// ==========================================
// DEVICE FINGERPRINT — Identification unique d'appareil
// Combinaison de caractéristiques navigateur/écran
// Persisté en localStorage pour stabilité
// ==========================================

const FP_KEY = 'cc_device_fingerprint';
const FP_NAME_KEY = 'cc_device_name';

/**
 * Génère un hash simple (non-crypto) à partir d'une string.
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Collecte les signaux de fingerprint de l'appareil.
 * Combinaison de: screen, timezone, language, platform, plugins, canvas.
 */
function collectSignals() {
  const signals = [];

  // Écran
  try {
    signals.push(`${screen.width}x${screen.height}`);
    signals.push(`${screen.colorDepth}`);
    signals.push(`${window.devicePixelRatio || 1}`);
  } catch {}

  // Timezone + langue
  try {
    signals.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    signals.push(navigator.language || '');
  } catch {}

  // Platform + CPU
  try {
    signals.push(navigator.platform || '');
    signals.push(String(navigator.hardwareConcurrency || ''));
    signals.push(String(navigator.maxTouchPoints || 0));
  } catch {}

  // Canvas fingerprint (léger)
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(50, 0, 100, 30);
      ctx.fillStyle = '#069';
      ctx.fillText('CrazyChronoFP', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('CrazyChronoFP', 4, 17);
      signals.push(canvas.toDataURL().slice(-50));
    }
  } catch {}

  // WebGL renderer (très discriminant)
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        signals.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '');
      }
    }
  } catch {}

  return signals.join('|');
}

/**
 * Génère ou récupère le fingerprint de l'appareil.
 * Persisté en localStorage pour stabilité entre sessions.
 * @returns {string} Fingerprint unique (ex: "fp_a1b2c3d4e5f6")
 */
export function getDeviceFingerprint() {
  try {
    const stored = localStorage.getItem(FP_KEY);
    if (stored) return stored;
  } catch {}

  // Générer un nouveau fingerprint
  const raw = collectSignals();
  const hash = simpleHash(raw);
  const fp = `fp_${hash}_${Date.now().toString(36).slice(-4)}`;

  try { localStorage.setItem(FP_KEY, fp); } catch {}
  return fp;
}

/**
 * Retourne un nom lisible pour cet appareil.
 * Ex: "Chrome / Windows", "Safari / iOS"
 */
export function getDeviceName() {
  try {
    const stored = localStorage.getItem(FP_NAME_KEY);
    if (stored) return stored;
  } catch {}

  let browser = 'Unknown';
  let os = 'Unknown';

  try {
    const ua = navigator.userAgent;
    if (ua.includes('CriOS') || ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Edg')) browser = 'Edge';

    if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
  } catch {}

  const name = `${browser} / ${os}`;
  try { localStorage.setItem(FP_NAME_KEY, name); } catch {}
  return name;
}

/**
 * Retourne les métadonnées du device pour l'envoi au serveur.
 */
export function getDeviceInfo() {
  return {
    fingerprint: getDeviceFingerprint(),
    name: getDeviceName(),
    browser: getBrowser(),
    os: getOS(),
  };
}

function getBrowser() {
  try {
    const ua = navigator.userAgent;
    if (ua.includes('CriOS') || ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Edg')) return 'Edge';
    return 'Other';
  } catch { return 'Unknown'; }
}

function getOS() {
  try {
    const ua = navigator.userAgent;
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    return 'Other';
  } catch { return 'Unknown'; }
}
