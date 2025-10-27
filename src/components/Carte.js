import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import '../styles/Carte.css';
import { pointToSvgCoords, polygonToPointsStr, segmentsToSvgPath, pointsToBezierPath } from './CarteUtils';
import { getBackendUrl } from '../utils/subscription';
import { assignElementsToZones, fetchElements } from '../utils/elementsLoader';
import { startSession as pgStartSession, recordAttempt as pgRecordAttempt, flushAttempts as pgFlushAttempts } from '../utils/progress';
import { isFree, canStartSessionToday, incrementSessionCount } from '../utils/subscription';

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
  const t = (Z?.label || Z?.content || Z?.text || Z?.value || '').toString();
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

// Anti-doublon: empêche de lancer deux fois l'animation pour la même paire en <800ms
let __lastBubbleSig = { sig: '', ts: 0 };
export function animateBubblesFromZones(aId, bId, color = '#3b82f6', ZA = null, ZB = null) {
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

function getArcPathFromZonePoints(points, zoneId, selectedArcPoints, arcPointsFromZone, marginPx = 0) {
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
  return `M ${newStart.x},${newStart.y} A ${r},${r} 0 ${largeArcFlag},${sweepFlag} ${newEnd.x},${newEnd.y}`;
}

const Carte = () => {
  const navigate = useNavigate();
  // ...
  // Mode plein écran de jeu
  const [fullScreen, setFullScreen] = useState(false);
  // Thèmes actifs de la session (pour badge UI)
  const [activeThemes, setActiveThemes] = useState([]);
  // Sélection interactive des deux points d'arc pour chaque zone texte
  const [selectedArcPoints, setSelectedArcPoints] = useState({}); // { [zoneId]: [idx1, idx2] }
const [arcSelectionMode, setArcSelectionMode] = useState(false); // mode sélection d'arc
  // --- GAME STATE ---
  const [gameActive, setGameActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [score, setScore] = useState(0);
  // Historique des sessions multi
  const [sessions, setSessions] = useState([]);
  // Verrou court pour éviter le double traitement d'une paire
  const processingPairRef = useRef(false);
  // Index des zones par id pour éviter les .find() répétitifs (déclaré après l'init de `zones`)
  // Responsive UI state
  const [isMobile, setIsMobile] = useState(false);
  // Socket and timers
  const socketRef = useRef(null);
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
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const autoStartRef = useRef(false);

  // Prewarm backend (non-blocking) to reduce cold-start latency
  useEffect(() => {
    fetchWithTimeout(`${getBackendUrl()}/healthz`, { cache: 'no-store' }, 1500).catch(() => {});
  }, []);

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
    try { email = localStorage.getItem('cc_profile_email') || localStorage.getItem('user_email') || localStorage.getItem('email'); } catch {}
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
    try { await navigator.clipboard.writeText((diagRecLines || []).join('\n')); } catch {}
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
  useEffect(() => {
    const onKeyDiag = (e) => {
      try {
        const k = String(e.key || '').toLowerCase();
        if (e.ctrlKey && e.altKey && k === 'd') {
          e.preventDefault();
          setDiagOpen(v => !v);
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
      if (!document.fullscreenElement) {
        const root = document.documentElement;
        await root.requestFullscreen?.();
      }
    } catch {}
    try { document.body.style.overflow = 'hidden'; } catch {}
    try { document.body.classList.add('cc-game'); } catch {}
    try { window.dispatchEvent(new CustomEvent('cc:gameFullscreen', { detail: { on: true } })); } catch {}
    setFullScreen(true);
    setPanelCollapsed(true);
  }), []);

  // ===== Freemium helpers (Sprint A) =====
  const applyFreeLimits = (sock) => {
    try {
      if (!isFree() || !sock) return;
      // force 3 rounds per session for Free users
      sock.emit && sock.emit('room:setRounds', 3);
    } catch {}
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
      const resp = await fetchWithTimeout(`${window.location.protocol}//${window.location.hostname}:4000/usage/can-start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId })
      }, 1500);
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) return { ok: false, allow: true }; // ne pas bloquer si erreur serveur
      return json;
    } catch { return { ok: false, allow: true }; }
  };

  const exitGameFullscreen = useMemo(() => (async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.();
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
    // Détection mobile + auto-réduction du panneau pour maximiser la carte
    const applyMobile = () => {
      const mobile = window.innerWidth <= 640;
      setIsMobile(mobile);
      if (mobile) setPanelCollapsed(true);
    };
    applyMobile();
    window.addEventListener('resize', applyMobile);
    // Cleanup resize listener will be returned later with socket cleanup
    const cleanupResize = () => window.removeEventListener('resize', applyMobile);
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
      // Listen room:state to know when we are host, then apply config once
      const onRoomState = (payload) => {
        try {
          if (!payload || !Array.isArray(payload.players)) return;
          // Vérifier que NOUS sommes l'hôte
          const self = payload.players.find(p => p && p.id === s.id);
          const amHost = !!self?.isHost;
          // Charger la config souhaitée
          let cfg = null; try { cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null'); } catch {}
          const wantRounds = parseInt(cfg?.rounds, 10);
          const wantDuration = parseInt(cfg?.duration, 10);
          const hasWanted = (Number.isFinite(payload.roundsPerSession) ? payload.roundsPerSession === wantRounds : false)
            && (Number.isFinite(payload.duration) ? payload.duration === wantDuration : false);
          // Si l'état reflète déjà la config, marquer appliqué
          if (hasWanted) { configAppliedRef.current = true; return; }
          // Sinon, si nous sommes l'hôte, tenter d'appliquer
          if (!configAppliedRef.current && amHost) {
            if (Number.isFinite(wantDuration) && wantDuration >= 10 && wantDuration <= 600) {
              addDiag('emit room:duration:set', { duration: wantDuration });
              try { s.emit('room:duration:set', { duration: wantDuration }); } catch {}
            }
            if (Number.isFinite(wantRounds) && wantRounds >= 1 && wantRounds <= 20) {
              addDiag('emit room:setRounds', { rounds: wantRounds });
              try { s.emit('room:setRounds', wantRounds); } catch {}
            }
            // Ne pas marquer comme appliqué tant que le room:state ne correspond pas
          }
        } catch {}
      };
      s.on('room:state', onRoomState);
      // Lire la config de session (si définie par l'écran Modes/SessionConfig)
      let cfg = null;
      try { cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null'); } catch {}
      const isOnline = cfg && cfg.mode === 'online';
      // Freemium guard: Free plan is solo only
      if (isOnline && isFree()) {
        try { alert('Le mode en ligne est réservé aux abonnés Pro.'); } catch {}
        try { navigate('/pricing'); } catch {}
        // Rejoindre quand même une salle locale par défaut pour éviter un état incohérent
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
            // Auto-prêt + démarrage immédiat (session solo si seul joueur)
            setTimeout(() => { try { s.emit('ready:toggle', { ready: true }); } catch {} }, 150);
            setTimeout(() => {
              // Freemium guard: limit daily sessions for Free users
              if (isFree()) {
                if (!canStartSessionToday(3)) { try { alert("Limite quotidienne atteinte (3 sessions/jour en version gratuite). Passe à la version Pro pour continuer."); } catch {}; try { navigate('/pricing'); } catch {}; return; }
                incrementSessionCount();
              }
              try {
                // Ensure config applied at start time if not yet via room:state
                if (!configAppliedRef.current) {
                  let cfg2 = null; try { cfg2 = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null'); } catch {}
                  const r2 = parseInt(cfg2?.rounds, 10);
                  const d2 = parseInt(cfg2?.duration, 10);
                  if (Number.isFinite(d2) && d2 >= 10 && d2 <= 600) s.emit('room:duration:set', { duration: d2 });
                  if (Number.isFinite(r2) && r2 >= 1 && r2 <= 20) s.emit('room:setRounds', r2);
                  configAppliedRef.current = true;
                }
                s.emit('startGame');
              } catch {}
            }, 350);
          } else {
            // Demander au serveur de créer une salle et la rejoindre
            try {
              s.emit('room:create', (res) => {
                if (res && res.ok && res.roomCode) {
                  setRoomId(res.roomCode);
                  s.emit('joinRoom', { roomId: res.roomCode, name: cfg.playerName || playerName });
                  setTimeout(() => { try { s.emit('ready:toggle', { ready: true }); } catch {} }, 150);
                  setTimeout(() => {
                    // Freemium guard
                    if (isFree()) {
                      if (!canStartSessionToday(3)) { try { alert("Limite quotidienne atteinte (3 sessions/jour en version gratuite)."); } catch {}; try { navigate('/pricing'); } catch {}; return; }
                      incrementSessionCount();
                    }
                    try {
                      if (!configAppliedRef.current) {
                        let cfg3 = null; try { cfg3 = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null'); } catch {}
                        const r3 = parseInt(cfg3?.rounds, 10);
                        const d3 = parseInt(cfg3?.duration, 10);
                        if (Number.isFinite(d3) && d3 >= 10 && d3 <= 600) s.emit('room:duration:set', { duration: d3 });
                        if (Number.isFinite(r3) && r3 >= 1 && r3 <= 20) s.emit('room:setRounds', r3);
                        configAppliedRef.current = true;
                      }
                      s.emit('startGame');
                    } catch {}
                  }, 350);
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
            setTimeout(() => { try { s.emit('ready:toggle', { ready: true }); } catch {} }, 150);
          } else {
            try { s.emit('joinRoom', { roomId, name: cfg.playerName || playerName }); } catch {}
            setTimeout(() => { try { s.emit('ready:toggle', { ready: true }); } catch {} }, 150);
          }
        }
      } else {
        // Pas de config en ligne → comportement par défaut
        try { s.emit('joinRoom', { roomId, name: playerName }); } catch {}
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

    s.on('round:new', (payload) => {
      console.debug('[CC][client] round:new', payload);
      addDiag('round:new', { duration: payload?.duration, roundIndex: payload?.roundIndex, roundsTotal: payload?.roundsTotal });
      // Clear waiting timer, if any
      try { if (roundNewTimerRef.current) { clearTimeout(roundNewTimerRef.current); roundNewTimerRef.current = null; } } catch {}
      // Show preload overlay at start of each round
      setPreparing(true);
      try { window.ccAddDiag && window.ccAddDiag('prep:start:round', { roundIndex: payload?.roundIndex }); } catch {}
      setPrepProgress(0);
      const seed = Number.isFinite(payload?.seed) ? payload.seed : undefined;
      const zonesFile = payload?.zonesFile || 'zones2';
      if (typeof setMpMsg === 'function') setMpMsg('Nouvelle manche');
      // Deterministic assignment based on seed and zones file
      safeHandleAutoAssign(seed, zonesFile);
      // Ensure game state is active
      setGameActive(true);
      // Prendre la durée côté serveur et initialiser le timer d'affichage
      try {
        const d = parseInt(payload?.duration, 10);
        if (Number.isFinite(d) && d > 0) {
          setGameDuration(d);
          setTimeLeft(d);
        }
      } catch {}
      // Synchroniser l'index de manche si fourni
      try {
        const idx = parseInt(payload?.roundIndex, 10);
        if (Number.isFinite(idx) && idx >= 0) setRoundsPlayed(idx);
      } catch {}
      setGameSelectedIds([]);
      setGameMsg('');
      // Reset de la paire cible côté client en attendant round:target
      setCurrentTargetPairKey(null);
      // Passer en plein écran jeu et replier le panneau multi
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
      const w = summary && summary.winner;
      const title = summary?.winnerTitle || 'Crazy Winner';
      // Détection d'égalité basée sur les derniers scores connus côté client
      const scoresList = Array.isArray(scoresRef.current) ? scoresRef.current : [];
      const maxScore = scoresList.length ? Math.max(...scoresList.map(p => p.score || 0)) : (w?.score ?? 0);
      const topPlayers = scoresList.filter(p => (p.score || 0) === maxScore);
      if (topPlayers.length >= 2) {
        const names = topPlayers.map(p => p.name).filter(Boolean).join(' & ');
        setMpMsg(`Session terminée. Égalité: ${names} (score ${maxScore})`);
        try { setWinnerOverlay({ text: `Égalité (${maxScore})`, until: Date.now() + 4500 }); setTimeout(() => setWinnerOverlay(null), 4500); } catch {}
      } else {
        const name = w?.name || 'Aucun gagnant';
        setMpMsg(`Session terminée. Vainqueur: ${name} (score ${w?.score ?? 0})`);
        try { playCorrectSound?.(); } catch {}
        try { showConfetti?.(); } catch {}
        try { setWinnerOverlay({ text: `${title}: ${name}`, until: Date.now() + 4500 }); setTimeout(() => setWinnerOverlay(null), 4500); } catch {}
      }
      // Sortie du mode jeu / plein écran et reset des états de manche
      try { setGameActive(false); } catch {}
      try { setGameSelectedIds([]); } catch {}
      try { setCurrentTargetPairKey(null); } catch {}
      try { exitGameFullscreen(); } catch {}
      try { setRoomStatus('lobby'); } catch {}
      // Rouvrir le panneau pour retrouver les commandes de lobby
      try { setPanelCollapsed(false); } catch {}
      // Historique client: enregistrer la session terminée
      try {
        const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
        const hist = JSON.parse(localStorage.getItem('cc_history') || '[]');
        const entry = {
          endedAt: summary?.endedAt || Date.now(),
          roomCode: summary?.roomCode || roomId,
          mode: cfg?.mode || null,
          winner: summary?.winner || null,
          scores: Array.isArray(summary?.scores) ? summary.scores : [],
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
      // Rediriger vers la sélection des modes après un court délai
      setTimeout(() => { try { navigate('/modes'); } catch {} }, 500);
    });

    s.on('pair:valid', (payload) => {
      console.debug('[CC][client] pair:valid', payload);
      // Réinitialise la sélection et le message local
      setGameSelectedIds([]);
      setGameMsg('');
      // Met à jour la vignette de dernière paire + historique
      try {
        const aId = payload?.a; const bId = payload?.b; const byId = payload?.by;
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
        // Couleur déterministe par index
        const idx = Math.max(0, (Array.isArray(players) ? players.findIndex(x => x.id === winnerId) : 0));
        const palette = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];
        const color = palette[idx % palette.length];
        const textFor = (Z) => {
          const t = (Z?.label || Z?.content || Z?.text || Z?.value || '').toString();
          if (t && t.trim()) return t;
          // fallback: pairId visible si contenu vide (ex: image sans label)
          const pid = getPairId(Z);
          return pid ? `[${pid}]` : '…';
        };
        const textA = textFor(ZA);
        const textB = textFor(ZB);
        const entry = { a: aId, b: bId, winnerId, winnerName, color, text: `${textA || '…'} ↔ ${textB || '…'}`, tie };
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
        animateBubblesFromZones(aId, bId, color, ZA, ZB);
      } catch (e) {
        console.warn('[CC][client] pair:valid post-UI failed', e);
      }
      // Reshuffle immédiat et déterministe pour tous les clients (sans délai)
      const sn = Number(payload?.seedNext);
      const zf = payload?.zonesFile || 'zones2';
      if (Number.isFinite(sn)) {
        try {
          console.debug('[CC][client] reshuffle with seedNext (immediate)', { seedNext: sn, zonesFile: zf });
          safeHandleAutoAssign(sn, zf);
        } catch (e) {
          console.error('[CC][client] handleAutoAssign(seedNext) failed', e);
        }
      } else {
        console.warn('[CC][client] pair:valid without valid seedNext; skip reshuffle to keep sync');
      }
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
  const gameContainerRef = useRef(null);
  // Timestamp du premier clic pour mesurer la latence d'une tentative
  const firstClickTsRef = useRef(0);
  // Timer pour détecter l'absence de 'round:new' après un démarrage multi (déclaré plus haut)

  // Détermination locale (fallback) de la paire cible si pas de serveur ou clé non reçue
  useEffect(() => {
    try {
      if (!Array.isArray(zones) || !zones.length) return;
      // Si on est connecté et qu'on a déjà une clé, ne pas surcharger
      if (socketConnected && currentTargetPairKey) return;
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
      if (!socketConnected && found && found !== currentTargetPairKeyRef.current) {
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
}, [gameActive, gameDuration]);

// Persister la durée choisie
useEffect(() => {
  try { localStorage.setItem('gameDuration', String(gameDuration)); } catch {}
}, [gameDuration]);

function startGame() {
  // Freemium: check serveur si dispo (lié au user), puis fallback local
  try {
    if (isFree()) {
      const uid = getLocalUserId();
      // Vérif serveur (non bloquante si serveur non configuré)
      // Note: startGame n'est pas async; on enchaîne via then()
      serverAllowsStart(uid).then((res) => {
        try {
          if (res && res.ok && res.allow === false) {
            alert("Limite quotidienne atteinte sur votre compte Free. Passez à la version Pro pour continuer.");
            navigate('/pricing');
            return;
          }
          // Après validation serveur, appliquer le fallback local
          if (!canStartSessionToday(3)) {
            alert('Limite quotidienne atteinte (3 sessions/jour en version gratuite). Passe à la version Pro pour continuer.');
            navigate('/pricing');
            return;
          }
          incrementSessionCount();
          // Poursuivre le démarrage réel
          doStart();
        } catch { /* ignore */ }
      });
      return; // attendre la réponse asynchrone
    }
  } catch {}
  // Pro: démarrage direct
  doStart();
}

function doStart() {
  try {
    try { window.ccAddDiag && window.ccAddDiag('doStart:called'); } catch {}
    // Réinitialiser le Set des paires validées au début d'une nouvelle session
    setValidatedPairIds(new Set());
    try { window.ccAddDiag && window.ccAddDiag('session:reset:validatedPairs'); } catch {}
    // Si connecté au serveur, lancer une session SOLO via le backend
  if (socket && socket.connected) {
    try {
      // Démarrer une session de progression côté Supabase aussi en mode socket
      try {
        const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
        pgStartSession({
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
      try { socket.emit('joinRoom', { roomId, name: playerName }); } catch {}
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
  // Démarrer une session de progression côté Supabase (si connecté)
  try {
    const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
    pgStartSession({
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
  setAssocToast({ kind, text });
  assocToastTimerRef.current = setTimeout(() => {
    setAssocToast(null);
    assocToastTimerRef.current = null;
  }, 1600);
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
  if (processingPairRef.current) return; // verrou anti-double-clic
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
    }
    if (next.length === 2) {
      const [a, b] = next;
      if (a === b) {
        // ignorer double clic sur la même zone
        return [a];
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
      let theme = '';
      try {
        const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
        levelClass = Array.isArray(cfg?.classes) && cfg.classes[0] ? String(cfg.classes[0]) : '';
        theme = Array.isArray(cfg?.themes) && cfg.themes[0] ? String(cfg.themes[0]) : '';
      } catch {}
      if (okPair) {
        console.log('[GAME] OK pair', { a, b, ZA: { id: ZA.id, type: ZA.type, pairId: ZA.pairId }, ZB: { id: ZB.id, type: ZB.type, pairId: ZB.pairId } });
        // Ajouter le pairId au Set des paires validées
        if (pairKey) {
          setValidatedPairIds(prev => new Set([...prev, pairKey]));
          try { window.ccAddDiag && window.ccAddDiag('pair:validated', { pairKey, totalValidated: validatedPairIdsRef.current.size + 1 }); } catch {}
        }
        // Effets visuels immédiats pour garantir le feedback, même en multijoueur
        setGameMsg('Bravo !');
        playCorrectSound();
        showConfetti();
        try { animateBubblesFromZones(a, b, '#22c55e', ZA, ZB); } catch {}
        if (socket && socket.connected) {
          try { socket.emit('attemptPair', { a, b }); } catch {}
        }
          // Enregistrer tentative OK
          try { pgRecordAttempt({ item_type, item_id: pairKey || `${ZA?.id}|${ZB?.id}`, objective_key: `${levelClass}:${theme}`, correct: true, latency_ms: latency, level_class: levelClass, theme, round_index: Number(roundsPlayed)||0 }); } catch {}
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
          // Comptage de manches en mode solo (fallback)
          if (!(socket && socket.connected)) {
            if (Number.isFinite(roundsPerSession)) {
              setRoundsPlayed(prev => {
                const nxt = (typeof prev === 'number' ? prev : 0) + 1;
                // Arrêter la session si on a atteint le quota
                if (nxt >= roundsPerSession) {
                  try { setGameActive(false); } catch {}
                }
                return nxt;
              });
            } else {
              setRoundsPlayed(prev => (typeof prev === 'number' ? prev + 1 : 1));
            }
          }
          setTimeout(() => {
            setGameSelectedIds([]);
            setGameMsg('');
            // En multi, on ne reshuffle pas localement pour garder la sync entre joueurs
            if (!(socket && socket.connected)) {
              // Mode solo/local
              safeHandleAutoAssign();
            }
          }, 450);
      } else {
        console.log('[GAME] BAD pair', { a, b, ZA: ZA && { id: ZA.id, type: ZA.type, pairId: ZA.pairId }, ZB: ZB && { id: ZB.id, type: ZB.type, pairId: ZB.pairId } });
        setGameMsg('Mauvaise association');
        setShowBigCross(true);
        playWrongSound();
        showWrongFlash();
        // Enregistrer tentative KO
        try { pgRecordAttempt({ item_type, item_id: `${ZA?.id}|${ZB?.id}`, objective_key: `${levelClass}:${theme}`, correct: false, latency_ms: latency, level_class: levelClass, theme, round_index: Number(roundsPlayed)||0 }); } catch {}
        // laisser l'effet visuel un court instant puis reset
        setTimeout(() => { setGameSelectedIds([]); setGameMsg(''); setShowBigCross(false); }, 400);
      }
    }
    return next;
  });
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
    const rnd = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `Joueur-${rnd}`;
  });
  const [scoresMP, setScoresMP] = useState([]); // [{id,name,score}]
  const [mpMsg, setMpMsg] = useState('');
  // Lobby/ready state
  const [roomStatus, setRoomStatus] = useState('lobby'); // 'lobby'|'countdown'|'playing'
  const [roomPlayers, setRoomPlayers] = useState([]); // [{id,nickname,score,ready,isHost}]
  const [isHost, setIsHost] = useState(false);
  const [myReady, setMyReady] = useState(false);
  const [countdownT, setCountdownT] = useState(null);
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

  // Load saved positions/angles from backend once on mount
  useEffect(() => {
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
      // Par défaut sur mobile, réduire le panneau et masquer l'historique
      setPanelCollapsed(mobile);
      setHistoryExpanded(!mobile);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Disable edit mode when a game starts/room playing
  useEffect(() => {
    if (gameActive || roomStatus === 'playing') {
      setEditMode(false);
    }
  }, [gameActive, roomStatus]);

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
// Tu peux stocker ces correspondances dans le state si tu veux les exploiter dans l’UI
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
    // Priorité au localStorage si présent (ex: nettoyages faits depuis l'Admin)
    try {
      const saved = localStorage.getItem('zones');
      if (saved) {
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
    localStorage.setItem('zones', JSON.stringify(zones));
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
        const str = String(s).trim().replace(/\s+/g, '').replace(/×/g, 'x').replace(/÷/g, '/');
        const m = str.match(/^(-?\d+)([+\-x*\/:])(-?\d+)$/i);
        if (!m) return null;
        const a = parseInt(m[1], 10);
        const op = m[2];
        const b = parseInt(m[3], 10);
        if (Number.isNaN(a) || Number.isNaN(b)) return null;
        let result;
        switch (op) {
          case '+': result = a + b; break;
          case '-': result = a - b; break;
          case 'x':
          case '*': result = a * b; break;
          case '/': result = b !== 0 ? a / b : NaN; break;
          case ':': result = b !== 0 ? a / b : NaN; break;
          default: result = NaN;
        }
        if (!Number.isFinite(result)) return null;
        return { a, b, op, result };
      }
      function randomDistractorText(exclude = []) {
        const pool = TEXTES_RANDOM.filter(t => !exclude.includes(t));
        if (pool.length === 0) return '';
        return pool[Math.floor(rng() * pool.length)];
      }
      // Identifie une image "principale" et garantit qu'au moins un texte partage son pairId
      let post = validated.map(z => ({ ...z }));
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
            const selThemes = Array.isArray(cfg?.themes) ? cfg.themes.filter(Boolean).map(String) : [];
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
            // Filtrage par niveau/classe (associations seulement pour ne pas assécher les pools)
            if (selClasses.length > 0) {
              const pickLevels = (a) => {
                // Supporte différents schémas: levelClass (string), levels/classes/classLevels (array)
                const lc = a?.levelClass ? [String(a.levelClass)] : [];
                const arr = a?.levels || a?.classes || a?.classLevels || [];
                return [...lc, ...arr];
              };
              const byClass = (a) => hasAny(pickLevels(a), selClasses);
              if (Array.isArray(assocRoot)) {
                assocRoot = assocRoot.filter(byClass);
              } else if (assocRoot && typeof assocRoot === 'object') {
                assocRoot = {
                  textImage: (assocRoot.textImage || []).filter(byClass),
                  calcNum: (assocRoot.calcNum || []).filter(byClass),
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
            const capped = arr.slice(-12);
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
            const capped = arr.slice(-20);
            try { localStorage.setItem('cc_recent_image_urls', JSON.stringify(capped)); } catch {}
            try { window.ccRecentImageUrls = capped; } catch {}
          };
          const recentImages = new Set(getRecentImages());
          const recentUrls = new Set(getRecentUrls());
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
              const strictLevelOk = (o) => {
                if (selClasses.length === 0) return true;
                const lv = pickLevels(o);
                // Si aucun niveau déclaré ou '-' alors exclu en présence de classes sélectionnées
                if (!lv.length) return false;
                return lv.some(v => selClasses.includes(v));
              };
              const strictThemeOk = (o) => hasAny(o?.themes || [], selThemes);
              if (selThemes.length > 0 || selClasses.length > 0) {
                const beforeCounts = { images: allImages.length, textes: allTextes.length, calculs: allCalcs.length, chiffres: allNums.length };
                allImages = allImages.filter(i => strictThemeOk(i) && strictLevelOk(i));
                allTextes = allTextes.filter(t => strictThemeOk(t) && strictLevelOk(t));
                allCalcs = allCalcs.filter(c => strictThemeOk(c) && strictLevelOk(c));
                allNums = allNums.filter(n => strictThemeOk(n) && strictLevelOk(n));
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
                // Ajouter l'image principale à la mémoire courte (persistée plus bas)
                try {
                  recentImages.add(String(imInfo.id));
                  const mainUrlNorm = normUrl(imInfo.url || imInfo.path || imInfo.src || '');
                  if (mainUrlNorm) { recentUrls.add(mainUrlNorm); roundImageSeq.push({ id: String(imInfo.id), url: mainUrlNorm }); }
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
                  // pick unique by id and by normalized url
                  let pick = null;
                  const poolImgs = [...allImages, ...(extraStrictImages || [])];
                  // Pass 1: try to pick non-recent, non-used, non-pairing image
                  for (const cand of poolImgs) {
                    const idStr = String(cand.id);
                    const urlNorm = normUrl(cand.url || cand.path || cand.src || '');
                    // Ne pas choisir une image qui formerait une paire valide avec le texte principal (ou futurs textes, pris en charge côté textes)
                    // Éviter aussi les images récemment utilisées (no-near-repeat entre manches) par ID et par URL
                    if (!usedImgIds.has(idStr) && urlNorm && !usedImgUrls.has(urlNorm) && !imgTxtPairs.has(`${idStr}|${txInfo.id}`) && !recentImages.has(idStr) && !recentUrls.has(urlNorm)) { pick = cand; break; }
                  }
                  // Pass 2: if pool exhausted (all recent), allow reuse but still avoid pairs and duplicates on same card
                  if (!pick) {
                    try { window.ccAddDiag && window.ccAddDiag('round:images:pool:exhausted', { spot: o.i }); } catch {}
                    for (const cand of poolImgs) {
                      const idStr = String(cand.id);
                      const urlNorm = normUrl(cand.url || cand.path || cand.src || '');
                      if (!usedImgIds.has(idStr) && urlNorm && !usedImgUrls.has(urlNorm) && !imgTxtPairs.has(`${idStr}|${txInfo.id}`)) { pick = cand; break; }
                    }
                  }
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
                  setRecentImages(uniqArr);
                  const uniqUrls = Array.from(new Set(Array.from(recentUrls)));
                  setRecentUrls(uniqUrls);
                  if (window && typeof window.ccAddDiag === 'function') {
                    window.ccAddDiag('round:images:recent:update', { recentCount: uniqArr.length, recentUrlCount: uniqUrls.length });
                    window.ccAddDiag('round:images:seq', { items: roundImageSeq });
                  }
                } catch {}
                // Choisir des textes qui ne forment aucune association valide avec les images présentes
                const pickTextAvoidingPairs = () => {
                  const poolBase = allTextes.filter(t => !usedTxtIds.has(String(t.id)) && !usedTxtContents.has(norm(t.content)));
                  const poolExtra = (extraStrictTextes || []).filter(t => !usedTxtIds.has(String(t.id)) && !usedTxtContents.has(norm(t.content)));
                  // Préférer un texte strict si possible
                  const ordered = [...poolExtra, ...poolBase];
                  const safe = ordered.filter(t => {
                    for (const imgId of presentImageIds) {
                      if (imgTxtPairs.has(`${imgId}|${t.id}`)) return false;
                    }
                    return true;
                  });
                  if (!safe.length) return null;
                  return safe[Math.floor(rng() * safe.length)];
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
                if (enableMathFill) for (const o of calculsIdx) {
                  if ((post[o.i]?.pairId || '').trim()) continue;
                  // ensure unique by content as well
                  let pick = null;
                  for (const cand of allCalcs) {
                    const idStr = String(cand.id);
                    const contNorm = normCalc(cand.content || '');
                    if (!usedCalcIds.has(idStr) && contNorm && !usedCalcContents.has(contNorm)) { pick = cand; break; }
                  }
                  if (pick) {
                    usedCalcIds.add(String(pick.id));
                    usedCalcContents.add(normCalc(pick.content || ''));
                    presentCalcIds.add(String(pick.id));
                    post[o.i] = { ...post[o.i], content: pick.content || post[o.i].content, label: pick.content || post[o.i].label, pairId: '' };
                  }
                }
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
                const pickNumberAvoidingPairsImgBranch = () => {
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
                if (enableMathFill) for (const o of chiffresIdx) {
                  if ((post[o.i]?.pairId || '').trim()) continue;
                  const pick = pickNumberAvoidingPairsImgBranch();
                  if (pick) {
                    usedNumIds.add(String(pick.id));
                    usedNumContents.add(normNum(pick.content));
                    post[o.i] = { ...post[o.i], content: String(pick.content ?? post[o.i].content), label: String(pick.content ?? post[o.i].label), pairId: '' };
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
                post[calcSpot.i] = { ...post[calcSpot.i], content: caInfo.content || post[calcSpot.i].content, label: caInfo.content || post[calcSpot.i].label, pairId: key };
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
                  if (window && typeof window.ccAddDiag === 'function') window.ccAddDiag('round:guard:calcnum:mainResult', { result: p?.result ?? null });
                } catch {}
                // Préparer ensembles d'unicité pour fallback
                const existingCalcContents = new Set(
                  post.filter(z => normType(z?.type) === 'calcul').map(z => String(z.content || '').trim())
                );
                const existingNumContents = new Set(
                  post.filter(z => normType(z?.type) === 'chiffre').map(z => String(z.content ?? '').trim())
                );
                const numbersOnCardSet = new Set(
                  Array.from(existingNumContents).map(s => parseInt(String(s).replace(/\s+/g, ''), 10)).filter(n => Number.isFinite(n))
                );
                let filteredCalcsByResult = 0;
                for (const o of calculsIdx) {
                  // Ne pas toucher au calcul apparié (pairId non vide)
                  if ((post[o.i]?.pairId || '').trim()) continue;
                  let pick = null;
                  for (const cand of allCalcs) {
                    const idStr = String(cand.id);
                    if (usedCalcIds.has(idStr)) continue;
                    const parsed = parseOperation(cand.content || '');
                    const res = parsed && Number.isFinite(parsed.result) ? parsed.result : null;
                    // Exclure tout calcul qui donnerait un résultat déjà présent (dont le résultat principal)
                    if (res != null && (presentCalcResults.has(res) || numbersOnCardSet.has(res))) { filteredCalcsByResult++; continue; }
                    pick = cand; break;
                  }
                  if (pick) {
                    usedCalcIds.add(String(pick.id));
                    presentCalcIds.add(String(pick.id));
                    post[o.i] = { ...post[o.i], content: pick.content || post[o.i].content, label: pick.content || post[o.i].label, pairId: '' };
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
                  const pool = allNums.filter(n => !usedNumIds.has(String(n.id)));
                  const safe = pool.filter(n => {
                    const v = parseInt(String(n.content).replace(/\s+/g, ''), 10);
                    if (Number.isFinite(v)) {
                      if (presentCalcResults.has(v)) return false; // ne pas créer de nouvelle vérité calc->num
                    }
                    for (const calcId of presentCalcIds) {
                      if (calcNumPairs.has(`${calcId}|${n.id}`)) return false;
                    }
                    return true;
                  });
                  if (!safe.length) return null;
                  return safe[Math.floor(rng() * safe.length)];
                };
                for (const o of chiffresIdx) {
                  // Ne pas toucher au chiffre apparié (pairId non vide)
                  if ((post[o.i]?.pairId || '').trim()) continue;
                  const pick = pickNumberAvoidingPairs();
                  if (pick) {
                    usedNumIds.add(String(pick.id));
                    post[o.i] = { ...post[o.i], content: String(pick.content ?? post[o.i].content), label: String(pick.content ?? post[o.i].label), pairId: '' };
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
                  let pick = null;
                  for (const cand of allImages) {
                    const idStr = String(cand.id);
                    const urlNorm = normUrl(cand.url || cand.path || cand.src || '');
                    if (!usedImgIds.has(idStr) && urlNorm && !usedImgUrls.has(urlNorm)) { pick = cand; break; }
                  }
                  if (pick) {
                    usedImgIds.add(String(pick.id));
                    usedImgUrls.add(normUrl(pick.url || pick.path || pick.src || ''));
                    presentImageIds.add(String(pick.id));
                    post[o.i] = { ...post[o.i], content: pick.url || pick.path || pick.src || post[o.i].content, pairId: '' };
                  } else {
                    const ph = 'images/carte-vide.png';
                    usedImgUrls.add(normUrl(ph));
                    post[o.i] = { ...post[o.i], content: ph, pairId: '' };
                  }
                }
                const pickTextAvoidingPairsCalcBranch = () => {
                  const pool = allTextes.filter(t => !usedTxtIds.has(String(t.id)) && !usedTxtContents.has(norm(t.content)));
                  const safe = pool.filter(t => {
                    for (const imgId of presentImageIds) {
                      if (imgTxtPairs.has(`${imgId}|${t.id}`)) return false;
                    }
                    return true;
                  });
                  if (!safe.length) return null;
                  return safe[Math.floor(rng() * safe.length)];
                };
                for (const o of textesIdx) {
                  if ((post[o.i]?.pairId || '').trim()) continue;
                  const pick = pickTextAvoidingPairsCalcBranch();
                  if (pick) {
                    usedTxtIds.add(String(pick.id));
                    usedTxtContents.add(norm(pick.content || ''));
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
      const numbersOnCard = new Set(
        post
          .filter(z => z?.type === 'chiffre')
          .map(z => parseInt(String(z.content).replace(/\s+/g, ''), 10))
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
      try {
        // Reconstruire mapping URL -> id image à partir des données Admin chargées dans la portée
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
        // Ensemble d'IDs autorisés: reconstruit depuis les pools stricts utilisés pour l'assignation
        const allowedImgIds = new Set(((assocData && assocData.images) || [])
          .filter(im => {
            // On n'a pas directement allImages ici; recalcul basique via niveaux/thèmes stricts
            // Récupérer la config
            const cfg = JSON.parse(localStorage.getItem('cc_session_cfg') || 'null');
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
            if (selThemes.length && !hasAny(im?.themes || [], selThemes)) return false;
            if (selClasses.length) {
              const lv = pickLevels(im);
              if (!lv.length) return false;
              if (!lv.some(v => selClasses.includes(v))) return false;
            }
            return true;
          })
          .map(im => String(im.id)));

        let cleaned = 0;
        post = post.map(z => {
          if (normType(z?.type) !== 'image') return z;
          const u = normUrl(z.content || z.url || z.path || z.src || '');
          const id = imgIdByUrl.get(u);
          if (!id) return z; // si on ne sait pas relier, ne pas casser (image externe ou placeholder déjà)
          if (!allowedImgIds.has(String(id))) {
            cleaned++;
            return { ...z, content: 'images/carte-vide.png', pairId: '' };
          }
          return z;
        });
        if (cleaned && typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.host)) {
          console.debug('[ASSIGN][STRICT][FINAL] images non conformes nettoyées:', cleaned);
        }
      } catch {}
      setZones(post);
      setCustomTextSettings(newTextSettings);
      localStorage.setItem('zones', JSON.stringify(post));
      console.log('Zones après attribution automatique (post-traitées) :', post);
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
      {/* Bouton Diagnostic flottant (toujours visible) */}
      <button
        onClick={() => setDiagOpen(v => !v)}
        title="Diagnostic"
        style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 10000, background: '#111827', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 999, padding: '8px 12px', boxShadow: '0 6px 18px rgba(0,0,0,0.25)', opacity: 0.9 }}
      >
        Diagnostic
      </button>

      {/* Panneau Diagnostic fixe (contenu admin-gaté) */}
      {diagOpen && (
        <div style={{ position: 'fixed', right: 12, bottom: 56, width: 420, maxWidth: '90vw', maxHeight: '70vh', overflow: 'auto', zIndex: 10000, background: '#111827', color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontWeight: 'bold' }}>Diagnostic</div>
            <button onClick={() => setDiagOpen(false)} style={{ color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', borderRadius: 6, padding: '4px 8px' }}>Fermer</button>
          </div>
          {isAdminUI ? (
            <div style={{ padding: 10 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button onClick={startDiagRecording} disabled={diagRecording} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #10b981', background: diagRecording ? '#064e3b' : '#065f46', color: '#ecfdf5' }}>Démarrer enregistrement</button>
                <button onClick={stopDiagRecording} disabled={!diagRecording} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ef4444', background: '#7f1d1d', color: '#fee2e2' }}>Arrêter</button>
                <button onClick={copyDiagRecording} disabled={!diagRecLines.length} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#e5e7eb' }}>Copier</button>
                <button onClick={() => { setDiagLines([]); setDiagRecLines([]); }} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#e5e7eb' }}>Vider</button>
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Derniers évènements</div>
              <div style={{ maxHeight: 180, overflow: 'auto', background: '#0b1220', padding: 8, borderRadius: 6 }}>
                {(diagLines || []).slice(-120).map((l, i) => (
                  <div key={i} style={{ whiteSpace: 'pre-wrap' }}>{l}</div>
                ))}
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, margin: '6px 0 4px' }}>Enregistrement ({diagRecLines.length} lignes)</div>
              <div style={{ maxHeight: 160, overflow: 'auto', background: '#0b1220', padding: 8, borderRadius: 6 }}>
                {(diagRecLines || []).map((l, i) => (
                  <div key={i} style={{ whiteSpace: 'pre-wrap' }}>{l}</div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ padding: 10, fontSize: 14 }}>
              <div style={{ marginBottom: 6, fontWeight: 'bold' }}>Accès restreint</div>
              <div style={{ opacity: 0.9, marginBottom: 8 }}>Ce panneau est réservé aux administrateurs. Demandez à un admin d’activer votre accès, ou connectez‑vous avec un compte admin.</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Astuce: appuyez sur Ctrl+Alt+D pour ouvrir/fermer rapidement.</div>
            </div>
          )}
        </div>
      )}
      {preparing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#111827', color: '#fff', padding: 18, borderRadius: 10, width: 280, textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Préparation de la session…</div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.2)', borderRadius: 999 }}>
              <div style={{ width: `${Math.max(0, Math.min(100, prepProgress))}%`, height: '100%', background: '#10b981', borderRadius: 999, transition: 'width .2s ease' }} />
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>{Math.max(0, Math.min(100, prepProgress))}%</div>
          </div>
        </div>
      )}
      {Array.isArray(activeThemes) && activeThemes.length > 0 && (
        <div
          title={activeThemes.join(', ')}
          style={{
            position: 'fixed',
            top: 8,
            left: 8,
            zIndex: 8,
            background: 'rgba(17,24,39,0.85)',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
            fontSize: 12,
            maxWidth: '60vw',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {(() => {
            const arr = activeThemes;
            if (arr.length <= 3) return `Thèmes: ${arr.join(', ')}`;
            const head = arr.slice(0, 3).join(', ');
            const rest = arr.length - 3;
            return `Thèmes: ${head} +${rest}`;
          })()}
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
              <div style={{ position: 'fixed', top: 8, right: 8, zIndex: 8, background: 'rgba(245,158,11,0.95)', color: '#111827', padding: '6px 10px', borderRadius: 999, border: '1px solid rgba(0,0,0,0.1)', boxShadow: '0 6px 18px rgba(0,0,0,0.18)', fontSize: 12 }}>
                Zones calcul/chiffre volontairement vides (pas de données pour cette configuration)
              </div>
            );
          }
        } catch {}
        return null;
      })()}
      {isMobile && (
        <div className="mobile-hud">
          <div className="hud-left">
            <div className="hud-chip">⏱ {Math.max(0, timeLeft)}s</div>
            <div className="hud-chip">⭐ {score}</div>
            <div className="hud-chip">
              {Number.isFinite(roundsPerSession)
                ? `Manche: ${Math.max(0, roundsPlayed || 0)} / ${roundsPerSession}`
                : `Manche: ${Math.max(0, roundsPlayed || 0)}`}
            </div>
          </div>
          <div className="hud-vignette" data-cc-vignette="last-pair" ref={mpLastPairRef} title={lastWonPair?.text || ''}>
            <span style={{ width: 12, height: 12, borderRadius: 999, display: 'inline-block', marginRight: 6, background: lastWonPair?.color || '#e5e7eb', boxShadow: lastWonPair ? `0 0 6px 2px ${(lastWonPair.color || '#e5e7eb')}55` : 'none' }} />
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
      {isMobile && Array.isArray(wonPairsHistory) && wonPairsHistory.length > 0 && (
        <div className="mobile-history-strip" aria-label="Historique des paires">
          {wonPairsHistory.slice(0, 10).map((e, i) => (
            <div key={i} className="hist-item" title={e.text}>
              <span className="dot" style={{ background: e.color || '#e5e7eb' }} />
              <span style={{ maxWidth: '52vw', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <b style={{ marginRight: 4 }}>{e.winnerName || 'Joueur'}</b>
                <span>{e.text}</span>
                {e.tie && (
                  <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 999, background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e' }}>Égalité</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {assocToast && (
        <div
          style={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: 520,
            background: assocToast.kind === 'fallback' ? 'rgba(255, 183, 77, 0.96)' : 'rgba(76, 175, 80, 0.96)',
            color: '#fff',
            padding: '12px 16px',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
            zIndex: 9999,
            fontSize: 15,
            lineHeight: 1.4,
            backdropFilter: 'blur(2px)'
          }}
        >
          <strong style={{ display: 'block', marginBottom: 4 }}>
            {assocToast.kind === 'imgtxt' && 'Association choisie (image-texte)'}
            {assocToast.kind === 'calcnum' && 'Association choisie (calcul-chiffre)'}
            {assocToast.kind === 'fallback' && 'Fallback utilisé'}
          </strong>
          <span>{assocToast.text}</span>
        </div>
      )}
      {/* Sidebar fixe en mode jeu plein écran */}
      {hasSidebar && (
        <aside className="game-sidebar-fixed">
          <div className="sidebar-content">
            <div className="hud-row" style={{ fontWeight: 'bold' }}>
              <div>Salle: {roomId || '—'}</div>
              <div>Manche: {Number.isFinite(roundsPerSession) ? `${Math.max(0, roundsPlayed||0)} / ${roundsPerSession}` : Math.max(0, roundsPlayed||0)}</div>
            </div>
            <div className="hud-row" style={{ fontSize: 12, color: '#374151' }}>
              <div style={{ opacity: 0.8 }}>Paramètres: {Number.isFinite(roundsPerSession) ? `${roundsPerSession} manches` : 'manches ∞'} · {gameDuration}s</div>
            </div>
            <div className="hud-row">
              <button onClick={handleEndSessionNow} style={{ background: '#d63031', color: '#fff', border: '1px solid #333', borderRadius: 6, padding: '6px 10px', fontWeight: 'bold' }}>Terminer</button>
              <div style={{ fontSize: 16, fontWeight: 'bold' }}>Temps: {timeLeft}s</div>
            </div>
            {isAdminUI && (
              <div style={{ marginTop: 8, padding: 8, border: '1px dashed #9ca3af', borderRadius: 8 }}>
                <div className="hud-row" style={{ gap: 6 }}>
                  <button onClick={() => setDiagOpen(v => !v)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db' }}>{diagOpen ? 'Masquer diagnostic' : 'Diagnostic'}</button>
                  <button onClick={startDiagRecording} disabled={diagRecording} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #10b981', background: diagRecording ? '#d1fae5' : '#ecfdf5', color: '#065f46' }}>Démarrer enregistrement</button>
                  <button onClick={stopDiagRecording} disabled={!diagRecording} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ef4444', background: !diagRecording ? '#fee2e2' : '#fef2f2', color: '#991b1b' }}>Arrêter</button>
                  <button onClick={copyDiagRecording} disabled={!diagRecLines.length} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db' }}>Copier l'enregistrement</button>
                  <button onClick={() => { setDiagLines([]); setDiagRecLines([]); }} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db' }}>Vider</button>
                </div>
                {diagOpen && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>Derniers évènements (live)</div>
                    <div style={{ maxHeight: 180, overflow: 'auto', background: '#111827', color: '#e5e7eb', padding: 8, borderRadius: 6, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: 12 }}>
                      {(diagLines || []).slice(-120).map((l, i) => (
                        <div key={i} style={{ whiteSpace: 'pre-wrap' }}>{l}</div>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: '#374151', margin: '6px 0 4px' }}>Enregistrement courant ({diagRecLines.length} lignes)</div>
                    <div style={{ maxHeight: 140, overflow: 'auto', background: '#111827', color: '#e5e7eb', padding: 8, borderRadius: 6, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: 12 }}>
                      {(diagRecLines || []).map((l, i) => (
                        <div key={i} style={{ whiteSpace: 'pre-wrap' }}>{l}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {lastWonPair && (
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Dernière paire</div>
                <div style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6, background: '#fff' }} data-cc-vignette="last-pair" ref={mpLastPairRef}>
                  <div style={{ fontSize: 14 }}>{lastWonPair.text}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{lastWonPair.winnerName || 'Joueur'}</div>
                </div>
              </div>
            )}
            <div>
              <div style={{ fontWeight: 'bold', marginTop: 8 }}>Joueurs</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
                {((roomPlayers && roomPlayers.length) ? roomPlayers : (scoresMP || []).map(p => ({ id: p.id, nickname: p.name, score: p.score })))
                  .map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', border: '1px solid #eee', borderRadius: 6 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{p.nickname || p.name}</span>
                      <span style={{ fontWeight: 'bold' }}>{(p.score ?? 0)}</span>
                    </div>
                  ))}
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '6px 0', borderTop: '1px dashed #ccc', marginTop: 8 }} onClick={() => setHistoryExpanded(v => !v)}>
                <div style={{ fontWeight: 'bold' }}>Historique</div>
                <div style={{ opacity: 0.7 }}>{Array.isArray(wonPairsHistory) ? wonPairsHistory.length : 0}</div>
              </div>
              {historyExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                  {(wonPairsHistory || []).map((h, i) => (
                    <div key={i} style={{ fontSize: 13, padding: '6px 8px', border: '1px solid #eee', borderRadius: 6, background: '#fff' }}>
                      {h.text}
                    </div>
                  ))}
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
          <div style={{ fontSize: 18, fontWeight: 'bold' }}>Temps: {timeLeft}s</div>
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
          {/* ClipPaths pour zones images */}
          {zones.filter(z => z.type === 'image' && Array.isArray(z.points) && z.points.length >= 2).map(zone => (
            <clipPath id={`clip-zone-${zone.id}`} key={`clip-${zone.id}`} clipPathUnits="userSpaceOnUse">
              <path d={pointsToBezierPath(zone.points)} />
            </clipPath>
          ))}
          {/* Paths pour texte courbé (zones non-image) */}
          {zones.filter(z => z.type !== 'image' && Array.isArray(z.points) && z.points.length >= 2).map(zone => (
            <path id={`text-curve-${zone.id}`} key={`textcurve-${zone.id}`} d={getArcPathFromZonePoints(zone.points, zone.id, selectedArcPoints, zone.arcPoints)} fill="none" />
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
                filter: hoveredZoneId === zone.id ? 'drop-shadow(0 0 8px #007bff)' : 'none',
                opacity: 1
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
                  const isHover = hoveredZoneId === zone.id;
                  const isSelected = gameActive && gameSelectedIds.includes(zone.id);
                  if (zone.type === 'image') {
                    if (isSelected) return 'rgba(255, 214, 0, 0.55)'; // jaune persistant pour sélection
                    return (selectedZoneIds.includes(zone.id) || isHover) ? 'rgba(255, 214, 0, 0.5)' : 'rgba(255, 214, 0, 0.01)';
                  }
                  if (zone.type === 'texte' || zone.type === 'chiffre' || zone.type === 'calcul') {
                    if (isSelected) return 'rgba(40, 167, 69, 0.55)'; // sélection persistante plus visible
                    return isHover ? 'rgba(40, 167, 69, 0.35)' : 'rgba(40, 167, 69, 0.01)';
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
                  const fontSize = (zone.type === 'chiffre' ? 0.42 : 0.28) * effectiveBase;
                  const angle = Number(calcAngles[zone.id] || 0);
                  const mo = mathOffsets[zone.id] || { x: 0, y: 0 };
                  const handleRotate = (e) => {
                    if (gameActive || !editMode) return;
                    e.stopPropagation();
                    setCalcAngles(prev => ({
                      ...prev,
                      [zone.id]: e.shiftKey ? 0 : (((Number(prev[zone.id] || 0) + 15) % 360))
                    }));
                  };
                  // Apply a tiny centering offset exclusively for digit "6" in chiffre zones
                  const contentStr = String(zone.content ?? '').trim();
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
      {/* Lobby / Multijoueur UI */}
      {socket && !hasSidebar && (
        <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Compte à rebours (caché en mode réduit) */}
          {countdownT !== null && !panelCollapsed && (
            <div style={{ alignSelf: 'flex-end', background: '#111a', color: '#fff', padding: '6px 10px', borderRadius: 10, fontSize: 18, fontWeight: 800, zIndex: 3000 }}>
              {countdownT}
            </div>
          )}
          <div style={{
            background: '#ffffffcc', backdropFilter: 'blur(4px)', border: '2px solid #333', borderRadius: 12,
            boxShadow: '0 6px 20px #0003', padding: 12, minWidth: isMobile ? 0 : 260, width: isMobile ? '86vw' : undefined
          }}>
            {/* Header: réduit = minimal; étendu = toutes les actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                {!panelCollapsed && (
                  <div style={{ fontWeight: 'bold' }}>Salle <span style={{ fontFamily: 'monospace' }}>{roomId}</span></div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {!panelCollapsed && isHost && (
                    <button
                      onClick={() => { try { socket && socket.emit('session:end'); } catch {} }}
                      title={'Terminer la session (hôte)'}
                      style={{ background: '#fee2e2', border: '1px solid #ef4444', color: '#991b1b', borderRadius: 8, padding: '4px 8px', fontSize: 12, fontWeight: 700 }}
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
                      style={{ width: 70, padding: '4px 6px', borderRadius: 8, border: '1px solid #aaa', fontSize: 12 }}
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
                      style={{ background: '#eef2ff', border: '1px solid #93c5fd', borderRadius: 8, padding: '4px 8px', fontSize: 12 }}
                    >
                      Historique {sessions?.length ? `(${sessions.length})` : ''}
                    </button>
                  )}
                  <button
                    onClick={() => setPanelCollapsed(c => !c)}
                    title={panelCollapsed ? 'Déployer' : 'Réduire'}
                    style={{ background: '#f3f4f6', border: '1px solid #9ca3af', borderRadius: 8, padding: '4px 8px', fontSize: 12 }}
                  >
                    {panelCollapsed ? '▢' : '—'}
                  </button>
                </div>
              {/* Bandeau compact: affiche toujours la dernière paire dans l'en-tête */}
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 12, color: '#333', whiteSpace: 'nowrap' }}>
                    {Number.isFinite(roundsPerSession) ? (
                    <>Manche: {Math.max(0, roundsPlayed || 0)} / {roundsPerSession}</>
                  ) : (
                    <>Manche: {Math.max(0, roundsPlayed || 0)}</>
                  )}
                </div>
                <div data-cc-vignette="last-pair" ref={mpLastPairRef} style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 999, background: lastWonPair?.color || '#e5e7eb', boxShadow: lastWonPair ? `0 0 6px 2px ${(lastWonPair.color || '#e5e7eb')}55` : 'none' }} />
                    <span style={{ fontSize: 12, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lastWonPair ? (<><b>{lastWonPair.winnerName}</b>: {lastWonPair.text} {lastWonPair.tie && (<span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 999, background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e' }}>Égalité</span>)}</>) : 'Dernière paire: —'}
                    </span>
                  </div>
                </div>
              </div>
              {/* Progression de la session */}
              {!panelCollapsed && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#333' }}>
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
              <input value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="Pseudo" style={{ padding: 6, borderRadius: 8, border: '1px solid #bbb' }} />
              <input value={roomId} onChange={e => setRoomId(e.target.value)} placeholder="Code salle" style={{ padding: 6, borderRadius: 8, border: '1px solid #bbb' }} />
              {/* Durée de manche (hôte uniquement) */}
              {isHost ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, color: '#333', minWidth: 90 }}>Durée:</label>
                  <select value={roomDuration} onChange={e => handleSetRoomDuration(e.target.value)} style={{ flex: 1, padding: 6, borderRadius: 8, border: '1px solid #bbb' }}>
                    <option value={30}>30 s</option>
                    <option value={60}>60 s</option>
                    <option value={90}>90 s</option>
                  </select>
                  {/* Sélection du nombre de manches (hôte) */}
                  <label style={{ fontSize: 12, color: '#333', minWidth: 90 }}>Manches:</label>
                  <input
                    type="number"
                    title="Nombre de manches de la session"
                    min={1}
                    max={20}
                    step={1}
                    value={Number.isFinite(roundsPerSession) ? roundsPerSession : 3}
                    onChange={(e) => handleSetRounds(e.target.value)}
                    style={{ flex: 1, padding: 6, borderRadius: 8, border: '1px solid #bbb' }}
                  />
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#333' }}>Durée: <b>{roomDuration}</b>s</div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                <button
                  onClick={handleCreateRoom}
                  style={{ flex: 1, background: '#eee', border: '1px solid #999', borderRadius: 8, padding: '6px 8px' }}
                >
                  Créer une salle
                </button>
                <button onClick={handleJoinRoom} style={{ flex: 1, background: '#dbeafe', border: '1px solid #60a5fa', borderRadius: 8, padding: '6px 8px', fontWeight: 600 }}>Rejoindre</button>
                <button onClick={handleLeaveRoom} style={{ flex: 1, background: '#fee2e2', border: '1px solid #ef4444', borderRadius: 8, padding: '6px 8px' }}>Quitter</button>
              </div>
            </div>
            )}
            {!panelCollapsed && <div style={{ marginTop: 10, fontWeight: 'bold' }}>Joueurs</div>}
            {!panelCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, maxHeight: isMobile ? '22vh' : 220, overflowY: 'auto' }}>
              {[...(roomPlayers.length ? roomPlayers : (scoresMP || []).map(p => ({ id: p.id, nickname: p.name, score: p.score })))]
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 140 }}>
                      {p.isHost && <span title="Hôte" style={{ color: '#a16207' }}>★</span>}
                      <span style={{ color: '#222', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.nickname || p.name}>{p.nickname || p.name || 'Joueur'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {typeof p.ready === 'boolean' && (
                        <span style={{ fontSize: 12, padding: '2px 6px', borderRadius: 999, background: p.ready ? '#dcfce7' : '#fee2e2', border: `1px solid ${p.ready ? '#22c55e' : '#ef4444'}`, color: p.ready ? '#166534' : '#7f1d1d' }}>
                          {p.ready ? 'Prêt' : 'Pas prêt'}
                        </span>
                      )}
                      <span style={{ fontWeight: 'bold', color: '#1a7f37' }}>{p.score ?? 0}</span>
                    </div>
                  </div>
                ))}
            </div>
            )}
            {!panelCollapsed && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={handleToggleReady} style={{ flex: 1, background: myReady ? '#fef3c7' : '#dcfce7', border: '1px solid #a3a3a3', borderRadius: 8, padding: '8px 10px', fontWeight: 700 }}>
                {myReady ? 'Pas prêt' : 'Je suis prêt'}
              </button>
              {(() => {
                const allReady = roomPlayers.length >= 2 && roomPlayers.every(p => p.ready);
                return (
                  <button onClick={handleStartRoom} disabled={!isHost || !allReady} title={!isHost ? 'Réservé à l\'hôte' : (allReady ? '' : 'Tous les joueurs doivent être prêts')} style={{ flex: 1, background: isHost && allReady ? '#fde68a' : '#e5e7eb', border: '1px solid #a3a3a3', borderRadius: 8, padding: '8px 10px', fontWeight: 700 }}>
                    Démarrer
                  </button>
                );
              })()}
            </div>
            )}
            {mpMsg && !panelCollapsed && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#333' }}>{mpMsg}</div>
            )}
            {/* Dernière paire trouvée (vignette compacte) */}
            {!panelCollapsed && (
              <div ref={mpLastPairRef} style={{
                marginTop: 10,
                padding: 8,
                borderRadius: 10,
                border: '1px solid #ddd',
                background: '#fff',
                boxShadow: 'inset 0 0 0 2px #00000008',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <div style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  background: lastWonPair?.color || '#e5e7eb',
                  boxShadow: lastWonPair ? `0 0 6px 3px ${(lastWonPair.color || '#e5e7eb')}55` : 'none'
                }} />
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lastWonPair ? `${lastWonPair.winnerName} a trouvé:` : 'Aucune paire trouvée'}
                  </div>
                  {lastWonPair && (
                    <div style={{ fontSize: 12, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lastWonPair.text}>
                      {lastWonPair.text} {lastWonPair.tie && (
                        <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 999, background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e' }}>Égalité</span>
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
                borderTop: '1px dashed #ddd',
                paddingTop: 8,
                maxHeight: isMobile ? '16vh' : 140,
                overflowY: 'auto',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#111', marginBottom: 4 }}>Dernières paires</div>
                {Array.isArray(wonPairsHistory) && wonPairsHistory.length ? (
                  wonPairsHistory.slice(0, 12).map((e, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: e.color || '#e5e7eb', display: 'inline-block' }} />
                      <span style={{ fontSize: 12, color: '#111', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.text}>
                        <b style={{ color: '#111' }}>{e.winnerName}:</b> {e.text} {e.tie && (
                          <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 999, background: '#fef3c7', border: '1px solid #f59e0b', color: '#92400e' }}>Égalité</span>
                        )}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 12, color: '#555' }}>—</div>
                )}
              </div>
            )}
          </div>
          {/* Tableau d'historique sous le panneau multijoueur */}
          {historyExpanded && (
            <div style={{
              background: '#ffffffcc', backdropFilter: 'blur(4px)', border: '1px solid #555', borderRadius: 10,
              boxShadow: '0 4px 14px #0003', padding: 10, minWidth: isMobile ? 0 : 260, width: isMobile ? '86vw' : undefined,
              maxHeight: isMobile ? '25vh' : 220, overflowY: 'auto'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 'bold' }}>Historique des sessions</div>
                <button onClick={() => setHistoryExpanded(false)} style={{ background: 'transparent', border: 'none', fontSize: 18, lineHeight: 1, cursor: 'pointer' }}>×</button>
              </div>
              {Array.isArray(sessions) && sessions.length > 0 ? (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sessions.slice().reverse().map((s, idx) => (
                    <div key={idx} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, background: '#fff' }}>
                      <div style={{ fontSize: 12, color: '#444' }}>{new Date(s.endedAt).toLocaleString()}</div>
                      <div style={{ fontWeight: 700, marginTop: 2 }}>
                        {s.winnerTitle ? `${s.winnerTitle}: ` : 'Vainqueur: '}{s.winner?.name || '—'} {typeof s.winner?.score === 'number' ? `( ${s.winner.score} )` : ''}
                      </div>
                      <div style={{ fontSize: 12, color: '#333', marginTop: 4 }}>
                        {Array.isArray(s.scores) && s.scores.length > 0 ? s.scores.map(sc => `${sc.name || 'Joueur'}: ${sc.score ?? 0}`).join(', ') : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ marginTop: 8, fontSize: 12, color: '#444' }}>Aucun historique pour le moment.</div>
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