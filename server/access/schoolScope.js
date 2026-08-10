// ==========================================
// PÉRIMÈTRE SCOLAIRE (CTO-003, revue CTO) — FAIL CLOSED
// Détermine, à partir du seul JWT vérifié, quelles classes et quels élèves
// un appelant a le droit de lire. Aucun studentId/classId/teacherId/schoolId
// envoyé par le client n'est une preuve d'autorité.
//
// Relations réellement exploitables côté serveur (server/db/schema_tournament.sql,
// schema_user_mapping.sql, migration_cpd_cpc_roles.sql) :
//   - user_profiles.role / .circonscription_id
//   - classes.teacher_email        → rattachement professeur ↔ classe
//   - students.class_id / .school_id / .circonscription_id
//   - schools.circonscription_id   → rattachement école ↔ circonscription
//   - user_student_mapping(user_id, student_id, active) → compte ↔ élève
//
// Revue CTO finale : `user_student_mapping` est l'UNIQUE preuve de propriété
// d'une fiche élève. Le rôle `student`, l'adresse @eleve… et le rapprochement
// de son préfixe avec `students.access_code` ne prouvent rien : ils décrivent
// une convention de nommage, pas un lien vérifié. Voir LEGACY_STUDENT_MAPPING_REQUIRED
// dans docs/CTO_003_ROUTE_MATRIX.md pour les comptes historiques sans ligne de
// mapping (fail closed, backfill administratif hors CTO-003).
//
// Relation manquante documentée : aucune table ne relie une circonscription à
// une région académique. Le périmètre « région » d'un CPD/rectorat n'est donc
// pas prouvable ; ces rôles sont ramenés à leur circonscription lorsqu'elle est
// renseignée, sinon refusés (fail closed).
// ==========================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STUDENT_EMAIL_DOMAIN = '@eleve.crazychrono.app';

const SCOPE_GLOBAL = 'global';
const SCOPE_CIRCONSCRIPTION = 'circonscription';
const SCOPE_CLASSES = 'classes';
const SCOPE_SELF = 'self';
const SCOPE_NONE = 'none';

function noScope(reason) {
  return { scope: SCOPE_NONE, reason, role: null, circonscriptionId: null, classIds: [], studentIds: [] };
}

function isTrustedUserId(userId) {
  return typeof userId === 'string' && UUID_RE.test(userId);
}

/**
 * Résout le périmètre scolaire du porteur du JWT.
 * @returns {Promise<{scope:string, reason:string, role:string|null, circonscriptionId:string|null, classIds:string[], studentIds:string[]}>}
 */
async function resolveSchoolScope({ supabase, userId, email }) {
  if (!isTrustedUserId(userId)) return noScope('unauthenticated');
  if (!supabase) return noScope('verification_unavailable');

  let prof = null;
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('role, email, circonscription_id')
      .eq('id', userId)
      .maybeSingle();
    if (error) return noScope('verification_error');
    prof = data || null;
  } catch {
    return noScope('verification_error');
  }

  const role = prof?.role || null;
  const userEmail = String(email || prof?.email || '').trim().toLowerCase();

  if (role === 'admin') {
    return { scope: SCOPE_GLOBAL, reason: 'admin', role, circonscriptionId: null, classIds: [], studentIds: [] };
  }

  if (role === 'cpc' || role === 'cpd' || role === 'rectorat') {
    const circo = prof?.circonscription_id || null;
    if (!circo) return noScope('institutional_scope_unprovable');
    return { scope: SCOPE_CIRCONSCRIPTION, reason: 'circonscription', role, circonscriptionId: circo, classIds: [], studentIds: [] };
  }

  if (role === 'teacher') {
    if (!userEmail) return noScope('teacher_email_missing');
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id')
        .eq('teacher_email', userEmail);
      if (error) return noScope('verification_error');
      const classIds = (data || []).map((c) => String(c.id));
      if (!classIds.length) return noScope('teacher_without_class');
      return { scope: SCOPE_CLASSES, reason: 'teacher_classes', role, circonscriptionId: null, classIds, studentIds: [] };
    } catch {
      return noScope('verification_error');
    }
  }

  // Compte élève : uniquement sa propre fiche, prouvée par un mapping actif.
  const studentIds = await resolveOwnStudentIds({ supabase, userId });
  if (studentIds === null) return noScope('verification_error');
  if (studentIds.length) {
    return { scope: SCOPE_SELF, reason: 'student_self', role, circonscriptionId: null, classIds: [], studentIds };
  }

  return noScope('no_school_scope');
}

/**
 * Fiches élèves possédées par le porteur du JWT. Seul `user_student_mapping`
 * actif fait foi (revue CTO). L'email et le code d'accès ne sont jamais une
 * preuve : un compte ne peut pas s'attribuer une fiche en choisissant son
 * adresse.
 * @returns {Promise<string[]|null>} null = erreur de vérification (fail closed)
 */
async function resolveOwnStudentIds({ supabase, userId }) {
  if (!supabase || !isTrustedUserId(userId)) return null;
  try {
    const { data, error } = await supabase
      .from('user_student_mapping')
      .select('student_id')
      .eq('user_id', userId)
      .eq('active', true);
    if (error) return null;
    const ids = new Set();
    (data || []).forEach((m) => { if (m?.student_id) ids.add(String(m.student_id)); });
    return [...ids];
  } catch {
    return null;
  }
}

/**
 * Primitive unique de rattachement compte → fiche élève, utilisée par
 * `resolveEntitlement()`, `/me` et `/usage/can-start` pour qu'une seule règle
 * existe côté serveur.
 * @returns {Promise<{ok:boolean, student:object|null, reason:string}>}
 *          ok=false → erreur de vérification, l'appelant doit fermer l'accès.
 */
async function resolveLinkedStudent({ supabase, userId }) {
  const ids = await resolveOwnStudentIds({ supabase, userId });
  if (ids === null) return { ok: false, student: null, reason: 'verification_error' };
  if (!ids.length) return { ok: true, student: null, reason: 'no_student_mapping' };

  for (const studentId of ids) {
    let row = null;
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, full_name, first_name, last_name, avatar_url, licensed, class_id, school_id')
        .eq('id', studentId)
        .maybeSingle();
      if (error) return { ok: false, student: null, reason: 'verification_error' };
      row = data || null;
    } catch {
      return { ok: false, student: null, reason: 'verification_error' };
    }
    if (row?.licensed) return { ok: true, student: row, reason: 'student_licensed' };
    if (row && !row.licensed) return { ok: true, student: row, reason: 'student_not_licensed' };
  }
  return { ok: true, student: null, reason: 'student_record_missing' };
}

/** Accès en lecture à une classe. */
async function canAccessClass({ supabase, scope, classId }) {
  if (!scope || scope.scope === SCOPE_NONE) return { allowed: false, reason: scope?.reason || 'no_scope' };
  if (scope.scope === SCOPE_GLOBAL) return { allowed: true, reason: 'admin' };
  const id = String(classId || '').trim();
  if (!id) return { allowed: false, reason: 'missing_class_id' };

  if (scope.scope === SCOPE_CLASSES) {
    return scope.classIds.includes(id)
      ? { allowed: true, reason: 'teacher_class' }
      : { allowed: false, reason: 'class_not_owned' };
  }

  if (scope.scope === SCOPE_CIRCONSCRIPTION) {
    if (!supabase) return { allowed: false, reason: 'verification_unavailable' };
    try {
      const { data: cls, error } = await supabase
        .from('classes')
        .select('id, school_id')
        .eq('id', id)
        .maybeSingle();
      if (error) return { allowed: false, reason: 'verification_error' };
      if (!cls?.school_id) return { allowed: false, reason: 'class_without_school' };
      const { data: school, error: sErr } = await supabase
        .from('schools')
        .select('id, circonscription_id')
        .eq('id', cls.school_id)
        .maybeSingle();
      if (sErr) return { allowed: false, reason: 'verification_error' };
      return school?.circonscription_id && school.circonscription_id === scope.circonscriptionId
        ? { allowed: true, reason: 'circonscription_match' }
        : { allowed: false, reason: 'class_outside_circonscription' };
    } catch {
      return { allowed: false, reason: 'verification_error' };
    }
  }

  // SCOPE_SELF : un élève ne lit pas les données de sa classe entière.
  return { allowed: false, reason: 'class_forbidden_for_role' };
}

/** Accès en lecture à un élève. */
async function canAccessStudent({ supabase, scope, studentId }) {
  if (!scope || scope.scope === SCOPE_NONE) return { allowed: false, reason: scope?.reason || 'no_scope' };
  if (scope.scope === SCOPE_GLOBAL) return { allowed: true, reason: 'admin' };
  const id = String(studentId || '').trim();
  if (!id) return { allowed: false, reason: 'missing_student_id' };

  if (scope.scope === SCOPE_SELF) {
    return scope.studentIds.includes(id)
      ? { allowed: true, reason: 'own_student_record' }
      : { allowed: false, reason: 'student_not_self' };
  }

  if (!supabase) return { allowed: false, reason: 'verification_unavailable' };
  let student = null;
  try {
    const { data, error } = await supabase
      .from('students')
      .select('id, class_id, school_id, circonscription_id')
      .eq('id', id)
      .maybeSingle();
    if (error) return { allowed: false, reason: 'verification_error' };
    student = data || null;
  } catch {
    return { allowed: false, reason: 'verification_error' };
  }
  if (!student) return { allowed: false, reason: 'student_not_found' };

  if (scope.scope === SCOPE_CLASSES) {
    return student.class_id && scope.classIds.includes(String(student.class_id))
      ? { allowed: true, reason: 'teacher_class' }
      : { allowed: false, reason: 'student_outside_teacher_classes' };
  }

  if (scope.scope === SCOPE_CIRCONSCRIPTION) {
    if (student.circonscription_id && student.circonscription_id === scope.circonscriptionId) {
      return { allowed: true, reason: 'circonscription_match' };
    }
    if (!student.school_id) return { allowed: false, reason: 'student_without_school' };
    try {
      const { data: school, error } = await supabase
        .from('schools')
        .select('id, circonscription_id')
        .eq('id', student.school_id)
        .maybeSingle();
      if (error) return { allowed: false, reason: 'verification_error' };
      return school?.circonscription_id && school.circonscription_id === scope.circonscriptionId
        ? { allowed: true, reason: 'circonscription_match' }
        : { allowed: false, reason: 'student_outside_circonscription' };
    } catch {
      return { allowed: false, reason: 'verification_error' };
    }
  }

  return { allowed: false, reason: 'student_forbidden_for_role' };
}

module.exports = {
  resolveSchoolScope,
  resolveOwnStudentIds,
  resolveLinkedStudent,
  canAccessClass,
  canAccessStudent,
  isTrustedUserId,
  SCOPE_GLOBAL,
  SCOPE_CIRCONSCRIPTION,
  SCOPE_CLASSES,
  SCOPE_SELF,
  SCOPE_NONE,
  STUDENT_EMAIL_DOMAIN,
};
