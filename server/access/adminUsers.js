// =============================================
// CTO-005A (revue CTO §E) — primitive unique d'administration des rôles
//
// L'email n'est pas une clé : `user_profiles.email` peut être NULL (la colonne
// n'est plus accordée aux clients) ou désynchronisé de Supabase Auth, et une
// ligne `user_profiles` peut ne pas exister encore. Un `UPDATE ... WHERE email`
// échouait donc silencieusement (0 ligne) sur des comptes bien réels.
//
// Règle : l'email fourni par l'admin ne sert qu'à retrouver le compte dans
// Supabase Auth ; l'écriture se fait sur `auth.users.id`, via service role.
// =============================================

const { normalizeEmail, normalizeRole, isAssignableRole } = require('./roles');

/**
 * Retrouve un compte Supabase Auth par email (pagination complète).
 * @param {any} supabaseAdmin
 * @param {string} email
 * @returns {Promise<{ user: { id: string, email: string } | null, error: string | null }>}
 */
async function findAuthUserByEmail(supabaseAdmin, email) {
  const wanted = normalizeEmail(email);
  if (!wanted) return { user: null, error: null };

  const perPage = 1000;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) return { user: null, error: error.message || 'list_users_failed' };
    const users = data?.users || [];
    const found = users.find((u) => normalizeEmail(u?.email) === wanted);
    if (found) return { user: { id: found.id, email: found.email }, error: null };
    if (users.length < perPage) break;
  }
  return { user: null, error: null };
}

/**
 * Applique un rôle à un compte, identifié par email puis écrit par `id`.
 * @param {any} supabaseAdmin
 * @param {string} email
 * @param {string} role
 * @returns {Promise<{ status: number, body: Record<string, unknown>, target?: { id: string, email: string } }>}
 */
async function setRoleByEmail(supabaseAdmin, email, role) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = normalizeRole(role);

  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { status: 400, body: { ok: false, error: 'invalid_email' } };
  }
  if (!isAssignableRole(normalizedRole)) {
    return { status: 400, body: { ok: false, error: 'invalid_role' } };
  }

  const { user, error: lookupError } = await findAuthUserByEmail(supabaseAdmin, normalizedEmail);
  // Fail closed : une panne de listing ne doit pas se lire comme « compte absent ».
  if (lookupError) return { status: 503, body: { ok: false, error: 'lookup_failed' } };
  if (!user) return { status: 404, body: { ok: false, error: 'user_not_found' } };

  const { error: upsertError } = await supabaseAdmin
    .from('user_profiles')
    .upsert({ id: user.id, role: normalizedRole }, { onConflict: 'id' });
  if (upsertError) return { status: 500, body: { ok: false, error: 'update_failed' } };

  return {
    status: 200,
    body: { ok: true, email: user.email, role: normalizedRole },
    target: user,
  };
}

module.exports = { findAuthUserByEmail, setRoleByEmail };
