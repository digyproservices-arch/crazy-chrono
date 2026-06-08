import { getPairId } from './gameHelpers';

// Paramètres d'animation (bulle)
const BUBBLE_MAIN_SIZE = 110; // px, plus grande pour meilleure visibilité en classe
const BUBBLE_DURATION_MS = 5200; // ms (durée jugée bonne)
const TRAIL_COUNT = 0; // uniquement 2 bulles (pas de traînée)
const TRAIL_DELAY_MS = 0; // sans effet car TRAIL_COUNT=0

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
