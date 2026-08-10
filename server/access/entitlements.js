// ==========================================
// HABILITATIONS (CTO-002) — FAIL CLOSED
// Détermine si un utilisateur a droit aux fonctionnalités payantes.
// Toute incertitude (identité absente, base injoignable, erreur de
// requête, profil introuvable) ferme l'accès.
// Les règles commerciales existantes sont conservées:
//   - abonnement active/trialing non expiré → accès
//   - rôle institutionnel (admin/teacher/cpd/cpc/rectorat) → accès
//   - élève rattaché à une licence RÉELLEMENT vérifiée → accès
//
// Revue CTO: le seul rôle `student`, ou la seule adresse @eleve…, ne vaut plus
// licence. L'accès exige une fiche `students` licensed=true rapprochée du
// compte (mapping actif ou code d'accès).
// ==========================================

const schoolScope = require('./schoolScope');

const PRIVILEGED_ROLES = ['admin', 'teacher', 'cpd', 'cpc', 'rectorat'];
// Rôles autorisés à piloter un match (créer, forcer le départ, supprimer).
// Un abonnement Pro n'accorde jamais ces pouvoirs.
const MANAGER_ROLES = ['admin', 'teacher', 'cpd', 'cpc', 'rectorat'];
const ACTIVE_SUB_STATUSES = ['active', 'trialing'];
const STUDENT_EMAIL_DOMAIN = '@eleve.crazychrono.app';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deny(reason, extra = {}) {
  return { isPro: false, reason, source: null, status: null, role: null, ...extra };
}
function grant(source, extra = {}) {
  return { isPro: true, reason: 'entitled', source, status: null, role: null, ...extra };
}

function isTrustedUserId(userId) {
  return typeof userId === 'string' && UUID_RE.test(userId);
}

/**
 * @param {object} params
 * @param {object|null} params.supabase client service-role (ou null)
 * @param {string|null} params.userId   identifiant résolu côté serveur (UUID auth)
 * @param {number} [params.now]
 * @returns {Promise<{isPro:boolean, reason:string, source:string|null, status:string|null, role:string|null}>}
 */
async function resolveEntitlement({ supabase, userId, now = Date.now() }) {
  if (!userId) return deny('unauthenticated');
  // Un identifiant non UUID ne provient pas d'un jeton Supabase vérifié.
  if (!isTrustedUserId(userId)) return deny('untrusted_identifier');
  if (!supabase) return deny('verification_unavailable');

  try {
    // 1) Abonnement Stripe
    const { data: subRows, error: subErr } = await supabase
      .from('subscriptions')
      .select('status,current_period_end')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (subErr) return deny('verification_error');
    const subRow = Array.isArray(subRows) && subRows[0] ? subRows[0] : null;
    const status = subRow?.status || null;
    if (ACTIVE_SUB_STATUSES.includes(status)) {
      const end = subRow?.current_period_end ? new Date(subRow.current_period_end).getTime() : null;
      const expired = Number.isFinite(end) && end !== null && end < now;
      if (!expired) return grant('subscription', { status });
      return deny('subscription_expired', { status });
    }

    // 2) Profil: rôle institutionnel ou rattachement élève
    const { data: prof, error: profErr } = await supabase
      .from('user_profiles')
      .select('role,email')
      .eq('id', userId)
      .maybeSingle();
    if (profErr) return deny('verification_error', { status });
    if (!prof) return deny('user_not_found', { status });

    const role = prof.role || null;
    if (PRIVILEGED_ROLES.includes(role)) return grant(`role:${role}`, { status, role });

    // Élève: la licence doit être prouvée par une fiche `students` licensed=true
    // rattachée au compte via `user_student_mapping`. Ni le rôle, ni l'adresse
    // @eleve…, ni le code d'accès ne valent rattachement (revue CTO finale).
    const linked = await schoolScope.resolveLinkedStudent({ supabase, userId });
    if (!linked.ok) return deny('verification_error', { status, role });
    if (linked.student?.licensed) return grant('student_license', { status, role: role || 'student' });
    if (linked.student) return deny('student_not_licensed', { status, role });

    return deny(status ? 'subscription_inactive' : 'no_entitlement', { status, role });
  } catch (e) {
    return deny('verification_error');
  }
}

/**
 * Rôle serveur d'un utilisateur (jamais issu du client). FAIL CLOSED:
 * toute incertitude renvoie `null`.
 * @returns {Promise<{role: string|null, reason: string}>}
 */
async function resolveRole({ supabase, userId }) {
  if (!userId) return { role: null, reason: 'unauthenticated' };
  if (!isTrustedUserId(userId)) return { role: null, reason: 'untrusted_identifier' };
  if (!supabase) return { role: null, reason: 'verification_unavailable' };
  try {
    const { data: prof, error } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (error) return { role: null, reason: 'verification_error' };
    if (!prof) return { role: null, reason: 'user_not_found' };
    return { role: prof.role || null, reason: prof.role ? 'resolved' : 'no_role' };
  } catch (e) {
    return { role: null, reason: 'verification_error' };
  }
}

/**
 * Cache TTL: les accès accordés sont gardés plus longtemps que les refus
 * (un refus doit être réévalué vite après un paiement).
 */
function createEntitlementCache({ grantTtlMs = 5 * 60_000, denyTtlMs = 30_000, maxEntries = 5000 } = {}) {
  const map = new Map();
  return {
    get(userId, now = Date.now()) {
      const e = map.get(userId);
      if (!e) return null;
      const ttl = e.value.isPro ? grantTtlMs : denyTtlMs;
      if (now - e.ts > ttl) { map.delete(userId); return null; }
      return e.value;
    },
    set(userId, value, now = Date.now()) {
      map.set(userId, { value, ts: now });
      if (map.size > maxEntries) {
        [...map.keys()].slice(0, Math.ceil(maxEntries / 5)).forEach((k) => map.delete(k));
      }
    },
    invalidate(userId) { map.delete(userId); },
    clear() { map.clear(); },
    size() { return map.size; },
  };
}

module.exports = {
  resolveEntitlement,
  resolveRole,
  createEntitlementCache,
  isTrustedUserId,
  PRIVILEGED_ROLES,
  MANAGER_ROLES,
  ACTIVE_SUB_STATUSES,
  STUDENT_EMAIL_DOMAIN,
};
