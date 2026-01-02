const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  console.log('[Notifications Routes] Supabase connected');
} else {
  console.warn('[Notifications Routes] Supabase not configured');
}

const requireSupabase = (req, res, next) => {
  if (!supabase) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }
  next();
};

router.post('/qualification', requireSupabase, async (req, res) => {
  try {
    const { studentId, tournamentId, currentPhase, nextPhase, nextPhaseName, message } = req.body;
    
    const { data: student } = await supabase
      .from('students')
      .select('full_name, first_name')
      .eq('id', studentId)
      .single();
    
    const { data: mapping } = await supabase
      .from('user_student_mapping')
      .select('user_id')
      .eq('student_id', studentId)
      .eq('active', true)
      .single();
    
    if (!mapping) {
      console.log(`[Notifications] Pas de mapping user pour student ${studentId}`);
      return res.json({ success: true, message: 'Aucun email trouvé' });
    }
    
    const { data: { user } } = await supabase.auth.admin.getUserById(mapping.user_id);
    
    if (!user || !user.email) {
      console.log(`[Notifications] Pas d'email pour user ${mapping.user_id}`);
      return res.json({ success: true, message: 'Aucun email trouvé' });
    }
    
    console.log(`[Notifications] Qualification ${student?.full_name || studentId} -> ${nextPhaseName}`);
    console.log(`[Notifications] Email: ${user.email}`);
    
    res.json({ 
      success: true, 
      message: 'Notification qualification enregistrée',
      recipient: user.email
    });
  } catch (error) {
    console.error('[Notifications API] Error sending qualification:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
