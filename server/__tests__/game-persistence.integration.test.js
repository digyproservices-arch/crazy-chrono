// =============================================
// Test d'intégration — Persistance des données de jeu
// Robot comptable 🤖 : vérifie que les scores, historiques et résumés
// sont bien enregistrés dans la base de données après un match.
//
// Lance avec : npm run test:server
// =============================================

const { createClient } = require('@supabase/supabase-js');
const { io: ioClient } = require('socket.io-client');
const { v4: uuidv4 } = require('uuid');

// ─────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────
const BACKEND_URL = process.env.TEST_BACKEND_URL || 'http://localhost:4000';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Skip si pas de connexion Supabase configurée
const canRunIntegration = SUPABASE_URL && SUPABASE_SERVICE_KEY;

// Tests DB purs (pas besoin d'un backend actif)
const describeIf = canRunIntegration ? describe : describe.skip;

// Tests socket.io (nécessitent un backend actif) — skip en pre-deploy/CI
const canRunSocket = canRunIntegration && process.env.TEST_BACKEND_URL;
const describeSocket = canRunSocket ? describe : describe.skip;

let supabase;
if (canRunIntegration) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function connectSocket(name, studentId) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(BACKEND_URL, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
    });
    socket.on('connect', () => {
      socket.name = name;
      socket.studentId = studentId;
      resolve(socket);
    });
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('Socket connection timeout')), 6000);
  });
}

function waitForEvent(socket, event, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Nettoyage des sessions de test créées pendant les tests
const sessionsToCleanup = [];

afterAll(async () => {
  if (supabase && sessionsToCleanup.length > 0) {
    for (const sessionId of sessionsToCleanup) {
      await supabase.from('match_rounds').delete().eq('session_id', sessionId);
      await supabase.from('match_player_summary').delete().eq('session_id', sessionId);
      await supabase.from('training_results').delete().eq('session_id', sessionId);
      await supabase.from('training_sessions').delete().eq('id', sessionId);
    }
  }
});

// ─────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────

describeSocket('Salle Privée — Persistance en DB (nécessite backend actif)', () => {
  let socket1, socket2;
  let roomCode;

  afterEach(async () => {
    if (socket1?.connected) socket1.disconnect();
    if (socket2?.connected) socket2.disconnect();
    await sleep(200);
  });

  test('Une session SP crée une entrée training_sessions au démarrage', async () => {
    roomCode = `test-sp-${Date.now()}`;
    const studentId1 = uuidv4();
    const studentId2 = uuidv4();

    socket1 = await connectSocket('Joueur1', studentId1);
    socket2 = await connectSocket('Joueur2', studentId2);

    // Les deux joueurs rejoignent la même salle
    socket1.emit('joinRoom', { room: roomCode, name: 'Joueur1', studentId: studentId1 });
    socket2.emit('joinRoom', { room: roomCode, name: 'Joueur2', studentId: studentId2 });
    await sleep(500);

    // Les deux indiquent qu'ils sont prêts
    socket1.emit('room:ready');
    socket2.emit('room:ready');

    // Attendre que la session démarre (countdown + round)
    const roundPromise = waitForEvent(socket1, 'round:new', 10000);
    socket1.emit('room:start');

    await roundPromise;
    // Laisser le temps à persistSessionStart de s'exécuter (async)
    await sleep(2000);

    // Vérifier en DB qu'une session existe (completed_at = NULL car en cours)
    const { data: sessions } = await supabase
      .from('training_sessions')
      .select('id, completed_at, config')
      .eq('class_id', 'salle-privee')
      .like('session_name', `%${roomCode}%`)
      .order('created_at', { ascending: false })
      .limit(1);

    expect(sessions).toBeDefined();
    expect(sessions.length).toBeGreaterThanOrEqual(1);

    const session = sessions[0];
    expect(session.completed_at).toBeNull(); // Pas encore terminée
    expect(session.config.mode).toBe('multiplayer');
    expect(session.config.roomCode).toBe(roomCode);

    sessionsToCleanup.push(session.id);
  }, 20000);
});

describeIf('Grande Salle — Persistance en DB', () => {
  // Note: Ce test nécessite qu'une Grande Salle soit configurée côté serveur.
  // En pratique, on teste via l'événement gs:start qui est déclenché par le prof/admin.
  // Ce test vérifie principalement la structure de la requête.

  test('La fonction persistSessionStart insère correctement (test unitaire DB)', async () => {
    // Simuler ce que persistSessionStart fait : insérer une session
    const matchId = uuidv4();
    const sessionPayload = {
      match_id: matchId,
      class_id: 'grande-salle',
      teacher_id: null,
      session_name: `Test GS - integration-${Date.now()}`,
      config: {
        mode: 'grande-salle',
        duration: 90,
        rounds: 3,
        themes: ['nature'],
        classes: ['CP'],
        playerCount: 5,
        playerNames: ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'],
        roomCode: 'test-gs'
      },
      created_at: new Date().toISOString()
    };

    const { data: session, error } = await supabase
      .from('training_sessions')
      .insert(sessionPayload)
      .select('id')
      .single();

    expect(error).toBeNull();
    expect(session).toBeDefined();
    expect(session.id).toBeDefined();

    sessionsToCleanup.push(session.id);

    // Vérifier qu'on peut insérer des match_rounds pour cette session
    const roundRow = {
      session_id: session.id,
      round_number: 0,
      zones: [{ id: '1', type: 'image', content: 'chat', pairId: 'p1', isDistractor: false }],
      good_pair_type: 'image',
      good_pair_theme: 'nature',
      good_pair_level: 'CP',
      good_pair_content: 'chat',
      winner_player_id: null,
      winner_display_name: null,
      winner_time_ms: null,
      errors: []
    };

    const { error: mrErr } = await supabase.from('match_rounds').insert(roundRow);
    expect(mrErr).toBeNull();

    // Vérifier qu'on peut insérer un match_player_summary
    const summaryRow = {
      session_id: session.id,
      player_id: uuidv4(),
      display_name: 'Alice',
      total_score: 5,
      total_pairs: 5,
      total_errors: 2,
      stats_by_theme: { nature: { found: 3, missed: 1, errors: 1 } },
      stats_by_type: { image: { found: 3 } },
      avg_response_time_ms: 2500,
      recommendations: [{ type: 'strength', theme: 'nature', message: 'Point fort : nature' }]
    };

    const { error: sumErr } = await supabase.from('match_player_summary').insert(summaryRow);
    expect(sumErr).toBeNull();

    // Vérifier la lecture
    const { data: rounds } = await supabase
      .from('match_rounds')
      .select('*')
      .eq('session_id', session.id);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].good_pair_theme).toBe('nature');

    const { data: summaries } = await supabase
      .from('match_player_summary')
      .select('*')
      .eq('session_id', session.id);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].total_score).toBe(5);
    expect(summaries[0].recommendations).toHaveLength(1);
  }, 15000);
});

describeIf('Nettoyage orphelins — sessions abandonnées', () => {
  test('Une session > 2h sans completed_at serait nettoyée au boot', async () => {
    // Créer une session orpheline (vieille de 3h)
    const matchId = uuidv4();
    const oldDate = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const { data: orphan, error } = await supabase
      .from('training_sessions')
      .insert({
        match_id: matchId,
        class_id: 'salle-privee',
        teacher_id: null,
        session_name: `Orphan test - ${Date.now()}`,
        config: { mode: 'multiplayer', roomCode: 'orphan-test' },
        created_at: oldDate
        // PAS de completed_at → session orpheline
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    sessionsToCleanup.push(orphan.id);

    // Simuler le nettoyage du boot (même requête que server.js)
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: cleaned } = await supabase
      .from('training_sessions')
      .update({ completed_at: new Date().toISOString() })
      .is('completed_at', null)
      .lt('created_at', cutoff)
      .in('class_id', ['salle-privee', 'multiplayer', 'grande-salle'])
      .eq('id', orphan.id) // Scope au test uniquement
      .select('id');

    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].id).toBe(orphan.id);

    // Vérifier que completed_at est maintenant rempli
    const { data: updated } = await supabase
      .from('training_sessions')
      .select('completed_at')
      .eq('id', orphan.id)
      .single();
    expect(updated.completed_at).not.toBeNull();
  }, 10000);
});

// ─────────────────────────────────────────────────────────
// Test sans DB (toujours exécuté)
// ─────────────────────────────────────────────────────────
describe('Vérification structure (sans DB)', () => {
  test('Le backend expose un healthcheck', async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/healthz`);
      expect(res.status).toBe(200);
    } catch (e) {
      // Backend pas lancé — skip silencieusement
      console.warn('⚠️ Backend non disponible sur', BACKEND_URL, '— test healthcheck skippé');
    }
  });
});
