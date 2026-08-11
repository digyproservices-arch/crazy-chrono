// =============================================
// CTO-005A (revue CTO §A/§E) — whitelist de rôles unique
//
// `user_profiles.role` gouverne l'accès institutionnel (classes, écoles,
// circonscriptions) : un rôle arbitraire accepté à un seul endroit suffit à
// contourner tout le périmètre. Les trois chemins qui peuvent l'écrire —
// POST /api/admin/send-invite, POST /api/auth/apply-invite,
// POST /api/admin/set-role (et le legacy /admin/users/role) — partagent donc
// cette liste, alignée sur celle codée en dur dans consume_invitation().
// =============================================

const ASSIGNABLE_ROLES = ['admin', 'editor', 'user', 'teacher', 'cpd', 'cpc', 'rectorat'];

// `student` n'est jamais attribuable par un administrateur ni invitable : il est
// écrit par le backend (service role) à la création d'un compte élève. La
// contrainte user_profiles_role_check (migration 1200) doit donc l'accepter,
// alors que invitations_role_check ne le tolère pas.
const BACKEND_ONLY_ROLES = ['student'];

// Valeurs de `user_profiles.role` légitimes en base, tous chemins confondus.
const PERSISTED_ROLES = [...ASSIGNABLE_ROLES, ...BACKEND_ONLY_ROLES];

// Rôles portant un périmètre institutionnel : `region` (et `circonscription_id`
// pour un CPC) est alors significatif.
const REGION_SCOPED_ROLES = ['cpd', 'cpc', 'rectorat'];

/** @param {unknown} role @returns {string} */
function normalizeRole(role) {
  return typeof role === 'string' ? role.trim().toLowerCase() : '';
}

/** @param {unknown} role @returns {boolean} */
function isAssignableRole(role) {
  return ASSIGNABLE_ROLES.includes(normalizeRole(role));
}

/** @param {unknown} email @returns {string} */
function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

module.exports = {
  ASSIGNABLE_ROLES,
  BACKEND_ONLY_ROLES,
  PERSISTED_ROLES,
  REGION_SCOPED_ROLES,
  normalizeRole,
  isAssignableRole,
  normalizeEmail,
};
