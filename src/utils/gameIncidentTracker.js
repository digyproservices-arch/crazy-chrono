// ============================================================
// GAME INCIDENT TRACKER
// Détection, sauvegarde et reporting d'anomalies de jeu
// ============================================================

import { getBackendUrl } from './apiHelpers';

const LS_KEY = 'cc_game_incidents';
const MAX_LOCAL_INCIDENTS = 200;

// ── Types d'incidents ──────────────────────────────────────
export const INCIDENT_TYPES = {
  DUPLICATE_PAIR: 'duplicate_pair',       // Même pairId apparaît > 2 fois sur une carte
  MISSING_PAIR: 'missing_pair',           // Zone sans pairId
  MISSING_CONTENT: 'missing_content',     // Zone sans contenu (label/content vide)
  SVG_OFFSET: 'svg_offset',              // Image SVG décalée hors limites
  IMAGE_LOAD_ERROR: 'image_load_error',   // Image qui ne charge pas
  ORPHAN_ZONE: 'orphan_zone',            // Zone avec pairId unique (pas de partenaire)
  TYPE_MISMATCH: 'type_mismatch',         // Paire avec types incompatibles (ex: 2 images)
  ZERO_VALID_PAIRS: 'zero_valid_pairs',   // Carte générée sans aucune paire valide
  MULTIPLE_TARGETS: 'multiple_targets',   // Plus d'une paire cible sur la carte
};

const SEVERITY = {
  [INCIDENT_TYPES.DUPLICATE_PAIR]: 'critical',
  [INCIDENT_TYPES.MISSING_PAIR]: 'warning',
  [INCIDENT_TYPES.MISSING_CONTENT]: 'warning',
  [INCIDENT_TYPES.SVG_OFFSET]: 'critical',
  [INCIDENT_TYPES.IMAGE_LOAD_ERROR]: 'error',
  [INCIDENT_TYPES.ORPHAN_ZONE]: 'error',
  [INCIDENT_TYPES.TYPE_MISMATCH]: 'critical',
  [INCIDENT_TYPES.ZERO_VALID_PAIRS]: 'critical',
  [INCIDENT_TYPES.MULTIPLE_TARGETS]: 'error',
};

// ── Device info helper ─────────────────────────────────────
function getDeviceInfo() {
  const ua = navigator.userAgent || '';
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
  const isTablet = /iPad|Tablet/i.test(ua);
  return {
    userAgent: ua.substring(0, 200),
    platform: navigator.platform || '',
    screenWidth: window.screen?.width || 0,
    screenHeight: window.screen?.height || 0,
    viewportWidth: window.innerWidth || 0,
    viewportHeight: window.innerHeight || 0,
    devicePixelRatio: window.devicePixelRatio || 1,
    deviceType: isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop',
    touchSupport: 'ontouchstart' in window,
  };
}

// ── LocalStorage persistence ───────────────────────────────
function loadLocalIncidents() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocalIncidents(incidents) {
  try {
    // Garder les plus récents
    const trimmed = incidents.slice(-MAX_LOCAL_INCIDENTS);
    localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('[IncidentTracker] localStorage save failed:', e);
  }
}

// ── Create incident object ─────────────────────────────────
function createIncident(type, details, zonesSnapshot) {
  return {
    id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    severity: SEVERITY[type] || 'warning',
    timestamp: new Date().toISOString(),
    device: getDeviceInfo(),
    details,
    zonesSnapshot: zonesSnapshot || null,
    sessionInfo: {
      url: window.location.href,
      mode: detectGameMode(),
    },
    synced: false,
  };
}

function detectGameMode() {
  const path = window.location.pathname || '';
  if (path.includes('arena')) return 'arena';
  if (path.includes('training')) return 'training';
  if (path.includes('multi')) return 'multiplayer';
  return 'solo';
}

// ── Send to backend ────────────────────────────────────────
async function sendToBackend(incident) {
  try {
    const auth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
    const token = auth.token;
    if (!token) return false;

    const res = await fetch(`${getBackendUrl()}/api/monitoring/incidents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ incident }),
    });
    return res.ok;
  } catch (e) {
    console.warn('[IncidentTracker] Backend send failed:', e.message);
    return false;
  }
}

// ── Public API ─────────────────────────────────────────────

/**
 * Enregistrer un incident. Sauvegarde en local + envoie au backend.
 */
export function reportIncident(type, details, zonesSnapshot) {
  const incident = createIncident(type, details, zonesSnapshot);
  console.warn(`[IncidentTracker] 🚨 ${incident.severity.toUpperCase()}: ${type}`, details);

  // Sauvegarder localement
  const incidents = loadLocalIncidents();
  incidents.push(incident);
  saveLocalIncidents(incidents);

  // Envoyer au backend (async, non-bloquant)
  sendToBackend(incident).then(ok => {
    if (ok) {
      // Marquer comme synchronisé
      const updated = loadLocalIncidents();
      const idx = updated.findIndex(i => i.id === incident.id);
      if (idx >= 0) { updated[idx].synced = true; saveLocalIncidents(updated); }
    }
  });

  return incident;
}

/**
 * Valider les zones d'une carte après génération.
 * Retourne un tableau d'incidents détectés.
 */
export function validateZones(zones, context = {}) {
  if (!Array.isArray(zones) || zones.length === 0) return [];

  const incidents = [];
  const pairGroups = new Map(); // pairId -> [zone, zone, ...]

  // Construire les groupes par pairId
  for (const z of zones) {
    if (z.validated) continue; // ignorer les zones déjà validées/masquées
    const pid = z.pairId || z.pairID || z.pairid || z.pair || z.groupId || z.groupID || z.group || '';
    if (!pid) {
      incidents.push(reportIncident(INCIDENT_TYPES.MISSING_PAIR, {
        zoneId: z.id,
        type: z.type,
        content: (z.content || z.label || '').substring(0, 50),
        message: `Zone ${z.id} sans pairId`,
      }, minimalSnapshot(zones)));
      continue;
    }
    if (!pairGroups.has(pid)) pairGroups.set(pid, []);
    pairGroups.get(pid).push(z);
  }

  // Vérifier chaque groupe
  for (const [pid, group] of pairGroups) {
    // Doublon: plus de 2 zones avec le même pairId
    if (group.length > 2) {
      incidents.push(reportIncident(INCIDENT_TYPES.DUPLICATE_PAIR, {
        pairId: pid,
        count: group.length,
        zones: group.map(z => ({ id: z.id, type: z.type, content: (z.content || z.label || '').substring(0, 50) })),
        message: `pairId "${pid}" apparaît ${group.length} fois (attendu: 2)`,
      }, minimalSnapshot(zones)));
    }

    // Orphelin: une seule zone avec ce pairId
    if (group.length === 1) {
      incidents.push(reportIncident(INCIDENT_TYPES.ORPHAN_ZONE, {
        pairId: pid,
        zone: { id: group[0].id, type: group[0].type, content: (group[0].content || group[0].label || '').substring(0, 50) },
        message: `pairId "${pid}" n'a qu'une seule zone (pas de partenaire)`,
      }, minimalSnapshot(zones)));
    }

    // Vérification types compatibles pour les paires de 2
    if (group.length === 2) {
      const t1 = normalizeType(group[0].type);
      const t2 = normalizeType(group[1].type);
      const validCombos = [
        ['image', 'texte'], ['texte', 'image'],
        ['calcul', 'chiffre'], ['chiffre', 'calcul'],
      ];
      const isValid = validCombos.some(([a, b]) => t1 === a && t2 === b);
      if (!isValid) {
        incidents.push(reportIncident(INCIDENT_TYPES.TYPE_MISMATCH, {
          pairId: pid,
          types: [t1, t2],
          zones: group.map(z => ({ id: z.id, type: z.type })),
          message: `pairId "${pid}": types incompatibles (${t1} + ${t2})`,
        }, minimalSnapshot(zones)));
      }
    }

    // Contenu manquant
    for (const z of group) {
      const content = (z.content || z.label || z.text || z.value || '').toString().trim();
      const isImage = normalizeType(z.type) === 'image';
      if (!content && !isImage && !z.url) {
        incidents.push(reportIncident(INCIDENT_TYPES.MISSING_CONTENT, {
          zoneId: z.id,
          pairId: pid,
          type: z.type,
          message: `Zone ${z.id} (type: ${z.type}) sans contenu visible`,
        }));
      }
    }
  }

  // Aucune paire valide sur la carte
  const validPairs = [...pairGroups.values()].filter(g => g.length === 2);
  if (validPairs.length === 0 && zones.length > 0) {
    incidents.push(reportIncident(INCIDENT_TYPES.ZERO_VALID_PAIRS, {
      totalZones: zones.length,
      pairGroups: pairGroups.size,
      message: `Carte avec ${zones.length} zones mais aucune paire valide`,
    }, minimalSnapshot(zones)));
  }

  if (incidents.length > 0) {
    console.warn(`[IncidentTracker] ${incidents.length} anomalie(s) détectée(s) sur cette carte`);
  }

  return incidents;
}

/**
 * Détecter un décalage SVG. Appelé depuis le rendu des zones.
 * @param {Object} zone - La zone concernée
 * @param {DOMRect} imgRect - Bounding rect de l'image rendue
 * @param {DOMRect} containerRect - Bounding rect du conteneur SVG
 */
export function checkSvgOffset(zone, imgRect, containerRect) {
  if (!imgRect || !containerRect) return null;

  const tolerance = 20; // pixels de tolérance
  const outsideLeft = imgRect.right < containerRect.left - tolerance;
  const outsideRight = imgRect.left > containerRect.right + tolerance;
  const outsideTop = imgRect.bottom < containerRect.top - tolerance;
  const outsideBottom = imgRect.top > containerRect.bottom + tolerance;

  if (outsideLeft || outsideRight || outsideTop || outsideBottom) {
    return reportIncident(INCIDENT_TYPES.SVG_OFFSET, {
      zoneId: zone.id,
      type: zone.type,
      pairId: zone.pairId || '',
      content: (zone.content || zone.label || '').substring(0, 50),
      imgRect: { left: imgRect.left, top: imgRect.top, width: imgRect.width, height: imgRect.height },
      containerRect: { left: containerRect.left, top: containerRect.top, width: containerRect.width, height: containerRect.height },
      offset: {
        left: outsideLeft ? imgRect.right - containerRect.left : 0,
        right: outsideRight ? imgRect.left - containerRect.right : 0,
        top: outsideTop ? imgRect.bottom - containerRect.top : 0,
        bottom: outsideBottom ? imgRect.top - containerRect.bottom : 0,
      },
      message: `Image SVG décalée hors de la zone ${zone.id}`,
    });
  }
  return null;
}

/**
 * Reporter une erreur de chargement d'image
 */
export function reportImageLoadError(zone, imageUrl, errorMsg) {
  return reportIncident(INCIDENT_TYPES.IMAGE_LOAD_ERROR, {
    zoneId: zone?.id,
    pairId: zone?.pairId || '',
    imageUrl: (imageUrl || '').substring(0, 200),
    error: errorMsg || 'Image failed to load',
    message: `Image non chargée: ${(imageUrl || '').substring(0, 80)}`,
  });
}

/**
 * Obtenir les incidents locaux non synchronisés
 */
export function getUnsyncedIncidents() {
  return loadLocalIncidents().filter(i => !i.synced);
}

/**
 * Obtenir tous les incidents locaux
 */
export function getAllLocalIncidents() {
  return loadLocalIncidents();
}

/**
 * Vider les incidents locaux
 */
export function clearLocalIncidents() {
  localStorage.removeItem(LS_KEY);
}

/**
 * Formater les incidents pour copie texte
 */
export function formatIncidentsForCopy(incidents) {
  if (!incidents || incidents.length === 0) return 'Aucun incident à signaler.';
  const header = `=== CRAZY CHRONO - Rapport d'incidents ===\nDate: ${new Date().toLocaleString('fr-FR')}\nTotal: ${incidents.length} incident(s)\n`;
  const sep = '─'.repeat(50);

  const body = incidents.map((inc, i) => {
    const lines = [
      `\n${sep}`,
      `#${i + 1} [${(inc.severity || 'warning').toUpperCase()}] ${inc.type}`,
      `Date: ${inc.timestamp}`,
      `Mode: ${inc.sessionInfo?.mode || '?'}`,
      `Appareil: ${inc.device?.deviceType || '?'} (${inc.device?.viewportWidth}x${inc.device?.viewportHeight})`,
      `Message: ${inc.details?.message || '—'}`,
    ];
    // Ajouter les détails pertinents
    const skip = new Set(['message']);
    const details = inc.details || {};
    for (const [k, v] of Object.entries(details)) {
      if (skip.has(k)) continue;
      const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
      lines.push(`  ${k}: ${val.substring(0, 200)}`);
    }
    if (inc.zonesSnapshot) {
      lines.push(`  zonesSnapshot: ${JSON.stringify(inc.zonesSnapshot).substring(0, 300)}`);
    }
    return lines.join('\n');
  }).join('\n');

  return header + body + `\n${sep}\n`;
}

// ── Helpers ────────────────────────────────────────────────

function normalizeType(t) {
  if (!t) return '';
  const x = String(t).toLowerCase().trim();
  if (['image', 'img', 'photo', 'picture'].includes(x)) return 'image';
  if (['texte', 'text', 'mot', 'word', 'label'].includes(x)) return 'texte';
  if (['calcul', 'calc', 'operation', 'op', 'math'].includes(x)) return 'calcul';
  if (['chiffre', 'nombre', 'number', 'num', 'result', 'resultat'].includes(x)) return 'chiffre';
  return x;
}

function minimalSnapshot(zones) {
  if (!zones) return null;
  return zones.slice(0, 30).map(z => ({
    id: z.id,
    type: z.type,
    pairId: z.pairId || z.pairID || '',
    content: (z.content || z.label || '').substring(0, 40),
    validated: z.validated || false,
  }));
}
