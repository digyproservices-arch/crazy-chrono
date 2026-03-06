import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import '../styles/Carte.css';
import { pointToSvgCoords, polygonToPointsStr, segmentsToSvgPath, pointsToBezierPath } from './CarteUtils';
import { getBackendUrl } from '../utils/subscription';
import { getAuthHeaders } from '../utils/apiHelpers';
import { assignElementsToZones, fetchElements, resetElementDecks, drawFromDeck } from '../utils/elementsLoader';
import { startSession as pgStartSession, recordAttempt as pgRecordAttempt, flushAttempts as pgFlushAttempts, setMonitorCallback as pgSetMonitorCallback } from '../utils/progress';
import { validateZones as incidentValidateZones, reportImageLoadError as incidentReportImageLoadError } from '../utils/gameIncidentTracker';
import { isFree, canStartSessionToday, incrementSessionCount, setSubscriptionStatus } from '../utils/subscription';

import { initMasteryTracker, resetMasterySession, recordPair as masteryRecordPair, getActiveSessionProgress, getMasteryProgress, isMasteryReady, syncToServer as masterySyncToServer, loadFromServer as masteryLoadFromServer } from '../utils/masteryTracker';
import MasteryBubble from './MasteryBubble';
import { generateHint, generateAnswer, findGoodPair, HINT_PENALTY, ANSWER_PENALTY } from '../utils/hintGenerator';

// Single shared AudioContext for smoother audio on low devices
let __audioCtx = null;
function getAudioCtx() {
  try {
    if (!__audioCtx) __audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {}
  return __audioCtx;
}
function playCorrectSound() {
  try {
    const ctx = getAudioCtx(); if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.26);
  } catch {}
}

// Durée pendant laquelle on laisse les réponses visibles avant reshuffle
const PAIR_REVEAL_MS = 2000; // enchaînement encore plus rapide
// Paramètres d'animation (bulle)
const BUBBLE_MAIN_SIZE = 110; // px, plus grande pour meilleure visibilité en classe
const BUBBLE_DURATION_MS = 5200; // ms (durée jugée bonne)
const TRAIL_COUNT = 0; // uniquement 2 bulles (pas de traînée)
const TRAIL_DELAY_MS = 0; // sans effet car TRAIL_COUNT=0

function playWrongSound() {
  try {
    const ctx = getAudioCtx(); if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(220, ctx.currentTime);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.36);
  } catch {}
}

const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());
const normType = (t) => {
  const x = norm(t);
  if (['texte', 'text', 'txt', 'label'].includes(x)) return 'texte';
  if (['image', 'img', 'photo', 'picture', 'pic'].includes(x)) return 'image';
  if (['chiffre', 'number', 'num', 'digit'].includes(x)) return 'chiffre';
  if (['calcul', 'math', 'operation', 'op', 'calc'].includes(x)) return 'calcul';
  return x || t;
};
const getPairId = (z) => {
  if (!z) return '';
  const cand = z.pairId ?? z.pairID ?? z.pairid ?? z.pair ?? z.groupId ?? z.groupID ?? z.group;
  return norm(cand);
};

// Liste des textes à afficher aléatoirement, sans doublon
const TEXTES_RANDOM = [
  "FARINE CHAUD",
  "Orthosiphon",
  "Patate Chandelier",
  "Soulier zombie",
  "Raifort",
  "Consoude",
  "Ti poul bwa",
  "Douvan Nèg",
  "Tajétes",
  "Plantain",
  "Koklaya",
  "Bleuets",
  "Mélisse",
  "Herbe charpentier",
  "Simen kontra",
  "Paroka",
  "Atoumo",
  "Gingembre",
  "Curcuma",
  "Grenn anba fey",
  "Cannelle",
  "Romarin",
  "Aloé Vera",
  "Gwo Ten",
  "Malnommée"
];

// RNG déterministe à partir d'une seed (mulberry32)
function mulberry32(seed) {
  let t = (seed >>> 0) || 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Small helper: fetch with timeout (ms)
async function fetchWithTimeout(url, options = {}, timeoutMs = 1500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort('timeout'), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    clearTimeout(t);
    return res;
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

// Préchargement d'un lot d'images à partir des classes/thèmes sélectionnés
function preloadAssets(cfg, data, onProgress, abortRef) {
  // Helper: shuffle Fisher-Yates
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const diag = (label, payload) => { try { if (window && typeof window.ccAddDiag === 'function') window.ccAddDiag(label, payload); } catch {} };
  const tryBuildUrls = (pool, cfg) => {
    const classSet = new Set((cfg?.classes||[]).map(String));
    const themeSet = new Set((cfg?.themes||[]).map(String));
    const fit = (a) => {
      const levels = (a?.levels||a?.classes||a?.classLevels||[]).map(String);
      const lc = a?.levelClass ? [String(a.levelClass)] : [];
      const L = [...levels, ...lc];
      const okClass = classSet.size ? L.some(v => classSet.has(v)) : true;
      const ts = (a?.themes||[]).map(String);
      const okTheme = themeSet.size ? ts.some(t => themeSet.has(t)) : true;
      return okClass && okTheme;
    };
    const sel = Array.isArray(pool) ? pool.filter(fit) : [];
    const urls = [];
    for (const a of sel) {
      const u1 = a?.imageUrl || a?.imgUrl || a?.image?.url;
      if (u1) urls.push(String(u1));
      const u2 = a?.chiffreImgUrl || a?.calcImgUrl;
      if (u2) urls.push(String(u2));
    }
    // unique + shuffle + éviter répétition adjacente à la fin
    const uniq = Array.from(new Set(urls));
    const shuf = shuffle(uniq);
    // Post-traitement: garantir pas de doublon adjacents par erreur de normalisation
    const ordered = [];
    let last = null;
    for (const u of shuf) {
      if (u === last) continue;
      ordered.push(u); last = u;
    }
    return ordered.slice(0, 60);
  };
  return new Promise(async (resolve) => {
    try {
      // Construire la liste d'URLs
      let urls = [];
      if (Array.isArray(data?.associations) && data.associations.length) {
        urls = tryBuildUrls(data.associations, cfg);
      } else {
        // fallback: DataContext via localStorage cache, sinon fetch du JSON public
        try {
          const cached = localStorage.getItem('cc_data_associations');
          if (cached) urls = tryBuildUrls(JSON.parse(cached), cfg);
        } catch {}
        if (!urls.length) {
          try {
            const res = await fetch(`${process.env.PUBLIC_URL || ''}/data/associations.json`, { cache: 'no-store' });
            const j = await res.json();
            if (Array.isArray(j?.associations)) {
              try { localStorage.setItem('cc_data_associations', JSON.stringify(j.associations)); } catch {}
              urls = tryBuildUrls(j.associations, cfg);
            }
          } catch {}
        }
      }
      if (!urls.length) { diag('preload:skip', { reason: 'no-urls' }); onProgress && onProgress(100); return resolve(true); }
      diag('preload:list', { count: urls.length });
      const total = urls.length; let done = 0;
      const update = () => { try { onProgress && onProgress(Math.max(0, Math.min(100, Math.round((done/total)*100)))); } catch {} };
      update();
      const loadImage = (u) => new Promise((res) => {
        if (abortRef?.current?.aborted) return res();
        try {
          const img = new Image();
          img.onload = () => { done++; update(); res(); };
          img.onerror = () => { done++; update(); res(); };
          img.referrerPolicy = 'no-referrer';
          img.decoding = 'async';
          img.src = u;
        } catch { done++; update(); res(); }
      });
      const concurrency = 8; let i = 0;
      const runners = new Array(concurrency).fill(0).map(async () => {
        while (i < urls.length) { const idx = i++; await loadImage(urls[idx]); }
      });
      await Promise.all(runners);
      diag('preload:done', { count: total });
      resolve(true);
    } catch { resolve(true); }
  });
}

function makeRngFromSeed(seed) {
  const s = Number(seed);
  return Number.isFinite(s) ? mulberry32(s) : Math.random;
}

// Mélange un tableau (algorithme de Fisher-Yates) avec RNG injectable
function shuffleArray(array, rng = Math.random) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ====== Helpers d'animation au niveau module (pas de dépendance à des refs React) ======
// Cache simple des centres d'écran des zones pour limiter les querySelector/getBoundingClientRect
const zoneCenterCache = new Map(); // key: zoneId -> { x, y }
export function invalidateZoneCenterCache() { try { zoneCenterCache.clear(); } catch {} }

function getZoneScreenCenter(zoneId) {
  if (!zoneId && zoneId !== 0) return null;
  if (zoneCenterCache.has(zoneId)) {
    return zoneCenterCache.get(zoneId);
  }
  const sels = [
    `[data-zone-id="${zoneId}"]`,
    `#zone-${zoneId}`,
    `[data-id="${zoneId}"]`,
    `svg [data-zone-id="${zoneId}"]`,
    `svg #zone-${zoneId}`,
  ];
  let el = null;
  for (const sel of sels) {
    const found = document.querySelector(sel);
    if (found) { el = found; break; }
  }
  if (!el) return null;
  try {
    const r = el.getBoundingClientRect();
    const center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    zoneCenterCache.set(zoneId, center);
    return center;
  } catch { return null; }
}

function getVignetteTargetEl() {
  // Préférer un élément visible (mobile HUD si la sidebar est masquée)
  try {
    const candidates = Array.from(document.querySelectorAll('[data-cc-vignette="last-pair"], [data-cc-vignette]'));
    const visible = candidates.find(el => {
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
      const r = el.getBoundingClientRect();
      return r && r.width > 0 && r.height > 0;
    });
    return visible || candidates[0] || null;
  } catch {
    return document.querySelector('[data-cc-vignette="last-pair"]') || document.querySelector('[data-cc-vignette]');
  }
}

function pulseVignette(color = '#3b82f6') {
  try {
    const targetEl = getVignetteTargetEl();
    if (!targetEl) return;
    const rect = targetEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const ring = document.createElement('div');
    ring.style.position = 'fixed';
    ring.style.left = `${cx - 8}px`;
    ring.style.top = `${cy - 8}px`;
    ring.style.width = '16px';
    ring.style.height = '16px';
    ring.style.borderRadius = '999px';
    ring.style.border = `3px solid ${color}`;
    ring.style.boxShadow = `0 0 20px 6px ${color}55`;
    ring.style.opacity = '0.9';
    ring.style.pointerEvents = 'none';
    ring.style.zIndex = '4600';
    document.body.appendChild(ring);
    const anim = ring.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 0.9 },
      { transform: 'translate(-2px,1px) scale(1.2)', opacity: 0.7, offset: 0.4 },
      { transform: 'translate(0,0) scale(2.2)', opacity: 0.0 }
    ], { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' });
    anim.onfinish = () => { try { ring.remove(); } catch {} };
    setTimeout(() => { try { ring.remove(); } catch {} }, 800);
  } catch {}
}

export function animateBubbleToVignette(color = '#3b82f6') {
  try {
    const targetEl = getVignetteTargetEl();
    if (!targetEl) { setTimeout(() => animateBubbleToVignette(color), 60); return; }
    const rect = targetEl.getBoundingClientRect();
    const tx = rect.left + rect.width / 2;
    const ty = rect.top + rect.height / 2;
    const el = document.createElement('div');
    el.style.position = 'fixed';
    el.style.left = `${tx - 15}px`;
    el.style.top = `${Math.max(0, ty - 240)}px`;
    el.style.width = '30px';
    el.style.height = '30px';
    el.style.borderRadius = '999px';
    el.style.background = color;
    el.style.boxShadow = `0 0 14px 6px ${color}88, 0 0 34px 12px ${color}55, 0 0 60px 24px ${color}33`;
    el.style.opacity = '0.98';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '4500';
    document.body.appendChild(el);
    const anim = el.animate([
      { transform: 'translate(0,0) scale(0.85)', opacity: 0.98 },
      { transform: `translate(0, 120px) scale(1.05)`, opacity: 0.95, offset: 0.5 },
      { transform: `translate(0, 220px) scale(1.28)`, opacity: 0.0 }
    ], { duration: 950, easing: 'cubic-bezier(.2,.8,.2,1)' });
    anim.onfinish = () => { try { el.remove(); } catch {} };
    setTimeout(() => { try { el.remove(); } catch {} }, 1600);
  } catch {}
}

function zoneText(Z) {
  // Pour les zones calcul, prioritiser content (expression ex: "3 × 4") sur label (résultat ex: "12")
  const t = (Z?.type === 'calcul')
    ? (Z?.content || Z?.label || Z?.text || Z?.value || '').toString()
    : (Z?.label || Z?.content || Z?.text || Z?.value || '').toString();
  if (t && t.trim()) return t;
  const pid = getPairId(Z);
  return pid ? `[${pid}]` : '…';
}

function resolveImageSrc(raw) {
  if (!raw) return null;
  const normalized = raw.startsWith('http')
    ? raw
    : process.env.PUBLIC_URL + '/' + (raw.startsWith('/') ? raw.slice(1) : (raw.startsWith('images/') ? raw : 'images/' + raw));
  return encodeURI(normalized).replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

const PLAYER_PRIMARY_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899', '#0ea5e9'];
const PLAYER_BORDER_COLORS = ['#111827', '#fbbf24', '#dc2626'];

function getPlayerColorComboByIndex(idx) {
  const safe = Number.isFinite(idx) ? idx : 0;
  const base = safe < 0 ? 0 : safe;
  const primary = PLAYER_PRIMARY_COLORS[base % PLAYER_PRIMARY_COLORS.length];
  const group = Math.floor(base / PLAYER_PRIMARY_COLORS.length);
  const border = PLAYER_BORDER_COLORS[group % PLAYER_BORDER_COLORS.length];
  return { primary, border };
}

function getInitials(name) {
  const str = String(name || '').trim();
  if (!str) return '';
  const parts = str.split(/\s+/).slice(0, 2);
  return parts.map(p => (p && p[0] ? p[0].toUpperCase() : '')).join('');
}

function ArenaPauseOverlay({ disconnectedPlayer, gracePeriodMs }) {
  const [secondsLeft, setSecondsLeft] = React.useState(Math.ceil((gracePeriodMs || 15000) / 1000));
  React.useEffect(() => {
    const iv = setInterval(() => {
      setSecondsLeft(s => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(iv);
  }, []);
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: '#fff', textAlign: 'center', pointerEvents: 'all'
    }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>&#9208;</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Match en pause</div>
      <div style={{ fontSize: 18, marginBottom: 20, opacity: 0.9 }}>
        <strong>{disconnectedPlayer || 'Un joueur'}</strong> s'est d&#233;connect&#233;
      </div>
      <div style={{
        fontSize: 48, fontWeight: 900, color: secondsLeft <= 5 ? '#ef4444' : '#f59e0b',
        marginBottom: 12, transition: 'color 0.3s'
      }}>
        {secondsLeft}s
      </div>
      <div style={{ fontSize: 14, opacity: 0.7 }}>
        Reprise automatique &#224; la reconnexion ou forfait dans {secondsLeft}s
      </div>
    </div>
  );
}

// ✨⭐💫 Particules emoji lors de la validation d'une paire (tous modes)
function spawnEmojiParticles(sx, sy) {
  const emojis = ['✨', '⭐', '💫', '🌟', '✨', '⭐', '💫', '🌟'];
  for (let i = 0; i < 8; i++) {
    const el = document.createElement('div');
    el.textContent = emojis[i];
    const angle = (i / 8) * Math.PI * 2;
    const dist = 60 + Math.random() * 50;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 30 - Math.random() * 30;
    const size = 16 + Math.random() * 10;
    Object.assign(el.style, {
      position: 'fixed', left: `${sx}px`, top: `${sy}px`,
      fontSize: `${size}px`, pointerEvents: 'none', zIndex: '4600',
      willChange: 'transform, opacity',
    });
    document.body.appendChild(el);
    const dur = 700 + Math.random() * 400;
    const anim = el.animate([
      { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.1)`, opacity: 0.9, offset: 0.4 },
      { transform: `translate(calc(-50% + ${dx * 1.3}px), calc(-50% + ${dy * 1.5}px)) scale(0.6)`, opacity: 0 },
    ], { duration: dur, easing: 'cubic-bezier(.2,.8,.3,1)' });
    anim.onfinish = () => { try { el.remove(); } catch {} };
  }
}

let __lastBubbleSig = { sig: '', ts: 0 };

export function animateBubblesFromZones(aId, bId, color = '#3b82f6', ZA = null, ZB = null, borderColor = null, label = '') {
  try {
    const ids = [aId, bId].filter(v => v !== undefined && v !== null).map(v => String(v));
    const sig = ids.sort().join('-');
    const now = Date.now();
    if (sig && __lastBubbleSig.sig === sig && (now - __lastBubbleSig.ts) < 800) {
      return; // ignore doublon rapproché
    }
    __lastBubbleSig = { sig, ts: now };
  } catch {}
  const targetEl = getVignetteTargetEl();
  if (!targetEl) { setTimeout(() => animateBubblesFromZones(aId, bId, color), 60); return; }
  const tRect = targetEl.getBoundingClientRect();
  const tx = tRect.left + tRect.width / 2;
  const ty = tRect.top + tRect.height / 2;

  const coords = [getZoneScreenCenter(aId), getZoneScreenCenter(bId)];
  const zonesData = [ZA, ZB];
  const origins = coords
    .map((p, i) => (p ? { ...p, Z: zonesData[i] } : null))
    .filter(Boolean);
  if (!origins.length) { animateBubbleToVignette(color); return; }

  // Pulse près de l'impact, une seule fois pour l'ensemble
  setTimeout(() => pulseVignette(color), Math.max(200, BUBBLE_DURATION_MS - 260));

  for (const { x: sx, y: sy, Z } of origins) {
    // ✨⭐💫 Spawn emoji particles at each matched zone
    spawnEmojiParticles(sx, sy);
    try {
      const makeBubble = (sizePx, startOpacity) => {
        const el = document.createElement('div');
        el.style.position = 'fixed';
        el.style.left = `${sx - sizePx / 2}px`;
        el.style.top = `${sy - sizePx / 2}px`;
        el.style.width = `${sizePx}px`;
        el.style.height = `${sizePx}px`;
        el.style.borderRadius = '999px';
        el.style.background = color;
        if (borderColor) {
          el.style.border = `2px solid ${borderColor}`;
        }
        el.style.boxShadow = `0 0 16px 8px ${color}88, 0 0 40px 14px ${color}55, 0 0 72px 28px ${color}33`;
        el.style.opacity = String(startOpacity);
        el.style.pointerEvents = 'none';
        el.style.zIndex = '4500';
        el.style.overflow = 'hidden';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';

        // Contenu de la bulle: image si zone image, sinon texte
        if (Z && (Z.type === 'image') && Z.content) {
          const img = document.createElement('img');
          img.src = resolveImageSrc(Z.content);
          img.alt = zoneText(Z);
          Object.assign(img.style, {
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '999px',
            filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.25))',
          });
          el.appendChild(img);
        } else {
          const span = document.createElement('div');
          span.textContent = zoneText(Z);
          Object.assign(span.style, {
            color: '#fff',
            fontWeight: 'bold',
            fontSize: `${Math.max(11, sizePx * 0.26)}px`,
            lineHeight: '1.05',
            textAlign: 'center',
            padding: '4px',
            textShadow: '0 1px 1px rgba(0,0,0,0.5)'
          });
          el.appendChild(span);
        }

        if (label && typeof label === 'string' && label.trim()) {
          const badge = document.createElement('div');
          badge.textContent = label.trim().slice(0, 3);
          Object.assign(badge.style, {
            position: 'absolute',
            bottom: '-4px',
            right: '-4px',
            minWidth: '18px',
            minHeight: '18px',
            padding: '0 4px',
            borderRadius: '999px',
            background: borderColor || '#111827',
            color: '#fff',
            fontSize: `${Math.max(9, sizePx * 0.22)}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 8px rgba(0,0,0,0.4)',
            border: '2px solid #ffffff'
          });
          el.appendChild(badge);
        }

      document.body.appendChild(el);
      const dx = tx - sx;
      const dy = ty - sy;
      const dist = Math.hypot(dx, dy) || 1;
      const px = -dy / dist; // vecteur perpendiculaire normalisé
      const py = dx / dist;
      let curve = 60; // amplitude de la courbe (plus visible)
      const mid1X = dx * 0.33 + px * curve;
      const mid1Y = dy * 0.33 + py * curve;
      const mid2X = dx * 0.66 - px * curve;
      const mid2Y = dy * 0.66 - py * curve;

      // Empêcher la bulle de sortir de l'écran (utile mobile)
      const vw = window.innerWidth || document.documentElement.clientWidth || 360;
      const vh = window.innerHeight || document.documentElement.clientHeight || 640;
      const margin = 6; // marge intérieure écran
      const left0 = sx - sizePx / 2; // position absolue de départ du conteneur
      const top0 = sy - sizePx / 2;
      const minRelX = margin - left0;
      const maxRelX = (vw - margin) - (left0 + sizePx);
      const minRelY = margin - top0;
      const maxRelY = (vh - margin) - (top0 + sizePx);
      const clampRel = (x, y) => ({
        x: Math.min(maxRelX, Math.max(minRelX, x)),
        y: Math.min(maxRelY, Math.max(minRelY, y))
      });

      const c1 = clampRel(mid1X, mid1Y);
      const c2 = clampRel(mid2X, mid2Y);
      const cEnd = clampRel(dx, dy);
      // si on a dû fortement clamper, diminuer un peu la courbe pour éviter des sorties
      if (Math.abs(c1.x - mid1X) > 12 || Math.abs(c1.y - mid1Y) > 12 ||
          Math.abs(c2.x - mid2X) > 12 || Math.abs(c2.y - mid2Y) > 12) {
        curve = 40;
      }

      const anim = el.animate([
        { transform: 'translate(0,0) scale(0.9)', opacity: 0.98 },
        { transform: `translate(${c1.x}px, ${c1.y}px) scale(1.02)`, opacity: 0.97, offset: 0.35 },
        { transform: `translate(${c2.x}px, ${c2.y}px) scale(1.08)`, opacity: 0.94, offset: 0.7 },
        { transform: `translate(${cEnd.x}px, ${cEnd.y}px) scale(1.22)`, opacity: 0.0 }
      ], { duration: BUBBLE_DURATION_MS, easing: 'cubic-bezier(.2,.8,.2,1)' });
      anim.onfinish = () => { try { el.remove(); } catch {} };
      setTimeout(() => { try { el.remove(); } catch {} }, BUBBLE_DURATION_MS + 600);
        };

        // Bulle principale
        makeBubble(BUBBLE_MAIN_SIZE, 0.98);
        // Traînées (mini-bulles)
        for (let i = 1; i <= TRAIL_COUNT; i++) {
          const size = Math.max(26, BUBBLE_MAIN_SIZE - 8 * i);
          const opacity = Math.max(0.55, 0.9 - 0.15 * i);
          setTimeout(() => makeBubble(size, opacity), i * TRAIL_DELAY_MS);
        }
      } catch {}
    }
}

// Mapping des zones nécessitant un flip de l'arc pour le texte
const FLIP_TEXT_ARC_ZONE_IDS = {
  1752570164541: true,
  1752570866370: true
};

// Calcule un arc entre deux points, mais avec une marge en pixels sur chaque extrémité
function interpolateArc(points, idxStart, idxEnd, marginPx) {
  // ✅ FIX: Bounds-check indices to prevent crash on undefined.x/.y
  if (!points || points.length < 2) return { newStart: {x:0,y:0}, newEnd: {x:1,y:1}, r: 1, centerX: 0.5, centerY: 0.5, largeArcFlag: 0, sweepFlag: 1, arcLen: 1, delta: 0.01 };
  if (idxStart >= points.length || !points[idxStart]) idxStart = 0;
  if (idxEnd >= points.length || !points[idxEnd]) idxEnd = Math.min(1, points.length - 1);
  const start = points[idxStart];
  const end = points[idxEnd];
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const r = (Math.hypot(start.x - centerX, start.y - centerY) + Math.hypot(end.x - centerX, end.y - centerY)) / 2;
  const angleStart = Math.atan2(start.y - centerY, start.x - centerX);
  const angleEnd = Math.atan2(end.y - centerY, end.x - centerX);
  let delta = angleEnd - angleStart;
  if (delta < 0) delta += 2 * Math.PI;
  const arcLen = r * delta;
  const marginAngle = marginPx / r;
  const newAngleStart = angleStart + marginAngle;
  const newAngleEnd = angleEnd - marginAngle;
  const newStart = {
    x: centerX + r * Math.cos(newAngleStart),
    y: centerY + r * Math.sin(newAngleStart)
  };
  const newEnd = {
    x: centerX + r * Math.cos(newAngleEnd),
    y: centerY + r * Math.sin(newAngleEnd)
  };
  return { newStart, newEnd, r, centerX, centerY, largeArcFlag: 0, sweepFlag: 1, arcLen, delta };
}

function getArcPathFromZonePoints(points, zoneId, selectedArcPoints, arcPointsFromZone, marginPx = 0, autoFlip = false) {
  if (!points || points.length < 2) return '';
  let idxStart, idxEnd;
  if (Array.isArray(arcPointsFromZone) && arcPointsFromZone.length === 2) {
    idxStart = arcPointsFromZone[0];
    idxEnd = arcPointsFromZone[1];
  } else if (selectedArcPoints && selectedArcPoints[zoneId] && selectedArcPoints[zoneId].length === 2) {
    idxStart = selectedArcPoints[zoneId][0];
    idxEnd = selectedArcPoints[zoneId][1];
  } else {
    idxStart = 0;
    idxEnd = 1;
  }
  const { newStart, newEnd, r, centerX, centerY, largeArcFlag, sweepFlag } = interpolateArc(points, idxStart, idxEnd, marginPx);

  // Auto-flip: si le milieu de l'arc est en bas du cercle, le texte serait à l'envers
  // car la tangente clockwise pointe vers la gauche. Inverser l'arc pour que le texte soit lisible.
  if (autoFlip) {
    const startAngle = Math.atan2(newStart.y - centerY, newStart.x - centerX);
    const endAngle = Math.atan2(newEnd.y - centerY, newEnd.x - centerX);
    let arcDelta = endAngle - startAngle;
    if (arcDelta < 0) arcDelta += 2 * Math.PI;
    const midAngle = startAngle + arcDelta / 2;
    const normMid = ((midAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    // Bottom half in SVG: normMid ∈ (0, π) → tangente clockwise va vers la gauche → texte à l'envers
    if (normMid > 0.05 && normMid < Math.PI - 0.05) {
      return `M ${newEnd.x},${newEnd.y} A ${r},${r} 0 ${largeArcFlag},${sweepFlag === 1 ? 0 : 1} ${newStart.x},${newStart.y}`;
    }
  }

  return `M ${newStart.x},${newStart.y} A ${r},${r} 0 ${largeArcFlag},${sweepFlag} ${newEnd.x},${newEnd.y}`;
}

const Carte = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const arenaMatchId = searchParams.get('arena');
  const trainingMatchId = searchParams.get('training');
  const gsMode = searchParams.get('gs');
  
  // Mode plein écran de jeu
  const [fullScreen, setFullScreen] = useState(false);
  // Thèmes actifs de la session (pour badge UI)
  const [activeThemes, setActiveThemes] = useState([]);
  const [themesDropdownOpen, setThemesDropdownOpen] = useState(false);
  // Sélection interactive des deux points d'arc pour chaque zone texte
  const [selectedArcPoints, setSelectedArcPoints] = useState({}); // { [zoneId]: [idx1, idx2] }
  const [arcSelectionMode, setArcSelectionMode] = useState(false); // mode sélection d'arc
  // --- GAME STATE ---
  const [gameActive, setGameActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [score, setScore] = useState(0);
  // --- MODE OBJECTIF & AIDE ---
  const [objectiveMode, setObjectiveMode] = useState(false);
  const objectiveModeRef = useRef(false);
  const [objectiveTarget, setObjectiveTarget] = useState(10);
  const [objectiveThemes, setObjectiveThemes] = useState([]); // ['category:table_7', ...]
  const objectiveProgressRef = useRef([]); // [{ theme, key, label, sessionFound, total }]
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [helpEnabled, setHelpEnabled] = useState(false);
  const [helpLevel, setHelpLevel] = useState(0); // 0=rien, 1=indice demandé, 2=réponse demandée
  const [helpBubble, setHelpBubble] = useState(null); // { text, icon, kind, explanation? }
  const [helpPenalty, setHelpPenalty] = useState(0); // pénalité accumulée en secondes
  const [highlightedZoneIds, setHighlightedZoneIds] = useState([]); // zones surlignées par la réponse
  const helpStatsRef = useRef({ hintsUsed: 0, answersUsed: 0, totalPenalty: 0 });
  const objectivePairsRef = useRef(0); // compteur de paires pour le mode objectif
  // Sync objectiveModeRef with state (avoid stale closures in setTimeout/async)
  useEffect(() => { objectiveModeRef.current = objectiveMode; }, [objectiveMode]);
  // Historique des sessions multi
  const [sessions, setSessions] = useState([]);
  // Verrou court pour éviter le double traitement d'une paire
  const processingPairRef = useRef(false);
  // Index des zones par id pour éviter les .find() répétitifs (déclaré après l'init de `zones`)
  // Responsive UI state
  const [isMobile, setIsMobile] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  // Socket and timers
  const socketRef = useRef(null);
  const trainingEndedRef = useRef(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const roundNewTimerRef = useRef(null);
  // Expose a stable alias so existing handlers using `socket` keep working
  const socket = socketRef.current;
  // Apply session config (rounds/duration) once when we are host
  const configAppliedRef = useRef(false);
  // Preload + gating state
  const [preparing, setPreparing] = useState(false);
  const [prepProgress, setPrepProgress] = useState(0);
  const preloadAbortRef = useRef({ aborted: false });
  const lastRoomStateRef = useRef(null);
  // Admin-only diagnostic panel
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagLines, setDiagLines] = useState([]);
  const [isAdminUI, setIsAdminUI] = useState(false);
  const [diagRecording, setDiagRecording] = useState(false);
  const diagRecordingRef = useRef(false);
  const [diagRecLines, setDiagRecLines] = useState([]);
  const [logsCopied, setLogsCopied] = useState(false);
  const [logsSent, setLogsSent] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  // Image analysis panel
  const [imageAnalysisOpen, setImageAnalysisOpen] = useState(false);
  const [imageStats, setImageStats] = useState(null);
  const autoStartRef = useRef(false);
  // Ref pour stocker assocData (accessible au click handler pour extraire la catégorie des zones)
  const assocDataRef = useRef({});

  // Prewarm backend (non-blocking) to reduce cold-start latency
  useEffect(() => {
    fetchWithTimeout(`${getBackendUrl()}/healthz`, { cache: 'no-store' }, 1500).catch(() => {});
  }, []);

  // Helper: émettre un event vers le monitoring temps réel (via Socket.IO)
  const emitMonitoringEvent = useCallback((type, data = {}) => {
    try {
      const s = socketRef.current;
      if (s && s.connected) {
        s.emit('monitoring:client-event', { type, ...data });
      }
    } catch {}
  }, []);

  // Brancher le monitoring de progress.js sur emitMonitoringEvent
  useEffect(() => { pgSetMonitorCallback(emitMonitoringEvent); }, [emitMonitoringEvent]);

  // Résoudre cc_student_id au montage (même logique que Arena/Training lobbies)
  useEffect(() => {
    const existing = localStorage.getItem('cc_student_id');
    if (existing) {
      emitMonitoringEvent('cc_student_id:resolved', { studentId: existing, source: 'localStorage' });
      return;
    }
    try {
      const auth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
      if (!auth.token) {
        emitMonitoringEvent('cc_student_id:missing', { reason: 'no auth token' });
        return;
      }
      fetch(`${getBackendUrl()}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${auth.token}` }
      }).then(r => r.json()).then(data => {
        if (data.ok && data.student) {
          localStorage.setItem('cc_student_id', data.student.id);
          localStorage.setItem('cc_student_name', data.student.fullName || data.student.firstName || 'Joueur');
          emitMonitoringEvent('cc_student_id:resolved', { studentId: data.student.id, source: 'api/auth/me' });
        } else {
          emitMonitoringEvent('cc_student_id:missing', { reason: 'no student in response', isTeacher: data.user?.role });
        }
      }).catch(e => {
        emitMonitoringEvent('cc_student_id:missing', { reason: 'fetch error', error: e.message });
      });
    } catch {}
  }, [emitMonitoringEvent]);

  // Determine if diagnostic UI is allowed (admin-only toggle)
  useEffect(() => {
    const urlHasAdmin = () => {
      try { return new URLSearchParams(window.location.search).get('admin') === '1'; } catch { return false; }
    };
    const lsAdmin = () => { try { return localStorage.getItem('cc_admin_ui') === '1'; } catch { return false; } };
    const pre = urlHasAdmin() || lsAdmin();
    if (pre) { setIsAdminUI(true); return; }
    // Tentative auto: si on trouve un email utilisateur en localStorage, vérifier /me côté backend
    let email = null;
    try { email = (JSON.parse(localStorage.getItem('cc_auth')||'null')||{}).email || localStorage.getItem('cc_profile_email') || localStorage.getItem('user_email') || localStorage.getItem('email'); } catch {}
    if (!email) return; // pas d'email connu, on n'active pas
    const backend = getBackendUrl();
    try {
      const THROTTLE_KEY = 'cc_last_me_email_fetch_ts_carte';
      const now = Date.now();
      try {
        const last = parseInt(localStorage.getItem(THROTTLE_KEY) || '0', 10);
        if (Number.isFinite(last) && now - last < 60000) {
          try { window.ccAddDiag && window.ccAddDiag('me:email:carte:throttled', { lastMs: now - last }); } catch {}
          return; // 60s throttle
        }
        localStorage.setItem(THROTTLE_KEY, String(now));
      } catch {}
      fetch(`${backend}/me?email=${encodeURIComponent(email)}`, { credentials: 'omit' })
        .then(r => r.ok ? r.json() : null)
        .then(j => {
          if (j && j.ok && String(j.role||'').toLowerCase() === 'admin') setIsAdminUI(true);
        })
        .catch(() => {});
    } catch {}
  }, []);

  const addDiag = (label, payload) => {
    try {
      const ts = new Date().toISOString();
      const line = payload !== undefined ? `${ts} | ${label} | ${JSON.stringify(payload)}` : `${ts} | ${label}`;
      setDiagLines(prev => {
        const arr = Array.isArray(prev) ? [...prev, line] : [line];
        return arr.slice(Math.max(0, arr.length - 199));
      });
      // Forward to global recorder if present
      try { if (window && typeof window.ccAddDiag === 'function') window.ccAddDiag(label, payload); } catch {}
      // Also capture into recording buffer if active
      if (diagRecordingRef.current) {
        setDiagRecLines(prev => {
          const arr = Array.isArray(prev) ? [...prev, line] : [line];
          return arr.slice(Math.max(0, arr.length - 999));
        });
      }
    } catch {}
  };

  useEffect(() => {
    diagRecordingRef.current = !!diagRecording;
  }, [diagRecording]);

  const startDiagRecording = () => {
    try { setDiagRecLines([]); } catch {}
    setDiagRecording(true);
    addDiag('recording:start');
  };
  const stopDiagRecording = () => {
    setDiagRecording(false);
    addDiag('recording:stop', { count: diagRecLines.length });
  };
  const copyDiagRecording = async () => {
    try {
      const text = (diagRecLines || []).join('\n');
      
      // Tentative avec Clipboard API moderne
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback: méthode textarea pour navigateurs anciens
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        try { if (textarea.parentNode) textarea.parentNode.removeChild(textarea); } catch {}
      }
      
      // Feedback visuel
      setLogsCopied(true);
      setTimeout(() => setLogsCopied(false), 2000);
    } catch (err) {
      console.error('[LOGS] Erreur copie:', err);
      alert('Erreur lors de la copie. Essayez de sélectionner manuellement le texte ci-dessous.');
    }
  };

  // Télécharger les logs en fichier .txt
  const downloadDiagRecording = () => {
    try {
      const text = (diagRecLines || []).join('\n');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      a.download = `crazy-chrono-logs-${timestamp}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('[LOGS] Fichier téléchargé');
    } catch (err) {
      console.error('[LOGS] Erreur téléchargement:', err);
      alert('Erreur lors du téléchargement.');
    }
  };

  // Envoyer les logs au backend
  const sendLogsToBackend = async () => {
    try {
      const text = (diagRecLines || []).join('\n');
      if (!text || text.length < 10) {
        alert('Aucun log à envoyer. Démarrez l\'enregistrement d\'abord.');
        return;
      }
      
      const backend = getBackendUrl();
      const response = await fetch(`${backend}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logs: text,
          timestamp: new Date().toISOString(),
          source: 'carte-diagnostic',
          matchId: arenaMatchId || 'unknown',
          userAgent: navigator.userAgent
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('[LOGS] Envoyé au backend:', result);
        setLogsSent(true);
        setTimeout(() => setLogsSent(false), 3000);
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      console.error('[LOGS] Erreur envoi backend:', err);
      alert(`Erreur envoi logs: ${err.message}. Essayez le téléchargement à la place.`);
    }
  };

  // Fonction d'analyse des images utilisées
  const analyzeImageUsage = async () => {
    try {
      // Charger associations.json
      const resp = await fetch(process.env.PUBLIC_URL + '/data/associations.json');
      const assocData = await resp.json();
      
      // Extraire les images botaniques
      const botanicalImages = (assocData.images || []).filter(img => {
        const themes = img.themes || [];
        return themes.includes('botanique');
      });

      // Extraire les logs du diagnostic
      const logs = diagRecLines.join('\n');
      
      // Parser les événements zones:assigned pour compter les images
      const imageCount = {};
      botanicalImages.forEach(img => {
        const filename = (img.url || '').split('/').pop().replace('.jpeg', '');
        imageCount[filename] = {
          id: img.id,
          url: img.url,
          level: img.levelClass || 'Non spécifié',
          count: 0,
          themes: img.themes || []
        };
      });

      // Compter les utilisations dans les logs
      const imageMatches = logs.match(/"content":"images\/[^"]+\.jpeg"/g);
      if (imageMatches) {
        imageMatches.forEach(match => {
          const fullPath = match.match(/"content":"images\/([^"]+)\.jpeg"/);
          if (fullPath && fullPath[1]) {
            const filename = fullPath[1];
            if (imageCount[filename]) {
              imageCount[filename].count++;
            }
          }
        });
      }

      // Calculer les statistiques
      const sorted = Object.entries(imageCount).sort((a, b) => b[1].count - a[1].count);
      const used = sorted.filter(([_, info]) => info.count > 0);
      const notUsed = sorted.filter(([_, info]) => info.count === 0);
      
      const totalUsages = used.reduce((sum, [_, info]) => sum + info.count, 0);
      const avgUsage = used.length > 0 ? totalUsages / used.length : 0;
      const maxUsage = used.length > 0 ? Math.max(...used.map(([_, info]) => info.count)) : 0;
      const minUsage = used.length > 0 ? Math.min(...used.map(([_, info]) => info.count)) : 0;

      setImageStats({
        total: botanicalImages.length,
        used: used.length,
        notUsed: notUsed.length,
        totalUsages,
        avgUsage,
        maxUsage,
        minUsage,
        distribution: sorted,
        usedImages: used,
        notUsedImages: notUsed
      });
    } catch (error) {
      console.error('Erreur lors de l\'analyse des images:', error);
      setImageStats({ error: 'Erreur lors de l\'analyse. Assurez-vous d\'avoir des logs enregistrés.' });
    }
  };

  // Invalidation du cache des centres (resize/scroll)
  useEffect(() => {
    const onViewportChange = () => { try { invalidateZoneCenterCache(); } catch {} };
    window.addEventListener('resize', onViewportChange);
    // Scroll en mode capture (true) pour capter scrolls profonds
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, []);

  // Raccourci clavier: Ctrl+Alt+D pour ouvrir/fermer le panneau Diagnostic
  // Raccourci clavier: Ctrl+Alt+I pour ouvrir/fermer le panneau d'analyse des images
  useEffect(() => {
    const onKeyDiag = (e) => {
      try {
        const k = String(e.key || '').toLowerCase();
        if (e.ctrlKey && e.altKey && k === 'd') {
          e.preventDefault();
          setDiagOpen(v => !v);
        }
        if (e.ctrlKey && e.altKey && k === 'i') {
          e.preventDefault();
          setImageAnalysisOpen(v => !v);
        }
      } catch {}
    };
    window.addEventListener('keydown', onKeyDiag);
    return () => window.removeEventListener('keydown', onKeyDiag);
  }, []);

  // ===== Helpers: niveau principal et génération de calculs adaptés au niveau =====
  const CLASS_ORDER = ["CP","CE1","CE2","CM1","CM2","6e","5e","4e","3e"]; // ordre croissant
  const pickPrimaryLevel = () => {
    try {
      const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
      const sel = (cfg && Array.isArray(cfg.classes)) ? cfg.classes : [];
      if (!sel.length) return null;
      // Choisir le plus "jeune" niveau (le plus simple) parmi la sélection
      const ordered = sel
        .map(String)
        .filter(s => CLASS_ORDER.includes(s))
        .sort((a,b) => CLASS_ORDER.indexOf(a) - CLASS_ORDER.indexOf(b));
      return ordered[0] || null;
    } catch { return null; }
  };
  const rngInt = (min, max, rng) => min + Math.floor(rng() * (max - min + 1));
  const generateCalcForLevel = (level, rng) => {
    // Retourne une expression string adaptée au niveau
    const lv = level || pickPrimaryLevel();
    const opPick = (ops) => ops[Math.floor(rng() * ops.length)];
    const within = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const makeAddSub = (maxA=10, maxB=10, resMax=20) => {
      const add = rng() < 0.5;
      let A = rngInt(1, maxA, rng);
      let B = rngInt(1, maxB, rng);
      if (add) {
        // limiter somme
        const cap = resMax;
        if (A + B > cap) { const over = (A + B) - cap; B = within(B - over, 1, maxB); }
        return `${A} + ${B}`;
      } else {
        // résultat >= 0
        if (B > A) [A,B] = [B,A];
        return `${A} - ${B}`;
      }
    };
    const makeMul = (lo=2, hi=6, cap=100) => {
      let A = rngInt(lo, hi, rng);
      let B = rngInt(lo, hi, rng);
      // si produit dépasse cap, ajuster
      let tries = 0;
      while (A*B > cap && tries < 20) { A = rngInt(lo, hi, rng); B = rngInt(lo, hi, rng); tries++; }
      return `${A} x ${B}`;
    };
    const makeDiv = (lo=2, hi=9) => {
      // ÷ exacte: construire à partir d'un produit
      const B = rngInt(lo, hi, rng);
      const A = B * rngInt(lo, hi, rng);
      return `${A} ÷ ${B}`;
    };
    switch (lv) {
      case 'CP':
        return makeAddSub(10, 10, 20);
      case 'CE1': {
        // 60% +/−, 40% petites × (2..5), produit ≤ 50
        if (rng() < 0.6) return makeAddSub(12, 12, 24);
        return makeMul(2, 5, 50);
      }
      case 'CE2': {
        // +/−/×, opérandes 2..12, produit ≤ 100
        const r = rng();
        if (r < 0.4) return makeAddSub(12, 12, 30);
        return makeMul(2, 12, 100);
      }
      case 'CM1':
      case 'CM2':
      case '6e':
      case '5e':
      case '4e':
      case '3e': {
        // +/−/×/÷ exactes
        const r = rng();
        if (r < 0.35) return makeAddSub(20, 20, 60);
        if (r < 0.7) return makeMul(2, 12, 144);
        return makeDiv(2, 9);
      }
      default:
        // fallback générique
        return makeAddSub(12, 12, 30);
    }
  };

  // Helpers pour le mode plein écran
  const enterGameFullscreen = useMemo(() => (async () => {
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const root = document.documentElement;
        const fsMethod = root.requestFullscreen || root.webkitRequestFullscreen || root.mozRequestFullScreen || root.msRequestFullscreen;
        if (fsMethod) await fsMethod.call(root);
      }
    } catch {}
    try { document.body.style.overflow = 'hidden'; } catch {}
    try { document.body.classList.add('cc-game'); } catch {}
    try { window.dispatchEvent(new CustomEvent('cc:gameFullscreen', { detail: { on: true } })); } catch {}
    setFullScreen(true);
    setPanelCollapsed(true);
  }), []);

  // ===== Freemium helpers (Sprint A) =====
  const FREE_MAX_ROUNDS = 3;
  const FREE_MAX_DURATION = 120; // secondes
  const applyFreeLimits = (sock) => {
    try {
      if (!isFree()) return;
      // Force manches et durée max pour les free (local + serveur)
      setRoundsPerSession(prev => {
        const v = Number.isFinite(prev) ? Math.min(prev, FREE_MAX_ROUNDS) : FREE_MAX_ROUNDS;
        return v;
      });
      setGameDuration(prev => {
        const v = Math.min(prev, FREE_MAX_DURATION);
        setTimeLeft(v);
        return v;
      });
      if (sock && sock.emit) sock.emit('room:setRounds', FREE_MAX_ROUNDS);
    } catch {};
  };

  // Mini-sprint: server-side quota check
  const getLocalUserId = () => {
    try { const a = JSON.parse(localStorage.getItem('cc_auth') || 'null'); return a?.id || null; } catch { return null; }
  };
  const fetchWithTimeout = (url, options, timeout = 5000) => {
    return Promise.race([
      fetch(url, options),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      ),
    ]);
  };
  const serverAllowsStart = async (userId) => {
    try {
      if (!userId) return { ok: true, allow: true };
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'https://crazy-chrono-backend.onrender.com';
      const resp = await fetchWithTimeout(`${backendUrl}/usage/can-start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId })
      }, 2500);
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) return { ok: false, allow: true }; // ne pas bloquer si erreur serveur
      // Sync subscription status from server to localStorage (server = source of truth)
      try {
        const proReasons = ['pro_active', 'role_unlimited', 'student_licensed'];
        if (json.reason && proReasons.includes(json.reason)) {
          setSubscriptionStatus('pro');
        } else if (json.ok && json.reason && !proReasons.includes(json.reason)) {
          setSubscriptionStatus('free');
        }
      } catch {}
      return json;
    } catch { return { ok: false, allow: true }; }
  };

  const exitGameFullscreen = useMemo(() => (async () => {
    try {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (fsEl) {
        const exitMethod = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
        if (exitMethod) await exitMethod.call(document);
      }
    } catch {}
    try { document.body.style.overflow = ''; } catch {}
    try { document.body.classList.remove('cc-game'); } catch {}
    try { window.dispatchEvent(new CustomEvent('cc:gameFullscreen', { detail: { on: false } })); } catch {}
    setFullScreen(false);
  }), []);

  // Quitter plein écran avec Echap
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { try { exitGameFullscreen(); } catch {} } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exitGameFullscreen]);

  // PWA: block pull-to-refresh / overscroll during gameplay to prevent nav bar
  useEffect(() => {
    if (!fullScreen) return;
    const prevent = (e) => {
      if (window.scrollY <= 0 && e.touches && e.touches[0] && e.touches[0].clientY > (e.target._startY || 0)) {
        e.preventDefault();
      }
    };
    const saveY = (e) => {
      if (e.touches && e.touches[0]) e.target._startY = e.touches[0].clientY;
    };
    document.addEventListener('touchstart', saveY, { passive: true });
    document.addEventListener('touchmove', prevent, { passive: false });
    return () => {
      document.removeEventListener('touchstart', saveY);
      document.removeEventListener('touchmove', prevent);
    };
  }, [fullScreen]);

  // Charger les thèmes actifs depuis la config (localStorage), et écouter les mises à jour
  useEffect(() => {
    const loadThemes = () => {
      try {
        const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
        const arr = Array.isArray(cfg?.themes) ? cfg.themes.filter(Boolean) : [];
        setActiveThemes(arr);
      } catch { setActiveThemes([]); }
    };
    loadThemes();
    const onCfg = () => loadThemes();
    window.addEventListener('cc:sessionConfigured', onCfg);
    return () => window.removeEventListener('cc:sessionConfigured', onCfg);
  }, []);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  // Overlay gagnant de session
  const [winnerOverlay, setWinnerOverlay] = useState(null); // { text: string, until: number }
  // Overlay fin de partie Arena (podium + classement)
  const [arenaGameEndOverlay, setArenaGameEndOverlay] = useState(null); // { ranking: [], winner: {}, duration: number }
  // Overlay fin de partie Solo (performance du joueur)
  const [soloGameEndOverlay, setSoloGameEndOverlay] = useState(null); // { score, pairsValidated, duration, mode }
  // Session tracking refs (pour sauvegarder une seule fois en fin de session, pas par manche)
  const sessionStartTimeRef = useRef(null);
  const sessionSaveTimerRef = useRef(null);
  const scoreRef = useRef(0);
  // Rounds/session
  const [roundsPerSession, setRoundsPerSession] = useState(null); // null => infini
  // Dernière paire gagnée + historique pour le bandeau multi réduit
  const [lastWonPair, setLastWonPair] = useState(null); // { a, b, winnerId, winnerName, color, text }
  const [wonPairsHistory, setWonPairsHistory] = useState([]);
  const mpLastPairRef = useRef(null);
  // Références stables pour noms/états joueurs
  const roomPlayersRef = useRef([]);
  const scoresRef = useRef([]);

  // Clé de paire cible (exactement une par manche)
  const [currentTargetPairKey, setCurrentTargetPairKey] = useState(null);
  const currentTargetPairKeyRef = useRef(null);
  useEffect(() => { currentTargetPairKeyRef.current = currentTargetPairKey; }, [currentTargetPairKey]);

  // --- Tracking des paires validées pendant la session ---
  const [validatedPairIds, setValidatedPairIds] = useState(new Set());
  const validatedPairIdsRef = useRef(new Set());
  useEffect(() => { validatedPairIdsRef.current = validatedPairIds; }, [validatedPairIds]);
  useEffect(() => { scoreRef.current = score; }, [score]);

  // --- Assignment guard to avoid overlapping reshuffles ---
  const assignInFlightRef = useRef(false);
  const pendingAssignRef = useRef(null);
  const [assignBusy, setAssignBusy] = useState(false);

  function safeHandleAutoAssign(seed, zonesFile) {
    if (assignInFlightRef.current) {
      pendingAssignRef.current = { seed, zonesFile };
      return;
    }
    assignInFlightRef.current = true;
    setAssignBusy(true);
    Promise.resolve(handleAutoAssign(seed, zonesFile))
      .catch(e => console.error('[CC] handleAutoAssign failed:', e))
      .finally(() => {
        assignInFlightRef.current = false;
        setAssignBusy(false);
        // Hide preload overlay after assignment completes
        setPreparing(false);
        try { window.ccAddDiag && window.ccAddDiag('prep:done:round'); } catch {}
        const next = pendingAssignRef.current;
        pendingAssignRef.current = null;
        if (next) {
          safeHandleAutoAssign(next.seed, next.zonesFile);
        }
      });
  }

  // Brief wait cursor during assignment
  useEffect(() => {
    try {
      document.body.style.cursor = assignBusy ? 'wait' : '';
    } catch {}
    return () => { try { document.body.style.cursor = ''; } catch {} };
  }, [assignBusy]);

  // Petite animation d'une bulle lumineuse qui "vole" vers la vignette cible
  function animateBubbleToVignette(color = '#3b82f6') {
    try {
      const targetEl = mpLastPairRef.current;
      if (!targetEl) {
        // réessaye brièvement si le DOM n'est pas encore monté
        setTimeout(() => animateBubbleToVignette(color), 60);
        return;
      }
      const rect = targetEl.getBoundingClientRect();
      const tx = rect.left + rect.width / 2;
      const ty = rect.top + rect.height / 2;
      const startX = window.innerWidth * 0.5;
      const startY = Math.max(24, rect.top - 80);
      const el = document.createElement('div');
      el.style.position = 'fixed';
      el.style.left = `${startX - 14}px`;
      el.style.top = `${startY - 14}px`;
      el.style.width = '28px';
      el.style.height = '28px';
      el.style.borderRadius = '999px';
      el.style.background = color;
      el.style.boxShadow = `0 0 12px 6px ${color}55, 0 0 28px 8px ${color}33`;
      el.style.opacity = '0.95';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '4500';
      document.body.appendChild(el);
      const anim = el.animate([
        { transform: 'translate(0,0) scale(0.8)', opacity: 0.95 },
        { transform: `translate(${tx - startX}px, ${ty - startY}px) scale(1.15)`, opacity: 0.0 }
      ], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });
      anim.onfinish = () => { try { el.remove(); } catch {} };
      setTimeout(() => { try { el.remove(); } catch {} }, 1200);
    } catch {}
  }

  // Initialize socket connection and listeners
  useEffect(() => {
    // Détection mobile (sans forcer la réduction du panneau, l'utilisateur choisit)
    const applyMobile = () => {
      const mobile = window.innerWidth <= 640;
      setIsMobile(mobile);
    };

    applyMobile();
    window.addEventListener('resize', applyMobile);
    // Cleanup resize listener will be returned later with socket cleanup
    const cleanupResize = () => window.removeEventListener('resize', applyMobile);
    
    // MODE TRAINING: Connexion Socket.IO TRAINING (auto-start comme Arena)
    if (trainingMatchId) {
      console.log('[TRAINING] Connexion Socket.IO Training pour match:', trainingMatchId);
      if (socketRef.current && socketRef.current.connected) return cleanupResize;
      
      const base = getBackendUrl();
      console.log('[TRAINING] Tentative connexion Socket.IO vers:', base);
      const s = io(base, { transports: ['websocket'], withCredentials: false });
      socketRef.current = s;
      
      s.on('connect', () => {
        console.log('[TRAINING] ✅ Socket connecté, ID:', s.id);
        setSocketConnected(true);
        
        // ✅ FIX: Ne pas rejoindre si le match est déjà terminé (évite "match introuvable" après cleanup)
        if (trainingEndedRef.current) {
          console.log('[TRAINING] ⏹️ Game déjà terminé, skip training:join sur reconnexion');
          return;
        }
        
        // ✅ REJOINDRE LA ROOM (comme Arena ligne 1314)
        try {
          const trainingData = JSON.parse(localStorage.getItem('cc_training_game') || '{}');
          const myPlayer = (trainingData.players || []).find(p => p.studentId === trainingData.myStudentId);
          
          if (!myPlayer) {
            console.error('[TRAINING] Joueur introuvable dans trainingData.players');
            return;
          }
          
          const studentData = {
            studentId: myPlayer.studentId,
            name: myPlayer.name,
            avatar: myPlayer.avatar
          };
          
          console.log('[TRAINING] 📡 Envoi training:join avec studentData:', studentData);
          s.emit('training:join', {
            matchId: trainingMatchId,
            studentData
          }, (response) => {
            if (response?.ok) {
              console.log('[TRAINING] ✅ Rejoint la room du match');
            } else {
              console.error('[TRAINING] ❌ Échec rejoin - match introuvable (serveur redémarré ?)');
              alert('Le match a été interrompu (le serveur a redémarré). Vous allez être redirigé.');
              navigate('/');
              return;
            }
          });
          
          console.log('[TRAINING] Données jeu:', trainingData);
          
          // Charger zones et démarrer immédiatement
          if (trainingData.zones && Array.isArray(trainingData.zones)) {
            console.log('[TRAINING] 🎮 Chargement zones:', trainingData.zones.length);
            try { incidentValidateZones(trainingData.zones, { source: 'training:initial' }); } catch {}
            try { window.__CC_LAST_FILTER_COUNTS__ = { calcNum: trainingData.zones.filter(z => z.type === 'calcul' || z.type === 'chiffre').length, textImage: trainingData.zones.filter(z => z.type === 'image' || z.type === 'texte').length }; } catch {}
            setZones(trainingData.zones);
            // ✅ FIX: Synchroniser calcAngles depuis les angles serveur dès le chargement initial
            const initAngles = {};
            trainingData.zones.forEach(z => {
              if ((z.type === 'calcul' || z.type === 'chiffre') && typeof z.angle === 'number') {
                initAngles[z.id] = z.angle;
              }
            });
            setCalcAngles(initAngles);
            setMathOffsets({});
            setTimeLeft(trainingData.duration || 60);
            
            // Démarrer le jeu automatiquement (comme Arena)
            setTimeout(() => {
              setGameActive(true);
              console.log('[TRAINING] ✅ Jeu démarré automatiquement');
            }, 500);
          } else {
            console.error('[TRAINING] ❌ Pas de zones dans trainingData');
          }
        } catch (e) {
          console.error('[TRAINING] ❌ Erreur chargement données:', e);
        }
      });
      
      s.on('training:match-lost', ({ reason }) => {
        console.error('[TRAINING] ❌ Match perdu:', reason);
        setGameActive(false);
        alert('Le match a été interrompu : ' + reason + '\nVous allez être redirigé.');
        navigate('/');
      });

      s.on('training:pair-validated', ({ pairId, zoneAId, zoneBId, playerName, studentId }) => {
        console.log('[TRAINING] Paire validée par', playerName, ':', pairId);
        
        // Masquer les zones validées
        setZones(prevZones => {
          return prevZones.map(z => {
            if (z.id === zoneAId || z.id === zoneBId) {
              return { ...z, validated: true };
            }
            return z;
          });
        });

        // Désactiver le jeu pendant transition (1.5s)
        setGameActive(false);
        console.log('[TRAINING] ⚠️ gameActive=false (attente nouvelle carte)');
      });

      // Écouter timer tick du backend pour synchroniser timeLeft (comme Arena)
      s.on('training:timer-tick', ({ timeLeft: serverTimeLeft }) => {
        setTimeLeft(serverTimeLeft);
      });

      // Écouter nouvelle carte (comme Arena)
      s.on('training:round-new', ({ zones, roundIndex, totalRounds }) => {
        console.log('[TRAINING] Nouvelle carte reçue!', { 
          zonesCount: zones?.length, 
          roundIndex, 
          totalRounds 
        });

        if (Array.isArray(zones)) {
          const cleanZones = zones.map(z => ({ ...z, validated: false }));
          try { window.__CC_LAST_FILTER_COUNTS__ = { calcNum: cleanZones.filter(z => z.type === 'calcul' || z.type === 'chiffre').length, textImage: cleanZones.filter(z => z.type === 'image' || z.type === 'texte').length }; } catch {}
          setZones(cleanZones);
          // ✅ FIX: Synchroniser calcAngles depuis les angles serveur pour éviter que le localStorage ne les écrase
          const serverAngles = {};
          zones.forEach(z => {
            if ((z.type === 'calcul' || z.type === 'chiffre') && typeof z.angle === 'number') {
              serverAngles[z.id] = z.angle;
            }
          });
          setCalcAngles(serverAngles);
          setMathOffsets({});
          console.log('[TRAINING] ✅ Zones mises à jour:', cleanZones.length, 'angles synced:', Object.keys(serverAngles).length);
        }

        // Réactiver le jeu après 50ms
        setTimeout(() => {
          setGameActive(true);
          console.log('[TRAINING] ✅ gameActive=true (nouvelle manche)');
        }, 50);

        setValidatedPairIds(new Set());
        setGameSelectedIds([]);
        setGameMsg('');
      });

      // Écouter fin de partie (comme Arena)
      s.on('training:game-end', ({ scores, duration }) => {
        console.log('[TRAINING] 🏁 Partie terminée!', { scores });
        trainingEndedRef.current = true;
        setGameActive(false);
        // TODO: Afficher écran de fin avec scores
      });
      
      return () => {
        console.log('[TRAINING] Cleanup socket');
        cleanupResize();
        if (s) s.disconnect();
      };
    }
    
    // MODE ARENA: Connexion Socket.IO ARENA (pas mode multijoueur classique)
    if (arenaMatchId) {
      console.log('[ARENA] Connexion Socket.IO Arena pour match:', arenaMatchId);
      if (socketRef.current && socketRef.current.connected) return cleanupResize;
      
      const base = getBackendUrl();
      console.log('[ARENA] Tentative connexion Socket.IO vers:', base);
      const s = io(base, { transports: ['websocket'], withCredentials: false });
      socketRef.current = s;
      
      s.on('connecting', () => {
        console.log('[ARENA] 🔄 Socket en cours de connexion...');
      });
      
      s.on('connect', () => {
        console.log('[ARENA] ✅ Socket connecté, ID:', s.id);
        setSocketConnected(true);
        
        // Rejoindre la room Arena avec matchId et studentData complet
        try {
          const arenaData = JSON.parse(localStorage.getItem('cc_crazy_arena_game') || '{}');
          const myPlayer = (arenaData.players || []).find(p => p.studentId === arenaData.myStudentId);
          
          if (!myPlayer) {
            console.error('[ARENA] Joueur introuvable dans arenaData.players');
            return;
          }
          
          const studentData = {
            studentId: myPlayer.studentId,
            name: myPlayer.name,
            avatar: myPlayer.avatar || '/avatars/default.png'
          };
          
          console.log('[ARENA] Émission arena:join', { matchId: arenaMatchId, studentData });
          s.emit('arena:join', {
            matchId: arenaMatchId,
            studentData
          }, (response) => {
            console.log('[ARENA] Callback arena:join reçu:', response);
            if (response && !response.ok) {
              console.error('[ARENA] ❌ Échec rejoin - match introuvable (serveur redémarré ?)');
              alert('Le match a été interrompu (le serveur a redémarré). Vous allez être redirigé.');
              navigate('/');
            }
          });
        } catch (e) {
          console.error('[ARENA] ❌ Erreur émission arena:join:', e);
        }
      });
      
      s.on('arena:match-lost', ({ reason }) => {
        console.error('[ARENA] ❌ Match perdu:', reason);
        setGameActive(false);
        alert('Le match a été interrompu : ' + reason + '\nVous allez être redirigé.');
        navigate('/');
      });

      // ✅ Listener pour countdown 3-2-1 avant tiebreaker
      s.on('arena:countdown', ({ count }) => {
        console.log('[ARENA] 📣 Countdown reçu:', count);
        
        // Au premier count, retirer l'overlay égalité
        if (count === 3) {
          const tieOverlay = document.getElementById('arena-tie-overlay');
          if (tieOverlay) {
            tieOverlay.remove();
            console.log('[ARENA] 🗑️ Overlay égalité retiré (début countdown)');
          }
        }
        
        // Créer overlay countdown full-screen
        let countdownOverlay = document.getElementById('arena-countdown-overlay');
        if (!countdownOverlay) {
          setTimeout(() => {
          countdownOverlay = document.createElement('div');
          countdownOverlay.id = 'arena-countdown-overlay';
          countdownOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;';
          
          const container = document.createElement('div');
          container.style.cssText = 'text-align:center;color:white;max-width:800px;padding:40px;';
          
          // Partie fixe du contenu (titres + cartes)
          const contentDiv = document.createElement('div');
          contentDiv.innerHTML = `<h1 style="font-size:64px;margin-bottom:20px;">⚖️</h1><h2 style="font-size:42px;margin-bottom:20px;text-shadow:0 2px 10px rgba(0,0,0,0.3);">ÉGALITÉ !</h2><p style="font-size:24px;margin-bottom:30px;">${message}</p><div style="display:flex;gap:20px;justify-content:center;">${tiedPlayers.map(p => `<div style="background:white;border-radius:16px;padding:24px;border:4px solid #fbbf24;"><div style="font-size:48px;margin-bottom:12px;">🤝</div><div style="color:#111;font-weight:700;font-size:20px;margin-bottom:8px;">${p.name}</div><div style="color:#6b7280;font-size:16px;">Score: <span style="color:#f59e0b;font-weight:700;">${p.score}</span></div></div>`).join('')}</div><p style="margin-top:40px;font-size:18px;color:#fef3c7;">⏳ En attente de la décision du professeur...</p>`;
          
          // Créer le bouton comme élément DOM natif
          const readyBtn = document.createElement('button');
          readyBtn.id = 'arena-tie-ready-btn';
          readyBtn.textContent = '✋ JE SUIS PRÊT';
          readyBtn.style.cssText = 'margin-top:30px;padding:16px 40px;font-size:20px;font-weight:700;background:#fff;color:#f59e0b;border:3px solid #fbbf24;border-radius:12px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.2);transition:all 0.3s;';
          
          // Créer élément de status
          const statusEl = document.createElement('p');
          statusEl.id = 'arena-tie-status';
          statusEl.style.cssText = 'margin-top:20px;font-size:16px;color:#fef3c7;min-height:24px;';
          
          // CRITIQUE: Attacher onclick AVANT appendChild
          readyBtn.onclick = () => {
            console.log('[ARENA] ✋ CLIC BOUTON DÉTECTÉ !');
            
            try {
              const socket = socketRef.current;
              
              console.log('[ARENA] 🔍 État socket:', {
                exists: !!socket,
                connected: socket?.connected,
                id: socket?.id,
                io: socket?.io?.uri || 'N/A'
              });
              
              if (!socket || !socket.connected) {
                console.error('[ARENA] ❌ Socket non connecté!');
                statusEl.textContent = '❌ Erreur: Connexion perdue';
                return;
              }
              
              const arenaData = JSON.parse(localStorage.getItem('cc_crazy_arena_game') || '{}');
              const matchId = new URLSearchParams(window.location.search).get('arena');
              const myStudentId = arenaData.myStudentId;
              const myName = arenaData.players?.find(p => p.studentId === myStudentId)?.name || 'Joueur';
              
              console.log('[ARENA] 📤 Tentative émission arena:player-ready-tiebreaker', { 
                matchId, 
                studentId: myStudentId, 
                playerName: myName,
                socketId: socket.id
              });
              
              socket.emit('arena:player-ready-tiebreaker', {
                matchId,
                studentId: myStudentId,
                playerName: myName
              }, (ack) => {
                console.log('[ARENA] ✅ Acknowledgement reçu du backend:', ack);
              });
              
              console.log('[ARENA] 📤 Événement émis (attente ACK...)');
              
              // Désactiver bouton
              readyBtn.disabled = true;
              readyBtn.style.opacity = '0.5';
              readyBtn.style.cursor = 'not-allowed';
              readyBtn.textContent = '✅ PRÊT !';
              statusEl.textContent = '✅ Vous êtes prêt ! En attente des autres joueurs...';
            } catch (e) {
              console.error('[ARENA] ❌ Erreur:', e);
              statusEl.textContent = '❌ Erreur: ' + e.message;
            }
          };
          
          // Assembler le DOM
          container.appendChild(contentDiv);
          container.appendChild(readyBtn);
          container.appendChild(statusEl);
          countdownOverlay.appendChild(container);
          document.body.appendChild(countdownOverlay);
          console.log('[ARENA] ✅ Overlay ajouté au DOM avec onclick attaché');
          }, 500);
        }
      });

      // ✅ DEBUG: Logs de diagnostic
      console.log('[ARENA] 🔧 Listener tiebreaker-start attaché, socket:', {
        connected: s.connected,
        id: s.id
      });
      
      // ✅ CATCH-ALL: Capturer TOUS les événements pour debug
      s.onAny((eventName, ...args) => {
        if (eventName.includes('tiebreaker')) {
          console.log('[ARENA] 📥 ÉVÉNEMENT CAPTURÉ:', eventName, args);
        }
      });
      
      // ✅ SIMPLE: Tiebreaker = Mettre à jour React directement
      s.on('arena:tiebreaker-start', ({ zones, duration, startTime, matchId }) => {
        console.log('[ARENA] 🎯 Tiebreaker start - Mise à jour React directe');
        
        if (!zones || zones.length === 0) {
          console.error('[ARENA] ❌ Zones manquantes');
          return;
        }
        
        console.log('[ARENA] ✅ Tiebreaker: ', zones.length, 'zones reçues');
        
        // CRITIQUE: Supprimer overlay égalité + countdown
        const tieOverlay = document.getElementById('arena-tie-overlay');
        if (tieOverlay) {
          tieOverlay.remove();
          console.log('[ARENA] ✅ Overlay égalité supprimé');
        }
        setCountdown(null);
        console.log('[ARENA] ✅ Countdown supprimé');
        
        // Mettre à jour localStorage pour backup
        const existingData = JSON.parse(localStorage.getItem('cc_crazy_arena_game') || '{}');
        const tiebreakerData = {
          ...existingData,
          zones,
          duration,
          startTime,
          isTiebreaker: true
        };
        localStorage.setItem('cc_crazy_arena_game', JSON.stringify(tiebreakerData));
        
        // ✅ FIX: Nettoyer validated=false pour rendre zones cliquables
        const cleanZones = Array.isArray(zones) ? zones.map(z => ({ ...z, validated: false })) : [];
        console.log('[ARENA] 🧹 Zones nettoyées (validated=false):', cleanZones.length);
        try { incidentValidateZones(cleanZones, { source: 'arena:tiebreaker' }); } catch {}
        
        // Mettre à jour React directement (pas de reload)
        setZones(cleanZones);
        // ✅ FIX: Synchroniser calcAngles depuis les angles serveur
        const tbAngles = {};
        zones.forEach(z => {
          if ((z.type === 'calcul' || z.type === 'chiffre') && typeof z.angle === 'number') {
            tbAngles[z.id] = z.angle;
          }
        });
        setCalcAngles(tbAngles);
        setMathOffsets({});
        // NE PAS mettre à jour gameDuration (pas de chrono pour tiebreaker)
        setGameActive(true);
        // setStartTime n'existe pas - pas nécessaire pour tiebreaker (pas de timer)
        setIsTiebreaker(true); // Activer mode tiebreaker
        
        console.log('[ARENA] ✅ État React mis à jour avec zones tiebreaker, angles synced:', Object.keys(tbAngles).length);
      });

      // Écouter fin de partie Arena
      s.on('arena:game-end', ({ ranking, winner, duration }) => {
        console.log('[ARENA] Partie terminée!', { winner: winner?.name, ranking });

        // Retirer podium égalité si présent
        const tieOverlay = document.getElementById('arena-tie-overlay');
        if (tieOverlay) tieOverlay.remove();

        setGameActive(false);

        // Afficher overlay podium professionnel
        if (ranking && Array.isArray(ranking)) {
          setArenaGameEndOverlay({
            ranking,
            winner,
            duration,
            timestamp: Date.now()
          });

          // Confetti + son pour célébrer
          try { showConfetti?.(); } catch {}
          try { playCorrectSound?.(); } catch {}

          console.log('[ARENA] Overlay podium affiché');
        }
      });

      // Écouter nouvelle carte (après que toutes les paires sont trouvées)
      s.on('arena:round-new', ({ zones, roundIndex, totalRounds }) => {
        console.log('[ARENA] Nouvelle carte reçue!', { 
          zonesCount: zones?.length, 
          roundIndex, 
          totalRounds 
        });
        
        // ✅ CRITIQUE: Annuler tout setTimeout précédent pour éviter race condition
        if (gameActiveTimeoutRef.current) {
          clearTimeout(gameActiveTimeoutRef.current);
          console.log('[ARENA] ⚠️ setTimeout précédent annulé (double arena:round-new)');
        }
        
        // Mettre à jour les zones - FORCER validated=false pour éviter héritage entre manches
        if (Array.isArray(zones)) {
          const cleanZones = zones.map(z => ({ ...z, validated: false }));
          try { window.__CC_LAST_FILTER_COUNTS__ = { calcNum: cleanZones.filter(z => z.type === 'calcul' || z.type === 'chiffre').length, textImage: cleanZones.filter(z => z.type === 'image' || z.type === 'texte').length }; } catch {}
          setZones(cleanZones);
          // ✅ FIX: Synchroniser calcAngles depuis les angles serveur pour éviter que le localStorage ne les écrase
          const serverAngles = {};
          zones.forEach(z => {
            if ((z.type === 'calcul' || z.type === 'chiffre') && typeof z.angle === 'number') {
              serverAngles[z.id] = z.angle;
            }
          });
          setCalcAngles(serverAngles);
          setMathOffsets({});
          console.log('[ARENA] ✅ Zones mises à jour (validated=false forcé):', cleanZones.length, 'angles synced:', Object.keys(serverAngles).length);
        }
        
        // ✅ BUG FIX: Réactiver le jeu AVEC setTimeout pour garantir synchro React state
        gameActiveTimeoutRef.current = setTimeout(() => {
          setGameActive(true);
          gameActiveTimeoutRef.current = null;
          console.log('[ARENA] ✅ gameActive=true (après setTimeout)');
        }, 50);
        
        // Réinitialiser l'état du jeu pour la nouvelle carte
        setValidatedPairIds(new Set());
        setGameSelectedIds([]);
        setGameMsg('');
        
        // Mettre à jour le compteur de manches si fourni
        if (Number.isFinite(roundIndex)) {
          setRoundsPlayed(roundIndex + 1);
        }
        // ✅ FIX: Mettre à jour roundsPerSession pour afficher "Manche X/Total"
        if (Number.isFinite(totalRounds)) {
          setRoundsPerSession(totalRounds);
        }
      });
      
      s.on('disconnect', () => {
        console.log('[ARENA] Socket déconnecté');
        setSocketConnected(false);
      });
      
      s.on('connect_error', (err) => {
        console.error('[ARENA] ❌ Erreur connexion Socket.IO:', err?.message || err);
        console.error('[ARENA] Détails erreur:', { name: err?.name, type: err?.type, description: err?.description });
      });
      
      s.on('reconnect_attempt', (attemptNumber) => {
        console.log('[ARENA] 🔄 Tentative de reconnexion #', attemptNumber);
      });
      
      s.on('reconnect_error', (err) => {
        console.error('[ARENA] ❌ Échec reconnexion:', err?.message || err);
      });
      
      return () => {
        cleanupResize();
        s.disconnect();
      };
    }
    
    // Supprimer tout autostart pour éviter les courses avant le handshake/preload
    // Avoid double-connect in strict mode by checking existing
    if (socketRef.current && socketRef.current.connected) return;
    const base = getBackendUrl();
    addDiag('socket:init', { url: base });
    const s = io(base, { transports: ['websocket'], withCredentials: false });
    socketRef.current = s;

    const onConnect = () => {
      setSocketConnected(true);
      addDiag('socket:connected', { id: s.id });
      console.debug('[CC][client] socket connected', { id: s.id });
      // Envoyer studentId au serveur pour le tracking des stats multijoueur
      try {
        const sid = (JSON.parse(localStorage.getItem('cc_auth') || '{}')).id || localStorage.getItem('cc_student_id') || null;
        if (sid) s.emit('mp:identify', { studentId: sid });
      } catch {}

      // Listen room:state to know when we are host, then apply config once
      const onRoomState = (payload) => {
        try {
          if (!payload || !Array.isArray(payload.players)) return;
          const self = payload.players.find(p => p && p.id === s.id);
          const amHost = !!self?.isHost;
          let cfg = null; try { cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null'); } catch {}
          const wantRounds = parseInt(cfg?.rounds, 10);
          const wantDuration = parseInt(cfg?.duration, 10);
          const hasWanted = (Number.isFinite(payload.roundsPerSession) ? payload.roundsPerSession === wantRounds : false)
            && (Number.isFinite(payload.duration) ? payload.duration === wantDuration : false);
          if (hasWanted) { configAppliedRef.current = true; return; }
          if (!configAppliedRef.current && amHost) {
            if (Number.isFinite(wantDuration) && wantDuration >= 10 && wantDuration <= 600) {
              addDiag('emit room:duration:set', { duration: wantDuration });
              try { s.emit('room:duration:set', { duration: wantDuration }); } catch {}
            }
            if (Number.isFinite(wantRounds) && wantRounds >= 1 && wantRounds <= 20) {
              addDiag('emit room:setRounds', { rounds: wantRounds });
              try { s.emit('room:setRounds', wantRounds); } catch {}
            }
          }
        } catch {}
      };
      s.on('room:state', onRoomState);

      // Lire la config de session
      let cfg = null;
      try { cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null'); } catch {}
      const isOnline = cfg && cfg.mode === 'online';
      // GS detection: URL param ?gs= OR cc_session_cfg.mode === 'grande-salle' ONLY
      // cc_gs_session is supplementary data, NOT a trigger (may be stale from previous GS game)
      const isGrandeSalle = !!gsMode || (cfg && cfg.mode === 'grande-salle');
      let gsSession = null;
      if (isGrandeSalle) {
        try { gsSession = JSON.parse(localStorage.getItem('cc_gs_session') || 'null'); } catch {}
      } else {
        // Clean up stale GS data when entering non-GS modes
        try { localStorage.removeItem('cc_gs_session'); } catch {}
        try { localStorage.removeItem('cc_gs_round'); } catch {}
      }
      console.log('[CC][GS] Mode detection:', { gsMode, cfgMode: cfg?.mode, isGrandeSalle });

      // === GRANDE SALLE MODE ===
      if (isGrandeSalle) {
        const gsName = gsSession?.playerName || playerName;
        // URL param carries salleId directly (e.g. ?gs=grande-salle-publique)
        const gsSalleId = (gsMode && gsMode !== '1' && gsMode !== 'true') ? decodeURIComponent(gsMode) : (gsSession?.salleId || 'grande-salle-publique');
        const gsTournamentId = gsSession?.tournamentId || null;
        try { if (gsName) setPlayerName(gsName); } catch {}

        console.log('[CC][GS] Grande Salle mode — joining', { salleId: gsSalleId, name: gsName, tournamentId: gsTournamentId });

        const joinPayload = { name: gsName };
        if (gsTournamentId) joinPayload.tournamentId = gsTournamentId;
        else joinPayload.salleId = gsSalleId;
        s.emit('gs:join', joinPayload, (res) => {
          console.log('[CC][GS] gs:join response', res);
          // Fallback: load zones from localStorage if server reconnection is slow
          if (res?.ok) {
            setTimeout(() => {
              try {
                const roundData = JSON.parse(localStorage.getItem('cc_gs_round') || 'null');
                if (roundData && Array.isArray(roundData.zones) && roundData.zones.length > 0) {
                  console.log('[CC][GS] Loading zones from localStorage fallback', { count: roundData.zones.length });
                  try { window.__CC_LAST_FILTER_COUNTS__ = { calcNum: roundData.zones.filter(z => z.type === 'calcul' || z.type === 'chiffre').length, textImage: roundData.zones.filter(z => z.type === 'image' || z.type === 'texte').length }; } catch {}
                  setZones(roundData.zones);
                  setPreparing(false);
                  setGameActive(true);
                  const d = parseInt(roundData.duration, 10);
                  if (Number.isFinite(d) && d > 0) {
                    const elapsed = Math.floor((Date.now() - (roundData.startedAt || Date.now())) / 1000);
                    const remaining = Math.max(1, d - elapsed);
                    setGameDuration(d);
                    setTimeLeft(remaining);
                  }
                  try { enterGameFullscreen(); } catch {}
                  try { setPanelCollapsed(true); } catch {}
                  localStorage.removeItem('cc_gs_round');
                }
              } catch {}
            }, 1500);
          }
        });

        try { s._isGrandeSalle = true; s._gsSalleId = gsSalleId; } catch {}

        // GS: round:new — zone processing
        s.on('gs:round:new', (payload) => {
          console.log('[CC][GS] gs:round:new', { zonesCount: payload?.zones?.length, duration: payload?.duration });
          try { localStorage.removeItem('cc_gs_round'); } catch {}
          try { if (roundNewTimerRef.current) { clearTimeout(roundNewTimerRef.current); roundNewTimerRef.current = null; } } catch {}
          if (Array.isArray(payload?.zones) && payload.zones.length > 0) {
            try { window.__CC_LAST_FILTER_COUNTS__ = { calcNum: payload.zones.filter(z => z.type === 'calcul' || z.type === 'chiffre').length, textImage: payload.zones.filter(z => z.type === 'image' || z.type === 'texte').length }; } catch {}
            setZones(payload.zones);
            setPreparing(false);
          }
          setGameActive(true);
          try {
            const d = parseInt(payload?.duration, 10);
            if (Number.isFinite(d) && d > 0) { setGameDuration(d); setTimeLeft(d); }
          } catch {}
          try {
            const idx = parseInt(payload?.roundIndex, 10);
            if (Number.isFinite(idx) && idx >= 0) setRoundsPlayed(idx);
          } catch {}
          setGameSelectedIds([]);
          setGameMsg('');
          setCurrentTargetPairKey(null);
          setValidatedPairIds(new Set());
          try { enterGameFullscreen(); } catch {}
          try { setPanelCollapsed(true); } catch {}
        });

        s.on('gs:pair:valid', (payload) => {
          console.log('[CC][GS] gs:pair:valid', { by: payload?.by, a: payload?.a, b: payload?.b });
          setGameSelectedIds([]);
          setGameMsg('');
          if (Array.isArray(payload?.leaderboard)) {
            setScoresMP(payload.leaderboard.map(p => ({ id: p.id, name: p.name, score: p.score })));
          }
          try {
            const aId = payload?.a; const bId = payload?.b;
            const ZA = zonesByIdRef.current?.get ? zonesByIdRef.current.get(aId) : null;
            const ZB = zonesByIdRef.current?.get ? zonesByIdRef.current.get(bId) : null;
            const winnerId = payload?.by;
            const winnerName = payload?.playerName || 'Joueur';
            const players = Array.isArray(roomPlayersRef.current) ? roomPlayersRef.current : [];
            const idx = Math.max(0, players.findIndex(x => x.id === winnerId));
            const { primary, border } = getPlayerColorComboByIndex(idx);
            const initials = getInitials(winnerName);
            animateBubblesFromZones(aId, bId, primary, ZA, ZB, border, initials);
          } catch (e) { console.warn('[CC][GS] pair:valid animation error', e); }
        });

        s.on('gs:pair:invalid', () => {
          setGameSelectedIds([]);
          try { playWrongSound(); } catch {}
          try { showWrongFlash(); } catch {}
        });

        s.on('gs:elimination', (data) => {
          console.log('[CC][GS] gs:elimination', data);
          const amEliminated = data?.eliminated?.some(e => e.id === s.id);
          if (amEliminated) {
            setGameActive(false);
            setMpMsg('Vous avez été éliminé ! Mode spectateur...');
          } else {
            setMpMsg(`Vague ${data?.wave || '?'} — ${data?.eliminated?.length || 0} joueurs éliminés. ${data?.remainingCount || '?'} restants.`);
          }
          if (Array.isArray(data?.leaderboard)) {
            setScoresMP(data.leaderboard.map(p => ({ id: p.id, name: p.name, score: p.score })));
          }
        });

        s.on('gs:finish', (data) => {
          console.log('[CC][GS] gs:finish', data);
          try { localStorage.setItem('cc_gs_finish', JSON.stringify(data)); } catch {}
          try { localStorage.removeItem('cc_gs_session'); } catch {}
          try { localStorage.removeItem('cc_gs_round'); } catch {}
          setGameActive(false);
          try { navigate('/grande-salle'); } catch {}
        });

        s.on('gs:round:result', (data) => {
          if (Array.isArray(data?.leaderboard)) {
            setScoresMP(data.leaderboard.map(p => ({ id: p.id, name: p.name, score: p.score })));
          }
        });

        // Don't fall through to regular online/solo logic
        return;
      }
      // Freemium guard: Free plan is solo only (EXCEPTION: mode arena bypass)
      if (isOnline && isFree() && !arenaMatchId) {
        try { alert('Le mode en ligne est réservé aux abonnés Pro.'); } catch {}
        try { navigate('/pricing'); } catch {}
        // ... (rest of the code remains the same)
        try { s.emit('joinRoom', { roomId, name: cfg.playerName || playerName }); } catch {}
        return;
      }
      if (isOnline) {
        // Appliquer le pseudo si fourni
        try {
          if (cfg.playerName) setPlayerName(cfg.playerName);
        } catch {}
        const roomInfo = cfg.room || {};
        const type = roomInfo.type === 'join' ? 'join' : 'create';
        const code = (roomInfo.code || '').toUpperCase();
        if (type === 'create') {
          if (code) {
            // Utiliser le code fourni puis rejoindre
            try { setRoomId(code); } catch {}
            try { s.emit('joinRoom', { roomId: code, name: cfg.playerName || playerName }); } catch {}
            // Appliquer la config mais ne pas auto-start en multijoueur
            setTimeout(() => {
              try {
                if (!configAppliedRef.current) {
                  let cfg2 = null; try { cfg2 = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null'); } catch {}
                  const r2 = parseInt(cfg2?.rounds, 10);
                  const d2 = parseInt(cfg2?.duration, 10);
                  if (Number.isFinite(d2) && d2 >= 10 && d2 <= 600) s.emit('room:duration:set', { duration: d2 });
                  if (Number.isFinite(r2) && r2 >= 1 && r2 <= 20) s.emit('room:setRounds', r2);
                  
                  // Envoyer les thématiques et classes au serveur
                  const themes2 = Array.isArray(cfg2?.themes) ? cfg2.themes : [];
                  const classes2 = Array.isArray(cfg2?.classes) ? cfg2.classes : [];
                  s.emit('room:setConfig', { themes: themes2, classes: classes2 });
                  console.log('[MP] Sent config to server:', { themes: themes2, classes: classes2 });
                  
                  configAppliedRef.current = true;
                }
              } catch {}
            }, 150);
          } else {
            // Demander au serveur de créer une salle et la rejoindre
            try {
              s.emit('room:create', (res) => {
                if (res && res.ok && res.roomCode) {
                  setRoomId(res.roomCode);
                  s.emit('joinRoom', { roomId: res.roomCode, name: cfg.playerName || playerName });
                  // Appliquer la config mais ne pas auto-start
                  setTimeout(() => {
                    try {
                      if (!configAppliedRef.current) {
                        let cfg3 = null; try { cfg3 = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null'); } catch {}
                        const r3 = parseInt(cfg3?.rounds, 10);
                        const d3 = parseInt(cfg3?.duration, 10);
                        if (Number.isFinite(d3) && d3 >= 10 && d3 <= 600) s.emit('room:duration:set', { duration: d3 });
                        if (Number.isFinite(r3) && r3 >= 1 && r3 <= 20) s.emit('room:setRounds', r3);
                        
                        // Envoyer les thématiques et classes au serveur
                        const themes = Array.isArray(cfg3?.themes) ? cfg3.themes : [];
                        const classes = Array.isArray(cfg3?.classes) ? cfg3.classes : [];
                        s.emit('room:setConfig', { themes, classes });
                        console.log('[MP] Sent config to server:', { themes, classes });
                        
                        configAppliedRef.current = true;
                      }
                    } catch {}
                  }, 150);
                } else {
                  // fallback: rejoindre la salle par défaut
                  s.emit('joinRoom', { roomId, name: cfg.playerName || playerName });
                }
              });
            } catch {
              try { s.emit('joinRoom', { roomId, name: cfg.playerName || playerName }); } catch {}
            }
          }
        } else {
          // join
          if (code) {
            try { setRoomId(code); } catch {}
            try { s.emit('joinRoom', { roomId: code, name: cfg.playerName || playerName }); } catch {}
          } else {
            try { const _sid = localStorage.getItem('cc_student_id') || null; s.emit('joinRoom', { roomId, name: cfg.playerName || playerName, studentId: _sid }); } catch {}
          }
        }
      } else {
        // Pas de config en ligne → comportement par défaut
        try { const _sid = localStorage.getItem('cc_student_id') || null; s.emit('joinRoom', { roomId, name: playerName, studentId: _sid }); } catch {}
        // Démarrage auto si mode=solo enregistré
        let cfgSolo = null; try { cfgSolo = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null'); } catch {}
        if (cfgSolo && cfgSolo.mode === 'solo') {
          setTimeout(() => { try { s.emit('startGame'); } catch {} }, 200);
        }
      }
      // Charger l'historique de sessions
      try { s.emit('session:history:get', (res) => { if (res && res.ok && Array.isArray(res.sessions)) setSessions(res.sessions); }); } catch {}
    };
    const onDisconnect = (reason) => {
      setSocketConnected(false);
      console.debug('[CC][client] socket disconnected', reason);
    };
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    // Debug global léger
    try {
      s.onAny?.((event, ...args) => {
        if (event !== 'room:state') {
          console.debug('[CC][client] onAny', event, args && args[0]);
        }
      });
    } catch {}
    s.on('connect_error', (err) => {
      console.warn('[CC][client] socket connect_error', err?.message || err);
    });

    // Compat héritée (scores simples)
    s.on('roomState', ({ players }) => {
      try { setScoresMP((players || []).map(p => ({ id: p.id, name: p.name, score: p.score || 0 }))); } catch {}
    });

    // Nouvel état de salle complet
    s.on('room:state', (data) => {
      console.debug('[CC][client] room:state', data);
      addDiag('room:state', { duration: data?.duration, roundsPerSession: data?.roundsPerSession, roundsPlayed: data?.roundsPlayed, status: data?.status });
      try {
        lastRoomStateRef.current = data;
        if (data) {
          if (Array.isArray(data.players)) {
            setRoomPlayers(data.players);
            roomPlayersRef.current = data.players;
            const me = data.players.find(p => p.id === s.id);
            setIsHost(!!me?.isHost);
            setMyReady(!!me?.ready);
            // Garder la liste des scores à part pour l'affichage compact
            const scoreList = data.players.map(p => ({ id: p.id, name: p.nickname ?? p.name, score: p.score || 0 }));
            setScoresMP(scoreList);
            scoresRef.current = scoreList;
          }
          if (Number.isFinite(data.roundsPerSession)) setRoundsPerSession(data.roundsPerSession);
          if (Number.isFinite(data.roundsPlayed)) setRoundsPlayed(data.roundsPlayed);
          if (typeof data.msg === 'string') setMpMsg(data.msg);
        }
      } catch {}
    });

    // Début de manche (compte à rebours visuel)
    s.on('room:countdown', ({ t }) => {
      setCountdownT(typeof t === 'number' ? t : null);
    });

    // Mise à jour de scores en flux
    s.on('score:update', ({ scores }) => {
      const list = Array.isArray(scores) ? scores : [];
      setScoresMP(list);
      scoresRef.current = list;
      // Refléter les scores sur la liste joueurs
      setRoomPlayers(prev => {
        if (!Array.isArray(prev) || !prev.length) return prev;
        const scoreMap = new Map(list.map(p => [p.id, p.score || 0]));
        return prev.map(p => ({ ...p, score: scoreMap.has(p.id) ? scoreMap.get(p.id) : (p.score || 0) }));
      });
    });

    // Logs serveur (pour l'enregistrement global)
    s.on('server:log', (logData) => {
      try {
        const { timestamp, level, message, data } = logData;
        const prefix = `[SERVER][${level.toUpperCase()}]`;
        
        // Afficher dans la console avec le bon niveau
        if (level === 'error') {
          console.error(prefix, message, data);
        } else if (level === 'warn') {
          console.warn(prefix, message, data);
        } else if (level === 'debug') {
          console.debug(prefix, message, data);
        } else {
          console.log(prefix, message, data);
        }
        
        // Ajouter au diagnostic pour l'enregistrement global
        addDiag('server:log', {
          timestamp,
          level,
          message,
          ...data
        });
      } catch (err) {
        console.error('[CC][client] Failed to handle server:log:', err);
      }
    });

    s.on('round:new', (payload) => {
      console.debug('[CC][client] round:new', payload);
      console.log('[CC][client] round:new zones check:', {
        hasZones: !!payload?.zones,
        zonesIsArray: Array.isArray(payload?.zones),
        zonesLength: payload?.zones?.length,
        firstZone: payload?.zones?.[0]
      });
      addDiag('round:new', { duration: payload?.duration, roundIndex: payload?.roundIndex, roundsTotal: payload?.roundsTotal, hasZones: !!payload?.zones, zonesCount: payload?.zones?.length || 0 });
      // Clear waiting timer, if any
      try { if (roundNewTimerRef.current) { clearTimeout(roundNewTimerRef.current); roundNewTimerRef.current = null; } } catch {}
      // Détecter le mode (solo vs multijoueur)
      let isSoloMode = false;
      try {
        const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
        isSoloMode = cfg && cfg.mode === 'solo';
      } catch {}
      // Show preload overlay seulement pour la première manche (roundIndex=0), pas lors des changements de carte
      const isFirstRound = (payload?.roundIndex || 0) === 0;
      if (!isSoloMode && isFirstRound) {
        setPreparing(true);
        try { window.ccAddDiag && window.ccAddDiag('prep:start:round', { roundIndex: payload?.roundIndex }); } catch {}
      }
      setPrepProgress(0);
      if (typeof setMpMsg === 'function') setMpMsg('Nouvelle manche');
      
      // MODE SOLO : Toujours générer localement (ne jamais utiliser les zones serveur)
      if (isSoloMode) {
        console.log('[CC][client] SOLO MODE: Generating zones locally');
        const seed = Number.isFinite(payload?.seed) ? payload.seed : undefined;
        const zonesFile = payload?.zonesFile || 'zones2';
        safeHandleAutoAssign(seed, zonesFile);
      }
      // MODE MULTIJOUEUR : Utiliser les zones serveur si disponibles
      else if (Array.isArray(payload?.zones) && payload.zones.length > 0) {
        console.log('[CC][client] MULTIPLAYER MODE: Using server-generated zones:', payload.zones.length);
        
        try { incidentValidateZones(payload.zones, { source: 'multiplayer:round-new' }); } catch {}
        
        const zonesWithPairId = payload.zones.filter(z => z.pairId);
        addDiag('zones:received', {
          totalZones: payload.zones.length,
          zonesWithPairId: zonesWithPairId.length,
          pairIds: zonesWithPairId.map(z => ({
            id: z.id,
            type: z.type,
            pairId: z.pairId,
            content: String(z.content || z.label || '').substring(0, 30)
          }))
        });
        
        try { window.__CC_LAST_FILTER_COUNTS__ = { calcNum: payload.zones.filter(z => z.type === 'calcul' || z.type === 'chiffre').length, textImage: payload.zones.filter(z => z.type === 'image' || z.type === 'texte').length }; } catch {}
        setZones(payload.zones);
        setPreparing(false);
      } else {
        // Fallback sur génération locale si le serveur n'envoie pas de zones
        const seed = Number.isFinite(payload?.seed) ? payload.seed : undefined;
        const zonesFile = payload?.zonesFile || 'zones2';
        console.log('[CC][client] MULTIPLAYER MODE: Fallback to local generation with seed:', seed);
        safeHandleAutoAssign(seed, zonesFile);
      }
      // Charger config objectif depuis cc_session_cfg (sinon objectiveMode reste false => countdown au lieu de countup)
      try {
        const cfgObj = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
        if (cfgObj && typeof cfgObj === 'object') {
          setObjectiveMode(!!cfgObj.objectiveMode);
          if (cfgObj.objectiveTarget) setObjectiveTarget(Math.max(3, Math.min(50, parseInt(cfgObj.objectiveTarget, 10) || 10)));
          setObjectiveThemes(Array.isArray(cfgObj.objectiveThemes) ? cfgObj.objectiveThemes : []);
          setHelpEnabled(!!cfgObj.helpEnabled);
        }
      } catch {}
      // Ensure game state is active
      setGameActive(true);
      // Prendre la duree cote serveur (sauf en mode objectif: pas de countdown)
      try {
        const cfgDur = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
        const isObjMode = cfgDur && !!cfgDur.objectiveMode;
        const d = parseInt(payload?.duration, 10);
        if (Number.isFinite(d) && d > 0 && !isObjMode) {
          setGameDuration(d);
          setTimeLeft(d);
        }
      } catch {}
      setGameSelectedIds([]);
      setGameMsg('');
      // Reset de la paire cible cote client en attendant round:target
      setCurrentTargetPairKey(null);
      // FIX ZONES VIDES MP: Reinitialiser validatedPairIds
      setValidatedPairIds(new Set());
      // Passer en plein ecran jeu et replier le panneau multi
      try { enterGameFullscreen(); } catch {}
      try { setPanelCollapsed(true); } catch {}
    });

    // Cible de la manche (clé de paire) poussée par le serveur
    s.on('round:target', (payload) => {
      try {
        const key = typeof payload === 'string' ? payload : (payload?.pairKey ?? payload?.key ?? '');
        const nk = norm(key);
        setCurrentTargetPairKey(nk || null);
      } catch {}
    });

    // Résultat de manche
    s.on('round:result', ({ winnerId, winnerName }) => {
      console.debug('[CC][client] round:result', { winnerId, winnerName });
      setMpMsg(`${winnerName || 'Un joueur'} a gagné la manche !`);
      try { playCorrectSound?.(); } catch {}
      try { showConfetti?.(); } catch {}
      try { setRoundOverlay({ text: `Gagnant: ${winnerName || 'Un joueur'}`, until: Date.now() + 1500 }); setTimeout(() => setRoundOverlay(null), 1500); } catch {}
    });

    // Temps écoulé
    s.on('round:timeout', ({ roundIndex, roundsTotal }) => {
      console.debug('[CC][client] round:timeout', { roundIndex, roundsTotal });
      setMpMsg('Temps écoulé — aucun gagnant pour cette manche');
      try { setRoundOverlay({ text: 'Temps écoulé', until: Date.now() + 1500 }); setTimeout(() => setRoundOverlay(null), 1500); } catch {}
      try { playWrongSound?.(); } catch {}
    });

    // Fin de session
    s.on('session:end', (summary) => {
      console.log('[CC] session:end received', summary);
      // En mode objectif, ignorer la fin de session serveur (le client gere la fin quand tous les objectifs sont atteints)
      try {
        const cfgCheck = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
        if (cfgCheck && cfgCheck.objectiveMode) {
          console.log('[CC] session:end IGNORED in objective mode (client manages game end)');
          return;
        }
      } catch {}
      // Annuler le debounce timer pour ne pas écraser l'overlay
      if (sessionSaveTimerRef.current) { clearTimeout(sessionSaveTimerRef.current); sessionSaveTimerRef.current = null; }

      // Sortie du mode jeu / plein écran et reset des états de manche
      try { setGameActive(false); } catch {}
      try { setGameSelectedIds([]); } catch {}
      try { setCurrentTargetPairKey(null); } catch {}
      try { exitGameFullscreen(); } catch {}

      // Confetti + son pour célébrer
      try { playCorrectSound?.(); } catch {}
      try { showConfetti?.(); } catch {}

      // Construire les données overlay à partir du summary serveur
      const scores = Array.isArray(summary?.scores) ? summary.scores : [];
      const mySocketId = socketRef.current?.id;
      const myEntry = scores.find(p => p.id === mySocketId) || scores[0] || {};
      const myScore = myEntry.score || 0;
      const myErrors = myEntry.errors || 0;
      const sessionDur = summary?.duration || gameDuration;
      const isMultiplayer = scores.length > 1;

      // Afficher l'overlay de fin de match (solo ou MP)
      setSoloGameEndOverlay({
        score: myScore,
        pairsValidated: myScore,
        duration: sessionDur,
        errors: myErrors,
        mode: isMultiplayer ? 'multiplayer' : 'solo',
        ranking: isMultiplayer ? scores.sort((a, b) => (b.score || 0) - (a.score || 0)) : null,
        winner: summary?.winner || null,
        timestamp: Date.now(),
        masterySession: getActiveSessionProgress(),
        masteryAll: getMasteryProgress()
      });

      // Reset session start time
      sessionStartTimeRef.current = null;

      // Historique client: enregistrer la session terminée
      try {
        const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
        const hist = JSON.parse(localStorage.getItem('cc_history') || '[]');
        const entry = {
          endedAt: summary?.endedAt || Date.now(),
          roomCode: summary?.roomCode || roomId,
          mode: cfg?.mode || null,
          winner: summary?.winner || null,
          scores: scores,
          roundsPerSession: Number.isFinite(roundsPerSession) ? roundsPerSession : null,
          roundsPlayed: typeof roundsPlayed === 'number' ? roundsPlayed : null
        };
        hist.unshift(entry);
        localStorage.setItem('cc_history', JSON.stringify(hist.slice(0, 20)));
      } catch {}
      // rafraîchir l'historique serveur
      try {
        s.emit('session:history:get', (res) => {
          if (res && res.ok && Array.isArray(res.sessions)) {
            setSessions(res.sessions);
            try { window.dispatchEvent(new CustomEvent('cc:sessionsUpdated', { detail: { sessions: res.sessions } })); } catch {}
          }
        });
      } catch {}
    });

    s.on('pair:valid', (payload) => {
      console.debug('[CC][client] pair:valid', payload);
      // Réinitialise la sélection et le message local
      setGameSelectedIds([]);
      setGameMsg('');
      // Met à jour la vignette de dernière paire + historique
      const aId = payload?.a; const bId = payload?.b;
      try {
        const byId = payload?.by;
        const tie = !!payload?.tie;
        const winners = Array.isArray(payload?.winners) ? payload.winners : (byId ? [byId] : []);
        // Utilise la map pour récupérer le contenu même si les zones viennent d'être reshuffled
        const ZA = zonesByIdRef.current?.get ? zonesByIdRef.current.get(aId) : (Array.isArray(zones) ? zones.find(z => z.id === aId) : null);
        const ZB = zonesByIdRef.current?.get ? zonesByIdRef.current.get(bId) : (Array.isArray(zones) ? zones.find(z => z.id === bId) : null);
        // Trouver le joueur gagnant (réf. stable)
        const players = Array.isArray(roomPlayersRef.current) ? roomPlayersRef.current : [];
        // Déterminer le premier gagnant (compat visuelle) + la liste des noms gagnants si égalité
        const pickNameById = (id) => {
          const p = players.find(x => x.id === id) || null;
          const fromScores = (Array.isArray(scoresRef.current) ? scoresRef.current : []).find(x => x.id === id) || null;
          return p?.nickname || p?.name || fromScores?.name || 'Joueur';
        };
        const winnerId = byId || (winners.length ? winners[0] : null);
        const winnerName = winnerId ? pickNameById(winnerId) : 'Joueur';
        // Couleur déterministe par index (fond + contour) pour le joueur gagnant
        const idx = Math.max(0, (Array.isArray(players) ? players.findIndex(x => x.id === winnerId) : 0));
        const { primary, border } = getPlayerColorComboByIndex(idx);
        const color = primary;
        const initials = getInitials(winnerName);

        const textFor = (Z) => {
          const t = (Z?.label || Z?.content || Z?.text || Z?.value || '').toString();
          if (t && t.trim()) return t;
          // fallback: pairId visible si contenu vide (ex: image sans label)
          const pid = getPairId(Z);
          return pid ? `[${pid}]` : '…';
        };
        // Version spéciale pour calcul/chiffre qui priorise content (expression mathématique)
        const textForCalc = (Z) => {
          const t = (Z?.content || Z?.label || Z?.text || Z?.value || '').toString();
          if (t && t.trim()) return t;
          const pid = getPairId(Z);
          return pid ? `[${pid}]` : '…';
        };
        const textA = textFor(ZA);
        const textB = textFor(ZB);
        
        // Déterminer le type de paire (calcnum ou imgtxt)
        const typeA = ZA?.type || '';
        const typeB = ZB?.type || '';
        let kind = null;
        let calcExpr = null;
        let calcResult = null;
        let imageSrc = null;
        let imageLabel = null;
        let displayText = `${textA || '…'} ↔ ${textB || '…'}`;
        
        // Helper pour résoudre l'URL de l'image
        const resolveImageSrc = (raw) => {
          if (!raw) return null;
          const normalized = String(raw).startsWith('http')
            ? String(raw)
            : process.env.PUBLIC_URL + '/' + (String(raw).startsWith('/') 
                ? String(raw).slice(1) 
                : (String(raw).startsWith('images/') ? String(raw) : 'images/' + String(raw)));
          return encodeURI(normalized).replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
        };
        
        if ((typeA === 'calcul' && typeB === 'chiffre') || (typeA === 'chiffre' && typeB === 'calcul')) {
          kind = 'calcnum';
          // Prioriser les types déclarés pour identifier calcul vs chiffre
          const calcZone = typeA === 'calcul' ? ZA : ZB;
          const numZone = typeA === 'chiffre' ? ZA : ZB;
          
          // Utiliser textForCalc qui priorise content (où se trouve l'expression)
          calcExpr = textForCalc(calcZone);
          calcResult = textForCalc(numZone);
          displayText = (calcExpr && calcResult) ? `${calcExpr} = ${calcResult}` : `${textA || '…'} ↔ ${textB || '…'}`;
        } else if ((typeA === 'image' && typeB === 'texte') || (typeA === 'texte' && typeB === 'image')) {
          kind = 'imgtxt';
          const imgZone = typeA === 'image' ? ZA : ZB;
          const txtZone = typeA === 'texte' ? ZA : ZB;
          const raw = imgZone?.content || imgZone?.url || imgZone?.path || imgZone?.src || '';
          if (raw) imageSrc = resolveImageSrc(String(raw));
          imageLabel = textFor(txtZone);
          displayText = imageLabel || `${textA || '…'} ↔ ${textB || '…'}`;
        }
        
        const entry = { 
          a: aId, 
          b: bId, 
          winnerId, 
          winnerName, 
          color, 
          borderColor: border, 
          initials, 
          text: displayText, 
          tie,
          kind,
          calcExpr,
          calcResult,
          imageSrc,
          imageLabel
        };

        setLastWonPair(entry);
        setWonPairsHistory(h => [entry, ...(Array.isArray(h) ? h : [])].slice(0, 25));
        // Message si égalité
        if (tie) {
          try {
            const names = winners.map(pickNameById).filter(Boolean).join(' & ');
            setMpMsg(names ? `Égalité: ${names}` : 'Égalité');
          } catch {}
        }
        // Déclenche deux bulles depuis les zones réelles (fallback => une bulle générique)
        animateBubblesFromZones(aId, bId, color, ZA, ZB, border, initials);

      } catch (e) {
        console.warn('[CC][client] pair:valid post-UI failed', e);
      }
      // ✅ FIX DISPARITÉ: Désactiver gameActive UNIQUEMENT en mode Arena (délai 1.5s backend)
      // En mode multijoueur classique, round:new arrive immédiatement et réactive gameActive
      // Ne pas désactiver ici sinon on écrase le setGameActive(true) de round:new
      if (arenaMatchId) {
        setGameActive(false);
        console.log('[CC][client] ⚠️ gameActive=false (paire validée Arena, attente nouvelle carte)');
      }
      
      // ✅ FIX ZONES VIDES: Ne marquer validated UNIQUEMENT en mode solo (pas multijoueur)
      // En multijoueur: round:new remplace toutes les zones, mais pair:valid arrive APRÈS et marque
      // les zones avec les mêmes IDs comme validated=true, cachant le nouveau contenu
      // En solo: pas de round:new, donc on doit marquer validated pour masquer visuellement
      if (!socketConnected || objectiveModeRef.current) {
        setZones(prevZones => {
          return prevZones.map(z => {
            if (z.id === aId || z.id === bId) {
              return { ...z, validated: true };
            }
            return z;
          });
        });
      }
      
      // ✅ FIX DISPARITÉ: Activer verrou pendant traitement
      processingPairRef.current = true;
      setTimeout(() => { processingPairRef.current = false; }, 800);
      
      // Ajouter à l'historique paires validées
      setValidatedPairIds(prev => new Set([...prev, payload.pairId]));
    });

    return () => {
      try { cleanupResize(); } catch {}
      try {
        s.off('connect', onConnect);
        s.off('disconnect', onDisconnect);
        s.off('connect_error');
        s.off('roomState');
        s.off('room:state');
        s.off('room:countdown');
        s.off('score:update');
        s.off('round:new');
        s.off('round:target');
        s.off('pair:valid');
        s.off('round:result');
        s.off('round:timeout');
        s.off('session:end');
      } catch {}
      try { s.disconnect(); } catch {}
    };
  }, []);
  const [roundsPlayed, setRoundsPlayed] = useState(0);
  const [roundOverlay, setRoundOverlay] = useState(null); // { text, until }
  // Zones must be declared before any effects that read them
  const [zones, setZones] = useState([]);
  // ✅ CRITIQUE: Ref mutable pour zones (évite stale closure dans Socket handlers)
  const zonesRef = useRef([]);
  useEffect(() => { zonesRef.current = zones; }, [zones]);
  // ✅ CRITIQUE: Ref pour setTimeout de setGameActive (clearTimeout si double arena:round-new)
  const gameActiveTimeoutRef = useRef(null);
  // Map rapide id -> zone pour récupérer les textes même après reshuffle
  const zonesByIdRef = useRef(new Map());
  useEffect(() => {
    try {
      const m = new Map();
      for (const z of (Array.isArray(zones) ? zones : [])) {
        m.set(z.id, z);
      }
      zonesByIdRef.current = m;
    } catch {}
  }, [zones]);
  // Index des zones par id pour éviter les .find() répétitifs (utilisé dans handleGameClick, etc.)
  const zonesById = useMemo(() => {
    const m = new Map();
    try {
      (zones || []).forEach(z => { if (z && (z.id || z.id === 0)) m.set(z.id, z); });
    } catch {}
    return m;
  }, [zones]);
  // Declare customTextSettings before effects that may update it
  const [customTextSettings, setCustomTextSettings] = useState({});
  // Log temporaire: ids des zones chiffre (une seule fois après chargement)
  const loggedChiffreIdsRef = useRef(false);
  useEffect(() => {
    try {
      if (!loggedChiffreIdsRef.current && Array.isArray(zones) && zones.length) {
        const chiffres = zones
          .filter(z => normType(z.type) === 'chiffre')
          .map(z => ({ id: z.id, content: z.content }));
        console.log('[CHIFFRE_ZONE_IDS]', chiffres);
        loggedChiffreIdsRef.current = true;
      }
    } catch {}
  }, [zones]);
  // Durée de jeu sélectionnable par le joueur (en secondes)
  const [gameDuration, setGameDuration] = useState(() => {
    const saved = parseInt(localStorage.getItem('gameDuration') || '60', 10);
    return Number.isFinite(saved) && saved > 0 ? saved : 60;
  });
  // Durée sélectionnée au niveau de la salle (host)
  const [roomDuration, setRoomDuration] = useState(60);
  // Garde anti double-score (ex: double validation rapprochée)
  const lastScoreTsRef = useRef(0);
  // Toast pour afficher l'association choisie
  const [assocToast, setAssocToast] = useState(null); // { kind: 'imgtxt'|'calcnum'|'fallback', text: string }
  const assocToastTimerRef = useRef(null);
  const [correctZoneId, setCorrectZoneId] = useState(null);
  const [correctImageZoneId, setCorrectImageZoneId] = useState(null);
  const [gameSelectedIds, setGameSelectedIds] = useState([]); // mémorise les 1-2 clics du joueur
  const [flashWrong, setFlashWrong] = useState(false);
  const [gameMsg, setGameMsg] = useState('');
  const [showBigCross, setShowBigCross] = useState(false);
  const [masteryEvent, setMasteryEvent] = useState(null);
  const [masteryProgress, setMasteryProgress] = useState([]);
  const gameContainerRef = useRef(null);
  // Timestamp du premier clic pour mesurer la latence d'une tentative
  const firstClickTsRef = useRef(0);
  // Timer pour détecter l'absence de 'round:new' après un démarrage multi (déclaré plus haut)

  // Détermination locale (fallback) de la paire cible si pas de serveur ou clé non reçue
  useEffect(() => {
    try {
      if (!Array.isArray(zones) || !zones.length) return;
      // Si on est connecté (hors mode objectif) et qu'on a déjà une clé, ne pas surcharger
      if (socketConnected && !objectiveModeRef.current && currentTargetPairKey) return;
      // Scanner les zones pour trouver une clé apparaissant sur une paire valide autorisée
      const byKey = new Map(); // key -> [zones]
      for (const z of zones) {
        const k = getPairId(z);
        if (!k) continue;
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k).push(z);
      }
      const isAllowed = (t1, t2) => {
        const a = normType(t1); const b = normType(t2);
        return (a === 'image' && b === 'texte') || (a === 'texte' && b === 'image') || (a === 'calcul' && b === 'chiffre') || (a === 'chiffre' && b === 'calcul');
      };
      let found = null;
      for (const [k, arr] of byKey.entries()) {
        if (arr.length < 2) continue;
        // chercher au moins une combinaison autorisée
        for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            if (isAllowed(arr[i]?.type, arr[j]?.type)) { found = k; break; }
          }
          if (found) break;
        }
        if (found) break;
      }
      if ((!socketConnected || objectiveModeRef.current) && found && found !== currentTargetPairKeyRef.current) {
        setCurrentTargetPairKey(found);
      }
    } catch {}
  }, [zones, socketConnected, currentTargetPairKey]);

  // (désactivé) indice utilisateur sur la paire cible courante
  useEffect(() => {
    try {
      // Indice désactivé, ne rien faire
    } catch {}
  }, [currentTargetPairKey, zones]);

// --- PERSISTANCE DES POINTS D'ARC ---
useEffect(() => {
  const saved = localStorage.getItem('selectedArcPoints');
  if (saved) {
    setSelectedArcPoints(JSON.parse(saved));
  }
  // Force toutes les couleurs customTextSettings à blanc
  const custom = localStorage.getItem('customTextSettings');
  if (custom) {
    try {
      const parsed = JSON.parse(custom);
      const forced = {};
      Object.keys(parsed).forEach(zoneId => {
        forced[zoneId] = { ...parsed[zoneId], color: '#fff' };
      });
      setCustomTextSettings(forced);
      localStorage.setItem('customTextSettings', JSON.stringify(forced));
    } catch {}
  }
}, []);

// Timer pour le mode jeu
useEffect(() => {
  if (!gameActive) return;
  
  // ⚠️ DÉSACTIVER timer local en mode Arena (utilise arena:timer-tick backend)
  if (arenaMatchId) {
    console.log('[ARENA] Timer local désactivé (backend gère le timer)');
    return;
  }
  
  // Mode Objectif: chrono monte (countup), pas de fin automatique
  if (objectiveMode) {
    setTimeElapsed(0);
    const t0 = Date.now();
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - t0) / 1000);
      setTimeElapsed(elapsed);
    }, 250);
    return () => clearInterval(id);
  }
  
  // Mode normal: countdown
  setTimeLeft(gameDuration);
  const t0 = Date.now();
  const id = setInterval(() => {
    const elapsed = Math.floor((Date.now() - t0) / 1000);
    const remaining = Math.max(0, gameDuration - elapsed);
    setTimeLeft(remaining);
    if (remaining <= 0) {
      clearInterval(id);
      setGameActive(false);
    }
  }, 250);
  return () => clearInterval(id);
}, [gameActive, gameDuration, arenaMatchId, objectiveMode]);

// 💾 PERSISTANCE: Sauvegarder les performances Solo/Multijoueur en DB quand la SESSION se termine
// Utilise un debounce de 3s pour distinguer "fin de manche" (round:new relance gameActive) de "fin de session"
const prevGameActiveRef = useRef(false);
useEffect(() => {
  const wasActive = prevGameActiveRef.current;
  prevGameActiveRef.current = gameActive;
  
  // Nouvelle manche démarre → annuler le timer de sauvegarde en attente
  if (!wasActive && gameActive) {
    if (sessionSaveTimerRef.current) {
      clearTimeout(sessionSaveTimerRef.current);
      sessionSaveTimerRef.current = null;
    }
    // Enregistrer le début de session si pas déjà fait (fallback mode local)
    if (!sessionStartTimeRef.current) sessionStartTimeRef.current = Date.now();
    return;
  }
  
  // Détecter transition gameActive: true → false (fin de manche OU fin de session)
  if (wasActive && !gameActive && !arenaMatchId && !trainingMatchId) {
    emitMonitoringEvent('perf:transition', { from: 'active', to: 'inactive' });
    
    // Annuler tout timer précédent
    if (sessionSaveTimerRef.current) clearTimeout(sessionSaveTimerRef.current);
    
    // Attendre 3s : si gameActive repasse à true (nouvelle manche), le timer sera annulé
    // Sinon, c'est la vraie fin de session → sauvegarder
    sessionSaveTimerRef.current = setTimeout(() => {
      sessionSaveTimerRef.current = null;
      // Flush les tentatives restantes dans le buffer (progress.js)
      try { pgFlushAttempts(); } catch {}
      try {
        // Lire le score via ref (valeur la plus récente, pas stale closure)
        const finalScore = scoreRef.current;
        
        // Préférer l'UUID auth Supabase (compatible UUID et TEXT en DB)
        let studentId = null;
        try {
          const authData = JSON.parse(localStorage.getItem('cc_auth') || '{}');
          if (authData.id) studentId = authData.id;
        } catch {}
        if (!studentId) studentId = localStorage.getItem('cc_student_id');
        
        const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
        const isSolo = !cfg || cfg.mode === 'solo';
        const mode = isSolo ? 'solo' : 'multiplayer';
        
        // Nombre de paires = score (chaque paire validée donne +1)
        const pairsCount = finalScore;
        
        // Si le socket est connecté, session:end gère l'overlay + la sauvegarde → ne rien faire ici
        const s = socketRef.current;
        if (s && s.connected) {
          emitMonitoringEvent('perf:save-skipped', { reason: 'socket connected, session:end handles overlay+save', studentId });
          return;
        }
        
        // Durée réelle de la session (toutes manches confondues)
        const sessionElapsedSec = sessionStartTimeRef.current
          ? Math.round((Date.now() - sessionStartTimeRef.current) / 1000)
          : gameDuration;
        sessionStartTimeRef.current = null; // reset pour prochaine session

        // Afficher l'overlay de fin de partie (mode déconnecté / fallback)
        setSoloGameEndOverlay({
          score: finalScore,
          pairsValidated: pairsCount,
          duration: sessionElapsedSec,
          errors: 0,
          mode,
          timestamp: Date.now(),
          masterySession: getActiveSessionProgress(),
          masteryAll: getMasteryProgress()
        });

        if (!studentId) {
          emitMonitoringEvent('perf:save-skipped', { reason: 'cc_student_id et cc_auth.id manquants' });
          return;
        }
        
        if (pairsCount === 0 && finalScore === 0) {
          emitMonitoringEvent('perf:save-skipped', { reason: 'score=0', studentId });
          return;
        }
        
        emitMonitoringEvent('perf:save-attempt', { mode, studentId, score: finalScore, pairsCount, duration: sessionElapsedSec });
        
        const backendUrl = getBackendUrl();
        fetch(`${backendUrl}/api/training/sessions`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            matchId: `${mode}_${studentId}_${Date.now()}`,
            classId: null,
            teacherId: null,
            sessionName: isSolo ? 'Session Solo' : 'Session Multijoueur',
            config: { mode, duration: sessionElapsedSec, classes: cfg?.classes || [], themes: cfg?.themes || [] },
            completedAt: new Date().toISOString(),
            results: [{
              studentId,
              position: isSolo ? null : 1,
              score: finalScore,
              timeMs: sessionElapsedSec * 1000,
              pairsValidated: pairsCount,
              errors: 0
            }]
          })
        }).then(async r => {
          if (r.ok) {
            emitMonitoringEvent('perf:save-result', { mode, studentId, status: r.status, ok: true });
          } else {
            const body = await r.text().catch(() => '');
            emitMonitoringEvent('perf:save-result', { mode, studentId, status: r.status, ok: false, body: body.slice(0, 300) });
          }
        }).catch(e => {
          emitMonitoringEvent('perf:save-result', { mode, studentId, error: e.message });
        });
      } catch (e) {
        emitMonitoringEvent('perf:save-result', { error: e.message });
      }
    }, 3000); // 3s debounce: distingue fin de manche vs fin de session
  }
}, [gameActive, arenaMatchId, trainingMatchId, gameDuration, emitMonitoringEvent]);

// === RUM: Real User Monitoring — viewport + key elements ===
useEffect(() => {
  if (!gameActive) return;
  // Delay to let layout settle after game activation
  const rumTimer = setTimeout(() => {
    try {
      const vw = window.innerWidth || 0;
      const vh = window.innerHeight || 0;
      const dpr = window.devicePixelRatio || 1;
      const ua = navigator.userAgent || '';
      const mobile = vw <= 768;

      // Measure key elements
      const carteEl = document.querySelector('.carte');
      const hudEl = document.querySelector('.mobile-hud');
      const svgOverlay = document.querySelector('.carte-svg-overlay');
      const containerEl = document.querySelector('.carte-container');

      const measure = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
      };

      const carte = measure(carteEl);
      const hud = measure(hudEl);
      const svg = measure(svgOverlay);
      const container = measure(containerEl);

      // Detect anomalies
      const anomalies = [];
      if (carte && (carte.w < 50 || carte.h < 50)) anomalies.push('carte-collapsed');
      if (carte && (carte.w > vw + 10 || carte.h > vh + 10)) anomalies.push('carte-overflow');
      if (carte && (carte.x + carte.w < 0 || carte.y + carte.h < 0)) anomalies.push('carte-offscreen');
      if (carte && carte.y < 0) anomalies.push('carte-clipped-top');
      if (carte && carte.x < -5) anomalies.push('carte-clipped-left');
      if (mobile && !hud) anomalies.push('mobile-hud-missing');
      if (mobile && hud && carte && carte.y < hud.y + hud.h - 5) anomalies.push('carte-behind-hud');
      if (svg && (svg.w < 50 || svg.h < 50)) anomalies.push('svg-overlay-collapsed');

      const orientation = vw > vh ? 'landscape' : 'portrait';
      const payload = {
        viewport: { w: vw, h: vh, dpr },
        mobile,
        orientation,
        carte,
        hud: mobile ? hud : undefined,
        svg,
        container,
        anomalies,
        hasAnomalies: anomalies.length > 0,
        ua: ua.slice(0, 120),
      };

      // Always log on mobile; on desktop only if anomalies
      if (mobile || anomalies.length > 0) {
        emitMonitoringEvent('rum:layout', payload);
      }

      // Console warning for anomalies
      if (anomalies.length > 0) {
        console.warn('[RUM] Layout anomalies detected:', anomalies, payload);
      }
    } catch (e) {
      console.warn('[RUM] Error:', e);
    }
  }, 1200);
  return () => clearTimeout(rumTimer);
}, [gameActive, emitMonitoringEvent, isPortrait]);

// Persister la durée choisie
useEffect(() => {
  try { localStorage.setItem('gameDuration', String(gameDuration)); } catch {}
}, [gameDuration]);

function startGame() {
  // Sécurité: TOUJOURS vérifier côté serveur (source de vérité), pas localStorage
  const uid = getLocalUserId();
  serverAllowsStart(uid).then((res) => {
    try {
      // Serveur a répondu: vérifier autorisation
      if (res && res.ok && res.allow === false) {
        alert("Limite quotidienne atteinte sur votre compte Free. Passez à la version Pro pour continuer.");
        navigate('/pricing');
        return;
      }
      // Serveur OK ou injoignable: fallback local si utilisateur free
      if (isFree()) {
        if (!canStartSessionToday(3)) {
          alert('Limite quotidienne atteinte (3 sessions/jour en version gratuite). Passe à la version Pro pour continuer.');
          navigate('/pricing');
          return;
        }
        incrementSessionCount();
      }
      doStart();
    } catch { doStart(); }
  }).catch(() => {
    // Serveur injoignable: fallback local
    if (isFree() && !canStartSessionToday(3)) {
      alert('Limite quotidienne atteinte (3 sessions/jour en version gratuite). Passe à la version Pro pour continuer.');
      navigate('/pricing');
      return;
    }
    if (isFree()) incrementSessionCount();
    doStart();
  });
}
async function doStart() {
  try {
    try { window.ccAddDiag && window.ccAddDiag('doStart:called'); } catch {}
    // Charger config objectif & aide depuis cc_session_cfg
    try {
      const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
      if (cfg && typeof cfg === 'object') {
        setObjectiveMode(!!cfg.objectiveMode);
        if (cfg.objectiveTarget) setObjectiveTarget(Math.max(3, Math.min(50, parseInt(cfg.objectiveTarget, 10) || 10)));
        setObjectiveThemes(Array.isArray(cfg.objectiveThemes) ? cfg.objectiveThemes : []);
        setHelpEnabled(!!cfg.helpEnabled);
      } else {
        setObjectiveMode(false);
        setObjectiveThemes([]);
        setHelpEnabled(false);
      }
    } catch { setObjectiveMode(false); setObjectiveThemes([]); setHelpEnabled(false); }
    // Reset état aide
    setHelpLevel(0);
    setHelpBubble(null);
    setHelpPenalty(0);
    setHighlightedZoneIds([]);
    helpStatsRef.current = { hintsUsed: 0, answersUsed: 0, totalPenalty: 0 };
    objectivePairsRef.current = 0;
    objectiveProgressRef.current = [];
    setTimeElapsed(0);
    // Reset score pour nouvelle partie
    setScore(0);
    scoreRef.current = 0;
    // Enregistrer le début de la session pour calculer la durée totale
    sessionStartTimeRef.current = Date.now();
    // Annuler tout timer de sauvegarde en cours d'une session précédente
    if (sessionSaveTimerRef.current) { clearTimeout(sessionSaveTimerRef.current); sessionSaveTimerRef.current = null; }
    // Réinitialiser le Set des paires validées au début d'une nouvelle session
    setValidatedPairIds(new Set());
    // Réinitialiser les decks anti-répétition pour garantir la variété des éléments
    resetElementDecks(Date.now());
    try { window.ccAddDiag && window.ccAddDiag('session:reset:validatedPairs'); } catch {}
    try { resetMasterySession(); setMasteryProgress([]); } catch {}
    // Si connecté au serveur, lancer une session SOLO via le backend
  if (socket && socket.connected) {
    try {
      // Démarrer une session de progression via API backend (await pour avoir sessionId avant gameplay)
      try {
        const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
        await pgStartSession({
          mode: 'solo',
          classes: Array.isArray(cfg?.classes) ? cfg.classes : [],
          themes: Array.isArray(cfg?.themes) ? cfg.themes : [],
          duration_seconds: Number(gameDuration) || null,
        });
      } catch {}
      // Appliquer limite Free: 3 manches par session
      try { applyFreeLimits(socket); } catch {}
      // Phase de préparation: préchargement + handshake de paramètres
      setPreparing(true);
      try { window.ccAddDiag && window.ccAddDiag('prep:start'); } catch {}
      setPrepProgress(0);
      preloadAbortRef.current = { aborted: false };
      const cfg2 = (() => { try { return JSON.parse(localStorage.getItem('cc_session_cfg') || 'null'); } catch { return null; } })();
      const wantRounds = parseInt(cfg2?.rounds, 10);
      const wantDuration = parseInt(cfg2?.duration, 10);
      // 1) Joindre la salle et pousser la config demandée
      try { let _sid = null; try { _sid = JSON.parse(localStorage.getItem('cc_auth') || '{}').id || null; } catch {} if (!_sid) _sid = localStorage.getItem('cc_student_id') || null; socket.emit('joinRoom', { roomId, name: playerName, studentId: _sid }); } catch {}
      try {
        if (Number.isFinite(wantDuration) && wantDuration >= 10 && wantDuration <= 600) {
          console.debug('[CC][client] emit room:duration:set', wantDuration);
          socket.emit('room:duration:set', { duration: wantDuration });
        }
        if (Number.isFinite(wantRounds) && wantRounds >= 1 && wantRounds <= 20) {
          console.debug('[CC][client] emit room:setRounds', wantRounds);
          socket.emit('room:setRounds', wantRounds);
        }
      } catch {}
      // 2) Handshake: attendre room:state qui reflète duration/rounds souhaités et hôte actif
      const handshakePromise = new Promise((resolve) => {
        const t0 = Date.now();
        const timeoutMs = 3000;
        const tick = () => {
          const st = lastRoomStateRef.current;
          const okDur = Number.isFinite(wantDuration) ? (st && st.duration === wantDuration) : true;
          const okR = Number.isFinite(wantRounds) ? (st && st.roundsPerSession === wantRounds) : true;
          let amHost = false;
          try { amHost = !!(st?.players||[]).find(p => p.id === socketRef.current?.id)?.isHost; } catch {}
          if (okDur && okR && amHost) { return resolve(true); }
          if (Date.now() - t0 > timeoutMs) { return resolve(false); }
          setTimeout(tick, 80);
        };
        tick();
      });
      // 3) Préchargement d'actifs (images) basé sur les thèmes/classes
      // Note: on passe null si aucune donnée globale n'est disponible ici
      const preloadPromise = preloadAssets(cfg2, null, setPrepProgress, preloadAbortRef);
      const prepT0 = Date.now();
      Promise.all([handshakePromise, preloadPromise]).then(() => {
        try {
          const elapsed = Date.now() - prepT0;
          const minMs = 700; // afficher au moins 700ms pour être visible
          const finish = () => { setPreparing(false); try { window.ccAddDiag && window.ccAddDiag('prep:done', { elapsed: Date.now()-prepT0 }); } catch {} };
          if (elapsed < minMs) { setTimeout(finish, minMs - elapsed); } else { finish(); }
          // Ajuster les états locaux durée/rounds
          if (Number.isFinite(wantDuration)) { setGameDuration(wantDuration); setTimeLeft(wantDuration); }
          if (Number.isFinite(wantRounds)) { setRoundsPerSession(wantRounds); }
          console.debug('[CC][client] startGame after handshake+preload');
          addDiag('startGame after handshake+preload');
          socket.emit('startGame');
          setMpMsg('Nouvelle manche');
        } catch {}
      });
      } catch {}
      return;
  }
  // Fallback: mode local (sans serveur)
  try { handleAutoAssign(); } catch {}
  setScore(0);
  setGameActive(true);
  setGameSelectedIds([]);
  setGameMsg('');
  try { enterGameFullscreen(); } catch {}
  try { setPanelCollapsed(true); } catch {}
  // Démarrer une session de progression via API backend (await pour avoir sessionId avant gameplay)
  try {
    const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
    await pgStartSession({
      mode: 'solo',
      classes: Array.isArray(cfg?.classes) ? cfg.classes : [],
      themes: Array.isArray(cfg?.themes) ? cfg.themes : [],
      duration_seconds: Number(gameDuration) || null,
    });
  } catch {}
  safeHandleAutoAssign();
  } catch {}
}

// Hôte: changer la durée de la salle
function handleSetRoomDuration(val) {
  const d = parseInt(val, 10);
  if (!Number.isFinite(d)) return;
  setRoomDuration(d);
  try { socket && socket.emit('room:duration:set', { duration: d }); } catch {}
}
function showConfetti() {
  // Always append to body to avoid clipping/stacking issues; position fixed uses viewport
  const container = gameContainerRef.current;
  const root = document.body;
  const rect = (container && container.getBoundingClientRect) ? container.getBoundingClientRect() : root.getBoundingClientRect();
  for (let i = 0; i < 36; i++) {
    const d = document.createElement('div');
    const size = 6 + Math.random() * 6;
    d.style.position = 'fixed';
    d.style.zIndex = '99999';
    d.style.left = `${rect.left + rect.width / 2}px`;
    d.style.top = `${rect.top + 60}px`;
    d.style.width = `${size}px`;
    d.style.height = `${size}px`;
    d.style.background = `hsl(${Math.floor(Math.random() * 360)},90%,55%)`;
    d.style.borderRadius = '2px';
    d.style.pointerEvents = 'none';
    root.appendChild(d);
    const dx = (Math.random() - 0.5) * rect.width;
    const dy = 120 + Math.random() * 200;
    d.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${Math.random() * 720 - 360}deg)`, opacity: 0 }
    ], { duration: 900 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.2,1)' }).onfinish = () => d.remove();
  }
}

function showWrongFlash() {
  setFlashWrong(true);
  setTimeout(() => setFlashWrong(false), 350);
}

// Affiche un toast d'association pendant un court instant
function showAssocToast(kind, text) {
  // Nettoyer un éventuel timer précédent
  if (assocToastTimerRef.current) {
    clearTimeout(assocToastTimerRef.current);
    assocToastTimerRef.current = null;
  }
  setAssocToast(null);
}

// Fin de drag: on nettoie les états pour permettre de nouveaux drags
function handleMouseUp() {
  setDraggedIdx(null);
  setDraggedHandle(null);
  if (dragState.id) {
    setDragState({ id: null, start: null, orig: null, moved: false });
  }
  setIsDragging(false);
}

function handleGameClick(zone) {
  // Ignore clicks during assignment transition to avoid race conditions
  if (assignInFlightRef.current || assignBusy) return;
  if (!gameActive || !zone) return;
  // ✅ FIX DISPARITÉ: Ignorer zones déjà validées (masquées)
  if (zone.validated) {
    console.log('[GAME] Zone déjà validée, clic ignoré:', zone.id);
    return;
  }
  if (processingPairRef.current) return; // verrou anti-double-clic
  // Déselection: clic sur une zone déjà sélectionnée = la retirer
  if (gameSelectedIds.includes(zone.id)) {
    setGameSelectedIds(prev => prev.filter(id => id !== zone.id));
    return;
  }
  // si déjà 2, réinitialiser avant de prendre un nouveau clic
  if (gameSelectedIds.length >= 2) {
    setGameSelectedIds([zone.id]);
    return;
  }
  setGameSelectedIds(prev => {
    const next = [...prev, zone.id];
    // Marquer le 1er clic
    if (next.length === 1) {
      firstClickTsRef.current = Date.now();
      try {
        const z = zonesById.get(zone.id);
        window.ccAddDiag && window.ccAddDiag('solo:click:1st', {
          zoneId: zone.id, type: z?.type,
          content: String(z?.content || z?.label || '').substring(0, 60),
          pairId: z?.pairId || null,
          round: Number(roundsPlayed) || 0
        });
      } catch {}
    }
    if (next.length === 2) {
      const [a, b] = next;
      if (a === b) {
        // double clic sur la même zone = désélectionner
        return [];
      }
      const ZA = zonesById.get(a);
      const ZB = zonesById.get(b);
      const t1 = normType(ZA?.type);
      const t2 = normType(ZB?.type);
      const allowed = (x, y) => (x === 'image' && y === 'texte') || (x === 'texte' && y === 'image') || (x === 'calcul' && y === 'chiffre') || (x === 'chiffre' && y === 'calcul');
      const p1 = getPairId(ZA);
      const p2 = getPairId(ZB);
      const basicOk = ZA && ZB && allowed(t1, t2) && p1 && p2 && (p1 === p2);
      const pairKey = basicOk ? p1 : '';
      // Revenir au comportement précédent: toute bonne paire est acceptée
      const okPair = !!basicOk;
      // Préparer métadonnées de tentative
      let item_type = ((t1 === 'image' && t2 === 'texte') || (t1 === 'texte' && t2 === 'image')) ? 'imgtxt' : 'calcnum';
      let latency = Math.max(0, Date.now() - (firstClickTsRef.current || Date.now()));
      let levelClass = '';
      let cfgTheme = '';
      let theme = '';
      let itemDetail = '';
      try {
        const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
        levelClass = Array.isArray(cfg?.classes) && cfg.classes[0] ? String(cfg.classes[0]) : '';
        cfgTheme = Array.isArray(cfg?.themes) && cfg.themes[0] ? String(cfg.themes[0]) : '';
      } catch {}
      // Mapping thème code → label lisible
      const THEME_DISPLAY = { 'botanique': 'Plantes médicinales', 'multiplication': 'Tables de multiplication', 'geographie': 'Géographie', 'animaux': 'Animaux', 'fruits': 'Fruits & Légumes' };
      const themeLabel = (code) => { if (!code) return ''; const c = String(code).toLowerCase().trim(); return THEME_DISPLAY[c] || (c.charAt(0).toUpperCase() + c.slice(1)); };
      // TOUJOURS extraire itemDetail et thème granulaire (même si config a un thème)
      if (item_type === 'calcnum') {
        const calculZone = t1 === 'calcul' ? ZA : ZB;
        const chiffreZone = t1 === 'chiffre' ? ZA : ZB;
        const calcText = String(calculZone?.content || '').trim();
        const chiffreText = String(chiffreZone?.content || '').trim();
        const mulMatch = calcText.match(/(\d+)\s*[×x*]\s*(\d+)/);
        const addMatch = !mulMatch && calcText.match(/(\d+)\s*[+]\s*(\d+)/);
        const subMatch = !mulMatch && !addMatch && calcText.match(/(\d+)\s*[-]\s*(\d+)/);
        if (mulMatch) {
          const table = Math.min(parseInt(mulMatch[1], 10), parseInt(mulMatch[2], 10));
          theme = `Table de ${table}`;
          itemDetail = `${calcText} = ${chiffreText}`;
        } else if (addMatch) {
          theme = 'Additions';
          itemDetail = `${calcText} = ${chiffreText}`;
        } else if (subMatch) {
          theme = 'Soustractions';
          itemDetail = `${calcText} = ${chiffreText}`;
        } else {
          theme = cfgTheme ? themeLabel(cfgTheme) : 'Calculs divers';
          itemDetail = calcText ? `${calcText} = ${chiffreText}` : (chiffreText || '');
        }
      } else {
        const texteZone = t1 === 'texte' ? ZA : ZB;
        const imageZone = t1 === 'image' ? ZA : ZB;
        const textContent = String(texteZone?.content || texteZone?.label || '').trim();
        const imageUrl = String(imageZone?.content || '').trim();
        // Chercher la catégorie réelle depuis assocData (ex: "botanique" → "Plantes médicinales")
        let zoneTheme = '';
        try {
          const ad = assocDataRef.current || {};
          const lc = textContent.toLowerCase().trim();
          const texteEntry = (ad.textes || []).find(t => String(t.content || '').toLowerCase().trim() === lc);
          if (texteEntry && Array.isArray(texteEntry.themes) && texteEntry.themes[0]) {
            zoneTheme = themeLabel(texteEntry.themes[0]);
          }
        } catch {}
        theme = zoneTheme || (cfgTheme ? themeLabel(cfgTheme) : 'Images & Textes');
        try { itemDetail = JSON.stringify({ text: textContent, img: imageUrl }); } catch { itemDetail = textContent; }
      }
      if (okPair) {
        console.log('[GAME] OK pair', { a, b, ZA: { id: ZA.id, type: ZA.type, pairId: ZA.pairId }, ZB: { id: ZB.id, type: ZB.type, pairId: ZB.pairId } });
        try {
          window.ccAddDiag && window.ccAddDiag('solo:pair:correct', {
            zoneA: { id: a, type: t1, content: String(ZA?.content || ZA?.label || '').substring(0, 60), pairId: p1 },
            zoneB: { id: b, type: t2, content: String(ZB?.content || ZB?.label || '').substring(0, 60), pairId: p2 },
            pairKey, latencyMs: latency, itemType: item_type, theme, itemDetail,
            round: Number(roundsPlayed) || 0, score: scoreRef.current
          });
        } catch {}
        try { const mEvt = masteryRecordPair(pairKey, true, latency); if (mEvt) setMasteryEvent(mEvt); setMasteryProgress(getActiveSessionProgress()); masterySyncToServer(getBackendUrl(), getAuthHeaders()); } catch {}
        // ✅ FIX DISPARITÉ: Activer verrou pendant traitement
        processingPairRef.current = true;
        setTimeout(() => { processingPairRef.current = false; }, 800);
        // Ajouter le pairId au Set des paires validées
        if (pairKey) {
          setValidatedPairIds(prev => {
            const newSet = new Set([...prev, pairKey]);
            try { window.ccAddDiag && window.ccAddDiag('pair:validated', { pairKey, totalValidated: newSet.size }); } catch {}
            return newSet;
          });
        }
        // Effets visuels immédiats pour garantir le feedback, même en multijoueur
        setGameMsg('Bravo !');
        playCorrectSound();
        showConfetti();
        // Utiliser la vraie couleur du joueur local
        try {
          let myIdx = -1;
          let myName = playerName;
          
          // Mode Arena: utiliser arenaData.players
          if (arenaMatchId) {
            const arenaData = JSON.parse(localStorage.getItem('cc_crazy_arena_game') || '{}');
            const players = Array.isArray(arenaData.players) ? arenaData.players : [];
            myIdx = players.findIndex(p => p.studentId === arenaData.myStudentId);
            if (myIdx >= 0) {
              myName = players[myIdx]?.name || playerName;
            }
          } else {
            // Mode multijoueur classique: utiliser roomPlayersRef
            const players = Array.isArray(roomPlayersRef.current) ? roomPlayersRef.current : [];
            const myId = socket?.id || null;
            myIdx = myId ? players.findIndex(p => p.id === myId) : -1;
            if (myIdx >= 0) {
              myName = players.find(p => p.id === myId)?.nickname || playerName;
            }
          }
          
          const { primary, border } = myIdx >= 0 ? getPlayerColorComboByIndex(myIdx) : { primary: '#22c55e', border: '#ffffff' };
          const initials = getInitials(myName);
          animateBubblesFromZones(a, b, primary, ZA, ZB, border, initials);
        } catch {}
        if (socket && socket.connected) {
          // Mode Arena : émettre event spécifique arena:pair-validated
          if (arenaMatchId) {
            try {
              const arenaData = JSON.parse(localStorage.getItem('cc_crazy_arena_game') || '{}');
              socket.emit('arena:pair-validated', {
                studentId: arenaData.myStudentId,
                isCorrect: true,
                timeMs: Date.now() - (arenaData.startTime || Date.now()),
                matchId: arenaMatchId,
                zoneAId: a,
                zoneBId: b,
                pairId: ZA?.pairId || ZB?.pairId || null
              });
            } catch (e) {
              console.error('[ARENA] Erreur émission arena:pair-validated:', e);
            }
          }

          // MODE TRAINING: Émettre validation paire au backend
          if (trainingMatchId) {
            try {
              const trainingData = JSON.parse(localStorage.getItem('cc_training_game') || '{}');
              socket.emit('training:pair-validated', {
                studentId: trainingData.myStudentId,
                isCorrect: true,
                matchId: trainingMatchId,
                zoneAId: a,
                zoneBId: b,
                pairId: ZA?.pairId || ZB?.pairId || null
              });
              console.log('[TRAINING] Paire validée émise:', ZA?.pairId || ZB?.pairId);
            } catch (e) {
              console.error('[TRAINING] Erreur émission pair-validated:', e);
            }
          } else if (socket._isGrandeSalle) {
            // Mode Grande Salle
            try { socket.emit('gs:attemptPair', { a, b }); } catch {}
          } else {
            // Mode multijoueur classique
            try { socket.emit('attemptPair', { a, b }); } catch {}
          }
        }
          // Enregistrer tentative OK
          try { pgRecordAttempt({ item_type, item_id: itemDetail || pairKey || `${ZA?.id}|${ZB?.id}`, objective_key: `${levelClass}:${theme}`, correct: true, latency_ms: latency, level_class: levelClass, theme, round_index: Number(roundsPlayed)||0 }); } catch {}
          // Historique local (solo): ajouter une entrée simple
          try {
            if (!(socket && socket.connected)) {
              const entry = { a, b, winnerId: null, winnerName: null, color: '#22c55e', text: `✔️ Paire validée (${pairKey || '—'})` };
              setLastWonPair(entry);
              setWonPairsHistory(h => [entry, ...(Array.isArray(h) ? h : [])].slice(0, 25));
            }
          } catch {}
          // Réinitialiser la sélection rapidement pour fluidifier l'expérience
          setTimeout(() => { setGameSelectedIds([]); setGameMsg(''); }, 450);
          // Le score et le tableau des joueurs seront mis à jour via 'score:update' serveur
          
          // Fallback solo/local: pas de bulle en doublon (déjà lancée plus haut)
          try { if (!(socket && socket.connected)) { pulseVignette('#22c55e'); } } catch {}
          const nowTs = Date.now();
          if (nowTs - (lastScoreTsRef.current || 0) > 600) {
            setScore(s => s + 1);
            lastScoreTsRef.current = nowTs;
          }
          // Mode Objectif: vérifier si objectif atteint
          if (objectiveMode) {
            objectivePairsRef.current += 1;
            const pairsFound = objectivePairsRef.current;
            // Mode thématique: vérifier progression par thème via mastery tracker
            if (objectiveThemes.length > 0) {
              const progress = getMasteryProgress();
              const objProgress = objectiveThemes.map(t => {
                const key = t.replace('category:', '');
                const p = progress.find(x => x.key === key);
                return { theme: t, key, label: p?.label || key, sessionFound: p?.sessionFound || 0, total: p?.total || 0 };
              });
              objectiveProgressRef.current = objProgress;
              const allComplete = objProgress.every(p => p.total > 0 && p.sessionFound >= p.total);
              try { window.ccAddDiag && window.ccAddDiag('objective:thematic:check', { objProgress, allComplete }); } catch {}
              if (allComplete) {
                const finalTime = timeElapsed + helpPenalty;
                try { window.ccAddDiag && window.ccAddDiag('objective:thematic:completed', { objProgress, timeElapsed, penalty: helpPenalty, finalTime }); } catch {}
                setTimeout(() => {
                  setGameActive(false);
                  setSoloGameEndOverlay({
                    score: pairsFound, pairsValidated: pairsFound, duration: finalTime, errors: 0, mode: 'solo',
                    timestamp: Date.now(), objectiveMode: true, objectiveTarget: pairsFound,
                    objectiveThemes, objectiveProgress: objProgress,
                    helpStats: { ...helpStatsRef.current },
                    masterySession: getActiveSessionProgress(), masteryAll: getMasteryProgress()
                  });
                }, 600);
              }
            } else if (pairsFound >= objectiveTarget) {
              // Fallback: mode simple (nombre de paires)
              const finalTime = timeElapsed + helpPenalty;
              try { window.ccAddDiag && window.ccAddDiag('objective:completed', { pairsFound, target: objectiveTarget, timeElapsed, penalty: helpPenalty, finalTime }); } catch {}
              setTimeout(() => {
                setGameActive(false);
                setSoloGameEndOverlay({
                  score: pairsFound, pairsValidated: pairsFound, duration: finalTime, errors: 0, mode: 'solo',
                  timestamp: Date.now(), objectiveMode: true, objectiveTarget,
                  helpStats: { ...helpStatsRef.current },
                  masterySession: getActiveSessionProgress(), masteryAll: getMasteryProgress()
                });
              }, 600);
            }
          }
          // Reset aide pour la prochaine carte
          setHelpLevel(0);
          setHelpBubble(null);
          setHighlightedZoneIds([]);
          // Comptage de manches en mode solo (fallback)
          if (!(socket && socket.connected) && !objectiveMode) {
            if (Number.isFinite(roundsPerSession)) {
              setRoundsPlayed(prev => {
                const nxt = (typeof prev === 'number' ? prev : 0) + 1;
                if (nxt >= roundsPerSession) {
                  try { setGameActive(false); } catch {}
                }
                return nxt;
              });
            } else {
              setRoundsPlayed(prev => (typeof prev === 'number' ? prev + 1 : 1));
            }
          }
          if (objectiveModeRef.current) {
            setRoundsPlayed(prev => (typeof prev === 'number' ? prev + 1 : 1));
          }
          setTimeout(() => {
            setGameSelectedIds([]);
            setGameMsg('');
            // En mode multiplayer, le serveur gère la régénération après pair:valid
            // En mode solo ou objectif, on régénère localement (le serveur peut avoir terminé sa session en mode objectif)
            const isObjMode = objectiveModeRef.current || (() => { try { return !!JSON.parse(localStorage.getItem('cc_session_cfg') || 'null')?.objectiveMode; } catch { return false; } })();
            console.log('[CC] Post-pair regen check:', { socketConnected, objectiveMode: objectiveModeRef.current, isObjMode, willRegen: !socketConnected || isObjMode });
            if (!socketConnected || isObjMode) {
              console.log('[CC] Calling safeHandleAutoAssign for board regen');
              safeHandleAutoAssign();
            }
            // Sinon, attendre que le serveur envoie round:new avec les nouvelles zones
          }, 450);
      } else {
        console.log('[GAME] BAD pair', { a, b, ZA: ZA && { id: ZA.id, type: ZA.type, pairId: ZA.pairId }, ZB: ZB && { id: ZB.id, type: ZB.type, pairId: ZB.pairId } });
        try {
          const reason = !ZA || !ZB ? 'zone_missing' : !allowed(t1, t2) ? 'type_mismatch' : !p1 || !p2 ? 'no_pairId' : p1 !== p2 ? 'pairId_mismatch' : 'unknown';
          window.ccAddDiag && window.ccAddDiag('solo:pair:incorrect', {
            zoneA: { id: a, type: t1, content: String(ZA?.content || ZA?.label || '').substring(0, 60), pairId: p1 || null },
            zoneB: { id: b, type: t2, content: String(ZB?.content || ZB?.label || '').substring(0, 60), pairId: p2 || null },
            reason, latencyMs: latency, itemType: item_type, theme, itemDetail,
            round: Number(roundsPlayed) || 0, score: scoreRef.current
          });
        } catch {}
        try { masteryRecordPair(p1 || p2 || '', false, latency); } catch {}
        setGameMsg('Mauvaise association');
        setShowBigCross(true);
        playWrongSound();
        showWrongFlash();
        // Notifier le serveur de l'erreur pour le tracking des stats
        try { if (socket && socket.connected) socket.emit('pair:error'); } catch {}
        // Enregistrer tentative KO
        try { pgRecordAttempt({ item_type, item_id: itemDetail || `${ZA?.id}|${ZB?.id}`, objective_key: `${levelClass}:${theme}`, correct: false, latency_ms: latency, level_class: levelClass, theme, round_index: Number(roundsPlayed)||0 }); } catch {}
        // laisser l'effet visuel un court instant puis reset
        setTimeout(() => { setGameSelectedIds([]); setGameMsg(''); setShowBigCross(false); }, 400);
      }
    }
    return next;
  });

}

// --- SYSTÈME D'AIDE: Handlers ---
function handleHintClick() {
  if (!gameActive || !helpEnabled || helpLevel >= 1) return;
  const hint = generateHint(zones);
  if (!hint) return;
  setHelpLevel(1);
  setHelpBubble(hint);
  setHelpPenalty(p => p + HINT_PENALTY);
  helpStatsRef.current.hintsUsed += 1;
  helpStatsRef.current.totalPenalty += HINT_PENALTY;
  try { window.ccAddDiag && window.ccAddDiag('help:hint', { text: hint.text, kind: hint.kind, penalty: HINT_PENALTY }); } catch {}
  // Auto-masquer après 6s
  setTimeout(() => { setHelpBubble(prev => prev && prev.icon === '💡' ? null : prev); }, 6000);
}

function handleAnswerClick() {
  if (!gameActive || !helpEnabled || helpLevel < 1 || helpLevel >= 2) return;
  const answer = generateAnswer(zones);
  if (!answer) return;
  setHelpLevel(2);
  setHelpBubble(answer);
  setHelpPenalty(p => p + ANSWER_PENALTY);
  helpStatsRef.current.answersUsed += 1;
  helpStatsRef.current.totalPenalty += ANSWER_PENALTY;
  if (answer.zoneAId && answer.zoneBId) {
    setHighlightedZoneIds([answer.zoneAId, answer.zoneBId]);
  }
  try { window.ccAddDiag && window.ccAddDiag('help:answer', { text: answer.text, kind: answer.kind, penalty: ANSWER_PENALTY, zoneA: answer.zoneAId, zoneB: answer.zoneBId }); } catch {}
  // Auto-masquer après 10s
  setTimeout(() => { setHelpBubble(prev => prev && prev.icon === '🎯' ? null : prev); setHighlightedZoneIds([]); }, 10000);
}

useEffect(() => {
  localStorage.setItem('selectedArcPoints', JSON.stringify(selectedArcPoints));
}, [selectedArcPoints]);

  // Fonction pour sélectionner/désélectionner un point pour l'arc du texte
  const handleArcPointClick = (zoneId, idx) => {
    setSelectedArcPoints(prev => {
      const current = prev[zoneId] || [];
      if (current.includes(idx)) {
        // Si déjà sélectionné, on l'enlève
        const newArc = current.filter(i => i !== idx);
        setTimeout(() => {
          if (newArc.length === 2) {
            console.log(`[ArcPoints] Zone ${zoneId}: [${newArc[0]}, ${newArc[1]}]`);
          }
        }, 0);
        return { ...prev, [zoneId]: newArc };
      } else if (current.length < 2) {
        // Ajoute le point (max 2)
        const newArc = [...current, idx];
        setTimeout(() => {
          if (newArc.length === 2) {
            console.log(`[ArcPoints] Zone ${zoneId}: [${newArc[0]}, ${newArc[1]}]`);
          }
        }, 0);
        return { ...prev, [zoneId]: newArc };
      } else {
        // Si déjà 2, on remplace le plus ancien
        const newArc = [current[1], idx];
      setTimeout(() => {
        if (newArc.length === 2) {
          console.log(`[ArcPoints] Zone ${zoneId}: [${newArc[0]}, ${newArc[1]}]`);
        }
      }, 0);
      return { ...prev, [zoneId]: newArc };
      }
    });
  };

  // --- Tous les hooks d'abord (ordre strict !) ---
  // Paramètres personnalisés pour le texte courbé des zones vertes
  const [editingZoneId, setEditingZoneId] = useState(null);
  // Pour édition directe sur le texte courbé
  const [editingTextZoneId, setEditingTextZoneId] = useState(null);
  const [editingTextValue, setEditingTextValue] = useState('');

  // Valeurs par défaut pour l'édition
  const defaultTextSettings = {
    text: '',
    angle: 0,
    fontSize: 32,
    fontFamily: 'Arial',
    color: '#fff'
  };

  // Ouvre le panneau d'édition avancée pour une zone verte
const handleEditGreenZone = (zone) => {
  // Ne jamais ouvrir l'éditeur en mode jeu ou si pas en mode édition
  if (gameActive || !editMode) return;
  setEditingZoneId(zone.id);
  setCustomTextSettings(settings => ({
    ...settings,
    [zone.id]: {
      ...defaultTextSettings,
      ...settings[zone.id],
      text: zone.content || settings[zone.id]?.text || '',
    }
  }));
};

  // Met à jour un paramètre du texte courbé
  const updateTextSetting = (zoneId, key, value) => {
    setCustomTextSettings(settings => ({
      ...settings,
      [zoneId]: {
        ...settings[zoneId],
        [key]: value
      }
    }));
  };

  // Valide et applique les modifs
  const validateTextSettings = (zoneId) => {
    // Optionnel : tu peux aussi mettre à jour le contenu principal de la zone ici
    setEditingZoneId(null);
  };

  // Ferme l'édition sans valider
  const cancelTextSettings = () => setEditingZoneId(null);
  const [drawingMode, setDrawingMode] = useState(false);
  const [editPoints, setEditPoints] = useState([]); // [{x, y, handleIn, handleOut}]
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [draggedHandle, setDraggedHandle] = useState(null); // {idx, type: 'in'|'out'}
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedZoneId, setCopiedZoneId] = useState(null);
  const [zoneColor, setZoneColor] = useState('yellow');
  const [selectedPointIdx, setSelectedPointIdx] = useState(null);
  const [hoveredZoneId, setHoveredZoneId] = useState(null);
  // --- Multiplayer state ---
  const [roomId, setRoomId] = useState('default');
  const [playerName, setPlayerName] = useState(() => {
    try {
      const storedName = localStorage.getItem('cc_student_name');
      if (storedName && storedName !== 'Joueur') return storedName;
      const a = JSON.parse(localStorage.getItem('cc_auth') || '{}');
      if (a.name && a.name !== 'Utilisateur') return a.name;
      if (a.firstName) return [a.firstName, a.lastName].filter(Boolean).join(' ').trim();
      if (a.email) return a.email.split('@')[0];
    } catch {}
    const rnd = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `Joueur-${rnd}`;
  });
  const [scoresMP, setScoresMP] = useState([]); // [{id,name,score}]
  const [mpMsg, setMpMsg] = useState('');
  // Solo mode detection (hide lobby UI)
  const [isSoloMode] = useState(() => {
    try { const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null'); return cfg && cfg.mode === 'solo'; } catch { return false; }
  });
  // Lobby/ready state
  const [roomStatus, setRoomStatus] = useState('lobby'); // 'lobby'|'countdown'|'playing'
  const [roomPlayers, setRoomPlayers] = useState([]); // [{id,nickname,score,ready,isHost}]
  const [isHost, setIsHost] = useState(false);
  const [myReady, setMyReady] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [isTiebreaker, setIsTiebreaker] = useState(false);
  const [countdownT, setCountdownT] = useState(null);
  const [arenaPauseInfo, setArenaPauseInfo] = useState(null); // { paused, disconnectedPlayer, gracePeriodMs }
  // Rotation en degrés des contenus pour zones calcul/chiffre (par id de zone)
  const [calcAngles, setCalcAngles] = useState(() => {
    try {
      const raw = localStorage.getItem('cc_calc_angles');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  // Offsets manuels pour déplacer chiffre/calcul à la souris
  const [mathOffsets, setMathOffsets] = useState(() => {
    try {
      const raw = localStorage.getItem('cc_math_offsets');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }); // { [zoneId]: { x, y } }
  const [dragState, setDragState] = useState({ id: null, start: null, orig: null, moved: false });

  useEffect(() => {
    try { localStorage.setItem('cc_calc_angles', JSON.stringify(calcAngles)); } catch {}
  }, [calcAngles]);
  useEffect(() => {
    try { localStorage.setItem('cc_math_offsets', JSON.stringify(mathOffsets)); } catch {}
  }, [mathOffsets]);

  // Flush des tentatives quand on quitte le jeu ou quand on arrête la partie
  useEffect(() => {
    const onBeforeUnload = () => { try { pgFlushAttempts(); } catch {} };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      try { pgFlushAttempts(); } catch {}
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);
  useEffect(() => {
    if (!gameActive) {
      try { pgFlushAttempts(); } catch {}
    }
  }, [gameActive]);

  // --- Edit mode and backend sync for positions/angles ---
  const [editMode, setEditMode] = useState(false);
  const [isLoadingPositions, setIsLoadingPositions] = useState(false);
  const [isSavingPositions, setIsSavingPositions] = useState(false);

  // Affichage colonne latérale de jeu (même sans plein écran)
  const hasSidebar = fullScreen || roomStatus === 'playing' || gameActive;
  useEffect(() => {
    if (hasSidebar) {
      try { document.body.classList.add('cc-game'); document.body.style.overflow = 'hidden'; } catch {}
      try { window.dispatchEvent(new CustomEvent('cc:gameMode', { detail: { on: true } })); } catch {}
    } else {
      try { document.body.classList.remove('cc-game'); document.body.style.overflow = ''; } catch {}
      try { window.dispatchEvent(new CustomEvent('cc:gameMode', { detail: { on: false } })); } catch {}
    }
    return () => { try { document.body.classList.remove('cc-game'); document.body.style.overflow = ''; } catch {} };
  }, [hasSidebar]);

  // Load saved positions/angles from backend once on mount (solo/MP classic only)
  useEffect(() => {
    // Skip in Training/Arena mode — server provides positions via socket events
    if (trainingMatchId || arenaMatchId) return;
    let abort = false;
    const load = async () => {
      try {
        setIsLoadingPositions(true);
        const apiBase = getBackendUrl();
        const res = await fetch(`${apiBase}/math-positions`, { method: 'GET' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (abort) return;
        if (data && typeof data === 'object') {
          const payload = data.data && typeof data.data === 'object' ? data.data : data;
          if (payload.mathOffsets && typeof payload.mathOffsets === 'object') {
            setMathOffsets(prev => ({ ...prev, ...payload.mathOffsets }));
          }
          if (payload.calcAngles && typeof payload.calcAngles === 'object') {
            setCalcAngles(prev => ({ ...prev, ...payload.calcAngles }));
          }
          // Sync to localStorage for this origin so both localhost and LAN keep a copy
          try {
            if (payload.mathOffsets) localStorage.setItem('cc_math_offsets', JSON.stringify(payload.mathOffsets));
            if (payload.calcAngles) localStorage.setItem('cc_calc_angles', JSON.stringify(payload.calcAngles));
          } catch {}
        }
        setMpMsg && setMpMsg('Positions chargées');
      } catch (e) {
        console.warn('Load math positions failed:', e);
      } finally {
        if (!abort) setIsLoadingPositions(false);
      }
    };
    load();
    return () => { abort = true; };
  }, []);

  // Responsive: détecte mobile et ajuste les panneaux pour ne pas masquer la carte
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      setIsPortrait(window.innerHeight > window.innerWidth);
      // Par défaut sur mobile, masquer l'historique
      setHistoryExpanded(!mobile);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [gameActive, roomStatus]);

  // Force fullscreen + landscape orientation on mobile when game is active
  useEffect(() => {
    if (!gameActive && roomStatus !== 'playing') return;
    if (!isMobile) return;
    const tryImmersive = async () => {
      // 1. Request fullscreen to hide browser chrome (address bar + nav bar)
      try {
        const el = document.documentElement;
        const rfs = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
        if (rfs && !document.fullscreenElement && !document.webkitFullscreenElement) {
          await rfs.call(el);
        }
      } catch (e) {
        console.debug('[CC] Fullscreen not supported:', e.message);
      }
      // 2. Try to lock orientation to landscape
      try {
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape');
        }
      } catch (e) {
        console.debug('[CC] Orientation lock not supported:', e.message);
      }
    };
    tryImmersive();
    return () => {
      try {
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
      } catch {}
      try {
        const efd = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
        if (efd && (document.fullscreenElement || document.webkitFullscreenElement)) {
          efd.call(document);
        }
      } catch {}
    };
  }, [gameActive, roomStatus, isMobile]);

  const handleToggleEditMode = () => {
    if (gameActive || roomStatus === 'playing') {
      setMpMsg && setMpMsg('Mode édition indisponible: partie en cours');
      return; // safety
    }
    setEditMode(v => !v);
    setMpMsg && setMpMsg(prev => (prev ? prev + ' • ' : '') + (!editMode ? 'Mode édition ON' : 'Mode édition OFF'));
  };

  const handleSaveMathPositions = async () => {
    if (gameActive || roomStatus === 'playing') return;
    try {
      setIsSavingPositions(true);
      const apiBase = `${window.location.protocol}//${window.location.hostname}:4000`;
      const res = await fetch(`${apiBase}/save-math-positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mathOffsets, calcAngles })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const out = await res.json();
      if (out && (out.ok || out.success)) {
        setMpMsg && setMpMsg('Positions enregistrées');
        // Keep localStorage in sync for current origin
        try {
          localStorage.setItem('cc_math_offsets', JSON.stringify(mathOffsets));
          localStorage.setItem('cc_calc_angles', JSON.stringify(calcAngles));
        } catch {}
      } else {
        setMpMsg && setMpMsg('Échec enregistrement positions');
      }
    } catch (e) {
      console.error('Save math positions failed:', e);
      setMpMsg && setMpMsg('Erreur enregistrement');
    } finally {
      setIsSavingPositions(false);
    }
  };

  // Listen to NavBar global events (added in NavBar.js)
  useEffect(() => {
    const onToggle = () => handleToggleEditMode();
    const onSave = () => handleSaveMathPositions();
    window.addEventListener('cc:toggleEditMode', onToggle);
    window.addEventListener('cc:saveMathPositions', onSave);
    return () => {
      window.removeEventListener('cc:toggleEditMode', onToggle);
      window.removeEventListener('cc:saveMathPositions', onSave);
    };
  }, [handleToggleEditMode, handleSaveMathPositions]);

  // Broadcast editMode changes to NavBar so it can style ON/OFF
  useEffect(() => {
    try {
      const evt = new CustomEvent('cc:editModeChanged', { detail: { editMode } });
      window.dispatchEvent(evt);
    } catch (e) {
      // Fallback for environments without CustomEvent
      window.dispatchEvent(new Event('cc:editModeChanged'));
    }
  }, [editMode]);

  // (Supprimé) Ancienne connexion Socket.IO MVP (port 4001) remplacée par la connexion unifiée via socketRef au début du composant.

  // Expose des hooks CustomEvent pour NavBar / autres composants
  useEffect(() => {
    function onEndSessionReq() {
      if (!socket) return;
      try { socket.emit('session:end'); } catch {}
    }
    function onHistoryRefreshReq() {
      if (!socket) return;
      try {
        socket.emit('session:history:get', (res) => {
          if (res && res.ok && Array.isArray(res.sessions)) {
            setSessions(res.sessions);
            try { window.dispatchEvent(new CustomEvent('cc:sessionsUpdated', { detail: { sessions: res.sessions } })); } catch {}
          }
        });
      } catch {}
    }
    window.addEventListener('cc:endSession', onEndSessionReq);
    window.addEventListener('cc:history:refresh', onHistoryRefreshReq);
    return () => {
      window.removeEventListener('cc:endSession', onEndSessionReq);
      window.removeEventListener('cc:history:refresh', onHistoryRefreshReq);
    };
  }, [socket]);
  // Handler global pour terminer la session (utilisable dans le rendu)
  const handleEndSessionNow = () => {
    const s = socketRef.current;
    if (!s) return;
    try { s.emit('session:end'); } catch {}
  };
  const handleStartRoom = () => {
    if (!socket) return;
    try {
      console.debug('[CC][client] emit room:start');
      socket.emit('room:start');
      // Lancer un timer de sécurité: si pas de 'round:new' sous 3s, prévenir dans les logs et l'UI
      if (roundNewTimerRef.current) {
        clearTimeout(roundNewTimerRef.current);
        roundNewTimerRef.current = null;
      }
      roundNewTimerRef.current = setTimeout(() => {
        console.warn('[CC][client] round:new non reçu 3s après room:start');
        setMpMsg && setMpMsg('En attente du serveur… (round non reçu)');
      }, 3000);
    } catch (e) {
      console.warn('[CC][client] emit room:start failed', e);
    }
  };
  const handleLeaveRoom = () => {
    if (!socket) return;
    try {
      setMyReady(false);
      setRoomStatus('lobby');
      socket.emit('joinRoom', { roomId: 'default', name: playerName });
      setRoomId('default');
    } catch {}
  };

  // Créer une salle (lobby)
  const handleCreateRoom = () => {
    if (isCreatingRoom) return; // anti double-clic
    if (!socket || !socket.connected) {
      // Gestion explicite du cas non connecté côté UI
      setMpMsg('Impossible de créer la salle: connexion non établie au serveur.');
      return;
    }
    setIsCreatingRoom(true);
    try {
      socket.emit('room:create', (res) => {
        setIsCreatingRoom(false);
        if (res?.ok && res.roomCode) {
          setRoomId(res.roomCode);
          setMpMsg(`Salle créée: ${res.roomCode}`);
          try { socket.emit('joinRoom', { roomId: res.roomCode, name: playerName }); } catch {}
        } else {
          setMpMsg('Création de salle impossible');
        }
      });
    } catch (e) {
      setIsCreatingRoom(false);
      console.warn('[CC][client] room:create emit failed', e);
      setMpMsg && setMpMsg('Création de salle échouée');
    }
  };

  // Rejoindre une salle existante avec le code saisi
  const handleJoinRoom = () => {
    if (!socket || !roomId) return;
    try { socket.emit('joinRoom', { roomId, name: playerName }); } catch {}
  };

  // Basculer l'état prêt/pas prêt
  const handleToggleReady = () => {
    if (!socket) return;
    try { socket.emit('ready:toggle', { ready: !myReady }); setMyReady(r => !r); } catch {}
  };

  // Hôte: définir le nombre de manches par session (valeur entière bornée)
  const handleSetRounds = (value) => {
    if (!socket) return;
    let n = parseInt(value, 10);
    if (!Number.isFinite(n)) n = 3;
    // borne 1..20
    n = Math.min(20, Math.max(1, n));
    console.debug('[CC][client] setRounds emit', { raw: value, clamped: n });
    // MAJ locale immédiate
    setRoundsPerSession(n);
    try {
      socket.emit('room:setRounds', n, (res) => {
        console.debug('[CC][client] setRounds ack', res);
        if (res && res.ok && Number.isFinite(res.roundsPerSession)) {
          setRoundsPerSession(res.roundsPerSession);
        }
      });
    } catch (e) {
      console.warn('[CC][client] setRounds emit failed', e);
    }
  };

  // Référence de taille moyenne des zones chiffre pour homogénéiser leur taille
  const chiffreRefBase = useMemo(() => {
    try {
      if (!Array.isArray(zones) || zones.length === 0) return null;
      const bases = zones
        .filter(z => z?.type === 'chiffre' && Array.isArray(z.points) && z.points.length)
        .map(z => {
          const b = getZoneBoundingBox(z.points);
          return Math.max(12, Math.min(b.width, b.height));
        });
      if (!bases.length) return null;
      const avg = bases.reduce((a, b) => a + b, 0) / bases.length;
      return avg;
    } catch {
      return null;
    }
  }, [zones]);
  const [selectedZoneIds, setSelectedZoneIds] = useState([]);
  const [attributionMode, setAttributionMode] = useState(false);
  const [zoneToEdit, setZoneToEdit] = useState(null);
  const [formData, setFormData] = useState({ type: '', content: '', pairId: '' });
  const [draggedZoneId, setDraggedZoneId] = useState(null);
  const [dragOrigin, setDragOrigin] = useState(null);
  const [prevEditingZone, setPrevEditingZone] = useState(null);
  const svgOverlayRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const skipNextClickRef = useRef(false);
  const [texts, setTexts] = useState({
    top: '417',
    topRight: '3/7 x 11',
    right: '219',
    bottomRight: '42 x 16',
    bottom: '15',
    bottomLeft: '9 x 7',
    left: '80',
    topLeft: 'Quenette'
  });
  const [topLinkUrl, setTopLinkUrl] = useState('https://example.com');
  const [copiedDebugZoneId, setCopiedDebugZoneId] = useState(null);
  // Zoom preview pour agrandir les images en jeu
  const [zoomPreviewSrc, setZoomPreviewSrc] = useState(null);
  const zoomTimerRef = useRef(null);
  // Gestion des retries ciblés pour certaines images problématiques
  const [retryMap, setRetryMap] = useState({}); // { [contentPath]: retryCount }
  const problematicList = useRef(new Set([
    'images/2024-09-10 13-37-16 (10).jpeg'
  ]));

  // --- Hooks useEffect ---
  useEffect(() => {
    // On vide le localStorage à chaque chargement pour forcer la randomisation
    localStorage.removeItem('zones');
    localStorage.removeItem('customTextSettings');
  }, []);

  // Préchargement ciblé des images problématiques (réduit les ratés au premier rendu)
  useEffect(() => {
    const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
    problematicList.current.forEach(p => {
      const full = p.startsWith('http') ? p : `${base}/${p.startsWith('/') ? p.slice(1) : p}`;
      const src = encodeURI(full)
        .replace(/ /g, '%20')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29');
      const im = new Image();
      im.src = src + `#preload=${Date.now()}`;
    });
  }, []);

  useEffect(() => {
    // MODE ARENA: Charger zones depuis localStorage
    if (arenaMatchId) {
      console.log('[ARENA] Détection mode arena, matchId:', arenaMatchId);
      try {
        const arenaData = JSON.parse(localStorage.getItem('cc_crazy_arena_game') || '{}');
        if (arenaData.zones && Array.isArray(arenaData.zones)) {
          console.log('[ARENA] Zones chargées depuis localStorage:', arenaData.zones.length);
          // Compter les zones calcul/chiffre pour éviter message "zones vides"
          const calcCount = arenaData.zones.filter(z => z.type === 'calcul' || z.type === 'chiffre').length;
          const imageCount = arenaData.zones.filter(z => z.type === 'image' || z.type === 'texte').length;
          try {
            window.__CC_LAST_FILTER_COUNTS__ = { calcNum: calcCount, textImage: imageCount };
            console.log('[ARENA] Filter counts set:', { calcNum: calcCount, textImage: imageCount });
          } catch {}
          setZones(arenaData.zones);
          // ✅ FIX: Synchroniser calcAngles et reset mathOffsets dès le chargement initial Arena
          const arenaAngles = {};
          arenaData.zones.forEach(z => {
            if ((z.type === 'calcul' || z.type === 'chiffre') && typeof z.angle === 'number') {
              arenaAngles[z.id] = z.angle;
            }
          });
          setCalcAngles(arenaAngles);
          setMathOffsets({});
          setGameActive(true);
          setTimeLeft(arenaData.duration || 60);
          setLoading(false);
          setRoomStatus('playing');
          setFullScreen(true);
          console.log('[ARENA] Mode jeu activé - bypass lobby, angles synced:', Object.keys(arenaAngles).length);
          return;
        }
      } catch (e) {
        console.error('[ARENA] Erreur chargement zones:', e);
      }
    }
    // Détecter le mode (solo vs multijoueur)
    let isSoloMode = false;
    try {
      const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
      isSoloMode = cfg && cfg.mode === 'solo';
    } catch {}
    
    // En mode MULTIJOUEUR, ne PAS générer de zones au chargement
    // Le serveur enverra les zones via round:new
    if (!isSoloMode) {
      console.log('[CC][client] MULTIPLAYER: Skipping initial zone generation, waiting for server');
      setLoading(false);
      return;
    }
    
    // MODE SOLO UNIQUEMENT : Génération locale au chargement
    const fetchZones = async () => {
      try {
        setError(null); // ou setError("")
        const tryFetch = async (path) => {
          const r = await fetch(path);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        };
        const p2 = process.env.PUBLIC_URL + '/data/zones2.json';
        const p1 = process.env.PUBLIC_URL + '/data/zones.json';
        let data;
        try {
          console.log('Tentative chargement initial', p2);
          data = await tryFetch(p2);
        } catch (e1) {
          console.warn('zones2.json indisponible, fallback vers zones.json');
          data = await tryFetch(p1);
        }
        console.log('ZONES JSON CHARGÉ:', data);
        // Attribution aléatoire des textes aux zones de type 'texte' (aucun doublon)
const zonesTexte = data.filter(z => z.type === 'texte');
const zonesImage = data.filter(z => z.type === 'image');
const zonesCalcul = data.filter(z => z.type === 'calcul');
const zonesChiffre = data.filter(z => z.type === 'chiffre');

let textesMelanges = shuffleArray(TEXTES_RANDOM);
// Attribution unique
const dataWithRandomTexts = data.map(z => {
  if (z.type === 'texte') {
    return { ...z, content: textesMelanges.pop() || '' };
  }
  return z;
});

// Correspondance unique texte <-> image
let correspondanceTexteImage = null;
if (zonesTexte.length && zonesImage.length) {
  const zoneTexte = shuffleArray(zonesTexte)[0];
  const zoneImage = shuffleArray(zonesImage)[0];
  correspondanceTexteImage = { texteId: zoneTexte.id, imageId: zoneImage.id };
}
// Correspondance unique calcul <-> chiffre
let correspondanceCalculChiffre = null;
if (zonesCalcul.length && zonesChiffre.length) {
  const zoneCalcul = shuffleArray(zonesCalcul)[0];
  const zoneChiffre = shuffleArray(zonesChiffre)[0];
  correspondanceCalculChiffre = { calculId: zoneCalcul.id, chiffreId: zoneChiffre.id };
}
// Tu peux stocker ces correspondances dans le state si tu veux les exploiter dans l'UI
console.log('Attribution aléatoire appliquée :', dataWithRandomTexts);
setZones(dataWithRandomTexts);
        setLoading(false);
      } catch (e) {
        const msg = 'Erreur lors du chargement des zones (zones2.json puis zones.json) : ' + e.message;
        setError(msg);
        setLoading(false);
        alert(msg);
      }
    };
    // MODE SOLO : Priorité au localStorage si présent (ex: nettoyages faits depuis l'Admin)
    // MODE MULTIJOUEUR : Ne PAS charger depuis localStorage (zones viennent du serveur)
    try {
      const saved = localStorage.getItem('zones');
      if (saved && isSoloMode) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Log hash pour debug
          try {
            const boardHash = (() => {
              const s = JSON.stringify(parsed.map(z => ({ id: z.id, type: z.type, content: z.content })));
              let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
              return h;
            })();
            console.debug('[CC][client] setZones legacy with hash', boardHash);
          } catch {}
          setZones(parsed);
          setLoading(false);
          return; // ne pas refetch si on a déjà des zones locales
        }
      }
    } catch {}
    fetchZones();
  }, []);

  useEffect(() => {
    // En mode multijoueur, ne PAS sauvegarder les zones dans localStorage
    // car elles viennent du serveur et doivent être synchronisées
    try {
      const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
      const isSoloMode = cfg && cfg.mode === 'solo';
      if (isSoloMode) {
        localStorage.setItem('zones', JSON.stringify(zones));
      }
    } catch {}
  }, [zones]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedPointIdx !== null) {
          setEditPoints(points => points.filter((_, i) => i !== selectedPointIdx));
          setSelectedPointIdx(null);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedPointIdx]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedPointIdx !== null) {
          setEditPoints(points => points.filter((_, i) => i !== selectedPointIdx));
          setSelectedPointIdx(null);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedPointIdx]);

  // Ensure drag stops even if mouseup happens outside the SVG (top-level effect)
  useEffect(() => {
    const onWinMouseUp = () => {
      setDraggedIdx(null);
      setDraggedHandle(null);
      setIsDragging(false);
    };
    window.addEventListener('mouseup', onWinMouseUp);
    return () => window.removeEventListener('mouseup', onWinMouseUp);
  }, []);

  if (error) {
    return (
      <div style={{ background: '#ffeaea', color: '#b30000', padding: '24px', border: '2px solid #b30000', borderRadius: 8, margin: 32, fontSize: 20, textAlign: 'center', fontWeight: 'bold' }}>
        <span>❌ Erreur lors du chargement des zones :</span>
        <br />
        <span style={{ fontSize: 16, fontWeight: 'normal' }}>{error}</span>
        <br /><br />
        <span>Vérifie le fichier <b>public/data/zones2.json</b> (syntaxe JSON, crochets, etc.)</span>
      </div>
    );
  }

  // Fonction pour recharger zones.json et elements.json avant attribution automatique
  // Option C: zonesFile ('zones2' | 'zones') force la source de zones pour garantir la même base chez tous
  async function handleAutoAssign(seed, zonesFile) {
    const rng = makeRngFromSeed(seed);
    const deterministicSync = (zonesFile === 'zones2' || zonesFile === 'zones') || Number.isFinite(seed);
    try {
      // Tente zones2.json puis fallback vers zones.json
      const tryFetch = async (path) => {
        const r = await fetch(path);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        if (!ct.includes('application/json')) {
          // Évite de parser du HTML (ex: index.html) comme JSON
          const snippet = (await r.text()).slice(0, 120);
          throw new Error('Non-JSON response for ' + path + ': ' + snippet);
        }
        return r.json();
      };
      let zonesData;
      const p2 = process.env.PUBLIC_URL + '/data/zones2.json';
      const p1 = process.env.PUBLIC_URL + '/data/zones.json';
      // Si le serveur impose zonesFile ('zones2' | 'zones'), on l'utilise strictement; sinon fallback déterministe.
      const useForced = zonesFile === 'zones2' || zonesFile === 'zones';
      const forcedPath = useForced ? (zonesFile === 'zones2' ? p2 : p1) : null;
      if (useForced) {
        try {
          console.debug('[CC][client] handleAutoAssign: forced zones file', { zonesFile, path: forcedPath, seed });
          zonesData = await tryFetch(forcedPath);
        } catch (eForce) {
          console.warn('[CC][client] handleAutoAssign: failed to load forced zones file; skip reshuffle to keep sync', { zonesFile, path: forcedPath, error: String(eForce) });
          return; // éviter divergence
        }
      } else {
        try {
          console.log('Tentative chargement', p2);
          zonesData = await tryFetch(p2);
        } catch (e1) {
          console.warn('zones2.json indisponible, fallback vers zones.json');
          zonesData = await tryFetch(p1);
        }
      }
      // --- RANDOMISATION DES TEXTES ---
      const zonesTexte = zonesData.filter(z => z.type === 'texte');
      let textesMelanges = shuffleArray(TEXTES_RANDOM, rng);
      const dataWithRandomTexts = zonesData.map(z => {
        if (z.type === 'texte') {
          return { ...z, content: textesMelanges.pop() || '' };
        }
        return z;
      });
      console.log('ZONES CHARGED', dataWithRandomTexts.filter(z => z.id === 1752571493404 || z.id === 1752571661490));
      console.log('DEBUG ZONES AVANT ATTRIB', dataWithRandomTexts.filter(z => z.id === 1752571493404 || z.id === 1752571661490));
      const elementsData = await fetchElements();
      let updatedZones = await assignElementsToZones(dataWithRandomTexts, elementsData, undefined, rng, validatedPairIdsRef.current);
      // Éviter toute divergence en multi: ne pas faire de post-traitements dépendants du réseau
      if (!deterministicSync) {
        // Filtrer les images qui ne sont plus listées dans l'Admin (associations.json)
        try {
          const assocResp = await fetch(process.env.PUBLIC_URL + '/data/associations.json');
          const assoc = await assocResp.json();
          const knownImages = new Set((assoc?.images || []).map(i => i.url && i.url.toLowerCase().replace(/\\/g, '/')));
          const norm = (p) => {
            if (!p) return '';
            try { p = decodeURIComponent(p); } catch {}
            p = p.toLowerCase().replace(/\\/g, '/');
            const pub = (process.env.PUBLIC_URL || '').toLowerCase();
            if (pub && p.startsWith(pub)) p = p.slice(pub.length);
            if (p.startsWith('/')) p = p.slice(1);
            return p;
          };
          // Fallback pool: only images that are also known by Admin
          const fallbackPool = (elementsData || [])
            .filter(e => e?.type === 'image' && e?.content && knownImages.has(norm(e.content)))
            .slice();
          // Mélange le pool de fallback pour éviter de revoir toujours les mêmes
          for (let i = fallbackPool.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [fallbackPool[i], fallbackPool[j]] = [fallbackPool[j], fallbackPool[i]];
          }
          let fIdx = fallbackPool.length ? Math.floor(rng() * fallbackPool.length) : 0;
          updatedZones = updatedZones.map(z => {
            if (z?.type === 'image' && z?.content && !knownImages.has(norm(z.content))) {
              if (fallbackPool.length) {
                const e = fallbackPool[fIdx % fallbackPool.length];
                fIdx++;
                return { ...z, type: 'image', content: e.content, label: e.label || '', pairId: e.pairId || '' };
              }
              return { ...z, content: '', label: '', pairId: '' };
            }
            return z;
          });
        } catch (e) {
          console.warn('Filtrage images inconnues ignoré:', e);
        }
      }
      // Ne pas setter les zones ici pour éviter des états intermédiaires différents entre clients
      // Synchronise customTextSettings pour zones texte
      const newTextSettings = {};
      updatedZones.forEach(zone => {
        if (zone.type === 'texte') {
          newTextSettings[zone.id] = {
            ...defaultTextSettings,
            text: zone.content || ''
          };
        }
      });
      // Charger les associations pour l'algorithme "1 seule bonne association"
      let assocData = {};
      try {
        const respAssoc = await fetch(process.env.PUBLIC_URL + '/data/associations.json');
        assocData = await respAssoc.json();
        try { assocDataRef.current = assocData; } catch {}
        try {
          if (!isMasteryReady()) {
            initMasteryTracker(assocData, (evt) => { setMasteryEvent(evt); setMasteryProgress(getActiveSessionProgress()); try { masterySyncToServer(getBackendUrl(), getAuthHeaders()); } catch {} });
            try { masteryLoadFromServer(getBackendUrl(), getAuthHeaders()); } catch {}
          }
        } catch {}
      } catch (e) {
        console.warn('Impossible de charger associations.json pour l\'attribution:', e);
        if (deterministicSync) {
          console.warn('[CC][client] deterministic mode: skip reshuffle due to associations fetch failure to keep sync');
          return; // éviter divergence si un client échoue
        }
      }
      let validated = await assignElementsToZones(updatedZones, elementsData, assocData, rng, validatedPairIdsRef.current);
      if (!deterministicSync) {
        // Vérification et auto-réparation des URLs d'images (réseau): uniquement en mode local/legacy
        async function verifyImageUrl(url) {
          if (!url) return null;
          const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
          const candidates = [];
          const dec = (() => { try { return decodeURIComponent(url); } catch { return url; } })();
          const filename = dec.split('/').pop();
          candidates.push(url);
          candidates.push(dec);
          candidates.push('images/' + filename);
          candidates.push('/images/' + filename);
          candidates.push(base + '/images/' + filename);
          // Root-level fallbacks (files found directement sous public/)
          candidates.push(filename);
          candidates.push('/' + filename);
          candidates.push(base + '/' + filename);
          candidates.push('images/' + encodeURIComponent(filename));
          candidates.push(base + '/images/' + encodeURIComponent(filename));
          for (const cand of candidates) {
            try {
              const res = await fetch(cand, { method: 'GET' });
              if (res.ok) return cand;
            } catch (e) {
              // ignore and try next
            }
          }
          return null;
        }
        validated = await Promise.all(
          validated.map(async (z) => {
            if (z?.type === 'image' && z?.content) {
              const ok = await verifyImageUrl(z.content);
              if (ok && ok !== z.content) {
                return { ...z, content: ok };
              }
            }
            return z;
          })
        );
      }
      // --- Post-traitement: garantir AU MOINS UNE association vraie ---
      function parseOperation(s) {
        if (!s) return null;
        const raw = String(s).trim();
        const _pn = (t) => { const c = String(t).replace(/\s/g, '').replace(/,/g, '.'); const v = parseFloat(c); return Number.isFinite(v) ? v : NaN; };
        const _r8 = (v) => Math.round(v * 1e8) / 1e8;
        // Format textuel: "le/la double/moitié/tiers/quart/triple de X"
        const tm = raw.match(/^l[ea]\s+(double|triple|tiers|quart|moiti[ée])\s+de\s+(.+)$/i);
        if (tm) {
          const k = tm[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const v = _pn(tm[2]); if (Number.isNaN(v)) return null;
          let r; switch (k) { case 'double': r = v * 2; break; case 'triple': r = v * 3; break; case 'moitie': r = v / 2; break; case 'tiers': r = v / 3; break; case 'quart': r = v / 4; break; default: return null; }
          return Number.isFinite(r) ? { a: v, b: null, op: k, result: _r8(r) } : null;
        }
        // Format "A op ? = C" (trouver l'inconnu)
        const norm = raw.replace(/×/g, '*').replace(/÷/g, '/').replace(/:/g, '/');
        const um = norm.match(/^(.+?)\s*([+\-*/])\s*\?\s*=\s*(.+)$/);
        if (um) {
          const a = _pn(um[1]), op = um[2], c = _pn(um[3]);
          if (Number.isNaN(a) || Number.isNaN(c)) return null;
          let r; switch (op) { case '+': r = c - a; break; case '-': r = a - c; break; case '*': r = a !== 0 ? c / a : NaN; break; case '/': r = c !== 0 ? a / c : NaN; break; default: return null; }
          return Number.isFinite(r) ? { a, b: c, op, result: _r8(r) } : null;
        }
        // Format simple "A op B" (décimaux, espaces milliers)
        const stripped = norm.replace(/\s/g, '').replace(/,/g, '.');
        const sm = stripped.match(/^(-?[\d.]+)([+\-*/])(-?[\d.]+)$/);
        if (sm) {
          const a = parseFloat(sm[1]), op = sm[2], b = parseFloat(sm[3]);
          if (Number.isNaN(a) || Number.isNaN(b)) return null;
          let r; switch (op) { case '+': r = a + b; break; case '-': r = a - b; break; case '*': r = a * b; break; case '/': r = b !== 0 ? a / b : NaN; break; default: return null; }
          return Number.isFinite(r) ? { a, b, op, result: _r8(r) } : null;
        }
        return null;
      }
      function randomDistractorText(exclude = []) {
        const pool = TEXTES_RANDOM.filter(t => !exclude.includes(t));
        if (pool.length === 0) return '';
        return pool[Math.floor(rng() * pool.length)];
      }
      // Identifie une image "principale" et garantit qu'au moins un texte partage son pairId
      let post = validated.map(z => ({ ...z }));

      // === MODE OBJECTIF: skip post-processing (assignElementsToZones gère déjà tout) ===
      const _isObjMode = (() => { try { return !!JSON.parse(localStorage.getItem('cc_session_cfg') || 'null')?.objectiveMode; } catch { return false; } })();
      if (_isObjMode) {
        console.log('[CC] Objective mode: skipping Admin post-processing, using assignElementsToZones result directly');
        setZones(post);
        setCustomTextSettings(newTextSettings);
        localStorage.setItem('zones', JSON.stringify(post));
        try { window.ccAddDiag && window.ccAddDiag('zones:assigned:objective', post); } catch {}
        return;
      }

      // Helper anti-répétition: tire un élément du deck (garantit voir TOUS avant répéter)
      // Remplace les boucles linéaires + mémoire courte (3 items) par le vrai deck system
      const pickFromPool = (deckName, pool, filterFn) => {
        const byId = new Map(pool.map(c => [String(c.id), c]));
        const ids = [...byId.keys()];
        if (!ids.length) return null;
        const picked = drawFromDeck(deckName, ids, rng, (candidateId) => {
          const cand = byId.get(candidateId);
          return cand && (!filterFn || filterFn(cand));
        });
        return picked ? byId.get(picked) : null;
      };
      const selectedCalcIdxs = new Set(); // protéger le calcul choisi si c'est une paire calc-chiffre
      let hadAnyAdminPairAssigned = false; // indique si on a pu poser 1 vraie paire Admin
      try {
        if (assocData && assocData.associations) {
          const imagesIdx = post.map((z, i) => ({ z, i })).filter(o => normType(o.z?.type) === 'image');
          const textesIdx = post.map((z, i) => ({ z, i })).filter(o => normType(o.z?.type) === 'texte');
          const calculsIdx = post.map((z, i) => ({ z, i })).filter(o => normType(o.z?.type) === 'calcul');
          const chiffresIdx = post.map((z, i) => ({ z, i })).filter(o => normType(o.z?.type) === 'chiffre');

          const normUrl = (p) => {
            if (!p) return '';
            let s = p;
            try { s = decodeURIComponent(s); } catch {}
            s = s.toLowerCase().replace(/\\/g, '/');
            const pub = (process.env.PUBLIC_URL || '').toLowerCase();
            if (pub && s.startsWith(pub)) s = s.slice(pub.length);
            if (s.startsWith('/')) s = s.slice(1);
            return s;
          };
          const normCalc = (t) => String(t || '').toLowerCase().replace(/\s+/g, '').replace(/[×*]/g, 'x');
          const normNum = (t) => String(t || '').replace(/\s+/g, '');

          const imgIdByUrl = new Map((assocData.images || []).map(it => [normUrl(it.url), it.id]));
          const txtIdByContent = new Map((assocData.textes || []).map(it => [norm(it.content), it.id]));
          const calcIdByContent = new Map((assocData.calculs || []).map(it => [normCalc(it.content), it.id]));
          const numIdByContent = new Map((assocData.chiffres || []).map(it => [normNum(it.content), it.id]));

          const imgTxtPairs = new Set(
            (assocData.associations || [])
              .filter(a => a.imageId && a.texteId)
              .map(a => `${a.imageId}|${a.texteId}`)
          );
          const calcNumPairs = new Set(
            (assocData.associations || [])
              .filter(a => a.calculId && a.chiffreId)
              .map(a => `${a.calculId}|${a.chiffreId}`)
          );

          // Préparer pools globaux
          let allImages = assocData.images || [];
          let allTextes = assocData.textes || [];
          let allCalcs = assocData.calculs || [];
          let allNums = assocData.chiffres || [];
          // Normaliser la structure des associations (peut être un objet {textImage, calcNum} ou un tableau mixte)
          let assocRoot = assocData.associations || [];
          try {
            const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
            const selThemesRaw = (cfg?.objectiveMode && Array.isArray(cfg?.objectiveThemes) && cfg.objectiveThemes.length > 0)
              ? cfg.objectiveThemes
              : (Array.isArray(cfg?.themes) ? cfg.themes : []);
            const selThemes = selThemesRaw.filter(Boolean).map(String);
            const selClasses = Array.isArray(cfg?.classes) ? cfg.classes.filter(Boolean).map(String) : [];
            const hasAny = (vals, selected) => {
              const ts = Array.isArray(vals) ? vals.map(String) : [];
              return selected.length === 0 || ts.some(t => selected.includes(t));
            };
            // Filtrage par thèmes (associations uniquement)
            if (selThemes.length > 0) {
              if (Array.isArray(assocRoot)) {
                assocRoot = assocRoot.filter(a => hasAny(a?.themes || [], selThemes));
              } else if (assocRoot && typeof assocRoot === 'object') {
                assocRoot = {
                  textImage: (assocRoot.textImage || []).filter(a => hasAny(a?.themes || [], selThemes)),
                  calcNum: (assocRoot.calcNum || []).filter(a => hasAny(a?.themes || [], selThemes)),
                };
              }
            }
            // Filtrage par niveau/classe CUMULATIF (CM2 inclut CP→CM2, cohérent avec elementsLoader/SessionConfig)
            if (selClasses.length > 0) {
              const LEVEL_ORDER = ["CP","CE1","CE2","CM1","CM2","6e","5e","4e","3e"];
              const lvlIdx = Object.fromEntries(LEVEL_ORDER.map((l, i) => [l, i]));
              const normLvl = (s) => {
                const x = String(s || '').toLowerCase();
                if (/\bcp\b/.test(x)) return 'CP';
                if (/\bce1\b/.test(x)) return 'CE1';
                if (/\bce2\b/.test(x)) return 'CE2';
                if (/\bcm1\b/.test(x)) return 'CM1';
                if (/\bcm2\b/.test(x)) return 'CM2';
                if (/\b6e\b/.test(x)) return '6e';
                if (/\b5e\b/.test(x)) return '5e';
                if (/\b4e\b/.test(x)) return '4e';
                if (/\b3e\b/.test(x)) return '3e';
                return '';
              };
              const maxLvlIdx = Math.max(...selClasses.map(c => lvlIdx[normLvl(c)] ?? -1));
              const byClassCumul = (a) => {
                const lc = a?.levelClass ? [String(a.levelClass)] : [];
                const arr = a?.levels || a?.classes || a?.classLevels || [];
                const vals = [...lc, ...arr].map(normLvl).filter(Boolean);
                return vals.length === 0 || vals.some(v => (lvlIdx[v] ?? 99) <= maxLvlIdx);
              };
              if (Array.isArray(assocRoot)) {
                assocRoot = assocRoot.filter(byClassCumul);
              } else if (assocRoot && typeof assocRoot === 'object') {
                assocRoot = {
                  textImage: (assocRoot.textImage || []).filter(byClassCumul),
                  calcNum: (assocRoot.calcNum || []).filter(byClassCumul),
                };
              }
            }
          } catch {}

          // Fonction utilitaire pour piocher un élément aléatoire différent d'une liste d'exclusions d'id
          const pickUnique = (arr, excludeIds = new Set()) => {
            const pool = arr.filter(x => !excludeIds.has(String(x.id)));
            if (!pool.length) return null;
            return pool[Math.floor(rng() * pool.length)];
          };
          // Mémoire courte des dernières images utilisées (éviter répétitions rapprochées entre manches)
          const getRecentImages = () => {
            try {
              const raw = localStorage.getItem('cc_recent_image_ids');
              const arr = raw ? JSON.parse(raw) : [];
              return Array.isArray(arr) ? arr.map(String) : [];
            } catch { return []; }
          };
          const setRecentImages = (arr) => {
            const capped = arr.slice(-3);
            try { localStorage.setItem('cc_recent_image_ids', JSON.stringify(capped)); } catch {}
            try { window.ccRecentImages = capped; } catch {}
          };
          // Mémoire courte des dernières URLs normalisées
          const getRecentUrls = () => {
            try {
              const raw = localStorage.getItem('cc_recent_image_urls');
              const arr = raw ? JSON.parse(raw) : [];
              return Array.isArray(arr) ? arr.map(String) : [];
            } catch { return []; }
          };
          const setRecentUrls = (arr) => {
            const capped = arr.slice(-3);
            try { localStorage.setItem('cc_recent_image_urls', JSON.stringify(capped)); } catch {}
            try { window.ccRecentImageUrls = capped; } catch {}
          };
          const recentImages = new Set(getRecentImages());
          const recentUrls = new Set(getRecentUrls());
          
          // Mémoire courte des derniers textes utilisés (éviter répétitions rapprochées entre manches)
          const getRecentTexts = () => {
            try {
              const raw = localStorage.getItem('cc_recent_texts');
              const arr = raw ? JSON.parse(raw) : [];
              return Array.isArray(arr) ? arr.map(String) : [];
            } catch { return []; }
          };
          const setRecentTexts = (arr) => {
            const capped = arr.slice(-3);
            try { localStorage.setItem('cc_recent_texts', JSON.stringify(capped)); } catch {}
            try { window.ccRecentTexts = capped; } catch {}
          };
          const recentTexts = new Set(getRecentTexts());
          
          // Mémoire courte des derniers calculs utilisés (éviter répétitions rapprochées entre manches)
          const getRecentCalcs = () => {
            try {
              const raw = localStorage.getItem('cc_recent_calcs');
              const arr = raw ? JSON.parse(raw) : [];
              return Array.isArray(arr) ? arr.map(String) : [];
            } catch { return []; }
          };
          const setRecentCalcs = (arr) => {
            const capped = arr.slice(-3);
            try { localStorage.setItem('cc_recent_calcs', JSON.stringify(capped)); } catch {}
            try { window.ccRecentCalcs = capped; } catch {}
          };
          const recentCalcs = new Set(getRecentCalcs());
          
          // Mémoire courte des derniers chiffres utilisés (éviter répétitions rapprochées entre manches)
          const getRecentNums = () => {
            try {
              const raw = localStorage.getItem('cc_recent_nums');
              const arr = raw ? JSON.parse(raw) : [];
              return Array.isArray(arr) ? arr.map(String) : [];
            } catch { return []; }
          };
          const setRecentNums = (arr) => {
            const capped = arr.slice(-3);
            try { localStorage.setItem('cc_recent_nums', JSON.stringify(capped)); } catch {}
            try { window.ccRecentNums = capped; } catch {}
          };
          const recentNums = new Set(getRecentNums());
          let textImageArr = Array.isArray(assocRoot)
            ? assocRoot.filter(a => a && a.imageId && a.texteId)
            : (assocRoot.textImage || []);
          let calcNumArr = Array.isArray(assocRoot)
            ? assocRoot.filter(a => a && a.calculId && a.chiffreId)
            : (assocRoot.calcNum || []);
          // Pool d'images strictement éligibles par métadonnées (Politique C), utilisé pour distracteurs
          let extraStrictImages = [];
          // Pool de textes strictement éligibles par métadonnées (Politique C), utilisé pour distracteurs
          let extraStrictTextes = [];

          // Si des thèmes/classes sont sélectionnés, restreindre les pools d'éléments
          // aux IDs référencés par les associations filtrées ci-dessus.
          try {
            const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
            const anyFilter = (Array.isArray(cfg?.themes) && cfg.themes.length > 0) || (Array.isArray(cfg?.classes) && cfg.classes.length > 0);
            if (anyFilter) {
              // Préparer/mettre à jour le pool d'images strictes (métadonnées) accessible plus bas pour les distracteurs
              const allowedImgIds = new Set(textImageArr.map(a => String(a.imageId)));
              const allowedTxtIds = new Set(textImageArr.map(a => String(a.texteId)));
              const allowedCalcIds = new Set(calcNumArr.map(a => String(a.calculId)));
              const allowedNumIds = new Set(calcNumArr.map(a => String(a.chiffreId)));
              if (allowedImgIds.size > 0) allImages = allImages.filter(it => allowedImgIds.has(String(it.id)));
              if (allowedTxtIds.size > 0) allTextes = allTextes.filter(it => allowedTxtIds.has(String(it.id)));
              if (allowedCalcIds.size > 0) allCalcs = allCalcs.filter(it => allowedCalcIds.has(String(it.id)));
              if (allowedNumIds.size > 0) allNums = allNums.filter(it => allowedNumIds.has(String(it.id)));

              // Politique C: strict partout — un élément doit lui-même matcher classes/thèmes.
              const selThemes = Array.isArray(cfg?.themes) ? cfg.themes.filter(Boolean).map(String) : [];
              const selClasses = Array.isArray(cfg?.classes) ? cfg.classes.filter(Boolean).map(String) : [];
              const normLevel = (s) => {
                const x = String(s || '').toLowerCase();
                if (/\bcp\b/.test(x)) return 'CP';
                if (/\bce1\b/.test(x)) return 'CE1';
                if (/\bce2\b/.test(x)) return 'CE2';
                if (/\bcm1\b/.test(x)) return 'CM1';
                if (/\bcm2\b/.test(x)) return 'CM2';
                if (/\b6e\b|\bsixieme\b/.test(x)) return '6e';
                if (/\b5e\b|\bcinquieme\b/.test(x)) return '5e';
                if (/\b4e\b|\bquatrieme\b/.test(x)) return '4e';
                if (/\b3e\b|\btroisieme\b/.test(x)) return '3e';
                return '';
              };
              const hasAny = (vals, selected) => {
                const ts = Array.isArray(vals) ? vals.map(String) : [];
                return selected.length === 0 || ts.some(t => selected.includes(t));
              };
              const pickLevels = (o) => {
                const lc = o?.levelClass ? [String(o.levelClass)] : [];
                const arr = o?.levels || o?.classes || o?.classLevels || [];
                return [...lc, ...arr].map(normLevel).filter(Boolean);
              };
              const LEVEL_ORD = ["CP","CE1","CE2","CM1","CM2","6e","5e","4e","3e"];
              const lvlOrdIdx = Object.fromEntries(LEVEL_ORD.map((l, i) => [l, i]));
              const maxSelIdx = Math.max(...selClasses.map(c => lvlOrdIdx[normLevel(c)] ?? -1));
              const strictLevelOk = (o) => {
                if (selClasses.length === 0) return true;
                const lv = pickLevels(o);
                if (!lv.length) return false;
                return lv.some(v => (lvlOrdIdx[v] ?? 99) <= maxSelIdx);
              };
              const strictThemeOk = (o) => hasAny(o?.themes || [], selThemes);
              if (selThemes.length > 0 || selClasses.length > 0) {
                const beforeCounts = { images: allImages.length, textes: allTextes.length, calculs: allCalcs.length, chiffres: allNums.length };
                allImages = allImages.filter(i => allowedImgIds.has(String(i.id)) || (strictThemeOk(i) && strictLevelOk(i)));
                allTextes = allTextes.filter(t => allowedTxtIds.has(String(t.id)) || (strictThemeOk(t) && strictLevelOk(t)));
                allCalcs = allCalcs.filter(c => allowedCalcIds.has(String(c.id)) || (strictThemeOk(c) && strictLevelOk(c)));
                allNums = allNums.filter(n => allowedNumIds.has(String(n.id)) || (strictThemeOk(n) && strictLevelOk(n)));
                // Pool strict méta pour images (incluant celles non référencées par associations)
                try {
                  const allStrict = (assocData.images || []).filter(i => strictThemeOk(i) && strictLevelOk(i));
                  const allowedSet = new Set(allImages.map(i => String(i.id)));
                  extraStrictImages = allStrict.filter(i => !allowedSet.has(String(i.id)));
                } catch {}
                // Pool strict méta pour textes (incluant ceux non référencés par associations)
                try {
                  const allStrictT = (assocData.textes || []).filter(t => strictThemeOk(t) && strictLevelOk(t));
                  const allowedSetT = new Set(allTextes.map(t => String(t.id)));
                  extraStrictTextes = allStrictT.filter(t => !allowedSetT.has(String(t.id)));
                } catch {}
                if (typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.host)) {
                  console.debug('[ASSIGN][STRICT] filtrage éléments', { beforeCounts, after: { images: allImages.length, textes: allTextes.length, calculs: allCalcs.length, chiffres: allNums.length } });
                }
              }

              // Nettoyage des contenus d'images préexistants non conformes (ex: restes d'une manche précédente)
              try {
                const allowedImg = new Set((allImages || []).map(i => String(i.id)));
                // Map URL->id disponible plus bas, on le refait ici rapidement
                const normUrl = (p) => {
                  if (!p) return '';
                  const normalized = String(p).startsWith('http')
                    ? String(p)
                    : (process.env.PUBLIC_URL + '/' + (String(p).startsWith('/') ? String(p).slice(1) : (String(p).startsWith('images/') ? String(p) : 'images/' + String(p))));
                  return encodeURI(normalized).replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
                };
                const imgIdByUrl = new Map();
                for (const im of (assocData.images || [])) {
                  const u = normUrl(im.url || im.path || im.src || '');
                  if (u) imgIdByUrl.set(u, String(im.id));
                }
                let cleaned = 0;
                post = post.map(z => {
                  if (normType(z?.type) !== 'image') return z;
                  const u = normUrl(z.content || z.url || z.path || z.src || '');
                  const id = imgIdByUrl.get(u);
                  if (id && !allowedImg.has(String(id))) {
                    cleaned++;
                    return { ...z, content: 'images/carte-vide.png', pairId: '' };
                  }
                  return z;
                });
                if (cleaned && typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.host)) {
                  console.debug('[ASSIGN][STRICT] images nettoyées (non conformes):', cleaned);
                }
              } catch {}

              // Politique C sur les associations elles-mêmes: ne garder qu'elles dont les éléments sont éligibles
              try {
                const allowedImgIds = new Set((allImages || []).map(i => String(i.id)));
                const allowedTxtIds = new Set((allTextes || []).map(t => String(t.id)));
                const allowedCalcIds = new Set((allCalcs || []).map(c => String(c.id)));
                const allowedNumIds = new Set((allNums || []).map(n => String(n.id)));
                const beforeAssoc = { ti: textImageArr.length, cn: calcNumArr.length };
                textImageArr = (textImageArr || []).filter(a => allowedImgIds.has(String(a.imageId)) && allowedTxtIds.has(String(a.texteId)));
                calcNumArr = (calcNumArr || []).filter(a => allowedCalcIds.has(String(a.calculId)) && allowedNumIds.has(String(a.chiffreId)));
                if (typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.host)) {
                  console.debug('[ASSIGN][STRICT] associations filtrées', { beforeAssoc, after: { ti: textImageArr.length, cn: calcNumArr.length } });
                }
              } catch {}

              // Fallback cohérent quand aucune association du type n'existe après filtre
              // 1) Aucune association image-texte: filtrer par métadonnées propres des éléments (si présentes)
              if (textImageArr.length === 0) {
                const selThemes = Array.isArray(cfg?.themes) ? cfg.themes.filter(Boolean).map(String) : [];
                const selClasses = Array.isArray(cfg?.classes) ? cfg.classes.filter(Boolean).map(String) : [];
                const hasAny = (vals, selected) => {
                  const ts = Array.isArray(vals) ? vals.map(String) : [];
                  return selected.length === 0 || ts.some(t => selected.includes(t));
                };
                if (selThemes.length > 0) {
                  allTextes = allTextes.filter(t => hasAny(t?.themes || [], selThemes));
                  allImages = allImages.filter(i => hasAny(i?.themes || [], selThemes));
                }
                if (selClasses.length > 0) {
                  const pickLevels = (o) => {
                    const lc = o?.levelClass ? [String(o.levelClass)] : [];
                    const arr = o?.levels || o?.classes || o?.classLevels || [];
                    return [...lc, ...arr];
                  };
                  allTextes = allTextes.filter(t => hasAny(pickLevels(t), selClasses));
                  allImages = allImages.filter(i => hasAny(pickLevels(i), selClasses));
                }
              }

              // 2) Aucune association calcul-chiffre: vider les pools pour forcer le fallback génératif niveau-aware
              if (calcNumArr.length === 0) {
                allCalcs = [];
                allNums = [];
              }

              // Logs dev pour diagnostiquer
              if (typeof window !== 'undefined') {
                // Exposer pour UI (bandeau) et logs
                try { window.__CC_LAST_FILTER_COUNTS__ = { textImage: textImageArr.length, calcNum: calcNumArr.length }; } catch {}
                if (/localhost|127\.0\.0\.1/.test(window.location.host)) {
                  console.debug('[ASSIGN] filtres actifs', {
                    themes: cfg?.themes || [], classes: cfg?.classes || [],
                    assocCounts: { textImage: textImageArr.length, calcNum: calcNumArr.length },
                    pools: { images: allImages.length, textes: allTextes.length, calculs: allCalcs.length, chiffres: allNums.length }
                  });
                }
              }
            }
          } catch {}

          // Essayer d'abord image-texte si on a au moins une zone image et texte
          const canImgTxt = imagesIdx.length > 0 && textesIdx.length > 0 && textImageArr.length > 0;
          const canCalcNum = calculsIdx.length > 0 && chiffresIdx.length > 0 && calcNumArr.length > 0;
          console.debug('[ASSOC] Disponibilité', { canImgTxt, canCalcNum, zones: { images: imagesIdx.length, textes: textesIdx.length, calculs: calculsIdx.length, chiffres: chiffresIdx.length } });
          const order = (canImgTxt && canCalcNum) ? (rng() < 0.5 ? ['imgtxt','calcnum'] : ['calcnum','imgtxt']) : (canImgTxt ? ['imgtxt'] : (canCalcNum ? ['calcnum'] : []));

          for (const kind of order) {
            if (kind === 'imgtxt') {
              const assocArr = textImageArr;
              if (!assocArr.length) continue;
              const chosen = assocArr[Math.floor(rng() * assocArr.length)];
              const imInfo = allImages.find(i => String(i.id) === String(chosen.imageId));
              const txInfo = allTextes.find(t => String(t.id) === String(chosen.texteId));
              // Choisir des emplacements de zones aléatoires disponibles
              const freeImages = imagesIdx.filter(o => !((post[o.i]?.pairId || '').trim()));
              const freeTextes = textesIdx.filter(o => !((post[o.i]?.pairId || '').trim()));
              const imgSpot = freeImages.length ? freeImages[Math.floor(rng() * freeImages.length)] : imagesIdx[0];
              const txtSpot = freeTextes.length ? freeTextes[Math.floor(rng() * freeTextes.length)] : textesIdx[0];
              if (imInfo && txInfo && imgSpot && txtSpot) {
                const key = `assoc-img-${imInfo.id}-txt-${txInfo.id}`;
                post[imgSpot.i] = { ...post[imgSpot.i], content: imInfo.url || imInfo.path || imInfo.src || post[imgSpot.i].content, pairId: key, label: txInfo.content || post[imgSpot.i].label };
                post[txtSpot.i] = { ...post[txtSpot.i], content: txInfo.content, label: txInfo.content, pairId: key };
                // Sync customTextSettings for the paired texte zone so it renders correctly
                if (txtSpot?.z?.id != null) {
                  newTextSettings[txtSpot.z.id] = {
                    ...defaultTextSettings,
                    ...(newTextSettings[txtSpot.z.id] || {}),
                    text: txInfo.content || ''
                  };
                }
                selectedCalcIdxs.clear();
                hadAnyAdminPairAssigned = true;
                console.info('[ASSOC] Choisie (image-texte):', {
                  pairId: key,
                  image: { id: imInfo.id, url: imInfo.url || imInfo.path || imInfo.src },
                  texte: { id: txInfo.id, content: txInfo.content }
                });
                // Toast UI
                showAssocToast(`Association: image ${imInfo.id} ↔ texte "${txInfo.content}"`, 'imgtxt');

                // Remplir distracteurs pour autres zones sans pairId
                const usedImgIds = new Set([String(imInfo.id)]);
                const usedTxtIds = new Set([String(txInfo.id)]);
                // Track normalized contents to avoid duplicates with different IDs
                const usedImgUrls = new Set([normUrl(imInfo.url || imInfo.path || imInfo.src || '')]);
                const usedTxtContents = new Set([norm(txInfo.content || '')]);
                // Conserver la liste des images présentes pour éviter de former d'autres paires valides
                const presentImageIds = new Set([String(imInfo.id)]);
                // Séquence d'images de la manche (ordre de pose)
                const roundImageSeq = [];
                // Ajouter l'image principale et le texte principal à la mémoire courte (persistée plus bas)
                try {
                  recentImages.add(String(imInfo.id));
                  const mainUrlNorm = normUrl(imInfo.url || imInfo.path || imInfo.src || '');
                  if (mainUrlNorm) { recentUrls.add(mainUrlNorm); roundImageSeq.push({ id: String(imInfo.id), url: mainUrlNorm }); }
                  recentTexts.add(norm(txInfo.content || ''));
                } catch {}
                const otherImageSpots = imagesIdx.filter(o => o !== imgSpot);

                // Préférence: placer au moins UNE image stricte-meta (extraStrictImages) si disponible et éligible
                try {
                  let pinId = null;
                  try { const raw = localStorage.getItem('cc_pin_image_id'); if (raw) pinId = String(raw); } catch {}
                  const poolPreferred = [...(extraStrictImages || [])];
                  // Si l'utilisateur a épinglé une image pour test et qu'elle est dans le pool strict, la mettre en tête
                  if (pinId) {
                    poolPreferred.sort((a,b)=> (String(a.id)===pinId? -1 : 0) - (String(b.id)===pinId? -1 : 0));
                  }
                  const spot = otherImageSpots[0];
                  if (spot) {
                    const pickPref = poolPreferred.find(cand => {
                      const idStr = String(cand.id);
                      const urlNorm = normUrl(cand.url || cand.path || cand.src || '');
                      return !usedImgIds.has(idStr) && urlNorm && !usedImgUrls.has(urlNorm) && !imgTxtPairs.has(`${idStr}|${txInfo.id}`);
                    });
                    if (pickPref) {
                      usedImgIds.add(String(pickPref.id));
                      usedImgUrls.add(normUrl(pickPref.url || pickPref.path || pickPref.src || ''));
                      presentImageIds.add(String(pickPref.id));
                      post[spot.i] = { ...post[spot.i], content: pickPref.url || pickPref.path || pickPref.src || post[spot.i].content, pairId: '' };
                      // Retirer le spot déjà servi
                      otherImageSpots.shift();
                    }
                  }
                } catch {}

                for (const o of otherImageSpots) {
                  const poolImgs = [...allImages, ...(extraStrictImages || [])];
                  // Deck anti-répétition: garantit voir TOUTES les images avant répéter
                  const pick = pickFromPool('postImg', poolImgs, (cand) => {
                    const idStr = String(cand.id);
                    const urlNorm = normUrl(cand.url || cand.path || cand.src || '');
                    return !usedImgIds.has(idStr) && urlNorm && !usedImgUrls.has(urlNorm) && !imgTxtPairs.has(`${idStr}|${txInfo.id}`);
                  });
                  if (pick) {
                    usedImgIds.add(String(pick.id));
                    const pUrlNorm = normUrl(pick.url || pick.path || pick.src || '');
                    usedImgUrls.add(pUrlNorm);
                    presentImageIds.add(String(pick.id));
                    post[o.i] = { ...post[o.i], content: pick.url || pick.path || pick.src || post[o.i].content, pairId: '' };
                    // Marquer pour la mémoire courte et séquence
                    try {
                      recentImages.add(String(pick.id));
                      if (pUrlNorm) { recentUrls.add(pUrlNorm); roundImageSeq.push({ id: String(pick.id), url: pUrlNorm }); }
                    } catch {}
                  } else {
                    // Placeholder neutre si aucun candidat sûr (évite zone vide)
                    const ph = 'images/carte-vide.png';
                    usedImgUrls.add(normUrl(ph));
                    post[o.i] = { ...post[o.i], content: ph, pairId: '' };
                    try { roundImageSeq.push({ id: '', url: normUrl(ph) }); } catch {}
                  }
                }
                // Persister la mémoire courte (ids) et tracer
                try {
                  const uniqArr = Array.from(new Set(Array.from(recentImages)));
                  const uniqUrls = Array.from(new Set(Array.from(recentUrls)));
                  const uniqTexts = Array.from(new Set(Array.from(recentTexts)));
                  const uniqCalcs = Array.from(new Set(Array.from(recentCalcs)));
                  const uniqNums = Array.from(new Set(Array.from(recentNums)));
                  // CORRECTION: Limiter la taille pour éviter la saturation (garder seulement les 3 dernières)
                  const MAX_RECENT = 3;
                  const trimmedArr = uniqArr.slice(-MAX_RECENT);
                  const trimmedUrls = uniqUrls.slice(-MAX_RECENT);
                  const trimmedTexts = uniqTexts.slice(-MAX_RECENT);
                  const trimmedCalcs = uniqCalcs.slice(-MAX_RECENT);
                  const trimmedNums = uniqNums.slice(-MAX_RECENT);
                  setRecentImages(trimmedArr);
                  setRecentUrls(trimmedUrls);
                  setRecentTexts(trimmedTexts);
                  setRecentCalcs(trimmedCalcs);
                  setRecentNums(trimmedNums);
                  if (window && typeof window.ccAddDiag === 'function') {
                    window.ccAddDiag('round:images:recent:update', { recentCount: trimmedArr.length, recentUrlCount: trimmedUrls.length, maxRecent: MAX_RECENT });
                    window.ccAddDiag('round:images:seq', { items: roundImageSeq });
                    window.ccAddDiag('round:texts:recent:update', { recentCount: trimmedTexts.length, maxRecent: MAX_RECENT });
                    window.ccAddDiag('round:calcs:recent:update', { recentCount: trimmedCalcs.length, maxRecent: MAX_RECENT });
                    window.ccAddDiag('round:nums:recent:update', { recentCount: trimmedNums.length, maxRecent: MAX_RECENT });
                  }
                } catch {}
                // Choisir des textes qui ne forment aucune association valide avec les images présentes
                const pickTextAvoidingPairs = () => {
                  // Deck anti-répétition: garantit voir TOUS les textes avant répéter
                  const poolTxt = [...(extraStrictTextes || []), ...allTextes];
                  return pickFromPool('postTxt', poolTxt, (t) => {
                    if (usedTxtIds.has(String(t.id)) || usedTxtContents.has(norm(t.content))) return false;
                    for (const imgId of presentImageIds) {
                      if (imgTxtPairs.has(`${imgId}|${t.id}`)) return false;
                    }
                    return true;
                  });
                };
                const otherTextSpots = textesIdx.filter(o => o !== txtSpot);
                // Préférence: placer au moins UN texte strict-meta si disponible et éligible
                try {
                  let pinTid = null;
                  try { const raw = localStorage.getItem('cc_pin_texte_id'); if (raw) pinTid = String(raw); } catch {}
                  const poolPreferredT = [...(extraStrictTextes || [])];
                  if (pinTid) {
                    poolPreferredT.sort((a,b)=> (String(a.id)===pinTid? -1 : 0) - (String(b.id)===pinTid? -1 : 0));
                  }
                  const tSpot = otherTextSpots[0];
                  if (tSpot) {
                    const pickPrefT = poolPreferredT.find(cand => {
                      const cont = norm(cand.content || '');
                      if (!cont) return false;
                      if (usedTxtIds.has(String(cand.id)) || usedTxtContents.has(cont)) return false;
                      // Ne pas créer de paire valide avec les images déjà présentes
                      for (const imgId of presentImageIds) {
                        if (imgTxtPairs.has(`${imgId}|${cand.id}`)) return false;
                      }
                      return true;
                    });
                    if (pickPrefT) {
                      usedTxtIds.add(String(pickPrefT.id));
                      usedTxtContents.add(norm(pickPrefT.content || ''));
                      recentTexts.add(norm(pickPrefT.content || ''));
                      post[tSpot.i] = { ...post[tSpot.i], content: pickPrefT.content, label: pickPrefT.content, pairId: '' };
                      // Sync customTextSettings for texte distractor
                      if (tSpot?.z?.id != null) {
                        newTextSettings[tSpot.z.id] = {
                          ...defaultTextSettings,
                          ...(newTextSettings[tSpot.z.id] || {}),
                          text: pickPrefT.content || ''
                        };
                      }
                      otherTextSpots.shift();
                    }
                  }
                } catch {}
                for (const o of otherTextSpots) {
                  // Ne pas écraser une zone déjà appariée
                  if ((post[o.i]?.pairId || '').trim()) continue;
                  const pick = pickTextAvoidingPairs();
                  if (pick) {
                    usedTxtIds.add(String(pick.id));
                    usedTxtContents.add(norm(pick.content || ''));
                    recentTexts.add(norm(pick.content || ''));
                    post[o.i] = { ...post[o.i], content: pick.content, label: pick.content, pairId: '' };
                    // Keep customTextSettings in sync for texte distractors
                    if (o?.z?.id != null) {
                      newTextSettings[o.z.id] = {
                        ...defaultTextSettings,
                        ...(newTextSettings[o.z.id] || {}),
                        text: pick.content || ''
                      };
                    }
                  } else {
                    // Placeholder texte si aucun candidat
                    post[o.i] = { ...post[o.i], content: '—', label: '—', pairId: '' };
                    if (o?.z?.id != null) {
                      newTextSettings[o.z.id] = { ...defaultTextSettings, ...(newTextSettings[o.z.id] || {}), text: '—' };
                    }
                  }
                }
                // Distracteurs pour calculs/chiffres en évitant de former une autre paire valide calc-num
                let enableMathFill = true;
                try {
                  const cfgX = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
                  // si aucune association calc-num filtrée et option activée, ne pas remplir les maths
                  enableMathFill = !(cfgX?.allowEmptyMathWhenNoData) || (Array.isArray(calcNumArr) ? calcNumArr.length > 0 : false);
                } catch {}
                const usedCalcIds = new Set();
                const usedNumIds = new Set();
                const usedCalcContents = new Set();
                const usedNumContents = new Set();
                const presentCalcIds = new Set();
                const presentCalcResults = new Set();
                const _pcIB = (s) => { const v = parseFloat(String(s).replace(/\s/g, '').replace(/,/g, '.')); return Number.isFinite(v) ? Math.round(v * 1e8) / 1e8 : NaN; };
                const numbersOnCardSetIB = new Set(
                  post.filter(z => normType(z?.type) === 'chiffre').map(z => _pcIB(String(z.content ?? '').trim())).filter(n => Number.isFinite(n))
                );
                let filteredCalcsByResultIB = 0;
                if (enableMathFill) for (const o of calculsIdx) {
                  if ((post[o.i]?.pairId || '').trim()) continue;
                  let pick = null;
                  // Pass 1: éviter calculs récents — sélection ALÉATOIRE pour distribution homogène
                  const pool1 = allCalcs.filter(cand => {
                    const idStr = String(cand.id);
                    const contNorm = normCalc(cand.content || '');
                    if (usedCalcIds.has(idStr) || !contNorm || usedCalcContents.has(contNorm) || recentCalcs.has(contNorm)) return false;
                    const parsed = parseOperation(cand.content || '');
                    const res = parsed && Number.isFinite(parsed.result) ? parsed.result : null;
                    if (res != null && (presentCalcResults.has(res) || numbersOnCardSetIB.has(res))) { filteredCalcsByResultIB++; return false; }
                    return true;
                  });
                  if (pool1.length) pick = pool1[Math.floor(rng() * pool1.length)];
                  // Pass 2: si épuisé, autoriser réutilisation (toujours aléatoire)
                  if (!pick) {
                    const pool2 = allCalcs.filter(cand => {
                      const idStr = String(cand.id);
                      const contNorm = normCalc(cand.content || '');
                      if (usedCalcIds.has(idStr) || !contNorm || usedCalcContents.has(contNorm)) return false;
                      const parsed = parseOperation(cand.content || '');
                      const res = parsed && Number.isFinite(parsed.result) ? parsed.result : null;
                      if (res != null && (presentCalcResults.has(res) || numbersOnCardSetIB.has(res))) { filteredCalcsByResultIB++; return false; }
                      return true;
                    });
                    if (pool2.length) pick = pool2[Math.floor(rng() * pool2.length)];
                  }
                  if (pick) {
                    usedCalcIds.add(String(pick.id));
                    usedCalcContents.add(normCalc(pick.content || ''));
                    recentCalcs.add(normCalc(pick.content || ''));
                    presentCalcIds.add(String(pick.id));
                    const calcContent = pick.content || post[o.i].content;
                    post[o.i] = { ...post[o.i], content: calcContent, label: calcContent, pairId: '' };
                    const parsed = parseOperation(pick.content || '');
                    if (parsed && Number.isFinite(parsed.result)) presentCalcResults.add(parsed.result);
                  }
                }
                if (filteredCalcsByResultIB > 0 && window && typeof window.ccAddDiag === 'function') try { window.ccAddDiag('round:guard:imgtxt:filtered', { calcFilteredByResult: filteredCalcsByResultIB, numbersOnCard: Array.from(numbersOnCardSetIB) }); } catch {}
                if (!enableMathFill) {
                  // Vider explicitement le contenu des zones calcul/chiffre
                  for (const o of calculsIdx) {
                    if ((post[o.i]?.pairId || '').trim()) continue;
                    post[o.i] = { ...post[o.i], content: '', label: '', pairId: '' };
                  }
                  for (const o of chiffresIdx) {
                    if ((post[o.i]?.pairId || '').trim()) continue;
                    post[o.i] = { ...post[o.i], content: '', label: '', pairId: '' };
                  }
                }
                const _pcImg = (s) => { const v = parseFloat(String(s).replace(/\s/g, '').replace(/,/g, '.')); return Number.isFinite(v) ? Math.round(v * 1e8) / 1e8 : NaN; };
                const pickNumberAvoidingPairsImgBranch = () => {
                  // Pass 1: éviter chiffres récents
                  const pool = allNums.filter(n => !usedNumIds.has(String(n.id)) && !usedNumContents.has(normNum(n.content)) && !recentNums.has(String(n.content)));
                  const safe = pool.filter(n => {
                    const v = _pcImg(String(n.content));
                    if (Number.isFinite(v) && presentCalcResults.has(v)) return false;
                    for (const calcId of presentCalcIds) {
                      if (calcNumPairs.has(`${calcId}|${n.id}`)) return false;
                    }
                    return true;
                  });
                  if (safe.length) return safe[Math.floor(rng() * safe.length)];
                  // Pass 2: si épuisé, autoriser réutilisation
                  const pool2 = allNums.filter(n => !usedNumIds.has(String(n.id)) && !usedNumContents.has(normNum(n.content)));
                  const safe2 = pool2.filter(n => {
                    const v = _pcImg(String(n.content));
                    if (Number.isFinite(v) && presentCalcResults.has(v)) return false;
                    for (const calcId of presentCalcIds) {
                      if (calcNumPairs.has(`${calcId}|${n.id}`)) return false;
                    }
                    return true;
                  });
                  if (!safe2.length) return null;
                  return safe2[Math.floor(rng() * safe2.length)];
                };
                if (enableMathFill) for (const o of chiffresIdx) {
                  if ((post[o.i]?.pairId || '').trim()) continue;
                  const pick = pickNumberAvoidingPairsImgBranch();
                  if (pick) {
                    usedNumIds.add(String(pick.id));
                    usedNumContents.add(normNum(pick.content));
                    recentNums.add(String(pick.content));
                    const numContent = String(pick.content ?? post[o.i].content);
                    post[o.i] = { ...post[o.i], content: numContent, label: numContent, pairId: '' };
                  }
                }
                break; // on a posé notre paire
              }
            } else if (kind === 'calcnum') {
              const assocArr = calcNumArr;
              if (!assocArr.length) continue;
              const chosen = assocArr[Math.floor(rng() * assocArr.length)];
              const caInfo = allCalcs.find(c => String(c.id) === String(chosen.calculId));
              const nuInfo = allNums.find(n => String(n.id) === String(chosen.chiffreId));
              // Emplacements aléatoires disponibles pour calcule et chiffre
              const freeCalcs = calculsIdx.filter(o => !((post[o.i]?.pairId || '').trim()));
              const freeNums = chiffresIdx.filter(o => !((post[o.i]?.pairId || '').trim()));
              const calcSpot = freeCalcs.length ? freeCalcs[Math.floor(rng() * freeCalcs.length)] : calculsIdx[0];
              const numSpot = freeNums.length ? freeNums[Math.floor(rng() * freeNums.length)] : chiffresIdx[0];
              if (caInfo && nuInfo && calcSpot && numSpot) {
                const key = `assoc-calc-${caInfo.id}-num-${nuInfo.id}`;
                post[calcSpot.i] = { ...post[calcSpot.i], content: caInfo.content || post[calcSpot.i].content, label: String(nuInfo.content ?? post[calcSpot.i].label), pairId: key };
                post[numSpot.i] = { ...post[numSpot.i], content: String(nuInfo.content ?? post[numSpot.i].content), label: String(nuInfo.content ?? post[numSpot.i].label), pairId: key };
                selectedCalcIdxs.add(calcSpot.i);
                hadAnyAdminPairAssigned = true;
                console.info('[ASSOC] Choisie (calcul-chiffre):', {
                  pairId: key,
                  calcul: { id: caInfo.id, content: caInfo.content },
                  chiffre: { id: nuInfo.id, content: String(nuInfo.content) }
                });
                // Toast UI
                const calcLabel = caInfo.content;
                const numLabel = String(nuInfo.content);
                showAssocToast(`Association: calcul "${calcLabel}" ↔ chiffre ${numLabel}`, 'calcnum');

                // Distracteurs pour le reste (tous sans pairId)
                const usedCalcIds = new Set([String(caInfo.id)]);
                const usedNumIds = new Set([String(nuInfo.id)]);
                // Conserver la liste des calculs présents pour éviter de former d'autres paires valides
                const presentCalcIds = new Set([String(caInfo.id)]);
                const presentCalcResults = new Set();
                try {
                  const p = parseOperation(caInfo.content);
                  if (p && Number.isFinite(p.result)) presentCalcResults.add(p.result);
                  recentCalcs.add(normCalc(caInfo.content || ''));
                  recentNums.add(String(nuInfo.content ?? ''));
                  if (window && typeof window.ccAddDiag === 'function') window.ccAddDiag('round:guard:calcnum:mainResult', { result: p?.result ?? null });
                } catch {}
                // Préparer ensembles d'unicité pour fallback
                const existingCalcContents = new Set(
                  post.filter(z => normType(z?.type) === 'calcul').map(z => String(z.content || '').trim())
                );
                const existingNumContents = new Set(
                  post.filter(z => normType(z?.type) === 'chiffre').map(z => String(z.content ?? '').trim())
                );
                const _parseChiffre = (s) => { const v = parseFloat(String(s).replace(/\s/g, '').replace(/,/g, '.')); return Number.isFinite(v) ? Math.round(v * 1e8) / 1e8 : NaN; };
                const numbersOnCardSet = new Set(
                  Array.from(existingNumContents).map(s => _parseChiffre(s)).filter(n => Number.isFinite(n))
                );
                let filteredCalcsByResult = 0;
                for (const o of calculsIdx) {
                  // Ne pas toucher au calcul apparié (pairId non vide)
                  if ((post[o.i]?.pairId || '').trim()) continue;
                  let pick = null;
                  // Pass 1: éviter calculs récents — sélection ALÉATOIRE pour distribution homogène
                  const cnPool1 = allCalcs.filter(cand => {
                    const idStr = String(cand.id);
                    const contNorm = normCalc(cand.content || '');
                    if (usedCalcIds.has(idStr) || recentCalcs.has(contNorm)) return false;
                    const parsed = parseOperation(cand.content || '');
                    const res = parsed && Number.isFinite(parsed.result) ? parsed.result : null;
                    if (res != null && (presentCalcResults.has(res) || numbersOnCardSet.has(res))) { filteredCalcsByResult++; return false; }
                    return true;
                  });
                  if (cnPool1.length) pick = cnPool1[Math.floor(rng() * cnPool1.length)];
                  // Pass 2: si épuisé, autoriser réutilisation (toujours aléatoire)
                  if (!pick) {
                    const cnPool2 = allCalcs.filter(cand => {
                      const idStr = String(cand.id);
                      if (usedCalcIds.has(idStr)) return false;
                      const parsed = parseOperation(cand.content || '');
                      const res = parsed && Number.isFinite(parsed.result) ? parsed.result : null;
                      if (res != null && (presentCalcResults.has(res) || numbersOnCardSet.has(res))) { filteredCalcsByResult++; return false; }
                      return true;
                    });
                    if (cnPool2.length) pick = cnPool2[Math.floor(rng() * cnPool2.length)];
                  }
                  if (pick) {
                    usedCalcIds.add(String(pick.id));
                    presentCalcIds.add(String(pick.id));
                    recentCalcs.add(normCalc(pick.content || ''));
                    const calcContent = pick.content || post[o.i].content;
                    post[o.i] = { ...post[o.i], content: calcContent, label: calcContent, pairId: '' };
                    existingCalcContents.add(String(pick.content || '').trim());
                    const parsed = parseOperation(pick.content || '');
                    if (parsed && Number.isFinite(parsed.result)) presentCalcResults.add(parsed.result);
                  } else {
                    // Fallback: générer un calcul adapté au niveau sélectionné
                    let tries = 0;
                    while (tries < 30) {
                      const expr = generateCalcForLevel(null, rng);
                      if (!existingCalcContents.has(expr)) {
                        existingCalcContents.add(expr);
                        post[o.i] = { ...post[o.i], content: expr, label: expr, pairId: '' };
                        const parsed = parseOperation(expr);
                        if (parsed && Number.isFinite(parsed.result)) presentCalcResults.add(parsed.result);
                        break;
                      }
                      tries++;
                    }
                  }
                }
                if (window && typeof window.ccAddDiag === 'function') try { window.ccAddDiag('round:guard:calcnum:filtered', { calcFilteredByResult: filteredCalcsByResult }); } catch {}
                const pickNumberAvoidingPairs = () => {
                  // Pass 1: éviter chiffres récents
                  const pool = allNums.filter(n => !usedNumIds.has(String(n.id)) && !recentNums.has(String(n.content)));
                  const safe = pool.filter(n => {
                    const v = _parseChiffre(String(n.content));
                    if (Number.isFinite(v)) {
                      if (presentCalcResults.has(v)) return false;
                    }
                    for (const calcId of presentCalcIds) {
                      if (calcNumPairs.has(`${calcId}|${n.id}`)) return false;
                    }
                    return true;
                  });
                  if (safe.length) return safe[Math.floor(rng() * safe.length)];
                  // Pass 2: si épuisé, autoriser réutilisation
                  const pool2 = allNums.filter(n => !usedNumIds.has(String(n.id)));
                  const safe2 = pool2.filter(n => {
                    const v = _parseChiffre(String(n.content));
                    if (Number.isFinite(v)) {
                      if (presentCalcResults.has(v)) return false;
                    }
                    for (const calcId of presentCalcIds) {
                      if (calcNumPairs.has(`${calcId}|${n.id}`)) return false;
                    }
                    return true;
                  });
                  if (!safe2.length) return null;
                  return safe2[Math.floor(rng() * safe2.length)];
                };
                for (const o of chiffresIdx) {
                  // Ne pas toucher au chiffre apparié (pairId non vide)
                  if ((post[o.i]?.pairId || '').trim()) continue;
                  const pick = pickNumberAvoidingPairs();
                  if (pick) {
                    usedNumIds.add(String(pick.id));
                    recentNums.add(String(pick.content));
                    const numContent = String(pick.content ?? post[o.i].content);
                    post[o.i] = { ...post[o.i], content: numContent, label: numContent, pairId: '' };
                    existingNumContents.add(String(pick.content ?? '').trim());
                  } else {
                    // Fallback: générer un nombre unique
                    let n = 8 + Math.floor(rng() * 90); // 8..97
                    let tries = 0;
                    while (tries < 50 && (existingNumContents.has(String(n)) || presentCalcResults.has(n))) { n = 8 + Math.floor(rng() * 90); tries++; }
                    const ns = String(n);
                    if (!existingNumContents.has(ns)) {
                      existingNumContents.add(ns);
                      post[o.i] = { ...post[o.i], content: ns, label: ns, pairId: '' };
                    }
                  }
                }
                // Images/textes distracteurs également sans pairId
                const usedImgIds = new Set();
                const usedTxtIds = new Set();
                const usedImgUrls = new Set();
                const usedTxtContents = new Set();
                // Conserver la liste des images présentes pour éviter de former d'autres paires image-texte valides
                const presentImageIds = new Set();
                for (const o of imagesIdx) {
                  if ((post[o.i]?.pairId || '').trim()) continue;
                  // Deck anti-répétition: garantit voir TOUTES les images avant répéter
                  const pick = pickFromPool('postImg', allImages, (cand) => {
                    const idStr = String(cand.id);
                    const urlNorm = normUrl(cand.url || cand.path || cand.src || '');
                    return !usedImgIds.has(idStr) && urlNorm && !usedImgUrls.has(urlNorm);
                  });
                  if (pick) {
                    usedImgIds.add(String(pick.id));
                    const pUrlNorm = normUrl(pick.url || pick.path || pick.src || '');
                    usedImgUrls.add(pUrlNorm);
                    presentImageIds.add(String(pick.id));
                    post[o.i] = { ...post[o.i], content: pick.url || pick.path || pick.src || post[o.i].content, pairId: '' };
                    // Ajouter à la mémoire courte
                    try {
                      recentImages.add(String(pick.id));
                      if (pUrlNorm) recentUrls.add(pUrlNorm);
                    } catch {}
                  } else {
                    const ph = 'images/carte-vide.png';
                    usedImgUrls.add(normUrl(ph));
                    post[o.i] = { ...post[o.i], content: ph, pairId: '' };
                  }
                }
                const pickTextAvoidingPairsCalcBranch = () => {
                  // Deck anti-répétition: garantit voir TOUS les textes avant répéter
                  return pickFromPool('postTxt', allTextes, (t) => {
                    if (usedTxtIds.has(String(t.id)) || usedTxtContents.has(norm(t.content))) return false;
                    for (const imgId of presentImageIds) {
                      if (imgTxtPairs.has(`${imgId}|${t.id}`)) return false;
                    }
                    return true;
                  });
                };
                for (const o of textesIdx) {
                  if ((post[o.i]?.pairId || '').trim()) continue;
                  const pick = pickTextAvoidingPairsCalcBranch();
                  if (pick) {
                    usedTxtIds.add(String(pick.id));
                    usedTxtContents.add(norm(pick.content || ''));
                    recentTexts.add(norm(pick.content || ''));
                    post[o.i] = { ...post[o.i], content: pick.content, label: pick.content, pairId: '' };
                    // Keep customTextSettings in sync for texte distractors in calcnum branch
                    if (o?.z?.id != null) {
                      newTextSettings[o.z.id] = {
                        ...defaultTextSettings,
                        ...(newTextSettings[o.z.id] || {}),
                        text: pick.content || ''
                      };
                    }
                  } else {
                    post[o.i] = { ...post[o.i], content: '—', label: '—', pairId: '' };
                    if (o?.z?.id != null) {
                      newTextSettings[o.z.id] = { ...defaultTextSettings, ...(newTextSettings[o.z.id] || {}), text: '—' };
                    }
                  }
                }
                // Persister la mémoire courte (calcnum branch)
                try {
                  const uniqArr = Array.from(new Set(Array.from(recentImages)));
                  const uniqUrls = Array.from(new Set(Array.from(recentUrls)));
                  const uniqTexts = Array.from(new Set(Array.from(recentTexts)));
                  const uniqCalcs = Array.from(new Set(Array.from(recentCalcs)));
                  const uniqNums = Array.from(new Set(Array.from(recentNums)));
                  const MAX_RECENT = 3;
                  const trimmedArr = uniqArr.slice(-MAX_RECENT);
                  const trimmedUrls = uniqUrls.slice(-MAX_RECENT);
                  const trimmedTexts = uniqTexts.slice(-MAX_RECENT);
                  const trimmedCalcs = uniqCalcs.slice(-MAX_RECENT);
                  const trimmedNums = uniqNums.slice(-MAX_RECENT);
                  setRecentImages(trimmedArr);
                  setRecentUrls(trimmedUrls);
                  setRecentTexts(trimmedTexts);
                  setRecentCalcs(trimmedCalcs);
                  setRecentNums(trimmedNums);
                  if (window && typeof window.ccAddDiag === 'function') {
                    window.ccAddDiag('round:images:recent:update:calcnum', { recentCount: trimmedArr.length, recentUrlCount: trimmedUrls.length, maxRecent: MAX_RECENT });
                    window.ccAddDiag('round:texts:recent:update:calcnum', { recentCount: trimmedTexts.length, maxRecent: MAX_RECENT });
                    window.ccAddDiag('round:calcs:recent:update:calcnum', { recentCount: trimmedCalcs.length, maxRecent: MAX_RECENT });
                    window.ccAddDiag('round:nums:recent:update:calcnum', { recentCount: trimmedNums.length, maxRecent: MAX_RECENT });
                  }
                } catch {}
                break; // on a posé notre paire
              }
            }
          }
        }
      } catch (e) {
        console.warn('Attribution via associations Admin ignorée:', e);
      }
      // Expose final zones pour debug rapide dans DevTools
      try { window.__lastAssignedZones = JSON.parse(JSON.stringify(post)); } catch {}
      // Fallback: si AUCUNE paire Admin n'a été possible, on garantit au moins une paire image-texte minimale
      if (!hadAnyAdminPairAssigned) {
        console.info('[ASSOC] Fallback utilisé: aucune association Admin posable sur cette carte');
        const imgIndex = post.findIndex(z => normType(z?.type) === 'image' && (getPairId(z) || z.label || z.content));
        if (imgIndex >= 0) {
          const img = post[imgIndex];
          // dérive une clé de pair si manquante
          let key = getPairId(img);
          if (!key) {
            const fromLabel = norm(img.label);
            if (fromLabel) key = fromLabel;
            else {
              // tente depuis le nom de fichier
              const name = (String(img.content || '').split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '');
              key = norm(name);
            }
            post[imgIndex] = { ...img, pairId: key };
          }
          // cherche un texte déjà apparié
          const textIdxs = post
            .map((z, i) => ({ z, i }))
            .filter(o => normType(o.z?.type) === 'texte');
          let matchedText = textIdxs.find(o => getPairId(o.z) === key);
          if (!matchedText && textIdxs.length) {
            // force un texte à devenir la bonne réponse
            const preferWithLabel = textIdxs.find(o => (o.z?.content || '').trim());
            const pick = preferWithLabel || textIdxs[0];
            const desiredLabel = img.label || pick.z.content || '';
            post[pick.i] = { ...pick.z, pairId: key, content: desiredLabel };
            // Sync customTextSettings for fallback-chosen texte
            if (pick?.z?.id != null) {
              newTextSettings[pick.z.id] = {
                ...defaultTextSettings,
                ...(newTextSettings[pick.z.id] || {}),
                text: desiredLabel || ''
              };
            }
            matchedText = { z: post[pick.i], i: pick.i };
            console.info('[ASSOC] Fallback (image-texte) choisi:', {
              pairId: key,
              image: { id: img.id, content: img.content, label: img.label },
              texte: { id: matchedText.z.id, content: matchedText.z.content }
            });
            // Toast UI pour fallback
            const imgLabel = img.label || (String(img.content || '').split('/').pop() || 'image');
            showAssocToast(`Fallback: image-texte "${imgLabel}" ↔ "${matchedText.z.content}"`, 'fallback');
          }
          if (!matchedText) {
            console.warn('[ASSOC] Fallback: aucune zone texte disponible pour créer la paire image-texte');
          }
          // journaliser le pairId effectivement utilisé en fallback
          if (key) {
            console.info('[ASSOC] Fallback: pairId utilisé:', key);
          }
        } else {
          console.warn('[ASSOC] Fallback: aucune zone image exploitable trouvée');
        }
      }
      // Casser les vérités math: aucune opération ne doit égaler un nombre présent
      const _pcFinal = (s) => { const v = parseFloat(String(s).replace(/\s/g, '').replace(/,/g, '.')); return Number.isFinite(v) ? Math.round(v * 1e8) / 1e8 : NaN; };
      const numbersOnCard = new Set(
        post
          .filter(z => z?.type === 'chiffre')
          .map(z => _pcFinal(String(z.content)))
          .filter(n => Number.isFinite(n))
      );
      post = post.map(z => {
        if (z?.type !== 'calcul' || !z?.content) return z;
        // Ne pas casser le calcul sélectionné via Admin
        const thisIdx = post.indexOf(z);
        if (selectedCalcIdxs.has(thisIdx)) return z;
        let parsed = parseOperation(z.content);
        if (!parsed) return z;
        let { a, b, op, result } = parsed;
        let tries = 0;
        const renderExpr = (A, O, B) => {
          if (O === '*' || O === 'x') return `${A} x ${B}`;
          if (O === '/') return `${A} ÷ ${B}`;
          if (O === ':') return `${A} : ${B}`;
          return `${A} ${O} ${B}`; // + ou -
        };
        const evalExpr = (A, O, B) => {
          switch (O) {
            case '+': return A + B;
            case '-': return A - B;
            case 'x':
            case '*': return A * B;
            case '/':
            case ':': return B !== 0 ? A / B : NaN;
            default: return NaN;
          }
        };
        while (Number.isFinite(result) && numbersOnCard.has(result) && tries < 5) {
          // stratégie simple: augmenter b de 1
          b = b + 1;
          result = evalExpr(a, op, b);
          tries++;
        }
        if (tries > 0) {
          return { ...z, content: renderExpr(a, op, b) };
        }
        return z;
      });
      // Assainissement final: garantir EXACTEMENT UNE paire image-texte valide
      try {
        // Détecter la première image qui a un pairId et un texte correspondant
        const imgWithPair = post.find(z => normType(z?.type) === 'image' && getPairId(z));
        let allowedKey = null;
        let keptTextId = null;
        if (imgWithPair) {
          const k = getPairId(imgWithPair);
          const textsSame = post.filter(z => normType(z?.type) === 'texte' && getPairId(z) === k);
          if (textsSame.length >= 1) {
            allowedKey = k;
            keptTextId = textsSame[0].id;
          }
        }
        // Si aucune correspondance détectée, rien à faire ici
        if (allowedKey) {
          // 1) Nettoyer toutes les autres paires image-texte (pairId différents ou doublons du même key)
          post = post.map(z => {
            if (normType(z?.type) === 'image') {
              const k = getPairId(z);
              if (!k) return z;
              // garder uniquement l'image du allowedKey, sinon vider
              if (k !== allowedKey) return { ...z, pairId: '' };
              return z;
            }
            if (normType(z?.type) === 'texte') {
              const k = getPairId(z);
              if (!k) return z;
              // ne conserver que le texte retenu pour allowedKey
              if (k === allowedKey && z.id === keptTextId) return z;
              return { ...z, pairId: '' };
            }
            return z;
          });
          // 2) Éviter qu'un distracteur (texte) forme une paire Admin avec une image présente
          // Reconstruire l'ensemble des images présentes et leur id Admin si disponible
          const normUrl = (p) => {
            if (!p) return '';
            let s = p; try { s = decodeURIComponent(s); } catch {}
            s = s.toLowerCase().replace(/\\/g, '/');
            const pub = (process.env.PUBLIC_URL || '').toLowerCase();
            if (pub && s.startsWith(pub)) s = s.slice(pub.length);
            if (s.startsWith('/')) s = s.slice(1);
            return s;
          };
          const imgIdByUrl = new Map(((assocData && assocData.images) || []).map(it => [normUrl(it.url), it.id]));
          const imgTxtPairs = new Set(((assocData && assocData.associations) || [])
            .filter(a => a.imageId && a.texteId)
            .map(a => `${a.imageId}|${a.texteId}`));
          const allTextes = (assocData && assocData.textes) || [];
          const presentImageIds = new Set(
            post.filter(z => normType(z?.type) === 'image')
                .map(z => imgIdByUrl.get(normUrl(z.content || z.url || z.path || z.src || '')))
                .filter(id => id != null)
                .map(id => String(id))
          );
          const usedTxtIds = new Set();
          const usedTxtContents = new Set();
          // Marquer le texte conservé comme déjà utilisé
          const keptText = post.find(z => z.id === keptTextId);
          if (keptText) {
            const keptAdmin = allTextes.find(t => String(t.content).trim() === String(keptText.content).trim());
            if (keptAdmin) usedTxtIds.add(String(keptAdmin.id));
            usedTxtContents.add(String(keptText.content || '').trim().toLowerCase());
          }
          const pickSafeText = () => {
            const pool = allTextes.filter(t => !usedTxtIds.has(String(t.id)) && !usedTxtContents.has(String(t.content || '').trim().toLowerCase()));
            const safe = pool.filter(t => {
              for (const imgId of presentImageIds) {
                if (imgTxtPairs.has(`${imgId}|${t.id}`)) return false;
              }
              return true;
            });
            if (!safe.length) return null;
            return safe[Math.floor(Math.random() * safe.length)];
          };
          post = post.map(z => {
            if (normType(z?.type) !== 'texte') return z;
            if (getPairId(z)) return z; // garder le texte apparié
            // si ce texte est susceptible de former une paire avec une image présente, remplace par un distracteur sûr
            const adminTxt = allTextes.find(t => String(t.content).trim().toLowerCase() === String(z.content || '').trim().toLowerCase());
            if (adminTxt) {
              let wouldPair = false;
              for (const imgId of presentImageIds) {
                if (imgTxtPairs.has(`${imgId}|${adminTxt.id}`)) { wouldPair = true; break; }
              }
              if (wouldPair) {
                const pick = pickSafeText();
                if (pick) {
                  usedTxtIds.add(String(pick.id));
                  usedTxtContents.add(String(pick.content || '').trim().toLowerCase());
                  // sync customTextSettings si possible
                  try {
                    newTextSettings[z.id] = { ...defaultTextSettings, ...(newTextSettings[z.id] || {}), text: pick.content || '' };
                  } catch {}
                  return { ...z, content: pick.content, label: pick.content, pairId: '' };
                }
              }
            }
            return z;
          });
        }
      } catch (e) {
        console.warn('Sanitisation unique image-texte ignorée:', e);
      }
      // Assainissement final: garantir EXACTEMENT UNE paire calcul-chiffre valide
      try {
        // Détecter la première paire calcul-chiffre existante (via pairId partagé)
        const calcWithPair = post.find(z => normType(z?.type) === 'calcul' && getPairId(z));
        let allowedCalcNumKey = null;
        let keptNumZoneId = null;
        if (calcWithPair) {
          const k = getPairId(calcWithPair);
          const numsSame = post.filter(z => normType(z?.type) === 'chiffre' && getPairId(z) === k);
          if (numsSame.length >= 1) {
            allowedCalcNumKey = k;
            keptNumZoneId = numsSame[0].id;
          }
        }
        if (allowedCalcNumKey) {
          // 1) Nettoyer toutes les autres paires calcul-chiffre (pairId différents ou doublons)
          post = post.map(z => {
            const t = normType(z?.type);
            if (t === 'calcul' || t === 'chiffre') {
              const k = getPairId(z);
              if (!k) return z;
              if (k !== allowedCalcNumKey) return { ...z, pairId: '' };
              if (t === 'chiffre' && z.id !== keptNumZoneId) return { ...z, pairId: '' };
              return z;
            }
            return z;
          });

          // 2) Casser toute autre association calc-num potentielle par contenu (selon Admin)
          const normCalc = (t) => String(t || '').toLowerCase().replace(/\s+/g, '').replace(/[×*]/g, 'x');
          const normNum = (t) => String(t || '').replace(/\s+/g, '');
          const allCalcs = (assocData && assocData.calculs) || [];
          const allNums = (assocData && assocData.chiffres) || [];
          const calcIdByContent = new Map(allCalcs.map(it => [normCalc(it.content), it.id]));
          const numIdByContent = new Map(allNums.map(it => [normNum(it.content), it.id]));
          const calcNumPairs = new Set(((assocData && assocData.associations) || [])
            .filter(a => a.calculId && a.chiffreId)
            .map(a => `${a.calculId}|${a.chiffreId}`));

          // Construire l'ensemble des calculs présents (IDs Admin si possible)
          const presentCalcIds = new Set(
            post.filter(z => normType(z?.type) === 'calcul')
                .map(z => calcIdByContent.get(normCalc(z.content)))
                .filter(id => id != null)
                .map(id => String(id))
          );

          const usedNumIds = new Set();
          const usedNumContents = new Set();
          // Marquer le chiffre conservé
          const keptNumZone = post.find(z => z.id === keptNumZoneId);
          if (keptNumZone) {
            const keptAdminNumId = numIdByContent.get(normNum(keptNumZone.content));
            if (keptAdminNumId != null) usedNumIds.add(String(keptAdminNumId));
            usedNumContents.add(normNum(keptNumZone.content));
          }

          const pickSafeNumber = () => {
            const pool = allNums.filter(n => !usedNumIds.has(String(n.id)) && !usedNumContents.has(normNum(n.content)));
            const safe = pool.filter(n => {
              for (const calcId of presentCalcIds) {
                if (calcNumPairs.has(`${calcId}|${n.id}`)) return false;
              }
              return true;
            });
            if (!safe.length) return null;
            return safe[Math.floor(rng() * safe.length)];
          };

          post = post.map(z => {
            if (normType(z?.type) !== 'chiffre') return z;
            if (getPairId(z)) return z; // garder le chiffre apparié
            const adminNumId = numIdByContent.get(normNum(z.content));
            if (adminNumId != null) {
              let wouldPair = false;
              for (const calcId of presentCalcIds) {
                if (calcNumPairs.has(`${calcId}|${adminNumId}`)) { wouldPair = true; break; }
              }
              if (wouldPair) {
                const pick = pickSafeNumber();
                if (pick) {
                  usedNumIds.add(String(pick.id));
                  usedNumContents.add(normNum(pick.content));
                  return { ...z, content: String(pick.content), label: String(pick.content), pairId: '' };
                }
              }
            }
            return z;
          });
        }
      } catch (e) {
        console.warn('Sanitisation unique calcul-chiffre ignorée:', e);
      }
      // Assainissement final bis: éviter les doublons de chiffres visibles (p.ex. deux fois "12")
      try {
        const normCalc = (t) => String(t || '').toLowerCase().replace(/\s+/g, '').replace(/[×*]/g, 'x');
        const normNum = (t) => String(t || '').replace(/\s+/g, '');
        const allNums = (assocData && assocData.chiffres) || [];
        const allCalcs = (assocData && assocData.calculs) || [];
        const calcIdByContent = new Map(allCalcs.map(it => [normCalc(it.content), it.id]));
        const calcNumPairs = new Set(((assocData && assocData.associations) || [])
          .filter(a => a.calculId && a.chiffreId)
          .map(a => `${a.calculId}|${a.chiffreId}`));
        // Calculs présents (IDs admin si disponibles)
        const presentCalcIds = new Set(
          post.filter(z => normType(z?.type) === 'calcul')
              .map(z => calcIdByContent.get(normCalc(z.content)))
              .filter(id => id != null)
              .map(id => String(id))
        );
        const usedNumContents = new Set();
        const usedNumIds = new Set();
        // seed with paired chiffre if any
        for (const z of post) {
          if (normType(z?.type) === 'chiffre' && z?.content != null) {
            const c = normNum(String(z.content));
            if ((z.pairId || '').trim()) {
              usedNumContents.add(c);
            }
          }
        }
        const pickSafeNumber = () => {
          // 1) essayer via Admin
          const pool = allNums.filter(n => !usedNumIds.has(String(n.id)) && !usedNumContents.has(normNum(n.content)));
          const safe = pool.filter(n => {
            for (const calcId of presentCalcIds) {
              if (calcNumPairs.has(`${calcId}|${n.id}`)) return false;
            }
            return true;
          });
          if (safe.length) return safe[Math.floor(rng() * safe.length)];
          return null;
        };
        post = post.map(z => {
          if (normType(z?.type) !== 'chiffre') return z;
          const contentStr = String(z.content ?? '').trim();
          const c = normNum(contentStr);
          // conserver le premier exemplaire de chaque valeur; modifier les suivants s'ils ne sont pas la paire gardée
          if (!usedNumContents.has(c)) {
            usedNumContents.add(c);
            return z;
          }
          // si doublon et non apparié, on remplace
          if (!(z.pairId || '').trim()) {
            const pick = pickSafeNumber();
            if (pick) {
              usedNumIds.add(String(pick.id));
              usedNumContents.add(normNum(pick.content));
              return { ...z, content: String(pick.content), label: String(pick.content), pairId: '' };
            }
            // Fallback: incrémenter jusqu'à trouver un nombre unique qui n'est pas associé à un calcul présent
            let n = parseInt(c, 10);
            if (!Number.isNaN(n)) {
              let tries = 0;
              while (tries < 20) {
                n = n + 1;
                const nc = String(n);
                // vérifier association admin si possible
                let forbidden = usedNumContents.has(nc);
                if (!forbidden && assocData) {
                  // si nous avons une table des chiffres, essayer d'éviter ceux qui pairent
                  const adminNum = (assocData.chiffres || []).find(it => String(it.content) === nc);
                  if (adminNum) {
                    for (const calcId of presentCalcIds) {
                      if (calcNumPairs.has(`${calcId}|${adminNum.id}`)) { forbidden = true; break; }
                    }
                  }
                }
                if (!forbidden) {
                  usedNumContents.add(nc);
                  return { ...z, content: nc, label: nc, pairId: '' };
                }
                tries++;
              }
            }
          }
          return z;
        });
      } catch (e) {
        console.warn('Sanitisation anti-doublons de chiffres ignorée:', e);
      }
      // Filet de sécurité final: anti-doublons pour images, textes et calculs
      try {
        const norm = (s) => String(s || '').trim().toLowerCase();
        const normUrl = (p) => {
          if (!p) return '';
          let s = p; try { s = decodeURIComponent(s); } catch {}
          s = s.toLowerCase().replace(/\\/g, '/');
          const pub = (process.env.PUBLIC_URL || '').toLowerCase();
          if (pub && s.startsWith(pub)) s = s.slice(pub.length);
          if (s.startsWith('/')) s = s.slice(1);
          return s;
        };
        const normCalc = (t) => String(t || '').toLowerCase().replace(/\s+/g, '').replace(/[×*]/g, 'x');
        const normNum = (t) => String(t || '').replace(/\s+/g, '');

        const allImages = (assocData && assocData.images) || [];
        const allTextes = (assocData && assocData.textes) || [];
        const allCalcs = (assocData && assocData.calculs) || [];
        const allNums = (assocData && assocData.chiffres) || [];
        const imgIdByUrl = new Map(allImages.map(it => [normUrl(it.url || it.path || it.src || ''), it.id]));
        const calcIdByContent = new Map(allCalcs.map(it => [normCalc(it.content), it.id]));
        const numIdByContent = new Map(allNums.map(it => [normNum(it.content), it.id]));
        const imgTxtPairs = new Set(((assocData && assocData.associations) || [])
          .filter(a => a.imageId && a.texteId)
          .map(a => `${a.imageId}|${a.texteId}`));
        const calcNumPairs = new Set(((assocData && assocData.associations) || [])
          .filter(a => a.calculId && a.chiffreId)
          .map(a => `${a.calculId}|${a.chiffreId}`));

        // Context: images et chiffres présents (IDs Admin si dispo)
        const presentImageIds = new Set(
          post.filter(z => normType(z?.type) === 'image')
              .map(z => imgIdByUrl.get(normUrl(z.content || z.url || z.path || z.src || '')))
              .filter(id => id != null)
              .map(id => String(id))
        );
        const presentNumIds = new Set(
          post.filter(z => normType(z?.type) === 'chiffre')
              .map(z => numIdByContent.get(normNum(z.content)))
              .filter(id => id != null)
              .map(id => String(id))
        );

        // Images: unicité par URL normalisée (ne change pas l'image appariée)
        {
          const usedUrls = new Set();
          post = post.map(z => {
            if (normType(z?.type) !== 'image') return z;
            const url = normUrl(z.content || z.url || z.path || z.src || '');
            if (!url || !usedUrls.has(url)) { usedUrls.add(url); return z; }
            // doublon non apparié: tenter une autre image sûre
            if (!(z.pairId || '').trim()) {
              let pick = null;
              const usedNow = new Set(usedUrls);
              for (const cand of allImages) {
                const u = normUrl(cand.url || cand.path || cand.src || '');
                if (!u || usedNow.has(u)) continue;
                // éviter de créer une paire avec un texte présent
                const imgId = String(cand.id);
                let wouldPair = false;
                for (const t of post.filter(x => normType(x?.type) === 'texte')) {
                  const tx = allTextes.find(tt => norm(tt.content) === norm(t.content));
                  if (tx && imgTxtPairs.has(`${imgId}|${tx.id}`)) { wouldPair = true; break; }
                }
                if (!wouldPair) { pick = cand; break; }
              }
              if (pick) {
                const u = normUrl(pick.url || pick.path || pick.src || '');
                usedUrls.add(u);
                return { ...z, content: pick.url || pick.path || pick.src || z.content, pairId: '' };
              }
            }
            return z;
          });
        }

        // Textes: unicité par contenu normalisé (ne change pas le texte apparié)
        {
          const usedTexts = new Set();
          const pickSafeText = (usedSet) => {
            const pool = allTextes.filter(t => !usedSet.has(norm(t.content)));
            const safe = pool.filter(t => {
              for (const imgId of presentImageIds) {
                if (imgTxtPairs.has(`${imgId}|${t.id}`)) return false;
              }
              return true;
            });
            if (!safe.length) return null;
            return safe[Math.floor(rng() * safe.length)];
          };
          post = post.map(z => {
            if (normType(z?.type) !== 'texte') return z;
            const c = norm(z.content);
            if (!usedTexts.has(c)) { usedTexts.add(c); return z; }
            if (!(z.pairId || '').trim()) {
              const pick = pickSafeText(usedTexts);
              if (pick) {
                usedTexts.add(norm(pick.content));
                try { newTextSettings[z.id] = { ...defaultTextSettings, ...(newTextSettings[z.id] || {}), text: pick.content || '' }; } catch {}
                return { ...z, content: pick.content, label: pick.content, pairId: '' };
              }
            }
            return z;
          });
        }

        // Calculs: unicité par contenu normalisé (ne change pas le calcul apparié)
        {
          const usedCalcs = new Set();
          const pickSafeCalc = (usedSet) => {
            const pool = allCalcs.filter(c => !usedSet.has(normCalc(c.content)));
            const safe = pool.filter(c => {
              const cid = String(c.id);
              for (const numId of presentNumIds) {
                if (calcNumPairs.has(`${cid}|${numId}`)) return false;
              }
              return true;
            });
            if (!safe.length) return null;
            return safe[Math.floor(rng() * safe.length)];
          };
          post = post.map(z => {
            if (normType(z?.type) !== 'calcul') return z;
            const c = normCalc(z.content);
            if (!usedCalcs.has(c)) { usedCalcs.add(c); return z; }
            if (!(z.pairId || '').trim()) {
              const pick = pickSafeCalc(usedCalcs);
              if (pick) {
                usedCalcs.add(normCalc(pick.content));
                return { ...z, content: pick.content, label: pick.content, pairId: '' };
              }
            }
            return z;
          });
        }
      } catch (e) {
        console.warn('Filet de sécurité anti-doublons (img/txt/calc) ignoré:', e);
      }
      // Enforce: exactement UNE paire valide sur la carte, choisie au hasard parmi toutes faisables (img-txt ou calc-chiffre)
      // Index par pairId
      const byType = (t) => post.filter(z => normType(z?.type) === t);
      const imgs = byType('image');
      const txts = byType('texte');
      const calcs = byType('calcul');
      const nums = byType('chiffre');
      const ids = (arr) => {
        const m = new Map();
        for (const z of arr) { const k = getPairId(z); if (k) { if (!m.has(k)) m.set(k, []); m.get(k).push(z); } }
        return m;
      };
      const mapImg = ids(imgs);
      const mapTxt = ids(txts);
      const mapCalc = ids(calcs);
      const mapNum = ids(nums);
      const interKeys = (A, B) => {
        const out = []; for (const k of A.keys()) { if (B.has(k)) out.push(k); } return out;
      };
      const imgTxtKeys = interKeys(mapImg, mapTxt).map(k => ({ key: k, kind: 'imgtxt' }));
      const calcNumKeys = interKeys(mapCalc, mapNum).map(k => ({ key: k, kind: 'calcnum' }));
      const candidates = [...imgTxtKeys, ...calcNumKeys];
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        const chosenKey = pick.key;
        const chosenKind = pick.kind; // 'imgtxt' | 'calcnum'
        // Choisir un seul exemplaire de chaque côté pour cette paire
        let keptA = null, keptB = null;
        if (chosenKind === 'imgtxt') {
          keptA = (mapImg.get(chosenKey) || [])[0] || null;
          keptB = (mapTxt.get(chosenKey) || [])[0] || null;
        } else {
          keptA = (mapCalc.get(chosenKey) || [])[0] || null;
          keptB = (mapNum.get(chosenKey) || [])[0] || null;
        }
        // Casser toutes les autres correspondances: rendre les pairId uniques/vides pour empêcher tout autre match
        const broken = post.map(z => {
          const t = normType(z?.type);
          const pid = getPairId(z);
          // Si c'est l'une des deux zones retenues, on garde intouché
          if (keptA && z.id === keptA.id) return z;
          if (keptB && z.id === keptB.id) return z;
          // Sinon, toute zone qui partage un pairId avec la clé choisie ou qui pourrait matcher doit être cassée
          if (chosenKind === 'imgtxt') {
            if ((t === 'image' || t === 'texte') && pid === chosenKey) {
              return { ...z, pairId: `x_${z.id}_${Date.now()}` };
            }
          } else {
            if ((t === 'calcul' || t === 'chiffre') && pid === chosenKey) {
              return { ...z, pairId: `x_${z.id}_${Date.now()}` };
            }
          }
          // Zones portant d'autres pairId valides potentiels: on neutralise côté complémentaire pour éviter tout match accidentel
          if (t === 'image' || t === 'texte' || t === 'calcul' || t === 'chiffre') {
            // on laisse leur contenu mais on vide leur pairId si plusieurs éléments partagent la même clé
            if (pid && ((t === 'image' && (mapTxt.has(pid) && pid !== chosenKey)) ||
                        (t === 'texte' && (mapImg.has(pid) && pid !== chosenKey)) ||
                        (t === 'calcul' && (mapNum.has(pid) && pid !== chosenKey)) ||
                        (t === 'chiffre' && (mapCalc.has(pid) && pid !== chosenKey)))) {
              return { ...z, pairId: '' };
            }
          }
          return z;
        });
        // Définir la zone correcte (texte si imgtxt, sinon chiffre)
        let corrId = null;
        let imageZone = null;
        if (chosenKind === 'imgtxt') {
          corrId = keptB?.id || null;
          imageZone = keptA || null;
        } else {
          // calcul-chiffre: zone correcte considérée côté 'chiffre'
          corrId = keptB?.id || null;
          imageZone = null;
        }
        setCorrectZoneId(corrId);
        setCorrectImageZoneId(imageZone?.id || null);
        // Remplacer post par la version neutralisée
        post = broken;
      } else {
        // Pas de candidats: par sécurité aucune paire ne doit matcher
        post = post.map(z => ({ ...z, pairId: '' }));
        setCorrectZoneId(null);
        setCorrectImageZoneId(null);
      }
      setGameSelectedIds([]);
      // Sécurité finale: si l'option est activée et qu'il n'existe aucune association calc↔chiffre,
      // vider systématiquement toutes les zones calcul/chiffre avant d'appliquer le nouvel état.
      try {
        const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
        const allow = !!cfg?.allowEmptyMathWhenNoData;
        const counts = (typeof window !== 'undefined' && window.__CC_LAST_FILTER_COUNTS__) ? window.__CC_LAST_FILTER_COUNTS__ : {};
        const noMathAssoc = Number(counts?.calcNum) === 0;
        if (allow && noMathAssoc && Array.isArray(post)) {
          post = post.map(z => {
            const t = normType(z?.type);
            if (t === 'calcul' || t === 'chiffre') return { ...z, content: '', label: '', pairId: '' };
            return z;
          });
        }
      } catch {}
      // Sécurité finale (Politique C): aucune image de zone ne doit référencer un ID non autorisé
      // IMPORTANT: utiliser la logique association-based et niveaux cumulatifs (cohérent avec le post-processing)
      try {
        const normUrl = (p) => {
          if (!p) return '';
          const normalized = String(p).startsWith('http')
            ? String(p)
            : (process.env.PUBLIC_URL + '/' + (String(p).startsWith('/') ? String(p).slice(1) : (String(p).startsWith('images/') ? String(p) : 'images/' + String(p))));
          return encodeURI(normalized).replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
        };
        const imgIdByUrl = new Map();
        for (const im of ((assocData && assocData.images) || [])) {
          const u = normUrl(im.url || im.path || im.src || '');
          if (u) imgIdByUrl.set(u, String(im.id));
        }
        const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
        const selThemes = Array.isArray(cfg?.themes) ? cfg.themes.filter(Boolean).map(String) : [];
        const selClasses = Array.isArray(cfg?.classes) ? cfg.classes.filter(Boolean).map(String) : [];
        const LEVEL_ORDER_F = ["CP","CE1","CE2","CM1","CM2","6e","5e","4e","3e"];
        const lvlIdxF = Object.fromEntries(LEVEL_ORDER_F.map((l, i) => [l, i]));
        const normLevelF = (s) => {
          const x = String(s || '').toLowerCase();
          if (/\bcp\b/.test(x)) return 'CP';
          if (/\bce1\b/.test(x)) return 'CE1';
          if (/\bce2\b/.test(x)) return 'CE2';
          if (/\bcm1\b/.test(x)) return 'CM1';
          if (/\bcm2\b/.test(x)) return 'CM2';
          if (/\b6e\b|\bsixieme\b/.test(x)) return '6e';
          if (/\b5e\b|\bcinquieme\b/.test(x)) return '5e';
          if (/\b4e\b|\bquatrieme\b/.test(x)) return '4e';
          if (/\b3e\b|\btroisieme\b/.test(x)) return '3e';
          return '';
        };
        const hasAnyF = (vals, selected) => {
          const ts = Array.isArray(vals) ? vals.map(String) : [];
          return selected.length === 0 || ts.some(t => selected.includes(t));
        };
        const maxLvlIdxF = selClasses.length ? Math.max(...selClasses.map(c => lvlIdxF[normLevelF(c)] ?? -1)) : 99;
        // Filtrer associations par thèmes et niveaux CUMULATIFS (CM2 inclut CP→CM2)
        let filteredAssoc = (assocData.associations || []);
        if (selThemes.length > 0) filteredAssoc = filteredAssoc.filter(a => hasAnyF(a?.themes || [], selThemes));
        if (selClasses.length > 0) filteredAssoc = filteredAssoc.filter(a => {
          const lc = a?.levelClass ? [String(a.levelClass)] : [];
          const arr = a?.levels || a?.classes || a?.classLevels || [];
          const vals = [...lc, ...arr].map(normLevelF).filter(Boolean);
          return vals.length === 0 || vals.some(v => (lvlIdxF[v] ?? 99) <= maxLvlIdxF);
        });
        // IDs autorisés = images référencées par associations filtrées (héritage de thème)
        const allowedImgIds = new Set(filteredAssoc.filter(a => a.imageId).map(a => String(a.imageId)));
        // Aussi inclure images qui matchent par elles-mêmes (niveaux cumulatifs + thèmes)
        for (const im of ((assocData && assocData.images) || [])) {
          if (selThemes.length && !hasAnyF(im?.themes || [], selThemes)) continue;
          if (selClasses.length) {
            const lc = im?.levelClass ? [String(im.levelClass)] : [];
            const arr = im?.levels || im?.classes || im?.classLevels || [];
            const lv = [...lc, ...arr].map(normLevelF).filter(Boolean);
            if (!lv.length) continue;
            if (!lv.some(v => (lvlIdxF[v] ?? 99) <= maxLvlIdxF)) continue;
          }
          allowedImgIds.add(String(im.id));
        }
        // Si aucun filtre actif, tout autoriser
        if (!selThemes.length && !selClasses.length) {
          for (const im of ((assocData && assocData.images) || [])) allowedImgIds.add(String(im.id));
        }

        let cleaned = 0;
        post = post.map(z => {
          if (normType(z?.type) !== 'image') return z;
          const u = normUrl(z.content || z.url || z.path || z.src || '');
          const id = imgIdByUrl.get(u);
          if (!id) return z;
          if (!allowedImgIds.has(String(id))) {
            cleaned++;
            return { ...z, content: 'images/carte-vide.png', pairId: '' };
          }
          return z;
        });
        if (cleaned) {
          console.warn('[ASSIGN][STRICT][FINAL] images nettoyées:', cleaned, 'allowedImgIds:', allowedImgIds.size);
        }
      } catch {}
      setZones(post);
      setCustomTextSettings(newTextSettings);
      localStorage.setItem('zones', JSON.stringify(post));
      console.log('Zones après attribution automatique (post-traitées) :', post);
      // Enregistrer dans le diagnostic global pour analyse
      try { window.ccAddDiag && window.ccAddDiag('zones:assigned', post); } catch {}
      
      // Marquer explicitement les zones sans pairId comme distracteurs
      // (le post-traitement Carte.js remplace le contenu sans préserver isDistractor d'elementsLoader)
      post = post.map(z => {
        const pid = (z.pairId || '').trim();
        if (!pid && !z.isDistractor) return { ...z, isDistractor: true };
        return z;
      });
      // Vérifier les anomalies sur les zones générées
      try { incidentValidateZones(post, { source: 'solo:assignElements' }); } catch {}
      
      // Enregistrer dans le monitoring backend automatiquement
      try {
        const sessionId = localStorage.getItem('cc_session_id') || `session_${Date.now()}`;
        const userId = localStorage.getItem('cc_user_id') || null;
        const roundIdx = (window.__CC_ROUND_INDEX__ || 0);
        
        fetch(`${getBackendUrl()}/api/monitoring/record-images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            userId,
            roundIndex: roundIdx,
            zones: post
          })
        }).catch(err => console.warn('[Monitoring] Erreur enregistrement:', err));
      } catch {}
    } catch (error) {
      alert('Erreur lors du chargement des éléments ou des zones.');
    }
  }

  // Sauvegarde auto dans localStorage à chaque modification de zones

  // Drag simple = déplacement du point
  const handlePointMouseDown = (idx, e) => {
    e.stopPropagation();
    setDraggedIdx(idx);
  };
  // Réinitialiser toutes les poignées
  const resetHandles = () => {
    setEditPoints(points => points.map(p => ({ ...p, handleIn: null, handleOut: null })));
  };

  // ... (toutes les autres fonctions utilitaires ici) ...
  // Sauvegarde auto dans localStorage à chaque modification de zones
  

  const handleMouseMove = (e) => {
    if (draggedIdx !== null || draggedHandle || dragState.id) {
      setIsDragging(true);
    }
    const svg = svgOverlayRef.current;
    if (draggedIdx !== null) {
      const pt = pointToSvgCoords(e, svg);
      setEditPoints(points => points.map((p, i) => i === draggedIdx ? { ...p, x: pt.x, y: pt.y } : p));
      return;
    }
    if (draggedHandle) {
      const pt = pointToSvgCoords(e, svg);
      setEditPoints(points => points.map((p, i) => {
        if (i !== draggedHandle.idx) return p;
        if (draggedHandle.type === 'in') return { ...p, handleIn: pt };
        if (draggedHandle.type === 'out') return { ...p, handleOut: pt };
        return p;
      }));
      return;
    }
    // Drag de positions calcul/chiffre
    if (dragState.id && !gameActive && editMode) {
      const pt = pointToSvgCoords(e, svg);
      const dx = pt.x - (dragState.start?.x || 0);
      const dy = pt.y - (dragState.start?.y || 0);
      const nx = (dragState.orig?.x || 0) + dx;
      const ny = (dragState.orig?.y || 0) + dy;
      if (Math.abs(dx) + Math.abs(dy) > 0.5 && !dragState.moved) {
        setDragState(s => ({ ...s, moved: true }));
      }
      setMathOffsets(prev => ({
        ...prev,
        [dragState.id]: { x: nx, y: ny }
      }));
    }
  };
  // Ajout/drag de poignées de Bézier
  const handleHandleMouseDown = (idx, type, e) => {
    e.stopPropagation();
    setDraggedHandle({ idx, type });
  };
  // À la création d’un point, il a toujours deux poignées par défaut
  const handleAddPoint = (e) => {
    const svg = svgOverlayRef.current;
    const pt = pointToSvgCoords(e, svg);
    setEditPoints(points => [
      ...points,
      {
        x: pt.x,
        y: pt.y,
        handleIn: { x: pt.x - 50, y: pt.y },
        handleOut: { x: pt.x + 50, y: pt.y }
      }
    ]);
  };

  if (error) {
    return (
      <div style={{ background: '#ffeaea', color: '#b30000', padding: '24px', border: '2px solid #b30000', borderRadius: 8, margin: 32, fontSize: 20, textAlign: 'center', fontWeight: 'bold' }}>
        <span>❌ Erreur lors du chargement des zones :</span>
        <br />
        <span style={{ fontSize: 16, fontWeight: 'normal' }}>{error}</span>
        <br /><br />
        <span>Vérifie le fichier <b>public/data/zones2.json</b> (syntaxe JSON, crochets, etc.)</span>
      </div>
    );
  }
  const svgPath = `${process.env.PUBLIC_URL}/images/carte-svg.svg`;

  // Calcule la bounding box d'une zone à partir de ses points
  function getZoneBoundingBox(points) {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

 return (
    <div className={`carte-container ${hasSidebar ? 'game-with-sidebar' : ''}`} style={{ position: 'relative' }}>
      {/* Overlay: tournez votre téléphone en mode paysage */}
      {isMobile && isPortrait && (gameActive || roomStatus === 'playing') && (
        <div className="cc-rotate-overlay">
          <div className="cc-rotate-content">
            <div className="cc-rotate-phone">📱</div>
            <div className="cc-rotate-arrow">↻</div>
            <p className="cc-rotate-text">Tournez votre téléphone en mode paysage</p>
            <p className="cc-rotate-sub">pour une meilleure expérience de jeu</p>
          </div>
        </div>
      )}
      {/* Particules flottantes CSS-only */}
      {hasSidebar && <div className="cc-game-particles" />}
      {(() => {
        if (!preparing) return null;
        let isSoloMode = false;
        try {
          const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
          isSoloMode = cfg && cfg.mode === 'solo';
        } catch {}
        if (isSoloMode) return null;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#111827', color: '#fff', padding: 18, borderRadius: 10, width: 280, textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
              <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Préparation de la session…</div>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.2)', borderRadius: 999 }}>
                <div style={{ width: `${Math.max(0, Math.min(100, prepProgress))}%`, height: '100%', background: '#10b981', borderRadius: 999, transition: 'width .2s ease' }} />
              </div>
            </div>
          </div>
        );
      })()}
      {Array.isArray(activeThemes) && activeThemes.length > 0 && !(isMobile && !isPortrait && hasSidebar) && (
        <div style={{ position: 'fixed', top: 8, right: 8, zIndex: 8 }}>
          <button
            onClick={() => setThemesDropdownOpen(v => !v)}
            style={{
              background: 'rgba(17,24,39,0.65)',
              color: '#fff',
              padding: '5px 10px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.15)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              fontSize: 11,
              cursor: 'pointer',
              opacity: themesDropdownOpen ? 1 : 0.55,
              transition: 'opacity 0.2s'
            }}
            title={activeThemes.join(', ')}
          >
            🏷️ {activeThemes.length} thème{activeThemes.length > 1 ? 's' : ''} {themesDropdownOpen ? '▲' : '▼'}
          </button>
          {themesDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                background: 'rgba(17,24,39,0.95)',
                color: '#e5e7eb',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.15)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                fontSize: 12,
                minWidth: 180,
                maxWidth: '70vw',
                maxHeight: '50vh',
                overflowY: 'auto',
                padding: '6px 0'
              }}
            >
              {activeThemes.map((t, i) => (
                <div key={i} style={{ padding: '5px 12px', borderBottom: i < activeThemes.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  {t}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {(() => {
        try {
          const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
          const allow = !!cfg?.allowEmptyMathWhenNoData;
          const hasMathAssoc = (() => {
            const d = window.__CC_LAST_FILTER_COUNTS__ || {};
            return Number(d?.calcNum) > 0;
          })();
          if (allow && !hasMathAssoc) {
            return (
              <div style={{ position: 'fixed', top: 44, right: 8, zIndex: 8, background: 'rgba(245,158,11,0.95)', color: '#111827', padding: '6px 10px', borderRadius: 999, border: '1px solid rgba(0,0,0,0.1)', boxShadow: '0 6px 18px rgba(0,0,0,0.18)', fontSize: 12 }}>
                Zones calcul/chiffre volontairement vides (pas de données pour cette configuration)
              </div>
            );
          }
        } catch {}
        return null;
      })()}
      {gameActive && (
        <button
          onClick={() => {
            try {
              const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
              if (isFs) {
                const exitFn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
                if (exitFn) exitFn.call(document);
                try { document.body.style.overflow = ''; } catch {}
                try { document.body.classList.remove('cc-game'); } catch {}
                setFullScreen(false);
              } else {
                const root = document.documentElement;
                const enterFn = root.requestFullscreen || root.webkitRequestFullscreen || root.mozRequestFullScreen || root.msRequestFullscreen;
                if (enterFn) enterFn.call(root);
                try { document.body.style.overflow = 'hidden'; } catch {}
                try { document.body.classList.add('cc-game'); } catch {}
                setFullScreen(true);
                setPanelCollapsed(true);
              }
            } catch (err) { console.warn('[Fullscreen] toggle error:', err); }
          }}
          title={fullScreen ? 'Quitter le plein écran' : 'Plein écran'}
          style={{ position: 'fixed', bottom: isMobile ? 12 : 16, right: isMobile ? 12 : 16, zIndex: 50, width: isMobile ? 36 : 32, height: isMobile ? 36 : 32, borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(17,24,39,0.5)', color: '#fff', fontSize: isMobile ? 18 : 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', opacity: 0.45, transition: 'opacity 0.2s', padding: 0, lineHeight: 1 }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0.45'}
          onTouchStart={e => e.currentTarget.style.opacity = '0.9'}
          onTouchEnd={e => { setTimeout(() => { try { e.target.style.opacity = '0.45'; } catch {} }, 1500); }}
        >
          {fullScreen ? '⊖' : '⛶'}
        </button>
      )}
      {isMobile && isPortrait && (
        <div className="mobile-hud">
          <div className="hud-left">
            {!isTiebreaker && !objectiveMode && <div className="hud-chip">⏱ {Math.max(0, timeLeft)}s</div>}
            {objectiveMode && <div className="hud-chip" style={{ background: 'rgba(13,106,122,0.85)' }}>⏱ {timeElapsed + helpPenalty}s</div>}
            <div className="hud-chip">⭐ {score}</div>
            {objectiveMode ? (
              objectiveThemes.length > 0 ? (
                <div className="hud-chip" style={{ background: 'rgba(13,106,122,0.7)', fontSize: 10, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  🎯 {(Array.isArray(objectiveProgressRef.current) ? objectiveProgressRef.current : []).filter(p => p.sessionFound >= p.total && p.total > 0).length}/{objectiveThemes.length}
                </div>
              ) : (
                <div className="hud-chip" style={{ background: 'rgba(13,106,122,0.7)' }}>
                  🎯 {objectivePairsRef.current}/{objectiveTarget}
                </div>
              )
            ) : (
              <div className="hud-chip">
                {Number.isFinite(roundsPerSession)
                  ? `Manche: ${Math.max(0, roundsPlayed || 0)} / ${roundsPerSession}`
                  : `Manche: ${Math.max(0, roundsPlayed || 0)}`}
              </div>
            )}
            {helpEnabled && gameActive && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={handleHintClick} disabled={helpLevel >= 1}
                  style={{ padding: '4px 8px', borderRadius: 8, border: 'none', background: helpLevel >= 1 ? '#94a3b8' : '#f59e0b', color: '#fff', fontSize: 11, fontWeight: 700, cursor: helpLevel >= 1 ? 'default' : 'pointer', opacity: helpLevel >= 1 ? 0.5 : 1 }}>
                  💡 +{HINT_PENALTY}s
                </button>
                <button onClick={handleAnswerClick} disabled={helpLevel < 1 || helpLevel >= 2}
                  style={{ padding: '4px 8px', borderRadius: 8, border: 'none', background: helpLevel < 1 || helpLevel >= 2 ? '#94a3b8' : '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, cursor: (helpLevel < 1 || helpLevel >= 2) ? 'default' : 'pointer', opacity: (helpLevel < 1 || helpLevel >= 2) ? 0.5 : 1 }}>
                  🎯 +{ANSWER_PENALTY}s
                </button>
              </div>
            )}
          </div>
          <div className="hud-vignette" data-cc-vignette="last-pair" ref={mpLastPairRef} title={lastWonPair?.text || ''}>
            <span style={{ width: 12, height: 12, borderRadius: 999, display: 'inline-block', marginRight: 6, background: lastWonPair?.color || '#e5e7eb', boxShadow: lastWonPair ? `0 0 6px 2px ${(lastWonPair.color || '#e5e7eb')}55` : 'none', border: lastWonPair?.borderColor ? `2px solid ${lastWonPair.borderColor}` : 'none' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lastWonPair ? (
                <><b>{lastWonPair.winnerName}</b>: {lastWonPair.text}{lastWonPair.tie && (
                  <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 999, background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e' }}>Égalité</span>
                )}</>
              ) : 'Dernière paire: —'}
            </span>
          </div>
        </div>
      )}
      {isMobile && isPortrait && Array.isArray(wonPairsHistory) && wonPairsHistory.length > 0 && (
        <div className="mobile-history-strip" aria-label="Historique des paires">
          {wonPairsHistory.slice(0, 10).map((e, i) => (
            <div key={i} className="hist-item" title={e.text}>
              <span className="dot" style={{ background: e.color || '#e5e7eb', border: e.borderColor ? `2px solid ${e.borderColor}` : 'none' }} />
              {e.kind === 'imgtxt' && e.imageSrc && (
                <img src={e.imageSrc} alt={e.imageLabel || e.text || 'Image'} style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover', flexShrink: 0, marginRight: 4 }} />
              )}
              <span style={{ maxWidth: '52vw', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <b style={{ marginRight: 4 }}>{e.winnerName || 'Joueur'}</b>
                <span>{e.kind === 'calcnum' && e.calcExpr && e.calcResult ? `${e.calcExpr} = ${e.calcResult}` : (e.kind === 'imgtxt' && e.imageLabel ? e.imageLabel : e.text)}</span>
                {e.tie && (
                  <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 999, background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e' }}>Égalité</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {hasSidebar && (
        <aside className="game-sidebar-fixed">
          <div className="sidebar-content">
            {/* HUD: Timer + Score + Manche */}
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {!isTiebreaker && !objectiveMode && (
                <div style={{
                  background: timeLeft < 10 ? 'rgba(220,38,38,0.85)' : 'rgba(0,0,0,0.3)',
                  borderRadius: 12, padding: '6px 14px', border: '1px solid rgba(255,255,255,0.12)',
                  fontSize: 18, fontWeight: 900,
                  color: timeLeft < 10 ? '#fff' : timeLeft <= 30 ? '#F5A623' : '#10b981',
                  fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums'
                }}>
                  ⏱ {Math.max(0, timeLeft)}s
                </div>
              )}
              {objectiveMode && (
                <div style={{
                  background: 'rgba(13,106,122,0.85)',
                  borderRadius: 12, padding: '6px 14px', border: '1px solid rgba(255,255,255,0.12)',
                  fontSize: 18, fontWeight: 900, color: '#7dd3fc',
                  fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums'
                }}>
                  ⏱ {timeElapsed + helpPenalty}s
                  {helpPenalty > 0 && <span style={{ fontSize: 11, color: '#fca5a5', marginLeft: 4 }}>(+{helpPenalty})</span>}
                </div>
              )}
              <div style={{ background: '#fff', borderRadius: 12, padding: '4px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, color: '#666' }}>⭐</span>
                <span style={{ fontSize: 22, fontWeight: 900, color: '#22c55e', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{score}</span>
              </div>
              {objectiveMode ? (
                objectiveThemes.length > 0 ? (
                  <div style={{ background: 'rgba(13,106,122,0.7)', borderRadius: 12, padding: '6px 14px', border: '1px solid rgba(255,255,255,0.12)', fontSize: 13, fontWeight: 700, color: '#fff' }}>
                    🎯 {(Array.isArray(objectiveProgressRef.current) ? objectiveProgressRef.current : []).filter(p => p.sessionFound >= p.total && p.total > 0).length}/{objectiveThemes.length} thèmes
                  </div>
                ) : (
                  <div style={{ background: 'rgba(13,106,122,0.7)', borderRadius: 12, padding: '6px 14px', border: '1px solid rgba(255,255,255,0.12)', fontSize: 13, fontWeight: 700, color: '#fff' }}>
                    🎯 {objectivePairsRef.current}/{objectiveTarget}
                  </div>
                )
              ) : (
                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: '6px 14px', border: '1px solid rgba(255,255,255,0.12)', fontSize: 13, fontWeight: 700, color: '#fff' }}>
                  {Number.isFinite(roundsPerSession)
                    ? `Manche ${Math.max(0, roundsPlayed||0)} / ${roundsPerSession}`
                    : `Manche ${Math.max(0, roundsPlayed||0)}`}
                </div>
              )}
            </div>
            {/* Barres de progression Objectif */}
            {objectiveMode && gameActive && (
              objectiveThemes.length > 0 ? (
                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '8px 14px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#7dd3fc', marginBottom: 2 }}>🎯 Objectifs thématiques</div>
                  {(Array.isArray(objectiveProgressRef.current) ? objectiveProgressRef.current : []).map(p => {
                    const pct = p.total > 0 ? Math.min(100, Math.round((p.sessionFound / p.total) * 100)) : 0;
                    const done = p.total > 0 && p.sessionFound >= p.total;
                    return (
                      <div key={p.key}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: done ? '#86efac' : '#cbd5e1', fontWeight: 600, marginBottom: 2 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{done ? '✅' : '🎯'} {p.label}</span>
                          <span>{p.sessionFound}/{p.total}</span>
                        </div>
                        <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: done ? '#22c55e' : 'linear-gradient(90deg, #0d6a7a, #22d3ee)', borderRadius: 3, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '8px 14px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#cbd5e1', fontWeight: 600, marginBottom: 4 }}>
                    <span>🎯 Objectif: {objectiveTarget} paires</span>
                    <span>{Math.round((objectivePairsRef.current / objectiveTarget) * 100)}%</span>
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, Math.round((objectivePairsRef.current / objectiveTarget) * 100))}%`, background: 'linear-gradient(90deg, #0d6a7a, #22d3ee)', borderRadius: 4, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              )
            )}
            {/* Boutons d'aide */}
            {helpEnabled && gameActive && (
              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600, marginRight: 4 }}>Aide:</span>
                <button onClick={handleHintClick} disabled={helpLevel >= 1}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: 'none', background: helpLevel >= 1 ? '#475569' : '#f59e0b', color: '#fff', fontSize: 12, fontWeight: 700, cursor: helpLevel >= 1 ? 'default' : 'pointer', opacity: helpLevel >= 1 ? 0.5 : 1, transition: 'all 0.2s' }}>
                  💡 Indice (+{HINT_PENALTY}s)
                </button>
                <button onClick={handleAnswerClick} disabled={helpLevel < 1 || helpLevel >= 2}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: 'none', background: (helpLevel < 1 || helpLevel >= 2) ? '#475569' : '#ef4444', color: '#fff', fontSize: 12, fontWeight: 700, cursor: (helpLevel < 1 || helpLevel >= 2) ? 'default' : 'pointer', opacity: (helpLevel < 1 || helpLevel >= 2) ? 0.5 : 1, transition: 'all 0.2s' }}>
                  🎯 Réponse (+{ANSWER_PENALTY}s)
                </button>
              </div>
            )}
            {/* Salle + Paramètres + Terminer */}
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{roomId ? `Salle: ${roomId}` : 'Mode Solo'}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{Number.isFinite(roundsPerSession) ? `${roundsPerSession} manches` : 'manches ∞'} · {gameDuration}s</div>
              </div>
              <button onClick={handleEndSessionNow} style={{ background: 'rgba(220,38,38,0.8)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Terminer</button>
            </div>
            {/* Classement joueurs */}
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#fff' }}>🏆 Classement</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {((roomPlayers && roomPlayers.length) ? roomPlayers : (scoresMP || []).map(p => ({ id: p.id, nickname: p.name, score: p.score })))
                  .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                  .map((p, idx) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)', transition: 'all 0.3s' }}>
                      <div style={{ fontSize: idx === 0 ? 18 : 13, fontWeight: 900, minWidth: 24, textAlign: 'center' }}>
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`}
                      </div>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, color: '#fff' }}>{p.nickname || p.name}</span>
                      <div style={{ background: '#fff', borderRadius: 10, padding: '2px 10px', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}>
                        <span style={{ fontSize: 18, fontWeight: 900, color: '#22c55e', fontVariantNumeric: 'tabular-nums' }}>{(p.score ?? 0)}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
            {/* Progression Maîtrise */}
            {masteryProgress.length > 0 && (
              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#fff' }}>🎯 Maîtrise</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {masteryProgress.slice(0, 5).map(t => (
                    <div key={t.key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#cbd5e1', fontWeight: 600, marginBottom: 2 }}>
                        <span>{t.tiers.gold ? '\u{1F947}' : t.tiers.silver ? '\u{1F948}' : t.tiers.bronze ? '\u{1F949}' : '\u{1F3AF}'} {t.label}</span>
                        <span style={{ color: '#94a3b8' }}>{t.found}/{t.total}</span>
                      </div>
                      <div style={{ height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.round((t.found / t.total) * 100)}%`, background: t.found >= t.total ? '#22c55e' : t.found / t.total > 0.6 ? '#f59e0b' : '#3b82f6', borderRadius: 3, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Dernière paire validée */}
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 8 }} data-cc-vignette="last-pair" ref={mpLastPairRef}>
              <span style={{ width: 12, height: 12, borderRadius: 999, flexShrink: 0, background: lastWonPair?.color || 'rgba(255,255,255,0.3)', boxShadow: lastWonPair ? `0 0 6px 2px ${(lastWonPair.color || '#e5e7eb')}55` : 'none', border: lastWonPair?.borderColor ? `2px solid ${lastWonPair.borderColor}` : 'none' }} />
              <span style={{ fontSize: 13, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lastWonPair ? (
                  <><b>{lastWonPair.winnerName}</b>: {lastWonPair.text}{lastWonPair.tie && (
                    <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'rgba(251,191,36,0.25)', border: '1px solid rgba(251,191,36,0.5)', color: '#fbbf24' }}>Égalité</span>
                  )}</>
                ) : 'Dernière paire: —'}
              </span>
            </div>
            {/* Historique */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '6px 0', marginBottom: 6 }} onClick={() => setHistoryExpanded(v => !v)}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#fff' }}>📚 Historique</h3>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '1px 7px', fontWeight: 600 }}>{Array.isArray(wonPairsHistory) ? wonPairsHistory.length : 0}</span>
              </div>
              {historyExpanded && (
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(wonPairsHistory || []).map((h, i) => {
                    const label = (() => {
                      if (h.kind === 'calcnum' && h.calcExpr && h.calcResult) return `${h.calcExpr} = ${h.calcResult}`;
                      if (h.kind === 'imgtxt' && h.imageLabel) return h.imageLabel;
                      return h.text || '';
                    })();
                    return (
                      <div key={i} style={{ fontSize: 12, padding: '5px 8px', border: `1px solid ${h.color || 'rgba(255,255,255,0.1)'}44`, borderRadius: 8, background: 'rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: h.color || '#e5e7eb', border: h.borderColor ? `2px solid ${h.borderColor}` : 'none', flexShrink: 0, boxShadow: `0 0 4px ${h.color || '#e5e7eb'}66` }} />
                          <span style={{ fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{h.winnerName || 'Joueur'}</span>
                        </div>
                        <div style={{ marginLeft: 14, display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                          {h.kind === 'imgtxt' && h.imageSrc && (
                            <img src={h.imageSrc} alt={h.imageLabel || label || 'Image'} style={{ width: 24, height: 24, borderRadius: 5, objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(255,255,255,0.2)' }} />
                          )}
                          {h.kind === 'calcnum' ? (
                            <span style={{ fontSize: 11, color: '#fff' }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{h.calcExpr}</span>
                              <span style={{ fontWeight: 800, margin: '0 3px', color: '#fbbf24' }}>=</span>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#fbbf24' }}>{h.calcResult}</span>
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {label}
                              {h.tie && (
                                <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 999, background: 'rgba(251,191,36,0.25)', border: '1px solid rgba(251,191,36,0.5)', color: '#fbbf24' }}>Égalité</span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>
      )}
      {/* BLOC BOUTONS TOUJOURS AFFICHÉS (masqué en plein écran jeu) */}
      {!hasSidebar && (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '24px 0 24px 0', gap: 10 }}>
          {/* (Supprimé) Bannière zone 417 + bouton de duplication */}
        {!gameActive && editMode && (
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => {
            const data = JSON.stringify(zones, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'zones.json';
            a.click();
            URL.revokeObjectURL(url);
          }}>
            Exporter les zones
          </button>
          <label style={{ cursor: 'pointer', background: '#eee', border: '1px solid #ccc', borderRadius: 4, padding: '6px 12px' }}>
            Importer des zones
            <input type="file" accept="application/json" style={{ display: 'none' }} onChange={e => {
              const file = e.target.files[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = evt => {
                try {
                  const imported = JSON.parse(evt.target.result);
                  if (Array.isArray(imported)) {
  // Correction automatique des propriétés manquantes pour compatibilité effets
  const enriched = imported.map(z => ({
    ...z,
    type: z.type || '',
    content: z.content || '',
    pairId: z.pairId || ''
  }));
  setZones(enriched);
  localStorage.setItem('zones', JSON.stringify(enriched));
  window.location.reload(); // force le rechargement pour que tout soit synchro
}
                  else alert('Le fichier n\'est pas valide.');
                } catch {
                  alert('Erreur de lecture du fichier.');
                }
              };
              reader.readAsText(file);
            }} />
          </label>
        </div>
        )}
        <hr style={{ margin: '16px 0', border: 0, borderTop: '2px dashed #ffc107' }} />
        {/* --- MODE JEU --- */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0', flexWrap: 'wrap' }}>
          {gameActive ? (
            <button
              style={{ background: '#d63031', color: '#fff', fontWeight: 'bold', border: '2px solid #333', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}
              onClick={() => setGameActive(false)}
            >
              Stop
            </button>
          ) : null}
          {!isTiebreaker && <div style={{ fontSize: 18, fontWeight: 'bold' }}>Temps: {timeLeft}s</div>}
          <div style={{ fontSize: 18, fontWeight: 'bold' }}>Score: {score}</div>
          <div style={{ fontSize: 18, fontWeight: 'bold' }}>
            {Number.isFinite(roundsPerSession)
              ? `Manche: ${Math.max(0, roundsPlayed || 0)} / ${roundsPerSession}`
              : `Manche: ${Math.max(0, roundsPlayed || 0)}`}
          </div>
        </div>

        {/* (Supprimé) Bouton d'attribution de contenu aux zones */}
        {!gameActive && editMode && (
        <button
          style={{
            background: drawingMode ? '#28a745' : '#ffc107',
            color: '#222',
            fontWeight: 'bold',
            border: '2px solid #333',
            borderRadius: 8,
            padding: '10px 24px',
            fontSize: 18,
            marginRight: 12,
            cursor: 'pointer'
          }}
          onClick={() => setDrawingMode(dm => !dm)}
        >
          {drawingMode ? 'Désactiver le dessin' : 'Activer le dessin'}
        </button>
        )}
        {!gameActive && editMode && (
        <button
          style={{
            background: '#4caf50',
            color: '#fff',
            fontWeight: 'bold',
            border: '2px solid #333',
            borderRadius: 8,
            padding: '10px 24px',
            fontSize: 16,
            marginLeft: 12,
            cursor: 'pointer'
          }}
          onClick={() => {
            const data = JSON.stringify(zones, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'zones_attribuees.json';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Exporter JSON enrichi
        </button>
        )}
        {drawingMode && editPoints.length > 2 && (
          <button
            style={{
              background: '#28a745',
              color: '#fff',
              fontWeight: 'bold',
              border: '2px solid #333',
              borderRadius: 8,
              padding: '8px 22px',
              fontSize: 16,
              margin: '10px 0 15px 0',
              cursor: 'pointer'
            }}
            onClick={() => {
              setZones(zs => [
                ...zs,
                { id: Date.now(), points: editPoints, color: 'yellow' }
              ]);
              setEditPoints([]);
              setDrawingMode(false);
            }}
          >
            Valider la zone
          </button>
        )}
      </div>
      )}
      {/* --- MODALE ÉDITION TEXTE COURBÉ ZONE VERTE --- */}
      {editingZoneId && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 99,
          background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, minWidth: 340, boxShadow: '0 4px 32px #0003', position: 'relative' }}>
            <h3>Édition du texte courbé (zone verte)</h3>
            <div style={{ marginBottom: 18 }}>
              <label>Texte<br/>
                <input type="text" style={{ width: '100%' }}
                  value={customTextSettings[editingZoneId]?.text || ''}
                  onChange={e => updateTextSetting(editingZoneId, 'text', e.target.value)}
                />
              </label>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label>Angle de départ (degrés)<br/>
                <input type="range" min="-180" max="180" step="1"
                  value={customTextSettings[editingZoneId]?.angle || 0}
                  onChange={e => updateTextSetting(editingZoneId, 'angle', Number(e.target.value))}
                />
                <span style={{ marginLeft: 12 }}>{customTextSettings[editingZoneId]?.angle || 0}°</span>
              </label>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label>Taille du texte<br/>
                <input type="range" min="12" max="96" step="1"
                  value={customTextSettings[editingZoneId]?.fontSize || 32}
                  onChange={e => updateTextSetting(editingZoneId, 'fontSize', Number(e.target.value))}
                />
                <span style={{ marginLeft: 12 }}>{customTextSettings[editingZoneId]?.fontSize || 32}px</span>
              </label>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label>Police<br/>
                <select
                  value={customTextSettings[editingZoneId]?.fontFamily || 'Arial'}
                  onChange={e => updateTextSetting(editingZoneId, 'fontFamily', e.target.value)}
                >
                  <option value="Arial">Arial</option>
                  <option value="Verdana">Verdana</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Comic Sans MS">Comic Sans MS</option>
                  <option value="Courier New">Courier New</option>
                  <option value="Montserrat">Montserrat</option>
                  <option value="Roboto">Roboto</option>
                </select>
              </label>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label>Couleur<br/>
                <input type="color"
                  value={customTextSettings[editingZoneId]?.color || '#222'}
                  onChange={e => updateTextSetting(editingZoneId, 'color', e.target.value)}
                />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
              <button onClick={cancelTextSettings} style={{ background: '#eee', color: '#333', border: 'none', padding: '8px 20px', borderRadius: 6 }}>Annuler</button>
              <button
                type="button"
                style={{ background: '#ffc107', color: '#222', border: 'none', padding: '8px 20px', borderRadius: 6, fontWeight: 'bold' }}
                onClick={() => {
                  setArcSelectionMode(true);
                  setEditingZoneId(null); // ferme le panneau pour activer la sélection
                }}
              >
                Sélectionner l’arc
              </button>
              <button onClick={() => validateTextSettings(editingZoneId)} style={{ background: '#1aaf52', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 6, fontWeight: 'bold' }}>Valider</button>
            </div>
          </div>
        </div>
      )}

      <MasteryBubble event={masteryEvent} onDone={() => setMasteryEvent(null)} />
      <div className="carte" style={{ position: 'relative' }} ref={gameContainerRef}>
        {flashWrong && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(214,48,49,0.25)', pointerEvents: 'none', zIndex: 5 }} />
        )}
        {showBigCross && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: '120%', height: 16, background: 'rgba(220,0,0,0.85)', transform: 'translate(-50%, -50%) rotate(45deg)', borderRadius: 8 }} />
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: '120%', height: 16, background: 'rgba(220,0,0,0.85)', transform: 'translate(-50%, -50%) rotate(-45deg)', borderRadius: 8 }} />
          </div>
        )}
        {gameMsg && (
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', background: '#222', color: '#fff', padding: '6px 10px', borderRadius: 8, fontWeight: 700, zIndex: 7 }}>
            {gameMsg}
          </div>
        )}
        {helpBubble && gameActive && (
          <div style={{
            position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
            background: helpBubble.icon === '💡' ? 'rgba(245,158,11,0.95)' : 'rgba(239,68,68,0.95)',
            color: '#fff', padding: '10px 18px', borderRadius: 12, fontWeight: 600, fontSize: 14,
            zIndex: 8, maxWidth: '80%', textAlign: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)', animation: 'fadeInUp 0.3s ease',
            display: 'flex', alignItems: 'center', gap: 8
          }}>
            <span style={{ fontSize: 22 }}>{helpBubble.icon}</span>
            <span>{helpBubble.text}</span>
            <button onClick={() => { setHelpBubble(null); if (helpBubble.icon === '🎯') setHighlightedZoneIds([]); }}
              style={{ marginLeft: 8, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }}>✕</button>
          </div>
        )}
        {arenaPauseInfo && arenaPauseInfo.paused && (
          <ArenaPauseOverlay
            disconnectedPlayer={arenaPauseInfo.disconnectedPlayer}
            gracePeriodMs={arenaPauseInfo.gracePeriodMs}
          />
        )}
        <object
          type="image/svg+xml"
          data={svgPath}
          className="carte-bg"
        >
          Votre navigateur ne supporte pas les SVG
        </object>
        <svg
          ref={svgOverlayRef}
          className="carte-svg-overlay"
          width={1000}
          height={1000}
          viewBox="0 0 1000 1000"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'auto',
            width: '100%',
            height: '100%',
            zIndex: 2
          }}
          onMouseDown={e => {
            if (drawingMode) handleAddPoint(e);
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
        {/* Définitions SVG */}
        <defs>
          {/* Glow filter for hover */}
          <filter id="zone-hover-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feFlood floodColor="#22c55e" floodOpacity="0.5" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {/* Bright flash filter for validated zones */}
          <filter id="zone-validated-flash" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feFlood floodColor="#fbbf24" floodOpacity="0.7" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge><feMergeNode in="glow" /><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {/* ClipPaths pour zones images */}
          {zones.filter(z => z.type === 'image' && Array.isArray(z.points) && z.points.length >= 2).map(zone => (
            <clipPath id={`clip-zone-${zone.id}`} key={`clip-${zone.id}`} clipPathUnits="userSpaceOnUse">
              <path d={pointsToBezierPath(zone.points)} />
            </clipPath>
          ))}
          {/* Paths pour texte courbé (zones non-image) — autoFlip en mode jeu pour éviter texte à l'envers */}
          {zones.filter(z => z.type !== 'image' && Array.isArray(z.points) && z.points.length >= 2).map(zone => (
            <path id={`text-curve-${zone.id}`} key={`textcurve-${zone.id}`} d={getArcPathFromZonePoints(zone.points, zone.id, selectedArcPoints, zone.arcPoints, 0, !!(arenaMatchId || trainingMatchId))} fill="none" />
          ))}
        </defs>
          {/* Chemin en cours de dessin façon Illustrator */}
          {drawingMode && editPoints.length > 1 && (
            <path
              d={pointsToBezierPath(editPoints)}
              fill="rgba(0,123,255,0.3)"
              stroke="#007bff"
              strokeWidth={2}
            />
          )}
          {zones.filter(z => z && typeof z === 'object').map((zone, idx) => (
            <g
              key={zone.id}
              data-zone-id={zone.id}
              id={`zone-${zone.id}`}
              onMouseEnter={() => setHoveredZoneId(zone.id)}
              onMouseLeave={() => setHoveredZoneId(null)}
              onClick={attributionMode ? (e) => {
                e.stopPropagation();
                setZoneToEdit(zone);
                setFormData({
                  type: zone.type || '',
                  content: zone.content || '',
                  pairId: zone.pairId || ''
                });
              } : (zone.color === 'green' ? (e) => {
                e.stopPropagation();
                handleEditGreenZone(zone);
              } : () => {
                setSelectedZoneIds(prev => {
                  if (selectedZoneIds.includes(zone.id)) {
                    return prev.filter(id => id !== zone.id);
                  } else if (prev.length < 2) {
                    return [...prev, zone.id];
                  } else {
                    return [prev[1], zone.id];
                  }
                });
              })}
              style={{
                cursor: attributionMode ? 'crosshair' : 'pointer',
                filter: (hoveredZoneId === zone.id && !attributionMode)
                  ? 'url(#zone-hover-glow)'
                  : 'none',
                transition: 'filter 0.2s ease'
              }}
            >
              {/* Affichage du type/contenu si déjà attribué (optionnel) - IMAGE EN FOND */}
              {zone.type === 'image' && zone.content && (
                (() => {
                  const raw = zone.content;
                  const normalized = raw.startsWith('http')
                    ? raw
                    : process.env.PUBLIC_URL + '/' + (raw.startsWith('/')
                      ? raw.slice(1)
                      : (raw.startsWith('images/') ? raw : 'images/' + raw));
                  const src = encodeURI(normalized)
                    .replace(/ /g, '%20')
                    .replace(/\(/g, '%28')
                    .replace(/\)/g, '%29');
                  const keyPath = raw; // clé basée sur le content original
                  const nonce = retryMap[keyPath] || 0;
                  const srcWithNonce = nonce ? `${src}${src.includes('?') ? '&' : '?'}r=${nonce}` : src;
                  const bbox = getZoneBoundingBox(zone.points);
                  return (
                    <image
                      href={srcWithNonce}
                      xlinkHref={srcWithNonce}
                      x={bbox.x}
                      y={bbox.y}
                      width={bbox.width}
                      height={bbox.height}
                      style={{ pointerEvents: 'none', objectFit: 'cover' }}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#clip-zone-${zone.id})`}
                      onError={(e) => {
                        console.warn('Erreur chargement image:', srcWithNonce);
                        // Retry automatique une fois pour les images problématiques
                        setRetryMap(m => {
                          const cur = m[keyPath] || 0;
                          if (cur >= 1) return m; // une seule tentative de retry
                          return { ...m, [keyPath]: cur + 1 };
                        });
                      }}
                    />
                  );
                })()
              )}
              <path
                d={pointsToBezierPath(zone.points)}
                fill={(() => {
                  const isHover = !gameActive && hoveredZoneId === zone.id;
                  const isSelected = gameActive && gameSelectedIds.includes(zone.id);
                  const isHighlighted = gameActive && highlightedZoneIds.includes(zone.id);
                  const isEditorSelected = !gameActive && selectedZoneIds.includes(zone.id);
                  if (isHighlighted) return 'rgba(239, 68, 68, 0.45)';
                  if (zone.type === 'image') {
                    if (isSelected) return 'rgba(255, 214, 0, 0.55)';
                    if (isEditorSelected || isHover) return 'rgba(255, 214, 0, 0.5)';
                    return 'transparent';
                  }
                  if (zone.type === 'texte' || zone.type === 'chiffre' || zone.type === 'calcul') {
                    if (isSelected) return 'rgba(40, 167, 69, 0.55)';
                    if (isEditorSelected || isHover) return 'rgba(40, 167, 69, 0.35)';
                    return 'transparent';
                  }
                  return 'transparent';
                })()}
                stroke={'none'}
                pointerEvents="all"
                onClick={(e) => {
                  if (gameActive && (zone.type === 'image' || zone.type === 'texte' || zone.type === 'chiffre' || zone.type === 'calcul')) {
                    e.stopPropagation();
                    handleGameClick(zone);
                  }
                }}
              />
              {/* Loupe d'agrandissement image (uniquement en jeu) */}
              {gameActive && zone.type === 'image' && zone.content && (() => {
                const bbox = getZoneBoundingBox(zone.points);
                const corners = [
                  { x: bbox.x + 18, y: bbox.y + 18 },
                  { x: bbox.x + bbox.width - 18, y: bbox.y + 18 },
                  { x: bbox.x + 18, y: bbox.y + bbox.height - 18 },
                  { x: bbox.x + bbox.width - 18, y: bbox.y + bbox.height - 18 },
                ];
                const cardCenter = { x: 500, y: 500 };
                let best = corners[0], bestDist = 0;
                for (const c of corners) {
                  const d = Math.hypot(c.x - cardCenter.x, c.y - cardCenter.y);
                  if (d > bestDist) { bestDist = d; best = c; }
                }
                const lx = best.x, ly = best.y;
                const raw = zone.content;
                const normalized = raw.startsWith('http')
                  ? raw
                  : process.env.PUBLIC_URL + '/' + (raw.startsWith('/')
                    ? raw.slice(1)
                    : (raw.startsWith('images/') ? raw : 'images/' + raw));
                const imgSrc = encodeURI(normalized)
                  .replace(/ /g, '%20')
                  .replace(/\(/g, '%28')
                  .replace(/\)/g, '%29');
                const handleLoupeTap = (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
                  setZoomPreviewSrc(imgSrc);
                  zoomTimerRef.current = setTimeout(() => setZoomPreviewSrc(null), 2000);
                };
                return (
                  <g
                    style={{ cursor: 'pointer' }}
                    pointerEvents="all"
                    onClick={handleLoupeTap}
                    onTouchStart={handleLoupeTap}
                  >
                    {/* Zone de clic invisible élargie pour mobile (min 44pt) */}
                    <circle cx={lx} cy={ly} r={36} fill="transparent" />
                    <circle cx={lx} cy={ly} r={22} fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.9)" strokeWidth={2} />
                    <circle cx={lx - 2.5} cy={ly - 2.5} r={7} fill="none" stroke="#fff" strokeWidth={2.2} />
                    <line x1={lx + 2.5} y1={ly + 2.5} x2={lx + 9} y2={ly + 9} stroke="#fff" strokeWidth={2.2} strokeLinecap="round" />
                  </g>
                );
              })()}
              {zone.type === 'texte' && (
  <>
    {(() => {
  // --- Adaptation dynamique de la taille du texte si trop long ---
  // Recalcule les indices de l'arc
  let idxStart, idxEnd;
  if (Array.isArray(zone.arcPoints) && zone.arcPoints.length === 2) {
    idxStart = zone.arcPoints[0];
    idxEnd = zone.arcPoints[1];
  } else if (Array.isArray(selectedArcPoints[zone.id]) && selectedArcPoints[zone.id].length === 2) {
    idxStart = selectedArcPoints[zone.id][0];
    idxEnd = selectedArcPoints[zone.id][1];
  } else {
    idxStart = 0;
    idxEnd = 1;
  }
  // Utilise la même marge que dans getArcPathFromZonePoints
  const pointsArr = Array.isArray(zone.points) && zone.points.length >= 2 ? zone.points : [{x:0,y:0},{x:1,y:1}];
  const { r, delta } = interpolateArc(pointsArr, idxStart, idxEnd, 0);
  const arcLen = r * delta;
  const textValue = (customTextSettings[zone.id]?.text && customTextSettings[zone.id]?.text.trim() !== '')
  ? customTextSettings[zone.id]?.text
  : (zone.content || zone.label || '');
  // Estimation de la longueur du texte en pixels (approx)
  const baseFontSize = customTextSettings[zone.id]?.fontSize || 32;
  const safeTextValue = typeof textValue === 'string' ? textValue : '';
  const textLen = safeTextValue.length * baseFontSize * 0.6;
  const marginPx = 24;
  const fontSize = textLen > arcLen - 2 * marginPx
    ? Math.max(12, (arcLen - 2 * marginPx) / (safeTextValue.length * 0.6))
    : baseFontSize;
  return (
  <g>
    <text
      fontSize={fontSize}
      fontFamily={customTextSettings[zone.id]?.fontFamily || 'Arial'}
      fill={customTextSettings[zone.id]?.color || '#fff'}
      fontWeight="bold"
      pointerEvents="auto"
      style={{ cursor: 'pointer' }}
      onClick={() => {
        if (gameActive) {
          handleGameClick(zone);
        } else {
          handleEditGreenZone(zone);
        }
      }}
    >
      <textPath xlinkHref={`#text-curve-${zone.id}`} startOffset="50%" textAnchor="middle" dominantBaseline="middle">
        {textValue}
      </textPath>
    </text>
    {editMode && !gameActive && (() => {
      const bbox = getZoneBoundingBox(pointsArr);
      const ix = bbox.x + bbox.width / 2;
      const iy = Math.min(pointsArr[idxStart].y, pointsArr[idxEnd].y) - 20;
      return (
        <foreignObject x={ix} y={iy} width={20} height={20} style={{ overflow: 'visible', pointerEvents: 'none' }}>
          <div style={{ fontSize: 14, opacity: 0.9 }}>✏️</div>
        </foreignObject>
      );
    })()}
    {/* Bouton Copier indices */}
    {Array.isArray(selectedArcPoints[zone.id]) && selectedArcPoints[zone.id].length === 2 && (
      <foreignObject
        x={pointsArr[idxStart].x + 10}
        y={pointsArr[idxStart].y - 30}
        width={110}
        height={40}
        style={{ overflow: 'visible' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, border: '1px solid #28a745', background: '#eaffea', color: '#1a7f37', cursor: 'pointer' }}
            onClick={e => {
              e.stopPropagation();
              const indices = selectedArcPoints[zone.id];
              navigator.clipboard.writeText(`[${indices[0]}, ${indices[1]}]`);
              // Affiche une notification visuelle temporaire
              const notif = document.createElement('div');
              notif.textContent = 'Indices copiés !';
              notif.style.position = 'fixed';
              notif.style.top = '30px';
              notif.style.left = '50%';
              notif.style.transform = 'translateX(-50%)';
              notif.style.background = '#28a745';
              notif.style.color = '#fff';
              notif.style.padding = '8px 18px';
              notif.style.borderRadius = '8px';
              notif.style.fontWeight = 'bold';
              notif.style.zIndex = 9999;
              document.body.appendChild(notif);
              setTimeout(() => notif.remove(), 1200);
            }}
          >
            Copier indices
          </button>
          <span style={{ fontSize: 12, color: '#1a7f37' }}>[{selectedArcPoints[zone.id][0]}, {selectedArcPoints[zone.id][1]}]</span>
        </div>
      </foreignObject>
    )}
  </g>
);
})()}

    {/* Affichage des points cliquables pour sélectionner l'arc en mode édition texte */}
    {editMode && arcSelectionMode && zone.points && zone.points.length > 1 && (
      <g>
        {zone.points.map((p, idx) => (
          <circle
            key={idx}
            cx={p.x}
            cy={p.y}
            r={selectedArcPoints[zone.id]?.includes(idx) ? 13 : 8}
            fill={selectedArcPoints[zone.id]?.includes(idx) ? '#28a745' : '#ffc107'}
            stroke={selectedArcPoints[zone.id]?.includes(idx) ? '#222' : '#0056b3'}
            strokeWidth={selectedArcPoints[zone.id]?.includes(idx) ? 4 : 2}
            style={{ cursor: 'pointer', opacity: 0.95 }}
            onClick={e => { e.stopPropagation(); handleArcPointClick(zone.id, idx); }}
          />
        ))}
        {/* Bouton de validation de l'arc */}
        {selectedArcPoints[zone.id]?.length === 2 && (
          <foreignObject
            x={Math.min(...zone.points.map(p => p.x)) - 20}
            y={Math.min(...zone.points.map(p => p.y)) - 60}
            width={200}
            height={40}
          >
            <button
              style={{ width: '100%', height: '38px', fontWeight: 'bold', fontSize: 16, background: '#28a745', color: '#fff', border: 'none', borderRadius: 8, marginTop: 4, cursor: 'pointer' }}
              onClick={() => {
                setArcSelectionMode(false);
                setEditingZoneId(zone.id); // rouvre le panneau d’édition texte
              }}
            >
              Valider l’arc
            </button>
          </foreignObject>
        )}
      </g>
    )}
  </>
)}
              {editingTextZoneId === zone.id && (
                <g>
                  {/* Ajoutez ici les handles et sliders d'édition si besoin */}
                </g>
              )}
              {/* Affichage des calculs et chiffres centrés dans leur zone (taille auto selon la bbox) */}
              {(zone.type === 'calcul' || zone.type === 'chiffre') && zone.content && (
                (() => {
                  const bbox = getZoneBoundingBox(zone.points);
                  const cx = bbox.x + bbox.width / 2;
                  const cy = bbox.y + bbox.height / 2;
                  const base = Math.max(12, Math.min(bbox.width, bbox.height));
                  // Pour les chiffres, garantissons une taille minimale basée sur la moyenne des zones chiffre
                  const chiffreBaseMin = chiffreRefBase ? 0.95 * chiffreRefBase : base;
                  const effectiveBase = (zone.type === 'chiffre') ? Math.max(base, chiffreBaseMin) : base;
                  const rawFontSize = (zone.type === 'chiffre' ? 0.42 : 0.38) * effectiveBase;
                  // Adapter la taille du texte pour qu'il reste dans la zone
                  const contentStr = String(zone.content ?? '').trim();
                  const charW = 0.52;
                  const fitW = contentStr.length > 0 ? (bbox.width * 0.92) / (contentStr.length * charW) : rawFontSize;
                  const fitH = bbox.height * 0.75;
                  const fontSize = Math.max(10, Math.min(rawFontSize, fitW, fitH));
                  // In Training/Arena mode, use server zone data directly (bypass localStorage-derived state)
                  const isServerMode = trainingMatchId || arenaMatchId;
                  const angle = isServerMode ? Number(zone.angle || 0) : Number(calcAngles[zone.id] || 0);
                  const mo = isServerMode ? (zone.mathOffset || { x: 0, y: 0 }) : (mathOffsets[zone.id] || { x: 0, y: 0 });
                  const handleRotate = (e) => {
                    if (gameActive || !editMode) return;
                    e.stopPropagation();
                    setCalcAngles(prev => ({
                      ...prev,
                      [zone.id]: e.shiftKey ? 0 : (((Number(prev[zone.id] || 0) + 15) % 360))
                    }));
                  };
                  // Apply a tiny centering offset exclusively for digit "6" in chiffre zones
                  const isSix = (zone.type === 'chiffre') && contentStr === '6';
                  // Negative X shifts slightly to the left; scale by font size for consistency
                  const offsetX = isSix ? (-0.04 * fontSize) : 0;
                  const isMath = zone.type === 'calcul' || zone.type === 'chiffre';
                  const isChiffre = zone.type === 'chiffre';
                  return (
                    <g transform={`translate(${mo.x || 0} ${mo.y || 0}) rotate(${angle} ${cx} ${cy})`}>
                      <text
                        x={cx}
                        y={cy}
                        transform={offsetX ? `translate(${offsetX} 0)` : undefined}
                        textAnchor="middle"
                        alignmentBaseline="middle"
                        fontSize={fontSize}
                        fill={isMath ? '#456451' : '#222'}
                        fontWeight="bold"
                        stroke={isMath ? 'none' : '#fff'}
                        strokeWidth={isMath ? 0 : 4}
                        paintOrder="stroke"
                        pointerEvents={gameActive ? 'none' : 'auto'}
                        style={{ cursor: gameActive ? 'default' : (dragState.id === zone.id ? 'grabbing' : 'grab') }}
                        onMouseDown={(e) => {
                          if (gameActive || !editMode) return;
                          e.stopPropagation();
                          const svg = svgOverlayRef.current;
                          const pt = pointToSvgCoords(e, svg);
                          setDragState({ id: zone.id, start: pt, orig: { x: mo.x || 0, y: mo.y || 0 }, moved: false });
                        }}
                        onClick={(e) => {
                          // si on vient de drag, on supprime le click de rotation
                          if (dragState.moved) {
                            e.preventDefault();
                            e.stopPropagation();
                            return;
                          }
                          handleRotate(e);
                        }}
                        title={gameActive ? '' : 'Cliquez pour pivoter (+15°). Shift+clic pour réinitialiser.'}
                      >
                        {zone.content}
                      </text>
                      {isChiffre && (
                        (() => {
                          // Soulignement simple, même couleur que le chiffre, sans contour
                          // Plus fin et centré en tenant compte de l'offset appliqué au "6".
                          const underLen = 0.5 * fontSize;
                          const half = underLen / 2;
                          const uy = cy + 0.54 * fontSize;
                          const strokeW = Math.max(1, 0.09 * fontSize);
                          const digitColor = '#456451';
                          const cxAdj = cx + (offsetX || 0);
                          return (
                            <line
                              x1={cxAdj - half}
                              y1={uy}
                              x2={cxAdj + half}
                              y2={uy}
                              stroke={digitColor}
                              strokeWidth={strokeW}
                              strokeLinecap="round"
                            />
                          );
                        })()
                      )}
                      {editMode && !gameActive && (
                        <foreignObject x={cx + 0.55 * fontSize} y={cy - 0.55 * fontSize} width={20} height={20} style={{ overflow: 'visible', pointerEvents: 'none' }}>
                          <div style={{ fontSize: 14, opacity: 0.9 }}>✏️</div>
                        </foreignObject>
                      )}
                    </g>
                  );
                })()
              )}
              {/* Debug labels and zone name/ID overlays removed for cleaner UI */}
            </g>
          ))}
          {/* Points et poignées */}
          {drawingMode && editPoints.map((p, idx) => (
            <React.Fragment key={idx}>
              <g>
                {/* Poignées de Bézier */}
                {p.handleIn && (
                  <>
                    <line x1={p.x} y1={p.y} x2={p.handleIn.x} y2={p.handleIn.y} stroke="#aaa" strokeDasharray="3 3" />
                    <circle cx={p.handleIn.x} cy={p.handleIn.y} r={6} fill="#fff" stroke="#007bff" strokeWidth={2} style={{ cursor: 'pointer' }}
                      onMouseDown={e => handleHandleMouseDown(idx, 'in', e)} />
                  </>
                )}
                {p.handleOut && (
                  <>
                    <line x1={p.x} y1={p.y} x2={p.handleOut.x} y2={p.handleOut.y} stroke="#aaa" strokeDasharray="3 3" />
                    <circle cx={p.handleOut.x} cy={p.handleOut.y} r={6} fill="#fff" stroke="#007bff" strokeWidth={2} style={{ cursor: 'pointer' }}
                      onMouseDown={e => handleHandleMouseDown(idx, 'out', e)} />
                  </>
                )}
                {/* Point principal */}
                <circle cx={p.x} cy={p.y} r={8} fill="#ffc107" stroke={selectedPointIdx === idx ? '#0056b3' : '#333'} strokeWidth={selectedPointIdx === idx ? 4 : 2} style={{ cursor: 'pointer' }}
                  onMouseDown={e => {
                    handlePointMouseDown(idx, e);
                    setSelectedPointIdx(idx);
                  }}
                />
              </g>
            </React.Fragment>
          ))}
        </svg>
      </div>
      {/* Popup zoom image (loupe) */}
      {zoomPreviewSrc && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
            cursor: 'pointer',
          }}
          onClick={() => {
            setZoomPreviewSrc(null);
            if (zoomTimerRef.current) { clearTimeout(zoomTimerRef.current); zoomTimerRef.current = null; }
          }}
        >
          <img
            src={zoomPreviewSrc}
            alt="Aperçu"
            style={{
              maxWidth: '70vw', maxHeight: '70vh',
              borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              objectFit: 'contain',
            }}
          />
        </div>
      )}
      {/* Lobby / Multijoueur UI (masqué en mode solo) */}
      {socket && !hasSidebar && !isSoloMode && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(8px)' }}>
          <div style={{
            background: '#ffffff', borderRadius: 24, padding: isMobile ? 20 : 32, maxWidth: 620, width: isMobile ? '94vw' : '90vw',
            boxShadow: '0 25px 50px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto', color: '#1e293b', position: 'relative'
          }}>
          {/* Compte à rebours */}
          {countdownT !== null && !panelCollapsed && (
            <div style={{ position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #0D6A7A, #1AACBE)', color: '#fff', padding: '8px 24px', borderRadius: 12, fontSize: 22, fontWeight: 900, zIndex: 3000, boxShadow: '0 4px 15px rgba(13,106,122,0.4)', letterSpacing: 1 }}>
              {countdownT}
            </div>
          )}
            {/* Header: réduit = minimal; étendu = toutes les actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                {!panelCollapsed && (
                  <div style={{ fontWeight: 800, fontSize: 18, color: '#0D6A7A' }}>🎮 Salle <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 8px', borderRadius: 6 }}>{roomId}</span></div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {!panelCollapsed && isHost && (
                    <button
                      onClick={() => { try { socket && socket.emit('session:end'); } catch {} }}
                      title={'Terminer la session (hôte)'}
                      style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Terminer la session
                    </button>
                  )}
                  {!panelCollapsed && isHost && (
                    <input
                      type="number"
                      title="Nombre de manches de la session"
                      min={1}
                      max={20}
                      step={1}
                      value={Number.isFinite(roundsPerSession) ? roundsPerSession : 3}
                      onChange={(e) => handleSetRounds(e.target.value)}
                      style={{ width: 60, padding: '4px 6px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#1e293b', fontSize: 12 }}
                    />
                  )}
                  {!panelCollapsed && (
                    <button
                      onClick={() => {
                        setHistoryExpanded(h => {
                          const next = !h;
                          if (next && socket) {
                            try {
                              socket.emit('session:history:get', (res) => {
                                if (res && res.ok && Array.isArray(res.sessions)) {
                                  setSessions(res.sessions);
                                  try { window.dispatchEvent(new CustomEvent('cc:sessionsUpdated', { detail: { sessions: res.sessions } })); } catch {}
                                }
                              });
                            } catch {}
                          }
                          return next;
                        });
                      }}
                      title={historyExpanded ? "Masquer l'historique" : "Afficher l'historique"}
                      style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, padding: '4px 10px', fontSize: 12, color: '#475569', cursor: 'pointer' }}
                    >
                      Historique {sessions?.length ? `(${sessions.length})` : ''}
                    </button>
                  )}
                  <button
                    onClick={() => setPanelCollapsed(c => !c)}
                    title={panelCollapsed ? 'Déployer' : 'Réduire'}
                    style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, padding: '4px 10px', fontSize: 12, color: '#475569', cursor: 'pointer' }}
                  >
                    {panelCollapsed ? '▢' : '—'}
                  </button>
                </div>
              {/* Bandeau compact: affiche toujours la dernière paire dans l'en-tête */}
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                    {Number.isFinite(roundsPerSession) ? (
                    <>Manche: {Math.max(0, roundsPlayed || 0)} / {roundsPerSession}</>
                  ) : (
                    <>Manche: {Math.max(0, roundsPlayed || 0)}</>
                  )}
                </div>
                <div data-cc-vignette="last-pair" ref={mpLastPairRef} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 999, background: lastWonPair?.color || '#e2e8f0', boxShadow: lastWonPair ? `0 0 6px 2px ${(lastWonPair.color || '#e2e8f0')}55` : 'none', border: lastWonPair?.borderColor ? `2px solid ${lastWonPair.borderColor}` : 'none' }} />
                    <span style={{ fontSize: 12, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lastWonPair ? (<><b style={{ color: '#1e293b' }}>{lastWonPair.winnerName}</b>: {lastWonPair.text} {lastWonPair.tie && (<span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 999, background: '#fef3c7', border: '1px solid #fbbf24', color: '#92400e' }}>Égalité</span>)}</>) : 'Dernière paire: —'}
                    </span>
                  </div>
                </div>
              </div>
              {/* Progression de la session */}
              {!panelCollapsed && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                  {Number.isFinite(roundsPerSession) ? (
                    <span>Manche: {Math.max(0, roundsPlayed || 0)} / {roundsPerSession}</span>
                  ) : (
                    <span>Manche: {Math.max(0, roundsPlayed || 0)}</span>
                  )}
                </div>
              )}
            </div>
            {/* Overlay de contexte de manche */}
            {roundOverlay && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ background: 'rgba(0,0,0,0.65)', color: '#fff', padding: '24px 32px', borderRadius: 16, fontSize: isMobile ? 28 : 42, fontWeight: 900, textAlign: 'center', boxShadow: '0 8px 40px #0006' }}>
                  {roundOverlay.text}
                </div>
              </div>
            )}
            {!panelCollapsed && (
            <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
              <input value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="Pseudo" style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#1e293b', fontSize: 13 }} />
              <input value={roomId} onChange={e => setRoomId(e.target.value)} placeholder="Code salle" style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#1e293b', fontSize: 13 }} />
              {/* Durée de manche (hôte uniquement) */}
              {isHost ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, color: '#333', minWidth: 50 }}>Durée:</label>
                  <select value={roomDuration} onChange={e => handleSetRoomDuration(e.target.value)} style={{ flex: 1, padding: '6px 8px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#333', fontSize: 12 }} >
                    <option value={30}>30 s</option>
                    <option value={60}>60 s</option>
                    <option value={90}>90 s</option>
                  </select>
                  {/* Sélection du nombre de manches (hôte) */}
                  <label style={{ fontSize: 12, color: '#333', minWidth: 60 }}>Manches:</label>
                  <input
                    type="number"
                    title="Nombre de manches de la session"
                    min={1}
                    max={20}
                    step={1}
                    value={Number.isFinite(roundsPerSession) ? roundsPerSession : 3}
                    onChange={(e) => handleSetRounds(e.target.value)}
                    style={{ flex: 1, padding: '6px 8px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#333', fontSize: 12 }}
                  />
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#333' }}>Durée: <b style={{ color: '#333' }}>{roomDuration}</b>s</div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                <button
                  onClick={handleCreateRoom}
                  style={{ flex: 1, background: '#fff', border: '1px solid #ddd', borderRadius: 10, padding: '8px 10px', color: '#333', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                >
                  Créer une salle
                </button>
                <button onClick={handleJoinRoom} style={{ flex: 1, background: '#0D6A7A', border: '1px solid #0D6A7A', borderRadius: 10, padding: '8px 10px', fontWeight: 700, fontSize: 13, color: '#fff', cursor: 'pointer' }}>Rejoindre</button>
                <button onClick={handleLeaveRoom} style={{ flex: 1, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '8px 10px', color: '#dc2626', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Quitter</button>
              </div>
            </div>
            )}
            {!panelCollapsed && <div style={{ marginTop: 10, fontWeight: 'bold', color: '#0D6A7A', fontSize: 15 }}>Joueurs</div>}
            {!panelCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, maxHeight: isMobile ? '22vh' : 220, overflowY: 'auto' }}>
              {[...(roomPlayers.length ? roomPlayers : (scoresMP || []).map(p => ({ id: p.id, nickname: p.name, score: p.score })))]
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 140 }}>
                      {p.isHost && <span title="Hôte" style={{ color: '#d97706' }}>★</span>}
                      <span style={{ color: '#1e293b', fontWeight: 600, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }} title={p.nickname || p.name}>{p.nickname || p.name || 'Joueur'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {typeof p.ready === 'boolean' && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: p.ready ? '#dcfce7' : '#fee2e2', border: `1px solid ${p.ready ? '#86efac' : '#fca5a5'}`, color: p.ready ? '#166534' : '#dc2626', fontWeight: 600 }}>
                          {p.ready ? 'Prêt' : 'Pas prêt'}
                        </span>
                      )}
                      <div style={{ background: '#0D6A7A', borderRadius: 10, padding: '2px 8px', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}>
                        <span style={{ fontWeight: 900, color: '#fff', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{p.score ?? 0}</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
            )}
            {!panelCollapsed && roomStatus === 'lobby' && (
            <>
              <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: '#f0fdfa', border: '1px solid #99f6e4', fontSize: 13, color: '#0D6A7A', textAlign: 'center', fontWeight: 500 }}>
                {(() => {
                  const allReady = roomPlayers.length >= 2 && roomPlayers.every(p => p.ready);
                  if (roomPlayers.length < 2) return '⏳ En attente d\'autres joueurs...';
                  if (!myReady) return '👉 Cliquez sur "Je suis prêt" !';
                  if (!allReady) return '⏳ En attente des autres joueurs...';
                  if (isHost) return '✅ Tous prêts ! Vous pouvez démarrer !';
                  return '✅ Tous prêts ! L\'hôte va démarrer.';
                })()}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={handleToggleReady} style={{ flex: 1, background: myReady ? '#fef3c7' : '#0D6A7A', border: '2px solid ' + (myReady ? '#f59e0b' : '#0D6A7A'), borderRadius: 10, padding: '10px', fontWeight: 700, fontSize: 14, color: myReady ? '#92400e' : '#fff', cursor: 'pointer' }}>
                  {myReady ? '❌ Pas prêt' : '✅ Je suis prêt'}
                </button>
                {(() => {
                  const allReady = roomPlayers.length >= 2 && roomPlayers.every(p => p.ready);
                  return (
                    <button onClick={handleStartRoom} disabled={!isHost || !allReady} title={!isHost ? 'Réservé à l\'hôte' : (allReady ? 'Lancer la partie' : 'Tous les joueurs doivent être prêts')} style={{ flex: 1, background: isHost && allReady ? '#f59e0b' : '#e2e8f0', border: '2px solid ' + (isHost && allReady ? '#f59e0b' : '#cbd5e1'), borderRadius: 10, padding: '10px', fontWeight: 700, fontSize: 14, color: isHost && allReady ? '#fff' : '#94a3b8', cursor: !isHost || !allReady ? 'not-allowed' : 'pointer', opacity: !isHost || !allReady ? 0.6 : 1 }}>
                      🚀 Démarrer
                    </button>
                  );
                })()}
              </div>
            </>
            )}
            {mpMsg && !panelCollapsed && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>{mpMsg}</div>
            )}
            {/* Dernière paire trouvée (vignette compacte) */}
            {!panelCollapsed && (
              <div ref={mpLastPairRef} style={{
                marginTop: 10,
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <div style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  flexShrink: 0,
                  background: lastWonPair?.color || '#fff',
                  boxShadow: lastWonPair ? `0 0 6px 2px ${(lastWonPair.color || '#fff')}55` : 'none',
                  border: lastWonPair?.borderColor ? `2px solid ${lastWonPair.borderColor}` : 'none'
                }} />

                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lastWonPair ? `${lastWonPair.winnerName} a trouvé:` : 'Aucune paire trouvée'}
                  </div>
                  {lastWonPair && (
                    <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lastWonPair.text}>
                      {lastWonPair.text} {lastWonPair.tie && (
                        <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 999, background: '#fef3c7', border: '1px solid #fbbf24', color: '#92400e' }}>Égalité</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Historique défilant des dernières paires */}
            {!panelCollapsed && (
              <div style={{
                marginTop: 8,
                borderTop: '1px solid #e2e8f0',
                paddingTop: 8,
                maxHeight: isMobile ? '16vh' : 140,
                overflowY: 'auto',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0D6A7A', marginBottom: 4 }}>Dernières paires</div>
                {Array.isArray(wonPairsHistory) && wonPairsHistory.length ? (
                  wonPairsHistory.slice(0, 12).map((e, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: e.color || '#e2e8f0', display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: '#475569', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.text}>
                        <b style={{ color: '#1e293b' }}>{e.winnerName}:</b> {e.text} {e.tie && (
                          <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 999, background: '#fef3c7', border: '1px solid #fbbf24', color: '#92400e' }}>Égalité</span>
                        )}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>—</div>
                )}
              </div>
            )}
          </div>
          {/* Tableau d'historique sous le panneau multijoueur */}
          {historyExpanded && (
            <div style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: 12, marginTop: 12,
              maxHeight: isMobile ? '25vh' : 220, overflowY: 'auto', color: '#1e293b'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 'bold', color: '#0D6A7A' }}>Historique des sessions</div>
                <button onClick={() => setHistoryExpanded(false)} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 16, lineHeight: 1, cursor: 'pointer', color: '#475569', padding: '2px 8px' }}>×</button>
              </div>
              {Array.isArray(sessions) && sessions.length > 0 ? (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sessions.slice().reverse().map((s, idx) => (
                    <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 8, background: '#f8fafc' }}>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{new Date(s.endedAt).toLocaleString()}</div>
                      <div style={{ fontWeight: 700, marginTop: 2, color: '#1e293b' }}>
                        {s.winnerTitle ? `${s.winnerTitle}: ` : 'Vainqueur: '}{s.winner?.name || '—'} {typeof s.winner?.score === 'number' ? `( ${s.winner.score} )` : ''}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                        {Array.isArray(s.scores) && s.scores.length > 0 ? s.scores.map(sc => `${sc.name || 'Joueur'}: ${sc.score ?? 0}`).join(', ') : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>Aucun historique pour le moment.</div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Overlay gagnant plein écran */}
      {winnerOverlay && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(0,0,0,0.65)', color: '#fff', padding: '24px 32px', borderRadius: 16, fontSize: isMobile ? 28 : 42, fontWeight: 900, textAlign: 'center', boxShadow: '0 8px 40px #0006' }}>
            {winnerOverlay.text}
          </div>
        </div>
      )}
      
      {/* Overlay podium fin de partie Arena */}
      {arenaGameEndOverlay && (() => {
        const { ranking, winner } = arenaGameEndOverlay;
        const topThree = Array.isArray(ranking) ? ranking.slice(0, 3) : [];
        
        return (
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 5000,
              background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.95) 0%, rgba(99, 102, 241, 0.95) 100%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: isMobile ? '16px' : '32px',
              animation: 'fadeIn 0.5s ease-out'
            }}
            onClick={() => setArenaGameEndOverlay(null)}
          >
            {/* Titre */}
            <div style={{
              fontSize: isMobile ? 32 : 48,
              fontWeight: 900,
              color: '#fff',
              marginBottom: isMobile ? '16px' : '24px',
              textShadow: '0 4px 12px rgba(0,0,0,0.3)',
              animation: 'slideDown 0.6s ease-out'
            }}>
              🏆 PARTIE TERMINÉE 🏆
            </div>
            
            {/* Gagnant principal */}
            {winner && (
              <div style={{
                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                borderRadius: 24,
                padding: isMobile ? '20px' : '32px',
                marginBottom: isMobile ? '20px' : '32px',
                boxShadow: '0 12px 48px rgba(251, 191, 36, 0.4)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px',
                minWidth: isMobile ? '280px' : '400px',
                animation: 'scaleIn 0.7s ease-out 0.3s both'
              }}>
                {/* Avatar */}
                <div style={{
                  width: isMobile ? 80 : 120,
                  height: isMobile ? 80 : 120,
                  borderRadius: '50%',
                  background: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: isMobile ? 40 : 60,
                  fontWeight: 900,
                  color: '#f59e0b',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                  border: '4px solid rgba(255,255,255,0.5)'
                }}>
                  {(winner.avatar && !winner.avatar.includes('default.png')) ? winner.avatar : '👤'}
                </div>
                
                {/* Nom gagnant */}
                <div style={{
                  fontSize: isMobile ? 24 : 32,
                  fontWeight: 900,
                  color: '#fff',
                  textShadow: '0 2px 8px rgba(0,0,0,0.3)'
                }}>
                  {winner.name}
                </div>
                
                {/* Score */}
                <div style={{
                  fontSize: isMobile ? 48 : 64,
                  fontWeight: 900,
                  color: '#fff',
                  textShadow: '0 4px 12px rgba(0,0,0,0.3)'
                }}>
                  {winner.score} pts
                </div>
              </div>
            )}
            
            {/* Classement complet */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.95)',
              borderRadius: 16,
              padding: isMobile ? '16px' : '24px',
              maxWidth: isMobile ? '90vw' : '600px',
              width: '100%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              animation: 'slideUp 0.8s ease-out 0.5s both'
            }}>
              <div style={{
                fontSize: isMobile ? 20 : 24,
                fontWeight: 700,
                color: '#4f46e5',
                marginBottom: '16px',
                textAlign: 'center'
              }}>
                📊 Classement Final
              </div>
              
              {ranking && ranking.map((player, idx) => {
                const medals = ['🥇', '🥈', '🥉'];
                const isTop3 = idx < 3;
                const bgColors = [
                  'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                  'linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)',
                  'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)'
                ];
                
                return (
                  <div
                    key={player.studentId || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: isMobile ? '8px' : '12px',
                      padding: isMobile ? '10px' : '12px 16px',
                      marginBottom: '8px',
                      borderRadius: 12,
                      background: isTop3 ? bgColors[idx] : '#f9fafb',
                      border: isTop3 ? '2px solid rgba(0,0,0,0.1)' : '1px solid #e5e7eb',
                      boxShadow: isTop3 ? '0 4px 12px rgba(0,0,0,0.1)' : 'none',
                      animation: `slideRight 0.5s ease-out ${0.6 + idx * 0.1}s both`
                    }}
                  >
                    {/* Position / Médaille */}
                    <div style={{
                      fontSize: isMobile ? 24 : 28,
                      fontWeight: 900,
                      minWidth: isMobile ? '32px' : '40px',
                      textAlign: 'center'
                    }}>
                      {isTop3 ? medals[idx] : `${idx + 1}`}
                    </div>
                    
                    {/* Avatar */}
                    <div style={{
                      width: isMobile ? 36 : 48,
                      height: isMobile ? 36 : 48,
                      borderRadius: '50%',
                      background: isTop3 ? '#fff' : '#e5e7eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: isMobile ? 18 : 24
                    }}>
                      {(player.avatar && !player.avatar.includes('default.png')) ? player.avatar : '👤'}
                    </div>
                    
                    {/* Nom */}
                    <div style={{
                      flex: 1,
                      fontSize: isMobile ? 16 : 18,
                      fontWeight: isTop3 ? 700 : 600,
                      color: '#1f2937',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {player.name}
                    </div>
                    
                    {/* Score */}
                    <div style={{
                      fontSize: isMobile ? 20 : 24,
                      fontWeight: 900,
                      color: isTop3 ? '#4f46e5' : '#6b7280',
                      minWidth: isMobile ? '60px' : '80px',
                      textAlign: 'right'
                    }}>
                      {player.score} pts
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Bouton fermer */}
            <div style={{
              marginTop: isMobile ? '16px' : '24px',
              fontSize: isMobile ? 14 : 16,
              color: 'rgba(255,255,255,0.8)',
              textAlign: 'center',
              animation: 'fadeIn 1s ease-out 1s both'
            }}>
              Cliquez pour fermer
            </div>
          </div>
        );
      })()}
      
      {/* Overlay fin de partie Solo/Multijoueur */}
      {soloGameEndOverlay && (() => {
        const ov = soloGameEndOverlay;
        const ppm = ov.duration > 0 ? ((ov.score / ov.duration) * 60).toFixed(1) : '0';
        const hasRanking = Array.isArray(ov.ranking) && ov.ranking.length > 1;
        const medals = ['🥇', '🥈', '🥉'];
        return (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 5000,
              background: ov.mode === 'multiplayer'
                ? 'linear-gradient(135deg, rgba(79, 70, 229, 0.95) 0%, rgba(99, 102, 241, 0.95) 100%)'
                : 'linear-gradient(135deg, rgba(20, 138, 156, 0.95) 0%, rgba(26, 172, 190, 0.95) 100%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: isMobile ? '16px' : '32px',
              animation: 'fadeIn 0.5s ease-out',
              overflowY: 'auto'
            }}
          >
            <div style={{ fontSize: isMobile ? 28 : 44, fontWeight: 900, color: '#fff', marginBottom: 24, textShadow: '0 4px 12px rgba(0,0,0,0.3)', animation: 'slideDown 0.6s ease-out' }}>
              {ov.objectiveMode ? '🎯 Objectif atteint !' : ov.mode === 'solo' ? '🎯 Partie Solo terminée' : '🏆 Partie terminée'}
            </div>

            {/* Score principal + gagnant MP */}
            <div style={{
              background: 'rgba(255,255,255,0.15)', borderRadius: 24, padding: isMobile ? '24px 32px' : '32px 48px',
              marginBottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)',
              animation: 'scaleIn 0.7s ease-out 0.2s both'
            }}>
              {hasRanking && ov.winner && (
                <div style={{ fontSize: isMobile ? 16 : 20, color: 'rgba(255,255,255,0.85)', fontWeight: 700, marginBottom: 4 }}>
                  Vainqueur : {ov.winner.name}
                </div>
              )}
              {ov.objectiveMode ? (
                <>
                  <div style={{ fontSize: isMobile ? 56 : 80, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{ov.duration}s</div>
                  <div style={{ fontSize: isMobile ? 16 : 20, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>temps total</div>
                  {ov.helpStats && ov.helpStats.totalPenalty > 0 && (
                    <div style={{ fontSize: 13, color: '#fca5a5', fontWeight: 600, marginTop: 4 }}>
                      dont +{ov.helpStats.totalPenalty}s de pénalité aide
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontSize: isMobile ? 56 : 80, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{ov.score}</div>
                  <div style={{ fontSize: isMobile ? 16 : 20, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>points</div>
                </>
              )}
            </div>

            {/* Stats */}
            <div style={{
              display: 'flex', gap: isMobile ? 12 : 24, marginBottom: hasRanking ? 20 : 32, flexWrap: 'wrap', justifyContent: 'center',
              animation: 'slideUp 0.6s ease-out 0.4s both'
            }}>
              {[
                { icon: '🧩', label: 'Paires', value: ov.objectiveMode ? `${ov.pairsValidated}/${ov.objectiveTarget}` : ov.pairsValidated },
                ...(ov.objectiveMode && ov.helpStats ? [
                  { icon: '💡', label: 'Indices', value: ov.helpStats.hintsUsed || 0 },
                  { icon: '🎯', label: 'Réponses', value: ov.helpStats.answersUsed || 0 },
                  { icon: '⏱️', label: 'Pénalité', value: `+${ov.helpStats.totalPenalty || 0}s` },
                ] : [
                  { icon: '❌', label: 'Erreurs', value: ov.errors || 0 },
                ]),
                { icon: '⏱️', label: 'Durée', value: `${ov.duration}s` },
                { icon: '⚡', label: 'Pts/min', value: ppm },
              ].map((stat, i) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: isMobile ? '10px 16px' : '14px 24px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 80,
                  border: '1px solid rgba(255,255,255,0.15)'
                }}>
                  <div style={{ fontSize: 22 }}>{stat.icon}</div>
                  <div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 800, color: '#fff' }}>{stat.value}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Progression Objectifs thématiques */}
            {ov.objectiveMode && Array.isArray(ov.objectiveProgress) && ov.objectiveProgress.length > 0 && (
              <div style={{
                background: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: isMobile ? '12px' : '20px',
                maxWidth: isMobile ? '90vw' : '500px', width: '100%', marginBottom: 24,
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                animation: 'slideUp 0.6s ease-out 0.45s both'
              }}>
                <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 700, color: '#148A9C', marginBottom: 12, textAlign: 'center' }}>
                  🎯 Objectifs thématiques
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ov.objectiveProgress.map(p => {
                    const pct = p.total > 0 ? Math.min(100, Math.round((p.sessionFound / p.total) * 100)) : 0;
                    const done = p.total > 0 && p.sessionFound >= p.total;
                    return (
                      <div key={p.key} style={{ padding: '8px 12px', borderRadius: 10, background: done ? '#f0fdf4' : '#f8fafc', border: done ? '1px solid #86efac' : '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: done ? '#166534' : '#1e293b' }}>{done ? '✅' : '🎯'} {p.label}</span>
                          <span style={{ fontSize: 12, color: done ? '#16a34a' : '#64748b', fontWeight: 600 }}>{p.sessionFound}/{p.total} ({pct}%)</span>
                        </div>
                        <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: done ? '#22c55e' : pct > 60 ? '#f59e0b' : '#3b82f6', borderRadius: 3, transition: 'width 0.8s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Classement MP */}
            {hasRanking && (
              <div style={{
                background: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: isMobile ? '12px' : '20px',
                maxWidth: isMobile ? '90vw' : '500px', width: '100%', marginBottom: 24,
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                animation: 'slideUp 0.6s ease-out 0.5s both'
              }}>
                <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 700, color: '#4f46e5', marginBottom: 12, textAlign: 'center' }}>
                  Classement
                </div>
                {ov.ranking.map((player, idx) => {
                  const isTop3 = idx < 3;
                  const bgColors = [
                    'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                    'linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)',
                    'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)'
                  ];
                  return (
                    <div key={player.id || idx} style={{
                      display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12,
                      padding: isMobile ? '8px 10px' : '10px 14px', marginBottom: 6, borderRadius: 10,
                      background: isTop3 ? bgColors[idx] : '#f9fafb',
                      border: isTop3 ? '2px solid rgba(0,0,0,0.1)' : '1px solid #e5e7eb'
                    }}>
                      <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 900, minWidth: 32, textAlign: 'center' }}>
                        {isTop3 ? medals[idx] : `${idx + 1}`}
                      </div>
                      <div style={{ flex: 1, fontSize: isMobile ? 14 : 16, fontWeight: isTop3 ? 700 : 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {player.name}
                      </div>
                      <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: '#6b7280' }}>
                        {player.score} pts {player.errors ? `· ${player.errors} err` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Récapitulatif Maîtrise */}
            {Array.isArray(ov.masterySession) && ov.masterySession.length > 0 && (
              <div style={{
                background: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: isMobile ? '12px' : '20px',
                maxWidth: isMobile ? '90vw' : '500px', width: '100%', marginBottom: 24,
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                animation: 'slideUp 0.6s ease-out 0.55s both'
              }}>
                <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 700, color: '#148A9C', marginBottom: 12, textAlign: 'center' }}>
                  🎯 Maîtrise — Cette session
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ov.masterySession.map(t => {
                    const pct = t.total > 0 ? Math.round((t.found / t.total) * 100) : 0;
                    const tierIcon = t.tiers.gold ? '🥇' : t.tiers.silver ? '🥈' : t.tiers.bronze ? '🥉' : '🎯';
                    const tierLabel = t.tiers.gold ? 'Or' : t.tiers.silver ? 'Argent' : t.tiers.bronze ? 'Bronze' : null;
                    const barColor = t.found >= t.total ? '#22c55e' : pct > 60 ? '#f59e0b' : '#3b82f6';
                    return (
                      <div key={t.key} style={{ padding: '8px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{tierIcon} {t.label}</span>
                          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{t.found}/{t.total} ({pct}%)</span>
                        </div>
                        <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3, transition: 'width 0.8s ease' }} />
                        </div>
                        {tierLabel && (
                          <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: t.tiers.gold ? '#d97706' : t.tiers.silver ? '#6b7280' : '#b45309', textAlign: 'right' }}>
                            Niveau {tierLabel} atteint !
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Boutons */}
            <div style={{ display: 'flex', gap: 16, animation: 'slideUp 0.6s ease-out 0.6s both' }}>
              <button
                onClick={() => { setSoloGameEndOverlay(null); startGame(); }}
                style={{
                  background: '#fff', color: ov.mode === 'multiplayer' ? '#4f46e5' : '#148A9C', border: 'none', borderRadius: 14,
                  padding: isMobile ? '14px 28px' : '16px 40px', fontSize: isMobile ? 16 : 20,
                  fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
                }}
              >
                🔄 Rejouer
              </button>
              <button
                onClick={() => { setSoloGameEndOverlay(null); try { navigate('/modes'); } catch {} }}
                style={{
                  background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 14, padding: isMobile ? '14px 28px' : '16px 40px',
                  fontSize: isMobile ? 16 : 20, fontWeight: 700, cursor: 'pointer'
                }}
              >
                Quitter
              </button>
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideDown {
          from { transform: translateY(-30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideRight {
          from { transform: translateX(-20px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeInUp {
          from { transform: translateX(-50%) translateY(20px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `}</style>
      {/* Popup attribution zone en overlay, hors SVG */}
      {attributionMode && zoneToEdit && (
        <div style={{
          position: 'fixed',
          top: 120,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#fff',
          border: '2px solid #007bff',
          borderRadius: 12,
          boxShadow: '0 8px 32px #0003',
          padding: 24,
          zIndex: 1000,
          width: 340
        }}>
          <h3>Attribuer un contenu à la zone</h3>
          <label>Type :
            <select value={formData.type} onChange={e => setFormData(f => ({ ...f, type: e.target.value }))} style={{ marginLeft: 8 }}>
              <option value="">-- Choisir --</option>
              <option value="calcul">Calcul</option>
              <option value="chiffre">Chiffre</option>
              <option value="texte">Texte</option>
              <option value="image">Image</option>
            </select>
          </label>
          <br /><br />
          <label>Contenu :
            <input
              type="text"
              value={formData.content}
              onChange={e => setFormData(f => ({ ...f, content: e.target.value }))}
              style={{ marginLeft: 8, width: '80%' }}
              placeholder={formData.type === 'image' ? 'URL image ex: image.png' : 'Texte, calcul ou chiffre'}
            />
          </label>
          <br /><br />
          <label>Identifiant d’association (pairId) :
            <input
              type="text"
              value={formData.pairId}
              onChange={e => setFormData(f => ({ ...f, pairId: e.target.value }))}
              style={{ marginLeft: 8, width: '40%' }}
            />
          </label>
          <br /><br />
          <button
            style={{
              background: '#28a745',
              color: '#fff',
              fontWeight: 'bold',
              border: '2px solid #333',
              borderRadius: 8,
              padding: '8px 22px',
              fontSize: 16,
              marginRight: 8,
              cursor: 'pointer'
            }}
            onClick={() => {
              setZones(zones => zones.map(z =>
                z.id === zoneToEdit.id
                  ? { ...z, ...formData }
                  : z
              ));
              setZoneToEdit(null);
            }}
          >
            Valider
          </button>
          <button
            style={{
              background: '#ffc107',
              color: '#222',
              fontWeight: 'bold',
              border: '2px solid #333',
              borderRadius: 8,
              padding: '8px 22px',
              fontSize: 16,
              cursor: 'pointer'
            }}
            onClick={() => setZoneToEdit(null)}
            >
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}
export default Carte;