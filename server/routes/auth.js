// ==========================================
// ROUTES AUTH - Gestion authentification et licences
// ==========================================

const express = require('express');
const router = express.Router();

/**
 * GET /api/auth/me
 * Récupère les informations complètes de l'utilisateur connecté
 * incluant son student_id et sa licence
 */
router.get('/me', async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin;
    if (!supabase) {
      return res.status(500).json({ ok: false, error: 'supabase_not_configured' });
    }

    // Récupérer le token depuis Authorization header
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'missing_token' });
    }

    const token = authHeader.slice(7).trim();

    // Vérifier le token
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return res.status(401).json({ ok: false, error: 'invalid_token' });
    }

    // Récupérer le profil utilisateur
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    // Récupérer la liaison student_id
    const { data: mapping, error: mappingError } = await supabase
      .from('user_student_mapping')
      .select(`
        student_id,
        active,
        linked_at,
        students (
          id,
          first_name,
          last_name,
          full_name,
          level,
          class_id,
          school_id,
          licensed,
          avatar_url
        )
      `)
      .eq('user_id', user.id)
      .eq('active', true)
      .single();

    // Vérifier la licence via la vue user_licenses
    const { data: licenseData, error: licenseError } = await supabase
      .from('user_licenses')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Construire la réponse
    const response = {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: profile?.first_name || user.user_metadata?.name || user.email?.split('@')[0],
        firstName: profile?.first_name,
        lastName: profile?.last_name,
        role: profile?.role || 'user',
        createdAt: user.created_at
      },
      student: mapping && !mappingError ? {
        id: mapping.student_id,
        firstName: mapping.students?.first_name,
        lastName: mapping.students?.last_name,
        fullName: mapping.students?.full_name,
        level: mapping.students?.level,
        classId: mapping.students?.class_id,
        schoolId: mapping.students?.school_id,
        licensed: mapping.students?.licensed,
        avatarUrl: mapping.students?.avatar_url,
        linkedAt: mapping.linked_at
      } : null,
      license: licenseData && !licenseError ? {
        hasActiveLicense: licenseData.has_active_license,
        licenseType: licenseData.license_type,
        licenseStatus: licenseData.license_status,
        validUntil: licenseData.valid_until
      } : null
    };

    return res.json(response);

  } catch (error) {
    console.error('[Auth] Error in /me:', error);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/**
 * GET /api/auth/check-license
 * Vérifie si l'utilisateur a une licence active
 */
router.get('/check-license', async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin;
    if (!supabase) {
      return res.status(500).json({ ok: false, error: 'supabase_not_configured' });
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'missing_token' });
    }

    const token = authHeader.slice(7).trim();

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return res.status(401).json({ ok: false, error: 'invalid_token' });
    }

    // Appeler la fonction SQL check_user_can_play
    const { data, error } = await supabase.rpc('check_user_can_play', {
      p_user_id: user.id
    });

    if (error) {
      console.error('[Auth] Error checking license:', error);
      return res.status(500).json({ ok: false, error: 'check_failed' });
    }

    const result = data && data.length > 0 ? data[0] : null;

    return res.json({
      ok: true,
      canPlay: result?.can_play || false,
      studentId: result?.student_id || null,
      reason: result?.reason || 'Unknown'
    });

  } catch (error) {
    console.error('[Auth] Error in /check-license:', error);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/**
 * POST /api/auth/link-student
 * Lier un compte utilisateur à un élève (admin seulement)
 */
router.post('/link-student', async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin;
    if (!supabase) {
      return res.status(500).json({ ok: false, error: 'supabase_not_configured' });
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'missing_token' });
    }

    const token = authHeader.slice(7).trim();

    // Vérifier que l'utilisateur est admin
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return res.status(401).json({ ok: false, error: 'invalid_token' });
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    // Récupérer les paramètres
    const { userEmail, studentId } = req.body;

    if (!userEmail || !studentId) {
      return res.status(400).json({ ok: false, error: 'missing_parameters' });
    }

    // Appeler la fonction SQL link_user_to_student
    const { data, error } = await supabase.rpc('link_user_to_student', {
      p_user_email: userEmail,
      p_student_id: studentId,
      p_admin_email: user.email
    });

    if (error) {
      console.error('[Auth] Error linking user to student:', error);
      return res.status(500).json({ ok: false, error: 'link_failed' });
    }

    return res.json(data);

  } catch (error) {
    console.error('[Auth] Error in /link-student:', error);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/**
 * GET /api/auth/teacher-class
 * Récupère la classe d'un professeur connecté
 */
router.get('/teacher-class', async (req, res) => {
  try {
    const supabase = req.app.locals.supabaseAdmin;
    if (!supabase) {
      return res.status(500).json({ ok: false, error: 'supabase_not_configured' });
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'missing_token' });
    }

    const token = authHeader.slice(7).trim();

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return res.status(401).json({ ok: false, error: 'invalid_token' });
    }

    // Chercher classe avec teacher_email
    const { data: classes, error: classError } = await supabase
      .from('classes')
      .select(`
        id,
        name,
        level,
        school_id,
        teacher_name,
        teacher_email,
        student_count,
        schools (
          id,
          name,
          city
        )
      `)
      .eq('teacher_email', user.email)
      .limit(1);

    if (classError) {
      console.error('[Auth] Error fetching teacher class:', classError);
      return res.status(500).json({ ok: false, error: 'fetch_failed' });
    }

    if (!classes || classes.length === 0) {
      return res.json({ ok: true, class: null, message: 'no_class_found' });
    }

    return res.json({
      ok: true,
      class: classes[0]
    });

  } catch (error) {
    console.error('[Auth] Error in /teacher-class:', error);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

module.exports = router;
