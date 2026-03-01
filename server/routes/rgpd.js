// ==========================================
// ROUTES RGPD — Droits des utilisateurs (GDPR)
// - Export des données personnelles (Art. 15 & 20)
// - Suppression du compte (Art. 17 — Droit à l'oubli)
// ==========================================

const express = require('express');
const router = express.Router();

/**
 * Helper: authenticate user from Bearer token
 */
async function authenticateUser(req) {
  const supabase = req.app.locals.supabaseAdmin;
  if (!supabase) throw Object.assign(new Error('supabase_not_configured'), { status: 503 });

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw Object.assign(new Error('missing_token'), { status: 401 });
  }

  const token = authHeader.slice(7).trim();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    throw Object.assign(new Error('invalid_token'), { status: 401 });
  }

  return { supabase, user };
}

/**
 * Helper: get student_id linked to this user (if any)
 */
async function getLinkedStudentId(supabase, userId) {
  try {
    const { data } = await supabase
      .from('user_student_mapping')
      .select('student_id')
      .eq('user_id', userId)
      .eq('active', true)
      .single();
    return data?.student_id || null;
  } catch {
    return null;
  }
}

/**
 * GET /api/rgpd/export-data
 * Exporte toutes les données personnelles de l'utilisateur (Art. 15 & 20 RGPD)
 * Retourne un JSON structuré avec toutes les tables concernées
 */
router.get('/export-data', async (req, res) => {
  try {
    const { supabase, user } = await authenticateUser(req);
    const userId = user.id;

    console.log(`[RGPD] Export data requested by user ${userId}`);

    // 1. Profil utilisateur
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    // 2. Mapping élève
    const { data: mappings } = await supabase
      .from('user_student_mapping')
      .select('student_id, active, linked_at')
      .eq('user_id', userId);

    // 3. Données élève (si lié)
    const studentId = await getLinkedStudentId(supabase, userId);
    let studentData = null;
    if (studentId) {
      const { data } = await supabase
        .from('students')
        .select('id, first_name, last_name, full_name, level, class_id, school_id, licensed, avatar_url, created_at')
        .eq('id', studentId)
        .single();
      studentData = data;
    }

    // 4. Abonnements
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('id, status, plan_id, current_period_start, current_period_end, created_at')
      .eq('user_id', userId);

    // 5. Sessions de jeu
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, mode, classes, themes, duration_seconds, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // 6. Tentatives de jeu
    const { data: attempts } = await supabase
      .from('attempts')
      .select('id, session_id, item_type, item_id, objective_key, correct, latency_ms, level_class, theme, round_index, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // 7. Résultats d'entraînement (via student_id)
    let trainingResults = [];
    if (studentId) {
      const { data } = await supabase
        .from('training_results')
        .select('id, score, pairs_validated, created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });
      trainingResults = data || [];
    }

    const exportData = {
      export_date: new Date().toISOString(),
      user_id: userId,
      account: {
        email: user.email,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      },
      profile: profile || null,
      student_mapping: mappings || [],
      student: studentData,
      subscriptions: subscriptions || [],
      game_sessions: sessions || [],
      game_attempts: attempts || [],
      training_results: trainingResults,
    };

    console.log(`[RGPD] Export completed for user ${userId}: ${JSON.stringify({
      profile: !!profile,
      mappings: (mappings || []).length,
      student: !!studentData,
      subscriptions: (subscriptions || []).length,
      sessions: (sessions || []).length,
      attempts: (attempts || []).length,
      trainingResults: trainingResults.length,
    })}`);

    res.setHeader('Content-Disposition', `attachment; filename="crazy-chrono-data-${userId.slice(0, 8)}.json"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.json({ ok: true, data: exportData });

  } catch (e) {
    const status = e.status || 500;
    console.error(`[RGPD] Export error:`, e.message);
    return res.status(status).json({ ok: false, error: e.message });
  }
});

/**
 * DELETE /api/rgpd/delete-account
 * Supprime toutes les données personnelles et le compte (Art. 17 RGPD — Droit à l'oubli)
 * Supprime dans l'ordre: attempts → sessions → training_results → subscriptions →
 * user_student_mapping → user_profiles → Supabase Auth user
 */
router.delete('/delete-account', async (req, res) => {
  try {
    const { supabase, user } = await authenticateUser(req);
    const userId = user.id;

    console.log(`[RGPD] ⚠️ Account deletion requested by user ${userId} (${user.email})`);

    // 0. Block deletion for school-linked students
    const studentId = await getLinkedStudentId(supabase, userId);
    if (studentId) {
      try {
        const { data: student } = await supabase
          .from('students')
          .select('school_id, class_id')
          .eq('id', studentId)
          .single();
        if (student && student.school_id) {
          console.log(`[RGPD] ❌ Deletion blocked: user ${userId} is school student (school=${student.school_id}, class=${student.class_id})`);
          return res.status(403).json({
            ok: false,
            error: 'school_student',
            message: 'Votre compte est géré par votre établissement scolaire. Contactez votre professeur ou l\'administrateur de l\'école pour toute demande de suppression de données.',
          });
        }
      } catch {}
    }

    const deletionLog = [];
    deletionLog.push({ step: 'resolve_student', studentId });

    // 2. Delete game attempts
    try {
      const { count } = await supabase
        .from('attempts')
        .delete({ count: 'exact' })
        .eq('user_id', userId);
      deletionLog.push({ step: 'attempts', deleted: count || 0 });
    } catch (e) { deletionLog.push({ step: 'attempts', error: e.message }); }

    // 3. Delete game sessions
    try {
      const { count } = await supabase
        .from('sessions')
        .delete({ count: 'exact' })
        .eq('user_id', userId);
      deletionLog.push({ step: 'sessions', deleted: count || 0 });
    } catch (e) { deletionLog.push({ step: 'sessions', error: e.message }); }

    // 4. Delete training results (via student_id)
    if (studentId) {
      try {
        const { count } = await supabase
          .from('training_results')
          .delete({ count: 'exact' })
          .eq('student_id', studentId);
        deletionLog.push({ step: 'training_results', deleted: count || 0 });
      } catch (e) { deletionLog.push({ step: 'training_results', error: e.message }); }
    }

    // 5. Delete subscriptions
    try {
      const { count } = await supabase
        .from('subscriptions')
        .delete({ count: 'exact' })
        .eq('user_id', userId);
      deletionLog.push({ step: 'subscriptions', deleted: count || 0 });
    } catch (e) { deletionLog.push({ step: 'subscriptions', error: e.message }); }

    // 6. Delete user-student mapping
    try {
      const { count } = await supabase
        .from('user_student_mapping')
        .delete({ count: 'exact' })
        .eq('user_id', userId);
      deletionLog.push({ step: 'user_student_mapping', deleted: count || 0 });
    } catch (e) { deletionLog.push({ step: 'user_student_mapping', error: e.message }); }

    // 7. Delete user profile
    try {
      const { count } = await supabase
        .from('user_profiles')
        .delete({ count: 'exact' })
        .eq('id', userId);
      deletionLog.push({ step: 'user_profiles', deleted: count || 0 });
    } catch (e) { deletionLog.push({ step: 'user_profiles', error: e.message }); }

    // 8. Delete Supabase Auth user (last — irreversible)
    try {
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
      if (authDeleteError) throw authDeleteError;
      deletionLog.push({ step: 'auth_user', deleted: 1 });
    } catch (e) { deletionLog.push({ step: 'auth_user', error: e.message }); }

    console.log(`[RGPD] ✅ Account deletion completed for user ${userId}:`, JSON.stringify(deletionLog));

    return res.json({
      ok: true,
      message: 'Votre compte et toutes vos données personnelles ont été supprimés.',
      deletion_log: deletionLog,
    });

  } catch (e) {
    const status = e.status || 500;
    console.error(`[RGPD] Delete error:`, e.message);
    return res.status(status).json({ ok: false, error: e.message });
  }
});

module.exports = router;
