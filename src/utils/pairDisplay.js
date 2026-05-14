// =============================================
// Fonctions d'affichage paires — source unique (Phase 2)
// Utilisé par: Carte.js, TrainingArenaGame.js, ArenaSpectator.js
// =============================================

/**
 * Initiales d'un nom (max 2 lettres).
 * "Jean Dupont" → "JD", "Solo" → "SO"
 */
function getInitials(name) {
  const str = String(name || '').trim();
  if (!str) return '';
  const parts = str.split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Texte d'affichage d'une zone (label > content > text > value).
 * Priorise label (nom affiché) pour les zones texte/image.
 */
function textFor(Z, fallbackPairId) {
  const t = (Z?.label || Z?.content || Z?.text || Z?.value || '').toString().trim();
  if (t) return t;
  return fallbackPairId ? `[${fallbackPairId}]` : '…';
}

/**
 * Texte d'affichage d'une zone calcul/chiffre (content > label).
 * Priorise content (expression mathématique) plutôt que label (résultat).
 */
function textForCalc(Z, fallbackPairId) {
  const t = (Z?.content || Z?.label || Z?.text || Z?.value || '').toString().trim();
  if (t) return t;
  return fallbackPairId ? `[${fallbackPairId}]` : '…';
}

export { getInitials, textFor, textForCalc };
