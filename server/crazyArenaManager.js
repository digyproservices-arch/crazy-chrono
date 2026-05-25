// ==========================================
// CRAZY ARENA MANAGER - Socket.IO
// Gestion des matchs 4 joueurs en temps réel
// ==========================================

// NOTE: TrainingMode/TournamentMode sont des classes alternatives complètes
// qui étendent BattleRoyaleEngine. Elles ne peuvent pas être instanciées
// depuis crazyArenaManager car elles nécessitent tout le contexte du match.
// TODO: Créer helpers de sauvegarde séparés si besoin de logique spécialisée

const logger = require('./logger');
const { v4: uuidv4 } = require('uuid');
const sTrace = require('./utils/serverTraceBuffer');
const { validateZonesServer } = require('./utils/validateZonesServer');
const fs = require('fs');
const path = require('path');

// Cache associations.json pour lookup thème réel des items
let _assocCache = null;
function _getAssocData() {
  if (_assocCache) return _assocCache;
  try {
    const p = path.join(__dirname, '..', 'public', 'data', 'associations.json');
    _assocCache = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch { _assocCache = {}; }
  return _assocCache;
}

// Mapping complet thème code → label lisible (aligné avec Carte.js)
const THEME_DISPLAY_FULL = {
  'botanique': 'Plantes médicinales', 'domain:botany': 'Plantes médicinales',
  'animaux': 'Animaux', 'domain:zoology': 'Animaux',
  'multiplication': 'Tables de multiplication', 'domain:math': 'Mathématiques',
  'geographie': 'Géographie',
  'fruits': 'Fruits', 'category:fruit': 'Fruits',
  'category:epice': 'Épices', 'category:fleur': 'Fleurs',
  'category:legumineuse': 'Légumineuses', 'category:legume': 'Légumes', 'category:plante_aromatique': 'Plantes aromatiques',
  'category:plante_medicinale': 'Plantes médicinales', 'category:tubercule': 'Tubercules',
  'category:oiseau': 'Oiseaux', 'category:mammifere': 'Mammifères', 'category:reptile': 'Reptiles',
  'category:poisson': 'Poissons', 'category:crustace': 'Crustacés', 'category:corail': 'Coraux', 'category:mollusque': 'Mollusques',
  'category:addition': 'Additions', 'category:soustraction': 'Soustractions',
  'category:division': 'Divisions', 'category:fraction': 'Fractions',
  'category:equation': 'Équations', 'category:numeration': 'Numération',
  'category:multiplication_avancee': 'Multiplications avancées'
};
function _themeLabel(code) {
  if (!code) return '';
  const c = String(code).toLowerCase().trim();
  if (THEME_DISPLAY_FULL[c]) return THEME_DISPLAY_FULL[c];
  // Auto-label: category:poisson → Poisson, domain:music → Music
  const stripped = c.replace(/^(category|domain|region):/, '');
  return stripped.replace(/_/g, ' ').replace(/^./, s => s.toUpperCase());
}
// Trouver le meilleur thème lisible dans un tableau de tags
// PRIORITÉ: category: (précis) > domain: (large) > autre tag connu
function _bestTheme(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  // 1) N'importe quel category: (toujours le plus précis)
  const cat = tags.find(t => String(t).startsWith('category:'));
  if (cat) return _themeLabel(cat);
  // 2) domain:
  const dom = tags.find(t => String(t).startsWith('domain:'));
  if (dom) return _themeLabel(dom);
  // 3) Autre tag non-region
  const nonRegion = tags.find(t => !String(t).startsWith('region:'));
  return nonRegion ? _themeLabel(nonRegion) : '';
}

// Fenêtre d'égalité Arena (ms): si 2 joueurs cliquent la même paire dans cet intervalle,
// les deux marquent le point. Au-delà, seul le premier marque.
const ARENA_TIE_WINDOW_MS = 200;

// ── Bridge monitoring: sauvegarder chaque round Arena dans arena_round_logs.json ──
const ARENA_ROUNDS_FILE = path.join(__dirname, 'data', 'arena_round_logs.json');
function _logArenaRound(roundData) {
  // ✅ Persister dans Supabase via Winston (survit aux redéploiements Render)
  logger.info('[ArenaRoundLog] Round logged', {
    roundId: roundData.id,
    mode: roundData.mode,
    source: roundData.source,
    matchId: roundData.matchId,
    roundIndex: roundData.roundIndex,
    totalZones: roundData.totalZones,
    pairZones: roundData.pairZones,
    validPairs: roundData.validPairs,
    doublePairIssues: roundData.doublePairIssues,
    issues: roundData.issues,
    pairDetails: roundData.pairDetails,
    zonesSnapshot: roundData.zonesSnapshot
  });
  
  // JSON file backup (éphémère mais utile si serveur stable)
  try {
    const dir = path.dirname(ARENA_ROUNDS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let existing = [];
    try { if (fs.existsSync(ARENA_ROUNDS_FILE)) existing = JSON.parse(fs.readFileSync(ARENA_ROUNDS_FILE, 'utf8')); } catch {}
    existing.push({ ...roundData, receivedAt: new Date().toISOString() });
    if (existing.length > 200) existing = existing.slice(-200);
    fs.writeFileSync(ARENA_ROUNDS_FILE, JSON.stringify(existing, null, 2), 'utf8');
  } catch (e) {
    logger.warn('[ArenaRoundLog] JSON file save failed:', e.message);
  }
}

// ── Match Events: journal centralisé de TOUS les événements de match ──
const MATCH_EVENTS_FILE = path.join(__dirname, 'data', 'match_events.json');
const MAX_MATCH_EVENTS = 2000;
function _logMatchEvent(eventType, matchId, data = {}) {
  const event = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: eventType,
    matchId: matchId || 'unknown',
    timestamp: new Date().toISOString(),
    ...data
  };
  // Winston persistent (Supabase)
  logger.info(`[MatchEvent][${eventType}]`, event);
  // Buffer for MonitoringDashboard report
  sTrace.push(`match:${eventType}`, { matchId: matchId || 'unknown', mode: data.mode || 'arena', ...data });
  // JSON file backup (survit aux crashes, lisible dans monitoring)
  try {
    const dir = path.dirname(MATCH_EVENTS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let existing = [];
    try { if (fs.existsSync(MATCH_EVENTS_FILE)) existing = JSON.parse(fs.readFileSync(MATCH_EVENTS_FILE, 'utf8')); } catch {}
    existing.push(event);
    if (existing.length > MAX_MATCH_EVENTS) existing = existing.slice(-MAX_MATCH_EVENTS);
    fs.writeFileSync(MATCH_EVENTS_FILE, JSON.stringify(existing, null, 2), 'utf8');
  } catch (e) {
    logger.warn('[MatchEventLog] File save failed:', e.message);
  }
  return event;
}

class CrazyArenaManager {
  constructor(io, supabase = null) {
    this.io = io;
    this.supabase = supabase;
    this.matches = new Map(); // matchId -> { players, status, scores, zones, config }
    this.playerMatches = new Map(); // socketId -> matchId
  }

  /**
   * Charger un match depuis Supabase (en cas de redémarrage du backend)
   */
  async loadMatchFromDatabase(matchId) {
    if (!this.supabase) {
      logger.warn('[CrazyArena] Supabase non configuré, impossible de récupérer le match');
      return null;
    }

    try {
      const { data, error } = await this.supabase
        .from('tournament_matches')
        .select('*')
        .eq('id', matchId)
        .in('status', ['pending', 'in_progress'])
        .single();

      if (error || !data) {
        logger.info(`[CrazyArena] Match ${matchId} non trouvé en base:`, error?.message);
        return null;
      }

      // Recréer le match en RAM
      const config = typeof data.config === 'string' ? JSON.parse(data.config) : data.config;
      this.createMatch(matchId, data.room_code, config);
      
      // Si le match était in_progress en DB, marquer pour auto-reprise quand les joueurs se reconnectent
      const match = this.matches.get(matchId);
      if (match && data.status === 'in_progress') {
        match.wasInProgress = true;
        logger.info(`[CrazyArena] Match ${matchId} était in_progress en DB, marqué wasInProgress=true pour auto-reprise`);
      }
      
      return match;
    } catch (err) {
      logger.error('[CrazyArena] Erreur chargement match depuis Supabase:', err);
      return null;
    }
  }

  /**
   * Charger un match TRAINING depuis Supabase (en cas de redémarrage du backend)
   * Cherche dans training_sessions par match_id (UUID sans préfixe match_)
   */
  async loadTrainingMatchFromDatabase(matchId) {
    if (!this.supabase) {
      logger.warn('[CrazyArena][Training] Supabase non configuré, impossible de récupérer le match');
      return null;
    }

    try {
      const isValidUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
      const rawUuid = matchId.replace(/^match_/, '');
      if (!isValidUuid(rawUuid)) {
        logger.info(`[CrazyArena][Training] Match ${matchId} - UUID invalide après strip: ${rawUuid}`);
        return null;
      }

      // Chercher session active (completed_at IS NULL)
      const { data: session, error } = await this.supabase
        .from('training_sessions')
        .select('*')
        .eq('match_id', rawUuid)
        .is('completed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        logger.warn('[CrazyArena][Training] Erreur query training_sessions:', error.message);
        return null;
      }
      if (!session) {
        logger.info(`[CrazyArena][Training] Aucune session active trouvée pour match_id=${rawUuid}`);
        return null;
      }

      // Récupérer les résultats (joueurs inscrits)
      const { data: results } = await this.supabase
        .from('training_results')
        .select('student_id, score, pairs_validated, errors')
        .eq('session_id', session.id);

      const config = typeof session.config === 'string' ? JSON.parse(session.config) : (session.config || {});
      const studentIds = (results || []).map(r => r.student_id);

      // Détecter si le jeu était déjà en cours (scores > 0 = game was playing)
      const wasInProgress = (results || []).some(r => (r.score || 0) > 0 || (r.pairs_validated || 0) > 0);
      
      // Restaurer les scores depuis la DB
      const restoredScores = {};
      (results || []).forEach(r => {
        restoredScores[r.student_id] = {
          score: r.score || 0,
          pairsValidated: r.pairs_validated || 0,
          errors: r.errors || 0,
          timeMs: 0
        };
      });

      logger.info(`[CrazyArena][Training] 🔄 Restauration match ${matchId} depuis DB (session ${session.id}, ${studentIds.length} joueurs, wasInProgress=${wasInProgress})`);

      // Recréer le match en mémoire
      this.matches.set(matchId, {
        matchId,
        mode: 'training',
        classId: session.class_id,
        teacherId: session.teacher_id,
        roomCode: matchId,
        config: {
          rounds: config.rounds || 3,
          duration: config.duration || config.durationPerRound || 60,
          classes: Array.isArray(config.classes) ? config.classes : [],
          themes: Array.isArray(config.themes) ? config.themes : [],
          extras: Array.isArray(config.extras) ? config.extras : [],
          level: config.level || config.selectedLevel || null,
          selectedLevel: config.selectedLevel || config.level || null,
          sessionName: config.sessionName || session.session_name || 'Session Entraînement',
          objectiveMode: !!config.objectiveMode,
          objectiveTarget: config.objectiveTarget || null,
          objectiveThemes: config.objectiveThemes || [],
          helpEnabled: !!config.helpEnabled,
          isOfficial: !!config.isOfficial,
        },
        players: [],
        status: 'waiting',
        expectedPlayers: studentIds,
        roundsPlayed: 0,
        scores: restoredScores,
        zones: null,
        startTime: null,
        endTime: null,
        timerInterval: null,
        countdownTimeout: null,
        gameTimeout: null,
        _sessionId: session.id,
        _recoveredFromDB: true,
        _needsGameRestart: wasInProgress
      });

      const match = this.matches.get(matchId);
      logger.info(`[CrazyArena][Training] ✅ Match ${matchId} restauré depuis DB — ${wasInProgress ? '⚡ jeu en cours, redémarrage auto quand joueurs rejoignent' : 'en attente de reconnexion des joueurs'}`);
      return match;
    } catch (err) {
      logger.error('[CrazyArena][Training] Erreur loadTrainingMatchFromDatabase:', err);
      return null;
    }
  }

  /**
   * Créer un match en mode ENTRAÎNEMENT (sans Supabase)
   */
  createTrainingMatch(matchId, studentIds, config, classId, teacherId) {
    logger.info(`[CrazyArena][Training] Création match ${matchId} pour ${studentIds.length} élèves`);
    logger.info(`[CrazyArena][Training] Config reçue:`, { classes: config.classes, themes: config.themes, extras: config.extras, rounds: config.rounds, objectiveMode: config.objectiveMode });
    _logMatchEvent('MATCH_CREATE', matchId, { mode: 'training', playersExpected: studentIds.length, studentIds, classId, teacherId, config: { classes: config.classes, themes: config.themes, rounds: config.rounds, duration: config.duration || config.durationPerRound || 60 } });
    
    this.matches.set(matchId, {
      matchId,
      mode: 'training',
      classId,
      teacherId,
      roomCode: matchId,
      config: {
        rounds: config.rounds || 3,
        duration: config.duration || config.durationPerRound || 60,
        classes: config.classes || ['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e', '5e', '4e', '3e'],
        themes: config.themes || [],
        extras: Array.isArray(config.extras) ? config.extras : [],
        level: config.level || 'CE1',
        sessionName: config.sessionName || 'Session Entraînement',
        objectiveMode: !!config.objectiveMode,
        objectiveTarget: config.objectiveTarget || null,
        objectiveThemes: config.objectiveThemes || [],
        helpEnabled: !!config.helpEnabled,
        isOfficial: !!config.isOfficial,
      },
      players: [],
      status: 'waiting',
      expectedPlayers: studentIds,
      roundsPlayed: 0,
      scores: {},
      zones: null,
      startTime: null,
      endTime: null,
      timerInterval: null,
      countdownTimeout: null,
      gameTimeout: null
    });

    // Notifier chaque élève via Socket.IO (config complète)
    const storedConfig = this.matches.get(matchId).config;
    
    // ✅ LOGS DÉTAILLÉS pour monitoring des invitations
    const connectedSockets = this.io.engine?.clientsCount || 0;
    const connectedPlayers = Array.from(this.playerMatches.entries());
    const alreadyConnected = studentIds.filter(sid => 
      connectedPlayers.some(([socketId, mid]) => {
        const match = this.matches.get(mid);
        if (!match || match.mode !== 'training') return false;
        return match.players?.some(p => p.studentId === sid);
      })
    );
    
    logger.info(`[CrazyArena][Training][INVITE] 📤 ÉMISSION INVITATIONS matchId=${matchId}`);
    logger.info(`[CrazyArena][Training][INVITE]    → ${studentIds.length} élèves ciblés: [${studentIds.join(', ')}]`);
    logger.info(`[CrazyArena][Training][INVITE]    → Sockets connectés globalement: ${connectedSockets}`);
    logger.info(`[CrazyArena][Training][INVITE]    → Élèves déjà connectés à un training: [${alreadyConnected.join(', ') || 'aucun'}]`);
    
    let emittedCount = 0;
    studentIds.forEach(studentId => {
      const eventName = `training:invite:${studentId}`;
      this.io.emit(eventName, {
        matchId,
        sessionName: storedConfig.sessionName,
        groupSize: studentIds.length,
        config: storedConfig
      });
      emittedCount++;
      logger.info(`[CrazyArena][Training][INVITE]    → Émis: ${eventName}`);
    });
    
    logger.info(`[CrazyArena][Training][INVITE] ✅ ${emittedCount} notifications émises via Socket.IO`);
    logger.info(`[CrazyArena][Training] Match ${matchId} créé, en attente de ${studentIds.length} joueurs`);

    // 📊 MONITORING: Tracer l'émission des invitations dans sTrace
    sTrace.push('training:invites-sent', {
      matchId: matchId.slice(-8),
      studentsCount: studentIds.length,
      studentIds: studentIds.map(s => s.slice(-8)),
      socketsConnected: connectedSockets,
      alreadyInTraining: alreadyConnected.map(s => s.slice(-8))
    });

    return this.matches.get(matchId);
  }

  /**
   * Un joueur rejoint un match training (clone de joinMatch pour Training)
   */
  async joinTrainingMatch(socket, matchId, studentData) {
    let match = this.matches.get(matchId);
    
    // Si match non trouvé en mémoire, tenter de restaurer depuis la DB
    if (!match) {
      logger.info(`[CrazyArena][Training] Match ${matchId} non trouvé en mémoire, tentative de restauration depuis DB...`);
      match = await this.loadTrainingMatchFromDatabase(matchId);
    }
    
    if (!match) {
      logger.error(`[CrazyArena][Training] Match ${matchId} introuvable (mémoire + DB)`);
      sTrace.push('training:join-reject', { reason: 'match_not_found', matchId: (matchId || '').slice(-8), studentName: studentData.name, studentId: (studentData.studentId || '').slice(-8), socketId: socket.id.slice(0, 8) });
      socket.emit('training:error', { message: 'Match introuvable' });
      socket.emit('training:match-lost', { reason: 'Match introuvable. Le serveur a peut-être redémarré.' });
      return false;
    }

    // Vérifier si le joueur fait déjà partie du match (reconnexion)
    const existingPlayer = match.players.find(p => p.studentId === studentData.studentId);
    
    if (existingPlayer) {
      // RECONNEXION : Nettoyer l'ancien socket et mettre à jour
      const oldSocketId = existingPlayer.socketId;
      if (oldSocketId && oldSocketId !== socket.id) {
        this.playerMatches.delete(oldSocketId);
      }
      logger.info(`[CrazyArena][Training] ${studentData.name} reconnecté au match ${matchId} (old=${oldSocketId?.slice(-6)}, new=${socket.id.slice(-6)})`);
      _logMatchEvent('PLAYER_RECONNECT', matchId, { mode: 'training', studentId: studentData.studentId, name: studentData.name, matchStatus: match.status });
      sTrace.push('training:reconnect', { matchId: matchId.slice(-8), playerName: studentData.name, studentId: (studentData.studentId || '').slice(-8), socketId: socket.id.slice(0, 8), matchStatus: match.status, wasDisconnected: !!existingPlayer.disconnected });
      existingPlayer.socketId = socket.id;
      existingPlayer.disconnected = false;
      delete existingPlayer.disconnectedAt;
      delete existingPlayer._oldSocketId;
      this.playerMatches.set(socket.id, matchId);
      socket.join(matchId);
      
      // Renvoyer l'état actuel du match
      this.io.to(matchId).emit('training:player-joined', {
        players: match.players.map(p => ({
          studentId: p.studentId,
          name: p.name,
          avatar: p.avatar,
          ready: p.ready
        })),
        count: match.players.length  // ✅ Comme Arena (reconnexion)
      });
      
      // ✅ SYNC: Renvoyer l'état complet du jeu au joueur reconnecté (zones + scores + timer)
      if (match.status === 'playing' || match.status === 'tiebreaker' || match.status === 'paused') {
        const roundsPerMatch = match.config.rounds || match.config.roundsPerMatch || 3;
        const durationPerRound = match.config.duration || match.config.durationPerRound || 60;
        const totalDuration = roundsPerMatch * durationPerRound;
        const elapsed = Math.floor((Date.now() - match.startTime) / 1000);
        const elapsedInRound = elapsed % durationPerRound;
        const timeLeftInRound = Math.max(0, durationPerRound - elapsedInRound);

        // Envoyer les zones actuelles au joueur reconnecté
        if (match.zones && match.zones.length > 0) {
          socket.emit('training:round-new', {
            zones: match.zones,
            roundIndex: match.roundsPlayed,
            totalRounds: roundsPerMatch,
            timestamp: Date.now(),
            _resync: true
          });
          logger.info(`[CrazyArena][Training] 📤 Resync zones envoyé à ${studentData.name}: ${match.zones.length} zones, manche ${match.roundsPlayed + 1}`);
        }

        // Envoyer les scores actuels (tiebreaker-aware)
        const isTB = match.status === 'tiebreaker' || match.status === 'tiebreaker-countdown';
        socket.emit('training:scores-update', {
          scores: match.players.map((p, idx) => ({
            studentId: p.studentId,
            name: p.name,
            avatar: p.avatar,
            playerIdx: idx,
            score: isTB ? (p.scoreBeforeTiebreaker || 0) + (p.tiebreakerScore || 0) : (p.score || 0),
            pairsValidated: isTB ? (p.pairsBeforeTiebreaker || 0) + (p.tiebreakerPairs || 0) : (p.pairsValidated || 0)
          })).sort((a, b) => b.score - a.score)
        });

        // Envoyer le timer actuel
        socket.emit('training:timer-tick', {
          timeLeft: timeLeftInRound,
          elapsed,
          duration: totalDuration,
          currentRound: match.roundsPlayed + 1,
          totalRounds: roundsPerMatch
        });

        logger.info(`[CrazyArena][Training] ✅ État complet renvoyé à ${studentData.name} (zones=${match.zones?.length || 0}, timer=${timeLeftInRound}s)`);
        sTrace.push('training:resync', { matchId: matchId.slice(-8), player: studentData.name, zones: match.zones?.length || 0, timer: timeLeftInRound, round: match.roundsPlayed + 1 });
      }

      // ✅ Si le match était en pause (joueur déconnecté), reprendre automatiquement
      // FIX: Reprendre SEULEMENT si TOUS les joueurs déconnectés sont revenus
      if (match.status === 'paused' && match._pauseState) {
        const stillDisconnected = match.players.filter(p => p.disconnected);
        if (stillDisconnected.length === 0) {
          logger.info(`[CrazyArena][Training] ▶️ Tous les joueurs déconnectés sont revenus → reprise du match`);
          this.resumeMatch(matchId);
        } else {
          logger.info(`[CrazyArena][Training] ⏸️ ${studentData.name} reconnecté mais ${stillDisconnected.length} joueur(s) encore déconnecté(s): ${stillDisconnected.map(p => p.name).join(', ')}`);
        }
      }

      // ✅ AUTO-RESTART sur reconnexion aussi (si dernier joueur attendu)
      if (match._needsGameRestart && match.status === 'waiting' && match.players.length >= match.expectedPlayers.length) {
        logger.info(`[CrazyArena][Training] ⚡ Reconnexion complète pour match restauré ${matchId} — redémarrage automatique !`);
        match._needsGameRestart = false;
        match.status = 'countdown';
        let count = 3;
        const interval = setInterval(() => {
          this.io.to(matchId).emit('training:countdown', { count });
          count--;
          if (count < 0) {
            clearInterval(interval);
            this.startTrainingGame(matchId);
          }
        }, 1000);
      }

      return true;
    }

    // Restaurer le score depuis la DB si match récupéré
    const restoredScore = (match._recoveredFromDB && match.scores[studentData.studentId]) || null;

    const player = {
      socketId: socket.id,
      studentId: studentData.studentId,
      authId: studentData.authId || null,
      name: studentData.name,
      avatar: studentData.avatar || '/avatars/default.png',
      ready: false,
      score: restoredScore ? restoredScore.score : 0,
      pairsValidated: restoredScore ? restoredScore.pairsValidated : 0,
      errors: restoredScore ? restoredScore.errors : 0,
      timeMs: 0
    };

    match.players.push(player);
    this.playerMatches.set(socket.id, matchId);  // ✅ Mapping socket → matchId
    socket.join(matchId);

    logger.info(`[CrazyArena][Training] ${studentData.name} a rejoint le match ${matchId} (${match.players.length}/${match.expectedPlayers.length})${restoredScore ? ` [score restauré: ${restoredScore.score}]` : ''}`);
    _logMatchEvent('PLAYER_JOIN', matchId, { mode: 'training', studentId: studentData.studentId, name: studentData.name, playersCount: match.players.length, expectedCount: match.expectedPlayers.length });

    // Notifier tous les joueurs
    this.io.to(matchId).emit('training:player-joined', {
      players: match.players.map(p => ({
        studentId: p.studentId,
        name: p.name,
        avatar: p.avatar,
        ready: p.ready
      })),
      count: match.players.length  // ✅ Comme Arena
    });
    
    // Notifier le dashboard professeur
    this.io.to(matchId).emit('training:players-update', {
      matchId,
      players: match.players.map(p => ({
        studentId: p.studentId,
        name: p.name,
        avatar: p.avatar,
        ready: p.ready
      }))
    });

    sTrace.push('training:player-joined', {
      matchId: matchId.slice(-8),
      playerName: studentData.name,
      studentId: (studentData.studentId || '').slice(-8),
      socketId: socket.id.slice(0, 8),
      playersCount: match.players.length,
      expectedCount: match.expectedPlayers.length,
      matchStatus: match.status,
      allPlayers: match.players.map(p => ({ name: p.name, sid: p.socketId?.slice(0, 8), ready: p.ready })),
      socketRooms: Array.from(socket.rooms)
    });

    // ✅ AUTO-RESTART: Si le match était en cours avant le redémarrage serveur,
    // relancer automatiquement le jeu quand tous les joueurs attendus ont rejoint
    if (match._needsGameRestart && match.players.length >= match.expectedPlayers.length) {
      logger.info(`[CrazyArena][Training] ⚡ Tous les joueurs ont rejoint le match restauré ${matchId} — redémarrage automatique du jeu !`);
      match._needsGameRestart = false;
      
      // Court countdown (2s) puis démarrage
      match.status = 'countdown';
      let count = 3;
      const interval = setInterval(() => {
        this.io.to(matchId).emit('training:countdown', { count });
        count--;
        if (count < 0) {
          clearInterval(interval);
          logger.info(`[CrazyArena][Training] ⚡ Countdown terminé, redémarrage jeu restauré...`);
          this.startTrainingGame(matchId);
        }
      }, 1000);
    }

    return true;
  }

  /**
   * Récupérer l'état actuel d'un match Training
   */
  getTrainingMatchState(matchId) {
    const match = this.matches.get(matchId);
    if (!match) return null;
    
    return {
      matchId,
      status: match.status,
      players: match.players || [],
      config: match.config
    };
  }

  /**
   * Un joueur training marque comme prêt
   */
  trainingPlayerReady(socket, matchId, studentId) {
    const match = this.matches.get(matchId);
    if (!match) {
      logger.error('[CrazyArena][Training] trainingPlayerReady: Match introuvable', { matchId, studentId });
      sTrace.push('training:ready-fail', { reason: 'match_not_found', matchId: (matchId || '').slice(-8), studentId: (studentId || '').slice(-8), socketId: socket.id.slice(0, 8) });
      return 'match_not_found';
    }

    const player = match.players.find(p => p.studentId === studentId);
    if (!player) {
      logger.warn('[CrazyArena][Training] trainingPlayerReady: Joueur introuvable', { matchId, studentId, playersInMatch: match.players.map(p => ({ name: p.name, studentId: p.studentId?.slice(-8), socketId: p.socketId?.slice(0, 8) })) });
      sTrace.push('training:ready-fail', { reason: 'player_not_found', matchId: (matchId || '').slice(-8), studentId: (studentId || '').slice(-8), socketId: socket.id.slice(0, 8), playersInMatch: match.players.map(p => ({ name: p.name, sid: p.studentId?.slice(-8) })) });
      return 'player_not_found';
    }
    
    player.ready = true;
    
    const readyCount = match.players.filter(p => p.ready).length;
    const totalCount = match.players.length;
    
    logger.info('[CrazyArena][Training] Joueur marqué prêt', { 
      matchId, 
      studentId, 
      readyCount, 
      totalCount,
      allReady: readyCount === totalCount
    });
    
    this.io.to(matchId).emit('training:player-ready', {
      players: match.players.map(p => ({ 
        studentId: p.studentId, 
        name: p.name, 
        avatar: p.avatar,
        ready: p.ready
      }))
    });
    
    // Notifier le dashboard professeur
    this.io.to(matchId).emit('training:players-update', {
      matchId,
      players: match.players.map(p => ({ 
        studentId: p.studentId, 
        name: p.name, 
        avatar: p.avatar,
        ready: p.ready
      }))
    });
    
    sTrace.push('training:ready-ok', { 
      matchId: (matchId || '').slice(-8), 
      playerName: player.name,
      studentId: (studentId || '').slice(-8),
      readyCount, 
      totalCount,
      allPlayersState: match.players.map(p => ({ name: p.name, ready: p.ready, sid: p.socketId?.slice(0, 8) })),
      socketRooms: Array.from(socket.rooms)
    });
    
    logger.info('[CrazyArena][Training] Événements Socket.IO émis', { 
      matchId, 
      events: ['training:player-ready', 'training:players-update'],
      readyCount,
      totalCount
    });
    return 'ok';
  }

  /**
   * Démarrage forcé training par le professeur
   */
  trainingForceStart(matchId) {
    const match = this.matches.get(matchId);
    
    if (!match) {
      logger.error(`[CrazyArena][Training] forceStart: Match ${matchId} introuvable`);
      return false;
    }

    if (match.status !== 'waiting') {
      logger.warn(`[CrazyArena][Training] forceStart: Match ${matchId} déjà en statut ${match.status}`);
      return false;
    }

    if (match.players.length < 2) {
      logger.warn(`[CrazyArena][Training] forceStart: Match ${matchId} a seulement ${match.players.length} joueur(s) (min 2)`);
      return false;
    }

    const readyCount = match.players.filter(p => p.ready).length;
    if (readyCount !== match.players.length) {
      logger.warn(`[CrazyArena][Training] forceStart: Match ${matchId} - tous les joueurs ne sont pas prêts (${readyCount}/${match.players.length})`);
      return false;
    }

    logger.info(`[CrazyArena][Training] 🚀 Démarrage forcé du match ${matchId} avec ${match.players.length} joueur(s) (tous prêts)`);
    match.status = 'countdown';
    
    // Countdown 3, 2, 1, GO!
    logger.info(`[CrazyArena][Training] Countdown démarré pour match ${matchId}`);
    
    let count = 3;
    const interval = setInterval(() => {
      this.io.to(matchId).emit('training:countdown', { count });
      count--;

      if (count < 0) {
        clearInterval(interval);
        logger.info(`[CrazyArena][Training] Countdown terminé, démarrage jeu...`);
        this.startTrainingGame(matchId);
      }
    }, 1000);

    return true;
  }

  /**
   * Démarrer le jeu training (après countdown)
   * COPIE EXACTE DE startGame() - seuls les noms d'events changent
   */
  async startTrainingGame(matchId) {
    const match = this.matches.get(matchId);
    if (!match) return;

    match.status = 'playing';
    match.startTime = Date.now();
    match.roundsPlayed = 0;
    match.validatedPairIds = new Set();

    logger.info(`[CrazyArena][Training] Partie démarrée pour match ${matchId}`);
    _logMatchEvent('MATCH_START', matchId, { mode: 'training', playersCount: match.players.length, players: match.players.map(p => ({ studentId: p.studentId, name: p.name })), config: { rounds: match.config.rounds, duration: match.config.duration, themes: match.config.themes, classes: match.config.classes } });

    // Générer les zones (utiliser la même logique que le mode multijoueur classique)
    const zones = await this.generateZones(match.config, matchId);
    match.zones = zones;
    
    logger.info(`[CrazyArena][Training] 🎯 Carte générée: ${zones.length} zones, 1 paire à trouver (règle: 1 paire/carte)`);

    // ✅ Log round to monitoring dashboard (same format as arena)
    const pairZonesT = zones.filter(z => z.pairId);
    _logArenaRound({
      id: `training_${matchId.slice(-8)}_r0_${Date.now()}`,
      timestamp: new Date().toISOString(),
      mode: 'training', source: 'training:game-start',
      matchId: matchId.slice(-8), roundIndex: 0,
      totalZones: zones.length, pairZones: pairZonesT.length,
      uniquePairs: [...new Set(pairZonesT.map(z => z.pairId))].length,
      pairDetails: pairZonesT.map(z => ({ id: z.id, type: z.type, content: String(z.content || '').substring(0, 30), pairId: z.pairId }))
    });

    // Initialiser les scores (préserver les scores restaurés depuis DB si match récupéré)
    const isRecovered = match._recoveredFromDB;
    match.players.forEach(p => {
      if (isRecovered && match.scores[p.studentId] && match.scores[p.studentId].score > 0) {
        logger.info(`[CrazyArena][Training] 🔄 Score restauré pour ${p.studentId}: ${match.scores[p.studentId].score} pts`);
        p.score = match.scores[p.studentId].score;
        p.pairsValidated = match.scores[p.studentId].pairsValidated;
        p.errors = match.scores[p.studentId].errors;
      } else {
        match.scores[p.studentId] = { score: 0, pairsValidated: 0, errors: 0, timeMs: 0 };
      }
    });

    // Notifier le démarrage avec les zones ET la config
    const gameStartPayload = {
      matchId,  // ✅ Ajouter matchId pour que le dashboard puisse update le status
      zones,
      duration: match.config.duration || 60,
      startTime: match.startTime,
      config: match.config,  // ✅ Transmettre config (themes, classes, etc.)
      players: match.players.map(p => ({
        studentId: p.studentId,
        name: p.name,
        avatar: p.avatar,
        score: p.score || 0
      }))
    };
    
    logger.info('[CrazyArena][Training] 🚀 Émission training:game-start avec config:', {
      matchId: matchId.slice(-8),
      hasConfig: !!gameStartPayload.config,
      configThemes: gameStartPayload.config?.themes,
      configClasses: gameStartPayload.config?.classes,
      zonesCount: zones.length
    });
    
    // ✅ LOG WINSTON: Angles des zones envoyées aux clients (visible dans monitoring)
    const calcChiffreZones = zones.filter(z => z.type === 'calcul' || z.type === 'chiffre');
    logger.info('[Training] 📐 ZONES ANGLES game-start', {
      matchId,
      totalZones: zones.length,
      calcChiffreCount: calcChiffreZones.length,
      zonesDetail: calcChiffreZones.map(z => ({
        id: z.id,
        type: z.type,
        content: String(z.content || '').substring(0, 20),
        angle: z.angle,
        hasAngle: typeof z.angle === 'number'
      }))
    });
    
    // 💾 Accumuler les zones pour archivage Supabase
    if (!match._roundsData) match._roundsData = [];
    match._roundsData.push({
      roundIndex: 0,
      timestamp: new Date().toISOString(),
      zones: zones.map(z => ({ id: z.id, type: z.type, content: z.content, pairId: z.pairId || '', isDistractor: !!z.isDistractor, points: z.points, arcPoints: z.arcPoints, angle: z.angle, mathOffset: z.mathOffset }))
    });

    // 📊 DIAGNOSTIC PÉDAGOGIQUE: Initialiser roundHistory
    match._roundHistory = [];
    const gp0 = match._lastGoodPairIds || {};
    match._roundHistory.push({
      round_number: 1,
      zones: zones.map(z => ({ id: z.id, type: z.type, content: z.content, pairId: z.pairId || null, isDistractor: !!z.isDistractor })),
      good_pair_type: gp0.pairType || null,
      good_pair_theme: gp0.theme || null,
      good_pair_level: gp0.level || null,
      good_pair_content: gp0.contentA ? { a: gp0.contentA, b: gp0.contentB } : null,
      winner_player_id: null,
      winner_display_name: null,
      winner_time_ms: null,
      errors: [],
      _startedAt: Date.now()
    });

    try { validateZonesServer(zones, { source: 'training:game-start', matchId: matchId.slice(-8) }); } catch (e) { logger.warn('[CrazyArena][Training] Zone validation error:', e.message); }
    this.io.to(matchId).emit('training:game-start', gameStartPayload);

    // 💾 PERSISTENCE: Créer session + résultats initiaux en DB
    // Stocker la promesse pour que persistMatchEnd puisse attendre la fin
    match._persistStartPromise = this.persistMatchStart(matchId).catch(err => {
      logger.error('[CrazyArena][Training] Erreur persistMatchStart (non-bloquante)', { matchId, error: err.message });
    });

    // ⏱️ CHRONO: Diffuser le temps restant toutes les secondes
    // ✅ CORRECTION: Timer TOTAL = rounds × duration (ex: 3 × 60s = 180s)
    const roundsPerMatch = match.config.rounds || match.config.roundsPerMatch || 3;
    const durationPerRound = match.config.duration || match.config.durationPerRound || 60;
    const totalDuration = roundsPerMatch * durationPerRound;
    
    logger.info(`[CrazyArena][Training] ⏱️  Timer configuré: ${roundsPerMatch} rounds × ${durationPerRound}s = ${totalDuration}s TOTAL`);
    
    match.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - match.startTime) / 1000);
      const timeLeft = Math.max(0, totalDuration - elapsed);
      
      // ✅ NOUVELLE MANCHE toutes les durationPerRound secondes (60s, 120s, etc.)
      const currentRound = Math.floor(elapsed / durationPerRound);
      if (currentRound > match.roundsPlayed && currentRound < roundsPerMatch) {
        match.roundsPlayed = currentRound;
        logger.info(`[CrazyArena][Training] 🔔 Nouvelle manche #${match.roundsPlayed + 1} démarrée (${elapsed}s écoulées)`);
        _logMatchEvent('ROUND_NEW', matchId, { mode: 'training', roundIndex: match.roundsPlayed, elapsed });
        
        // Réinitialiser le verrou de paire (nouvelle manche = nouvelle carte)
        match._pairClaimLock = null;
        
        // Générer nouvelle carte pour la nouvelle manche
        this.generateZones(match.config, matchId).then(newZones => {
          match.zones = newZones;
          logger.info(`[CrazyArena][Training] 🎯 Nouvelle carte pour manche ${match.roundsPlayed + 1}: ${newZones.length} zones`);
          // ✅ Log round to monitoring dashboard
          const _pzT = newZones.filter(z => z.pairId);
          _logArenaRound({
            id: `training_${matchId.slice(-8)}_r${match.roundsPlayed}_${Date.now()}`,
            timestamp: new Date().toISOString(), mode: 'training', source: 'training:round-new',
            matchId: matchId.slice(-8), roundIndex: match.roundsPlayed,
            totalZones: newZones.length, pairZones: _pzT.length,
            uniquePairs: [...new Set(_pzT.map(z => z.pairId))].length,
            pairDetails: _pzT.map(z => ({ id: z.id, type: z.type, content: String(z.content || '').substring(0, 30), pairId: z.pairId }))
          });
          
          // ✅ LOG WINSTON: Angles des zones de la nouvelle manche
          const newCalcChiffre = newZones.filter(z => z.type === 'calcul' || z.type === 'chiffre');
          logger.info('[Training] 📐 ZONES ANGLES round-new', {
            matchId,
            roundIndex: match.roundsPlayed,
            totalZones: newZones.length,
            calcChiffreCount: newCalcChiffre.length,
            zonesDetail: newCalcChiffre.map(z => ({
              id: z.id,
              type: z.type,
              content: String(z.content || '').substring(0, 20),
              angle: z.angle,
              hasAngle: typeof z.angle === 'number'
            }))
          });
          
          // 💾 Accumuler zones pour archivage
          if (!match._roundsData) match._roundsData = [];
          match._roundsData.push({
            roundIndex: match.roundsPlayed,
            timestamp: new Date().toISOString(),
            zones: newZones.map(z => ({ id: z.id, type: z.type, content: z.content, pairId: z.pairId || '', isDistractor: !!z.isDistractor, points: z.points, arcPoints: z.arcPoints, angle: z.angle, mathOffset: z.mathOffset }))
          });

          // 📊 DIAGNOSTIC: Pousser nouveau round (changement de manche par timer)
          if (match._roundHistory) {
            const gpTimer = match._lastGoodPairIds || {};
            match._roundHistory.push({
              round_number: match._roundHistory.length + 1,
              zones: newZones.map(z => ({ id: z.id, type: z.type, content: z.content, pairId: z.pairId || null, isDistractor: !!z.isDistractor })),
              good_pair_type: gpTimer.pairType || null,
              good_pair_theme: gpTimer.theme || null,
              good_pair_level: gpTimer.level || null,
              good_pair_content: gpTimer.contentA ? { a: gpTimer.contentA, b: gpTimer.contentB } : null,
              winner_player_id: null,
              winner_display_name: null,
              winner_time_ms: null,
              errors: [],
              _startedAt: Date.now()
            });
          }

          // Émettre nouvelle carte à tous les joueurs
          try { validateZonesServer(newZones, { source: 'training:round-new', matchId: matchId.slice(-8), roundIndex: match.roundsPlayed }); } catch (e) { logger.warn('[CrazyArena][Training] Zone validation error (round-new):', e.message); }
          this.io.to(matchId).emit('training:round-new', {
            zones: newZones,
            roundIndex: match.roundsPlayed,
            totalRounds: roundsPerMatch,
            timestamp: Date.now()
          });
          
          logger.info(`[CrazyArena][Training] ✅ Manche ${match.roundsPlayed + 1}/${roundsPerMatch} démarrée`);
        }).catch(err => {
          logger.error('[CrazyArena][Training] Erreur génération nouvelle carte manche:', err);
        });
      }
      
      // ✅ FIX: Afficher temps restant dans la MANCHE ACTUELLE (pas global)
      const elapsedInRound = elapsed % durationPerRound;
      const timeLeftInRound = Math.max(0, durationPerRound - elapsedInRound);
      
      logger.info(`[CrazyArena][Training] Émission training:timer-tick: timeLeft=${timeLeftInRound}s (manche ${match.roundsPlayed + 1}/${roundsPerMatch})`);
      this.io.to(matchId).emit('training:timer-tick', {
        timeLeft: timeLeftInRound,  // Temps restant dans la manche actuelle
        elapsed,
        duration: totalDuration,
        currentRound: match.roundsPlayed + 1,
        totalRounds: roundsPerMatch
      });
      
      if (timeLeft === 0) {
        logger.info(`[CrazyArena][Training] ⏰ Timer terminé pour match ${matchId}`);
        clearInterval(match.timerInterval);
        this.endTrainingGame(matchId);
      }
    }, 1000);
  }

  /**
   * Terminer le match Training (COPIE EXACTE de endGame Arena)
   */
  async endTrainingGame(matchId) {
    const match = this.matches.get(matchId);
    if (!match || (match.status !== 'playing' && match.status !== 'tiebreaker' && match.status !== 'tiebreaker-countdown')) return;

    match.status = 'finished';
    match.endTime = Date.now();

    // Nettoyer les timers
    if (match.gameTimeout) {
      clearTimeout(match.gameTimeout);
    }
    if (match.timerInterval) {
      clearInterval(match.timerInterval);
    }

    // ✅ FIX: Si on sort d'un tiebreaker, ADDITIONNER scores match normal + tiebreaker AVANT le log
    if (match.isTiebreaker) {
      match.players.forEach(p => {
        const scoreNormal = p.scoreBeforeTiebreaker || 0;
        const scoreTiebreaker = p.tiebreakerScore || 0;
        const pairsNormal = p.pairsBeforeTiebreaker || 0;
        const pairsTiebreaker = p.tiebreakerPairs || 0;
        
        p.score = scoreNormal + scoreTiebreaker;
        p.pairsValidated = pairsNormal + pairsTiebreaker;
        
        logger.info(`[CrazyArena][Training] 🏆 ${p.name}: Score final = ${scoreNormal} (normal) + ${scoreTiebreaker} (tiebreaker) = ${p.score} pts`);
      });
    }

    logger.info(`[CrazyArena][Training] 🏁 Match ${matchId} terminé`);
    _logMatchEvent('MATCH_END', matchId, { mode: 'training', duration: match.endTime - match.startTime, playersCount: match.players.length, players: match.players.map(p => ({ studentId: p.studentId, name: p.name, score: p.score, pairsValidated: p.pairsValidated, errors: p.errors })) });

    // Calculer les temps finaux
    match.players.forEach(p => {
      p.timeMs = match.endTime - match.startTime;
    });

    // Trier les joueurs par score DESC, puis temps ASC
    const ranking = match.players.map(p => ({
      studentId: p.studentId,
      authId: p.authId || null,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      pairsValidated: p.pairsValidated,
      errors: p.errors,
      timeMs: p.timeMs
    })).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timeMs - b.timeMs;
    });

    // Ajouter les positions
    ranking.forEach((p, idx) => {
      p.position = idx + 1;
    });

    // ✅ CRITIQUE: Vérifier égalité au premier rang (COMME ARENA)
    const topPlayer = ranking[0];
    const tiedPlayers = ranking.filter(p => 
      p.pairsValidated === topPlayer.pairsValidated && p.errors === topPlayer.errors
    );
    
    if (tiedPlayers.length > 1 && !match.isTiebreaker) {
      // ÉGALITÉ DÉTECTÉE - Attendre décision du professeur
      logger.info(`[CrazyArena][Training] ⚖️ ÉGALITÉ détectée ! ${tiedPlayers.length} joueurs à ${topPlayer.pairsValidated} paires, ${topPlayer.errors} erreurs`);
      logger.info(`[CrazyArena][Training] ⏸️ En attente décision professeur pour départage...`);
      _logMatchEvent('TIE_DETECTED', matchId, { mode: 'training', tiedCount: tiedPlayers.length, topPairs: topPlayer.pairsValidated, topErrors: topPlayer.errors, tiedPlayers: tiedPlayers.map(p => ({ studentId: p.studentId, name: p.name, score: p.score })) });
      
      // Mettre le match en attente de départage
      match.status = 'tie-waiting';
      match.tiedPlayers = tiedPlayers;
      
      // Notifier les joueurs de l'égalité (attente du prof)
      const tieData = {
        tiedPlayers: tiedPlayers.map(p => ({ name: p.name, score: p.score })),
        message: 'Égalité ! En attente du professeur pour le départage...'
      };
      
      logger.info(`[CrazyArena][Training] 📢 Émission training:tie-detected à room ${matchId}:`, tieData);
      this.io.to(matchId).emit('training:tie-detected', tieData);
      
      // AUSSI en broadcast pour debug
      logger.info(`[CrazyArena][Training] 📢 Émission training:tie-detected en BROADCAST`);
      this.io.emit('training:tie-detected', { ...tieData, matchId });
      
      // Notifier le dashboard professeur qu'il doit décider
      this.io.emit('training:tie-waiting-teacher', {
        matchId,
        tiedPlayers: tiedPlayers.map(p => ({ 
          studentId: p.studentId,
          name: p.name, 
          score: p.score 
        })),
        ranking
      });
      
      logger.info(`[CrazyArena][Training] 📢 Notification égalité envoyée pour match ${matchId}`);
      
      return; // Ne pas terminer le match - attendre décision prof
    }

    // Pas d'égalité ou après départage - Envoyer le podium final
    const winner = ranking[0];

    logger.info(`[CrazyArena][Training] 🎉 Émission podium final à room ${matchId}`);
    this.io.to(matchId).emit('training:game-end', {
      ranking,
      winner,
      duration: match.endTime - match.startTime,
      isTiebreaker: match.isTiebreaker || false
    });
    
    // ✅ BROADCAST GLOBAL pour retirer notifications des élèves
    this.io.emit('training:match-finished', { matchId });
    logger.info(`[Training] 📢 Broadcast training:match-finished pour ${matchId}`);
    
    // 💾 PERSISTENCE: Finaliser le match en DB (positions finales + completed_at)
    _logMatchEvent('PERSIST_END_START', matchId, { mode: 'training', hasSessionId: !!match._sessionId, sessionId: match._sessionId || null, roundHistoryLength: match._roundHistory ? match._roundHistory.length : 0, path: match._sessionId ? 'persistMatchEnd' : 'saveTrainingResults (legacy)' });
    if (match._sessionId) {
      await this.persistMatchEnd(matchId, ranking);
    } else {
      // Fallback legacy (si persistMatchStart n'a pas été appelé)
      await this.saveTrainingResults(matchId, ranking, match);
    }
    
    // ✅ FIX: Mettre à jour le statut du groupe en DB (playing → finished)
    if (this.supabase) {
      try {
        const { data: groupData, error: groupErr } = await this.supabase
          .from('tournament_groups')
          .update({ status: 'finished', winner_id: winner.studentId })
          .eq('match_id', matchId)
          .select('id')
          .single();
        
        if (groupErr) {
          logger.warn(`[CrazyArena][Training] ⚠️ Erreur mise à jour groupe:`, groupErr.message);
        } else if (groupData) {
          logger.info(`[CrazyArena][Training] ✅ Groupe ${groupData.id} → finished, winner: ${winner.name}`);
        }
      } catch (err) {
        logger.warn(`[CrazyArena][Training] ⚠️ Erreur update groupe:`, err.message);
      }
    }
    
    // Nettoyer après 30s (IDENTIQUE À ARENA)
    setTimeout(() => {
      this.cleanupMatch(matchId);
    }, 30000);
  }

  /**
   * Joueur prêt pour départage Training
   */
  trainingPlayerReadyForTiebreaker(matchId, studentId, playerName, io) {
    logger.info('[CrazyArena][Training] playerReadyForTiebreaker appelé', { matchId, studentId, playerName });
    
    const match = this.matches.get(matchId);
    if (!match) {
      logger.error('[CrazyArena][Training] Match introuvable pour tiebreaker', { matchId, studentId, matchesCount: this.matches.size });
      return;
    }

    logger.info('[CrazyArena][Training] Match trouvé pour tiebreaker', { matchId, status: match.status });
    
    if (match.status !== 'tie-waiting') {
      logger.error('[CrazyArena][Training] Match pas en attente départage', { matchId, status: match.status, expected: 'tie-waiting' });
      return;
    }

    if (!match.playersReadyForTiebreaker) {
      match.playersReadyForTiebreaker = new Set();
      logger.info('[CrazyArena][Training] Set playersReadyForTiebreaker initialisé', { matchId });
    }

    match.playersReadyForTiebreaker.add(studentId);
    
    const readyCount = match.playersReadyForTiebreaker.size;
    const totalCount = match.tiedPlayers.length;
    
    logger.info('[CrazyArena][Training] Joueur marqué prêt pour départage', { 
      matchId, 
      studentId, 
      playerName,
      readyCount,
      totalCount,
      allReady: readyCount === totalCount
    });

    const payload = {
      matchId,
      readyCount,
      totalCount,
      readyPlayers: Array.from(match.playersReadyForTiebreaker)
    };
    
    logger.info('[CrazyArena][Training] Émission training:tiebreaker-ready-update', payload);
    io.emit('training:tiebreaker-ready-update', payload);
    logger.info('[CrazyArena][Training] training:tiebreaker-ready-update émis avec succès', { matchId, readyCount, totalCount });
  }

  /**
   * Démarrage départage par professeur Training
   */
  async trainingStartTiebreakerByTeacher(matchId) {
    const match = this.matches.get(matchId);
    if (!match) {
      logger.error(`[CrazyArena][Training] ❌ Match ${matchId} introuvable`);
      return;
    }

    if (match.status !== 'tie-waiting') {
      logger.error(`[CrazyArena][Training] ❌ Match ${matchId} n'est pas en attente de départage`);
      return;
    }

    const tiedPlayers = match.tiedPlayers;
    if (!tiedPlayers || tiedPlayers.length < 2) {
      logger.error(`[CrazyArena][Training] ❌ Pas de joueurs à égalité`);
      return;
    }

    logger.info(`[CrazyArena][Training] 🎯 Professeur lance départage (${tiedPlayers.length} joueurs)`);
    
    match.isTiebreaker = true;
    match.status = 'playing';
    match.startTime = Date.now();
    
    const tiebreakerConfig = {
      ...match.config,
      rounds: 1
    };
    
    const zonesResult = await this.generateZones(tiebreakerConfig, matchId);
    const zonesArray = Array.isArray(zonesResult) ? zonesResult : (zonesResult?.zones || []);
    
    match.zones = zonesArray;
    match.tiebreakerPairsToFind = 3;
    match.tiebreakerPairsFound = 0;
    
    const tiedStudentIds = tiedPlayers.map(p => p.studentId);
    
    match.players.forEach(p => {
      if (tiedStudentIds.includes(p.studentId)) {
        p.scoreBeforeTiebreaker = p.score;
        p.pairsBeforeTiebreaker = p.pairsValidated;
        p.tiebreakerScore = 0;
        p.tiebreakerPairs = 0;
        p.errors = 0;
      }
    });
    
    logger.info(`[CrazyArena][Training] 📡 Countdown 3-2-1 pour tiebreaker...`);
    
    match.status = 'tiebreaker-countdown';
    let count = 3;
    const countdownInterval = setInterval(() => {
      this.io.to(matchId).emit('training:countdown', { count });
      count--;
      
      if (count < 0) {
        clearInterval(countdownInterval);
        
        try {
          match.status = 'tiebreaker';
          
          const payload = {
            zones: match.zones,
            duration: 999,  // ✅ Comme Arena: pas de limite de temps, juste 3 paires
            startTime: Date.now(),  // ✅ Comme Arena
            tiedPlayers: tiedPlayers.map(p => ({ 
              studentId: p.studentId,
              name: p.name, 
              score: p.score 
            })),
            pairsToFind: match.tiebreakerPairsToFind
          };
          
          logger.info(`[CrazyArena][Training] 📡 Émission training:tiebreaker-start...`);
          this.io.to(matchId).emit('training:tiebreaker-start', payload);
          this.io.emit('training:tiebreaker-start', { ...payload, matchId });
          
          logger.info(`[CrazyArena][Training] ✅ training:tiebreaker-start émis`);
          
        } catch (error) {
          logger.error(`[CrazyArena][Training] ❌ ERREUR tiebreaker:`, error);
          this.endTrainingGame(matchId);
        }
      }
    }, 1000);
  }

  /**
   * Validation de paire en mode Training (COPIE EXACTE de pairValidated Battle Royale)
   */
  trainingPairValidated(socket, data) {
    let matchId = this.playerMatches.get(socket.id);
    
    // ✅ Fallback: essayer data.matchId si le mapping socket→match est perdu (reconnexion)
    if (!matchId && data.matchId) {
      const fallbackMatch = this.matches.get(data.matchId);
      if (fallbackMatch) {
        // Retrouver le joueur par studentId et ré-enregistrer le socket
        const playerByStudent = fallbackMatch.players.find(p => p.studentId === data.studentId);
        if (playerByStudent) {
          logger.info('[CrazyArena][Training] trainingPairValidated: Récupération mapping socket via data.matchId', { matchId: data.matchId, socketId: socket.id, studentId: data.studentId });
          playerByStudent.socketId = socket.id;
          this.playerMatches.set(socket.id, data.matchId);
          socket.join(data.matchId);
          matchId = data.matchId;
        }
      }
    }
    
    if (!matchId) {
      logger.warn('[CrazyArena][Training] trainingPairValidated: Aucun match pour socket (attente rejoin)', { socketId: socket.id, dataMatchId: data.matchId });
      // Ne PAS émettre training:match-lost ici — le handler training:join fera la récupération DB
      return;
    }

    const match = this.matches.get(matchId);
    if (!match) {
      logger.warn('[CrazyArena][Training] trainingPairValidated: Match introuvable (attente rejoin)', { matchId, socketId: socket.id });
      // Nettoyer le mapping obsolète
      this.playerMatches.delete(socket.id);
      return;
    }
    
    if (match.status !== 'playing' && match.status !== 'tiebreaker' && match.status !== 'tiebreaker-countdown') {
      logger.warn('[CrazyArena][Training] trainingPairValidated: Statut invalide', { matchId, status: match.status, expected: ['playing', 'tiebreaker', 'tiebreaker-countdown'] });
      return;
    }

    let player = match.players.find(p => p.socketId === socket.id);
    if (!player && data.studentId) {
      // ✅ Fallback: trouver le joueur par studentId (socket reconnecter avec nouvel ID)
      player = match.players.find(p => p.studentId === data.studentId);
      if (player) {
        logger.info('[CrazyArena][Training] trainingPairValidated: Récupération joueur par studentId', { matchId, socketId: socket.id, studentId: data.studentId, oldSocketId: player.socketId?.slice(-6) });
        // Mettre à jour le mapping socket
        const oldSocketId = player.socketId;
        if (oldSocketId && oldSocketId !== socket.id) {
          this.playerMatches.delete(oldSocketId);
        }
        player.socketId = socket.id;
        this.playerMatches.set(socket.id, matchId);
        socket.join(matchId);
      }
    }
    if (!player) {
      logger.warn('[CrazyArena][Training] trainingPairValidated: Joueur introuvable', { matchId, socketId: socket.id, studentId: data.studentId });
      return;
    }

    const { studentId, isCorrect, timeMs, pairId, zoneAId, zoneBId } = data;

    logger.info('[CrazyArena][Training] Paire validée', { 
      matchId, 
      studentId, 
      isCorrect, 
      timeMs,
      pairId, 
      zoneA: zoneAId, 
      zoneB: zoneBId,
      status: match.status
    });

    // Mettre à jour le score
    if (isCorrect) {
      // ═══ VERROU CLAIM (fenêtre d'égalité 200ms + anti-doublon) ═══
      const now = Date.now();
      if (match._pairClaimLock) {
        if (match._pairClaimLock.claimants.has(studentId)) {
          logger.info('[CrazyArena][Training] Claim ignoré (doublon même joueur)', { matchId, studentId });
          return;
        }
        const elapsed = now - match._pairClaimLock.timestamp;
        if (elapsed > ARENA_TIE_WINDOW_MS) {
          logger.info('[CrazyArena][Training] ⏰ Claim rejeté (hors fenêtre)', { matchId, studentId, elapsed, window: ARENA_TIE_WINDOW_MS });
          socket.emit('training:claim-rejected', { reason: 'too_late', elapsed });
          return;
        }
        match._pairClaimLock.claimants.add(studentId);
        logger.info('[CrazyArena][Training] ⚡ Égalité détectée dans la fenêtre', { matchId, studentId, elapsed, window: ARENA_TIE_WINDOW_MS });
      } else {
        match._pairClaimLock = { pairId, timestamp: now, claimants: new Set([studentId]), cardGenScheduled: false };
        logger.info('[CrazyArena][Training] 🔒 Premier claim, verrou posé', { matchId, studentId, pairId });
      }

      // Mode tiebreaker
      if (match.status === 'tiebreaker' || match.status === 'tiebreaker-countdown') {
        const oldScore = player.tiebreakerScore || 0;
        player.tiebreakerScore = oldScore + 1;
        player.tiebreakerPairs = (player.tiebreakerPairs || 0) + 1;
        
        // Incrémenter pairsFound uniquement pour le premier réclamant
        const isFirstClaimTB = match._pairClaimLock && !match._pairClaimLock.cardGenScheduled;
        if (isFirstClaimTB) {
          match.tiebreakerPairsFound = (match.tiebreakerPairsFound || 0) + 1;
        }
        
        logger.info('[CrazyArena][Training] Score tiebreaker mis à jour', { 
          matchId, 
          studentId,
          oldScore,
          newScore: player.tiebreakerScore,
          pairsFound: match.tiebreakerPairsFound,
          pairsToFind: match.tiebreakerPairsToFind
        });

        // 💾 PERSISTENCE: Sauvegarder le score tiebreaker en DB
        this.persistScoreUpdate(matchId, studentId);
        // 📊 MAÎTRISE: Enregistrer la tentative pour le suivi par thème
        this.persistAttempt(match, player, { isCorrect: true, pairId, zoneAId, zoneBId });
        
        // ✅ CRITIQUE: Émettre scores tiebreaker aux clients (score combiné = base + tiebreaker)
        const playersData = match.players.map(p => ({
          studentId: p.studentId,
          name: p.name,
          avatar: p.avatar,
          score: (p.scoreBeforeTiebreaker || 0) + (p.tiebreakerScore || 0),
          pairsValidated: (p.pairsBeforeTiebreaker || 0) + (p.tiebreakerPairs || 0),
          errors: p.errors || 0,
          ready: p.ready || false
        }));
        
        this.io.to(matchId).emit('training:players-update', {
          matchId,
          players: playersData
        });
        
        logger.info('[CrazyArena][Training] Événement training:players-update émis (tiebreaker)', { 
          matchId, 
          playerScores: playersData.map(p => ({ studentId: p.studentId, score: p.score })),
          event: 'training:players-update'
        });
        
        // ✅ FIX: Émettre training:pair-validated pour déclencher les bulles d'animation (comme mode normal)
        if (pairId) {
          const playerIdx = match.players.findIndex(p => p.studentId === studentId);
          this.io.to(matchId).emit('training:pair-validated', {
            studentId,
            playerName: player.name,
            playerIdx,
            pairId,
            zoneAId,
            zoneBId,
            timestamp: Date.now()
          });
          
          logger.info('[CrazyArena][Training] Événement training:pair-validated émis (tiebreaker)', { 
            matchId, studentId, playerIdx, pairId, event: 'training:pair-validated'
          });
        }
        
        if (match.tiebreakerPairsFound >= match.tiebreakerPairsToFind) {
          // ✅ FIX: Émettre scores-update AVANT de return (sinon UI figée)
          const tbScoresLast = {
            scores: match.players.map((p, idx) => ({
              studentId: p.studentId,
              name: p.name,
              playerIdx: idx,
              score: (p.scoreBeforeTiebreaker || 0) + (p.tiebreakerScore || 0),
              pairsValidated: (p.pairsBeforeTiebreaker || 0) + (p.tiebreakerPairs || 0)
            })).sort((a, b) => b.score - a.score)
          };
          this.io.to(matchId).emit('training:scores-update', tbScoresLast);

          // ✅ FIX ÉGALITÉ TIEBREAKER: Attendre la fenêtre d'égalité avant de terminer.
          // Ensuite vérifier si c'est encore à égalité → prolonger avec une carte supplémentaire.
          if (!match._tiebreakerEndScheduled) {
            match._tiebreakerEndScheduled = true;
            if (match._pairClaimLock) match._pairClaimLock.cardGenScheduled = true;
            logger.info('[CrazyArena][Training] Tiebreaker dernière paire trouvée — attente fenêtre égalité', { 
              matchId, 
              pairsFound: match.tiebreakerPairsFound,
              pairsToFind: match.tiebreakerPairsToFind,
              delayMs: ARENA_TIE_WINDOW_MS
            });
            setTimeout(async () => {
              // Vérifier si les scores tiebreaker sont encore à égalité
              const tbScores = match.players
                .filter(p => p.tiebreakerScore !== undefined)
                .map(p => p.tiebreakerScore || 0);
              const maxTbScore = Math.max(...tbScores);
              const playersAtMax = tbScores.filter(s => s === maxTbScore).length;

              if (playersAtMax > 1 && maxTbScore > 0) {
                // ⚡ Encore égalité ! Prolonger avec une carte supplémentaire
                logger.info('[CrazyArena][Training] ⚡ Tiebreaker encore à égalité — prolongation !', {
                  matchId,
                  tbScores: match.players.map(p => ({ name: p.name, tbScore: p.tiebreakerScore })),
                  newPairsToFind: match.tiebreakerPairsToFind + 1
                });
                match.tiebreakerPairsToFind += 1;
                match._tiebreakerEndScheduled = false;
                match._pairClaimLock = null;

                // Notifier les joueurs de la prolongation
                this.io.to(matchId).emit('training:tiebreaker-extended', {
                  reason: 'equality',
                  newPairsToFind: match.tiebreakerPairsToFind,
                  pairsFound: match.tiebreakerPairsFound,
                  scores: match.players.map(p => ({ studentId: p.studentId, name: p.name, tbScore: p.tiebreakerScore }))
                });

                // Générer et envoyer une nouvelle carte
                try {
                  const newZones = await this.generateZones(match.config, matchId);
                  match.zones = newZones;
                  
                  const payload = {
                    zones: newZones,
                    roundIndex: match.tiebreakerPairsFound,
                    totalRounds: match.tiebreakerPairsToFind,
                    timestamp: Date.now()
                  };
                  
                  try { validateZonesServer(newZones, { source: 'training:tiebreaker-extension', matchId: matchId.slice(-8) }); } catch (e) { logger.warn('[CrazyArena][Training] Zone validation error (tiebreaker ext):', e.message); }
                  this.io.to(matchId).emit('training:round-new', payload);
                  
                  logger.info('[CrazyArena][Training] Carte prolongation tiebreaker envoyée', {
                    matchId,
                    zonesCount: newZones?.length || 0,
                    newPairsToFind: match.tiebreakerPairsToFind
                  });
                } catch (err) {
                  logger.error('[CrazyArena][Training] Erreur génération carte prolongation', { matchId, error: err.message });
                  this.endTrainingGame(matchId);
                }
              } else {
                // Un joueur est en avance → terminer normalement
                this.endTrainingGame(matchId);
              }
            }, ARENA_TIE_WINDOW_MS);
          }
          return;
        }
        
        // Générer nouvelle carte tiebreaker UNIQUEMENT pour le premier réclamant
        if (isFirstClaimTB && match._pairClaimLock) {
          match._pairClaimLock.cardGenScheduled = true;
          setTimeout(async () => {
            try {
              // Libérer le verrou — nouvelle carte = nouveaux claims possibles
              match._pairClaimLock = null;

              // ✅ FIX RACE CONDITION: Vérifier que le match est toujours en tiebreaker
              if (match.status === 'finished') {
                logger.info('[CrazyArena][Training] ⚠️ Carte tiebreaker annulée — match déjà terminé', { matchId });
                return;
              }
              logger.info('[CrazyArena][Training] Génération nouvelle carte tiebreaker', { 
                matchId, 
                pairsFound: match.tiebreakerPairsFound,
                pairsRemaining: match.tiebreakerPairsToFind - match.tiebreakerPairsFound
              });
              
              const newZones = await this.generateZones(match.config, matchId);
              match.zones = newZones;
              
              const payload = {
                zones: newZones,
                roundIndex: match.tiebreakerPairsFound,
                totalRounds: match.tiebreakerPairsToFind,
                timestamp: Date.now()
              };
              
              try { validateZonesServer(newZones, { source: 'training:tiebreaker-round', matchId: matchId.slice(-8) }); } catch (e) { logger.warn('[CrazyArena][Training] Zone validation error (tiebreaker):', e.message); }
              this.io.to(matchId).emit('training:round-new', payload);
              
              logger.info('[CrazyArena][Training] Événement training:round-new émis (tiebreaker)', { 
                matchId, 
                zonesCount: newZones?.length || 0,
                roundIndex: match.tiebreakerPairsFound,
                event: 'training:round-new'
              });
            } catch (err) {
              logger.error('[CrazyArena][Training] Erreur génération carte tiebreaker', { 
                matchId, 
                error: err.message,
                stack: err.stack?.slice(0, 200)
              });
            }
          }, 1500);
        }
        
        return;
      } else {
        // Mode normal
        const oldScore = player.score || 0;
        player.score = oldScore + 1;
        player.pairsValidated = (player.pairsValidated || 0) + 1;
        
        logger.info('[CrazyArena][Training] Score mis à jour (mode normal)', { 
          matchId, 
          studentId,
          oldScore,
          newScore: player.score,
          pairsValidated: player.pairsValidated
        });
      }

      // 💾 PERSISTENCE: Sauvegarder le score en DB (fire-and-forget)
      this.persistScoreUpdate(matchId, studentId);
    } else {
      // Mauvaise paire: aucune pénalité, juste compteur erreurs
      logger.info('[CrazyArena][Training] Paire incorrecte - pas de pénalité', { 
        matchId, 
        studentId,
        status: match.status
      });
      player.errors = (player.errors || 0) + 1;

      // 📊 DIAGNOSTIC: Enregistrer l'erreur dans le roundHistory courant
      if (match._roundHistory && match._roundHistory.length > 0) {
        const lastEntry = match._roundHistory[match._roundHistory.length - 1];
        lastEntry.errors.push({ player_id: studentId, display_name: player.name, timestamp: Date.now() });
      }

      // 💾 PERSISTENCE: Sauvegarder les erreurs en DB
      this.persistScoreUpdate(matchId, studentId);
    }

    // 📊 MAÎTRISE: Enregistrer la tentative pour le suivi par thème (correct et incorrect)
    this.persistAttempt(match, player, { isCorrect, pairId, zoneAId, zoneBId });

    // ✅ CRITIQUE: Mettre à jour match.scores comme Arena
    match.scores[studentId] = {
      score: player.score || 0,
      pairsValidated: player.pairsValidated || 0,
      errors: player.errors || 0,
      timeMs: Date.now() - match.startTime
    };

    // ✅ SYNCHRONISER la paire validée à TOUS les joueurs
    if (isCorrect && pairId) {
      // ✅ CRITIQUE: Calculer playerIdx canonique (ordre match.players) pour couleurs cohérentes
      const playerIdx = match.players.findIndex(p => p.studentId === studentId);
      
      const pairValidatedPayload = {
        studentId,
        playerName: player.name,
        playerIdx,
        pairId,
        zoneAId,
        zoneBId,
        timestamp: Date.now()
      };
      
      this.io.to(matchId).emit('training:pair-validated', pairValidatedPayload);
      
      logger.info('[CrazyArena][Training] Événement training:pair-validated émis', { 
        matchId, 
        studentId,
        playerIdx,
        pairId,
        zoneA: zoneAId,
        zoneB: zoneBId,
        event: 'training:pair-validated'
      });
      
      // ✅ FIFO + Génération nouvelle carte: UNIQUEMENT pour le premier réclamant
      const isFirstClaimNormal = match._pairClaimLock && !match._pairClaimLock.cardGenScheduled;
      if (isFirstClaimNormal) {
        match._pairClaimLock.cardGenScheduled = true;

        if (!match.validatedPairIds) match.validatedPairIds = new Set();
        
        const MAX_EXCLUDED_PAIRS = 15;
        
        if (match.validatedPairIds.size >= MAX_EXCLUDED_PAIRS) {
          const pairIdsArray = Array.from(match.validatedPairIds);
          const oldestPairId = pairIdsArray[0];
          match.validatedPairIds.delete(oldestPairId);
          logger.info('[CrazyArena][Training] FIFO: Paire la plus ancienne supprimée', { matchId, oldestPairId, maxSize: MAX_EXCLUDED_PAIRS });
        }
        
        match.validatedPairIds.add(pairId);
        
        logger.info('[CrazyArena][Training] FIFO: Paire ajoutée aux exclusions', { 
          matchId, 
          pairId,
          excludedCount: match.validatedPairIds.size,
          maxExcluded: MAX_EXCLUDED_PAIRS
        });
      }
      
      // 📊 DIAGNOSTIC: Enregistrer le gagnant dans le roundHistory courant
      if (match._roundHistory && match._roundHistory.length > 0) {
        const lastEntry = match._roundHistory[match._roundHistory.length - 1];
        if (!lastEntry.winner_player_id) {
          lastEntry.winner_player_id = studentId;
          lastEntry.winner_display_name = player.name;
          lastEntry.winner_time_ms = lastEntry._startedAt ? Date.now() - lastEntry._startedAt : (timeMs || null);
        }
      }

      // ✅ NOUVELLE CARTE: UNIQUEMENT pour le premier réclamant
      if (isFirstClaimNormal) {
        logger.info('[CrazyArena][Training] Démarrage génération nouvelle carte', { 
          matchId, 
          excludedPairs: match.validatedPairIds?.size || 0
        });
        
        setTimeout(async () => {
          try {
            // Libérer le verrou — nouvelle carte = nouveaux claims possibles
            match._pairClaimLock = null;

            logger.info('[CrazyArena][Training] Génération nouvelle carte (mode normal)', { 
              matchId, 
              roundsPlayed: match.roundsPlayed || 0,
              totalRounds: match.config.rounds || null
            });
            
            const newZones = await this.generateZones(match.config, matchId);
            match.zones = newZones;
            
            logger.info('[CrazyArena][Training] Nouvelle carte générée', { 
              matchId, 
              zonesCount: newZones?.length || 0
            });
            
            // 📊 DIAGNOSTIC: Pousser nouveau round dans l'historique
            if (match._roundHistory) {
              const gpNew = match._lastGoodPairIds || {};
              match._roundHistory.push({
                round_number: match._roundHistory.length + 1,
                zones: newZones.map(z => ({ id: z.id, type: z.type, content: z.content, pairId: z.pairId || null, isDistractor: !!z.isDistractor })),
                good_pair_type: gpNew.pairType || null,
                good_pair_theme: gpNew.theme || null,
                good_pair_level: gpNew.level || null,
                good_pair_content: gpNew.contentA ? { a: gpNew.contentA, b: gpNew.contentB } : null,
                winner_player_id: null,
                winner_display_name: null,
                winner_time_ms: null,
                errors: [],
                _startedAt: Date.now()
              });
            }

            const roundPayload = {
              zones: newZones,
              roundIndex: match.roundsPlayed || 0,
              totalRounds: match.config.rounds || null,
              timestamp: Date.now()
            };
            
            try { validateZonesServer(newZones, { source: 'training:round-new-normal', matchId: matchId.slice(-8), roundIndex: match.roundsPlayed }); } catch (e) { logger.warn('[CrazyArena][Training] Zone validation error (normal):', e.message); }
            this.io.to(matchId).emit('training:round-new', roundPayload);
            
            logger.info('[CrazyArena][Training] Événement training:round-new émis (mode normal)', { 
              matchId, 
              zonesCount: newZones?.length || 0,
              roundIndex: match.roundsPlayed || 0,
              event: 'training:round-new'
            });
          } catch (err) {
            logger.error('[CrazyArena][Training] Erreur génération carte (mode normal)', { 
              matchId, 
              error: err.message,
              stack: err.stack?.slice(0, 200)
            });
          }
        }, 1500);
      }
    }

    // Diffuser les scores (combiné base + tiebreaker si départage en cours)
    const isTiebreaker = match.status === 'tiebreaker' || match.status === 'tiebreaker-countdown';
    const scoresPayload = {
      scores: match.players.map((p, idx) => ({
        studentId: p.studentId,
        name: p.name,
        playerIdx: idx,
        score: isTiebreaker 
          ? (p.scoreBeforeTiebreaker || 0) + (p.tiebreakerScore || 0)
          : (p.score || 0),
        pairsValidated: isTiebreaker
          ? (p.pairsBeforeTiebreaker || 0) + (p.tiebreakerPairs || 0)
          : (p.pairsValidated || 0)
      })).sort((a, b) => b.score - a.score)
    };
    
    this.io.to(matchId).emit('training:scores-update', scoresPayload);
    
    logger.info('[CrazyArena][Training] Événement training:scores-update émis', { 
      matchId, 
      playerCount: match.players.length,
      event: 'training:scores-update'
    });
  }

  /**
   * Créer une salle Battle Royale (mode TOURNOI)
   */
  createMatch(matchId, roomCode, config) {
    this.matches.set(matchId, {
      matchId,  // ✅ Comme Training (cohérence)
      id: matchId,  // Garder pour compatibilité getMatchState
      mode: 'arena',
      roomCode,
      players: [],
      status: 'waiting',
      scores: {},
      zones: null,
      config: config || { rounds: 3, duration: 60, classes: ['CE1'], themes: [] },
      startTime: null,
      endTime: null,
      roundsPlayed: 0,
      validatedPairIds: null,
      timerInterval: null,  // ✅ Comme Training
      countdownTimeout: null,
      gameTimeout: null
    });

    logger.info(`[CrazyArena] Match créé: ${matchId} (code: ${roomCode})`);
    _logMatchEvent('MATCH_CREATE', matchId, { mode: 'arena', roomCode, config: config || { rounds: 3, duration: 60 } });
    return this.matches.get(matchId);
  }

  /**
   * Récupérer l'état d'un match (pour dashboard professeur / spectateur)
   */
  getMatchState(matchId) {
    const match = this.matches.get(matchId);
    if (!match) return null;

    const config = match.config || {};
    const roundsPerMatch = config.rounds || 3;
    const durationPerRound = config.duration || 60;

    return {
      matchId: match.matchId || match.id,
      roomCode: match.roomCode,
      mode: match.mode,
      status: match.status,
      players: match.players.map(p => ({
        studentId: p.studentId,
        name: p.name,
        avatar: p.avatar,
        ready: p.ready,
        score: p.score || 0,
        pairsFound: p.pairsFound || 0
      })),
      currentRound: (match.roundsPlayed || 0) + 1,
      totalRounds: roundsPerMatch,
      durationPerRound,
      startTime: match.startTime,
      config: { rounds: roundsPerMatch, duration: durationPerRound, themes: config.themes || [] },
      zones: match.zones || [],
      pauseState: match._pauseState ? {
        disconnectedPlayer: match._pauseState.disconnectedPlayerName,
        disconnectedStudentId: match._pauseState.disconnectedStudentId,
        pausedAt: match._pauseState.pausedAt,
        gracePeriodMs: 15000
      } : null
    };
  }

  /**
   * Un joueur rejoint un match
   */
  async joinMatch(socket, matchId, studentData) {
    let match = this.matches.get(matchId);
    
    // Fallback: si matchId est un roomCode, chercher le vrai match
    if (!match) {
      for (const [id, m] of this.matches.entries()) {
        if (m.roomCode === matchId || m.roomCode === matchId.toUpperCase()) {
          logger.info(`[CrazyArena] Résolution roomCode "${matchId}" → matchId "${id}"`);
          matchId = id;
          match = m;
          break;
        }
      }
    }
    
    // Si le match n'existe pas en RAM, essayer de le récupérer depuis Supabase
    if (!match) {
      logger.info(`[CrazyArena] Match ${matchId} introuvable en RAM, tentative récupération depuis Supabase...`);
      match = await this.loadMatchFromDatabase(matchId);
      
      if (!match) {
        logger.error(`[CrazyArena] Match ${matchId} introuvable dans Supabase`);
        sTrace.push('arena:join-reject', { reason: 'match_not_found', matchId: (matchId || '').slice(-8), studentName: studentData.name, studentId: (studentData.studentId || '').slice(-8), socketId: socket.id.slice(0, 8) });
        socket.emit('arena:error', { message: 'Match introuvable' });
        return false;
      }
      
      logger.info(`[CrazyArena] Match ${matchId} récupéré depuis Supabase avec succès`);
    }

    // Vérifier si le joueur fait déjà partie du match (reconnexion)
    const existingPlayer = match.players.find(p => p.studentId === studentData.studentId);
    
    if (existingPlayer) {
      // RECONNEXION : Mettre à jour le socketId et rejoindre la room
      logger.info(`[CrazyArena] 🔄 Reconnexion de ${studentData.name} (status=${match.status}, wasDisconnected=${!!existingPlayer.disconnected})`);
      _logMatchEvent('PLAYER_RECONNECT', matchId, { mode: 'arena', studentId: studentData.studentId, name: studentData.name, matchStatus: match.status });
      sTrace.push('arena:reconnect', { matchId: matchId.slice(-8), playerName: studentData.name, studentId: (studentData.studentId || '').slice(-8), socketId: socket.id.slice(0, 8), matchStatus: match.status, wasDisconnected: !!existingPlayer.disconnected });
      
      // Nettoyer l'ancien mapping socket si différent
      if (existingPlayer._oldSocketId && existingPlayer._oldSocketId !== socket.id) {
        this.playerMatches.delete(existingPlayer._oldSocketId);
      }
      existingPlayer.socketId = socket.id;
      existingPlayer.disconnected = false;
      delete existingPlayer.disconnectedAt;
      delete existingPlayer._oldSocketId;
      this.playerMatches.set(socket.id, matchId);
      
      // Rejoindre la room Socket.IO
      socket.join(matchId);
      logger.info(`[CrazyArena] APRÈS socket.join(${matchId}) [RECONNECT] - socket.rooms:`, Array.from(socket.rooms));
      
      // Notifier la reconnexion
      this.io.to(matchId).emit('arena:player-joined', {
        players: match.players.map(p => ({ 
          studentId: p.studentId, 
          name: p.name, 
          avatar: p.avatar,
          ready: p.ready
        })),
        count: match.players.length
      });
      
      // ✅ SYNC: Renvoyer l'état complet du jeu au joueur reconnecté (zones + scores + timer)
      if (match.status === 'playing' || match.status === 'tiebreaker' || match.status === 'paused') {
        const roundsPerMatch = match.config.rounds || match.config.roundsPerMatch || 3;
        const durationPerRound = match.config.duration || match.config.durationPerRound || 60;
        const totalDuration = roundsPerMatch * durationPerRound;
        const elapsed = Math.floor((Date.now() - match.startTime) / 1000);
        const elapsedInRound = elapsed % durationPerRound;
        const timeLeftInRound = Math.max(0, durationPerRound - elapsedInRound);

        // Envoyer les zones actuelles au joueur reconnecté
        if (match.zones && match.zones.length > 0) {
          socket.emit('arena:round-new', {
            zones: match.zones,
            roundIndex: match.roundsPlayed,
            totalRounds: roundsPerMatch,
            timestamp: Date.now(),
            _resync: true
          });
          logger.info(`[CrazyArena] 📤 Resync zones envoyé à ${studentData.name}: ${match.zones.length} zones, manche ${match.roundsPlayed + 1}`);
        }

        // Envoyer les scores actuels (tiebreaker-aware)
        const isTB = match.status === 'tiebreaker' || match.status === 'tiebreaker-countdown';
        const scoresPayload = {
          scores: match.players.map((p, idx) => ({
            studentId: p.studentId,
            name: p.name,
            avatar: p.avatar,
            playerIdx: idx,
            score: isTB ? (p.scoreBeforeTiebreaker || 0) + (p.tiebreakerScore || 0) : (p.score || 0),
            pairsValidated: isTB ? (p.pairsBeforeTiebreaker || 0) + (p.tiebreakerPairs || 0) : (p.pairsValidated || 0)
          })).sort((a, b) => b.score - a.score)
        };
        socket.emit('arena:scores-update', scoresPayload);

        // Envoyer le timer actuel
        socket.emit('arena:timer-tick', {
          timeLeft: timeLeftInRound,
          elapsed,
          duration: totalDuration,
          currentRound: match.roundsPlayed + 1,
          totalRounds: roundsPerMatch
        });

        logger.info(`[CrazyArena] ✅ État complet renvoyé à ${studentData.name} (zones=${match.zones?.length || 0}, timer=${timeLeftInRound}s, scores=${match.players.length} joueurs)`);
        sTrace.push('arena:resync', { matchId: matchId.slice(-8), player: studentData.name, zones: match.zones?.length || 0, timer: timeLeftInRound, round: match.roundsPlayed + 1 });
      }

      // ✅ Si le match était en pause (joueur déconnecté), reprendre automatiquement
      // FIX: Reprendre SEULEMENT si TOUS les joueurs déconnectés sont revenus
      if (match.status === 'paused' && match._pauseState) {
        const stillDisconnected = match.players.filter(p => p.disconnected);
        if (stillDisconnected.length === 0) {
          logger.info(`[CrazyArena] ▶️ Tous les joueurs déconnectés sont revenus → reprise du match`);
          this.resumeMatch(matchId);
        } else {
          logger.info(`[CrazyArena] ⏸️ ${studentData.name} reconnecté mais ${stillDisconnected.length} joueur(s) encore déconnecté(s): ${stillDisconnected.map(p => p.name).join(', ')}`);
        }
      }
      
      return true;
    }

    // NOUVEAU JOUEUR : Vérifier les conditions d'entrée
    if (match.status !== 'waiting') {
      sTrace.push('arena:join-reject', { reason: 'match_already_started', matchId: matchId.slice(-8), studentName: studentData.name, studentId: (studentData.studentId || '').slice(-8), matchStatus: match.status, socketId: socket.id.slice(0, 8) });
      socket.emit('arena:error', { message: 'Match déjà commencé - impossible de rejoindre' });
      return false;
    }

    // Pas de limite de joueurs — le professeur décide de la taille du groupe

    // Ajouter le joueur
    const player = {
      socketId: socket.id,
      studentId: studentData.studentId,
      authId: studentData.authId || null,
      name: studentData.name,
      avatar: studentData.avatar || '/avatars/default.png',
      ready: false,
      score: 0,
      pairsValidated: 0,
      errors: 0,
      timeMs: 0
    };

    match.players.push(player);
    this.playerMatches.set(socket.id, matchId);

    // Rejoindre la room Socket.IO
    logger.info(`[CrazyArena] AVANT socket.join(${matchId}) pour ${studentData.name}`);
    socket.join(matchId);
    logger.info(`[CrazyArena] APRÈS socket.join(${matchId}) - socket.rooms:`, Array.from(socket.rooms));

    logger.info(`[CrazyArena] ${studentData.name} a rejoint le match ${matchId} (${match.players.length}/4)`);

    // Notifier tous les joueurs
    logger.info(`[CrazyArena] Émission arena:player-joined à room ${matchId}, count=${match.players.length}`);
    const playersData = match.players.map(p => ({
      studentId: p.studentId,
      name: p.name,
      avatar: p.avatar,
      ready: p.ready,
      score: p.score
    }));
    
    this.io.to(matchId).emit('arena:player-joined', {
      players: match.players.map(p => ({
        studentId: p.studentId,
        name: p.name,
        avatar: p.avatar,
        ready: p.ready
      })),
      count: match.players.length
    });
    
    // Notifier aussi le dashboard professeur
    this.io.to(matchId).emit('arena:players-update', {
      matchId,
      players: playersData
    });
    logger.info(`[CrazyArena] arena:player-joined et arena:players-update émis avec succès`);

    sTrace.push('arena:player-joined', {
      matchId: matchId.slice(-8),
      playerName: studentData.name,
      studentId: (studentData.studentId || '').slice(-8),
      socketId: socket.id.slice(0, 8),
      playersCount: match.players.length,
      matchStatus: match.status,
      allPlayers: match.players.map(p => ({ name: p.name, sid: p.socketId?.slice(0, 8), ready: p.ready })),
      socketRooms: Array.from(socket.rooms)
    });

    // ✅ AUTO-REPRISE: Si le match était in_progress avant un redémarrage serveur,
    // relancer automatiquement dès que 2+ joueurs se sont reconnectés
    if (match.wasInProgress && match.players.length >= 2 && match.status === 'waiting') {
      logger.info(`[CrazyArena] 🔄 Auto-reprise du match ${matchId} après redémarrage serveur (${match.players.length} joueurs reconnectés)`);
      // Petit délai pour laisser les autres joueurs se reconnecter aussi
      setTimeout(() => {
        const m = this.matches.get(matchId);
        if (m && m.status === 'waiting' && m.wasInProgress) {
          logger.info(`[CrazyArena] 🚀 Reprise effective du match ${matchId} avec ${m.players.length} joueur(s)`);
          delete m.wasInProgress;
          this.startGame(matchId, true);
        }
      }, 3000); // 3s de grâce pour que tous les joueurs se reconnectent
    }

    return true;
  }

  /**
   * Un joueur marque comme prêt
   */
  playerReady(socket, studentId) {
    const matchId = this.playerMatches.get(socket.id);
    if (!matchId) {
      logger.warn('[CrazyArena][Arena] playerReady: Aucun match pour socket', { socketId: socket.id, studentId });
      sTrace.push('arena:ready-fail', { reason: 'no_match_for_socket', studentId: (studentId || '').slice(-8), socketId: socket.id.slice(0, 8), playerMatchesSize: this.playerMatches.size });
      return 'no_match_for_socket';
    }

    const match = this.matches.get(matchId);
    if (!match) {
      logger.error('[CrazyArena][Arena] playerReady: Match introuvable', { matchId, socketId: socket.id });
      sTrace.push('arena:ready-fail', { reason: 'match_not_found', matchId: matchId.slice(-8), studentId: (studentId || '').slice(-8), socketId: socket.id.slice(0, 8) });
      return 'match_not_found';
    }

    const player = match.players.find(p => p.socketId === socket.id);
    if (!player) {
      logger.warn('[CrazyArena][Arena] playerReady: Joueur introuvable', { matchId, socketId: socket.id, playersInMatch: match.players.map(p => ({ name: p.name, socketId: p.socketId?.slice(0, 8) })) });
      sTrace.push('arena:ready-fail', { reason: 'player_not_found_by_socket', matchId: matchId.slice(-8), studentId: (studentId || '').slice(-8), socketId: socket.id.slice(0, 8), playersInMatch: match.players.map(p => ({ name: p.name, sid: p.socketId?.slice(0, 8) })) });
      return 'player_not_found';
    }
    
    player.ready = true;
    
    const readyCount = match.players.filter(p => p.ready).length;
    const totalCount = match.players.length;
    
    logger.info('[CrazyArena][Arena] Joueur marqué prêt (lobby)', { 
      matchId, 
      studentId, 
      readyCount, 
      totalCount,
      allReady: readyCount === totalCount
    });
    
    const playersData = match.players.map(p => ({ 
      studentId: p.studentId, 
      name: p.name, 
      avatar: p.avatar,
      ready: p.ready,
      score: p.score
    }));
    
    this.io.to(matchId).emit('arena:player-ready', {
      players: match.players.map(p => ({ 
        studentId: p.studentId, 
        name: p.name, 
        avatar: p.avatar,
        ready: p.ready
      }))
    });
    
    // Notifier aussi le dashboard professeur
    this.io.to(matchId).emit('arena:players-update', {
      matchId,
      players: playersData
    });
    
    sTrace.push('arena:ready-ok', { 
      matchId: matchId.slice(-8), 
      playerName: player.name,
      studentId: (studentId || '').slice(-8),
      readyCount, 
      totalCount,
      allPlayersState: match.players.map(p => ({ name: p.name, ready: p.ready, sid: p.socketId?.slice(0, 8) })),
      socketRooms: Array.from(socket.rooms)
    });
    
    logger.info('[CrazyArena][Arena] Événements Socket.IO émis (lobby)', { 
      matchId, 
      events: ['arena:player-ready', 'arena:players-update'],
      readyCount,
      totalCount
    });

    // NE PLUS démarrer automatiquement - attendre arena:force-start du professeur
    return 'ok';
  }

  /**
   * Démarrage forcé par le professeur (2-4 joueurs)
   */
  forceStart(matchId) {
    const match = this.matches.get(matchId);
    
    if (!match) {
      logger.error(`[CrazyArena] forceStart: Match ${matchId} introuvable`);
      return false;
    }

    if (match.status === 'countdown' || match.status === 'playing') {
      logger.info(`[CrazyArena] forceStart: Match ${matchId} déjà en ${match.status} — OK`);
      return true; // ✅ Idempotent: already starting/playing is fine
    }
    if (match.status !== 'waiting') {
      logger.warn(`[CrazyArena] forceStart: Match ${matchId} statut ${match.status} — refusé`);
      return false;
    }

    if (match.players.length < 2) {
      logger.warn(`[CrazyArena] forceStart: Match ${matchId} a seulement ${match.players.length} joueur(s) (min 2)`);
      return false;
    }

    const readyCount = match.players.filter(p => p.ready).length;
    if (readyCount !== match.players.length) {
      logger.warn(`[CrazyArena] forceStart: Match ${matchId} - tous les joueurs ne sont pas prêts (${readyCount}/${match.players.length})`);
      return false;
    }

    logger.info(`[CrazyArena] 🚀 Démarrage forcé du match ${matchId} avec ${match.players.length} joueur(s) (tous prêts)`);
    this.startCountdown(matchId);
    return true;
  }

  /**
   * Countdown 3...2...1...GO!
   */
  startCountdown(matchId) {
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'waiting') return;

    match.status = 'countdown';
    logger.info(`[CrazyArena] Countdown démarré pour match ${matchId}`);

    let count = 3;
    const interval = setInterval(() => {
      this.io.to(matchId).emit('arena:countdown', { count });
      count--;

      if (count < 0) {
        clearInterval(interval);
        this.startGame(matchId);
      }
    }, 1000);
  }

  /**
   * Démarrer la partie
   */
  async startGame(matchId, isResume = false) {
    const match = this.matches.get(matchId);
    if (!match) return;

    match.status = 'playing';
    match.startTime = Date.now();
    match.roundsPlayed = 0;
    match.validatedPairIds = new Set();

    logger.info(`[CrazyArena] Partie démarrée pour match ${matchId}`);
    _logMatchEvent('MATCH_START', matchId, { mode: 'arena', playersCount: match.players.length, players: match.players.map(p => ({ studentId: p.studentId, name: p.name })), config: { rounds: match.config.rounds, duration: match.config.duration, themes: match.config.themes, classes: match.config.classes } });

    // Générer les zones (utiliser la même logique que le mode multijoueur classique)
    const zones = await this.generateZones(match.config, matchId);
    match.zones = zones;
    
    logger.info(`[CrazyArena] 🎯 Carte générée: ${zones.length} zones, 1 paire à trouver (règle: 1 paire/carte)`);

    // Initialiser les scores
    match.players.forEach(p => {
      match.scores[p.studentId] = { score: 0, pairsValidated: 0, errors: 0, timeMs: 0 };
    });

    // Notifier le démarrage avec les zones ET la config
    const gameStartPayload = {
      matchId,  // ✅ Ajouter matchId pour que le dashboard puisse update le status
      zones,
      duration: match.config.duration || 60,
      startTime: match.startTime,
      config: match.config,  // ✅ Transmettre config (themes, classes, etc.)
      players: match.players.map(p => ({
        studentId: p.studentId,
        name: p.name,
        avatar: p.avatar,
        score: 0
      }))
    };
    
    logger.info('[CrazyArena] 🚀 Émission arena:game-start avec config:', {
      matchId: matchId.slice(-8),
      hasConfig: !!gameStartPayload.config,
      configThemes: gameStartPayload.config?.themes,
      configClasses: gameStartPayload.config?.classes,
      zonesCount: zones.length
    });
    
    // Valider les zones avant émission (monitoring double PA / fausse paire)
    try { validateZonesServer(zones, { source: 'arena:game-start', matchId: matchId.slice(-8) }); } catch (e) { logger.warn('[CrazyArena] Zone validation error:', e.message); }
    
    // 💾 Accumuler les zones de chaque round pour archivage Supabase
    if (!match._roundsData) match._roundsData = [];
    match._roundsData.push({
      roundIndex: 0,
      timestamp: new Date().toISOString(),
      zones: zones.map(z => ({ id: z.id, type: z.type, content: z.content, pairId: z.pairId || '', isDistractor: !!z.isDistractor, points: z.points, arcPoints: z.arcPoints, angle: z.angle, mathOffset: z.mathOffset }))
    });

    // 📊 DIAGNOSTIC PÉDAGOGIQUE: Initialiser roundHistory (Arena)
    match._roundHistory = [];
    const gpA0 = match._lastGoodPairIds || {};
    match._roundHistory.push({
      round_number: 1,
      zones: zones.map(z => ({ id: z.id, type: z.type, content: z.content, pairId: z.pairId || null, isDistractor: !!z.isDistractor })),
      good_pair_type: gpA0.pairType || null,
      good_pair_theme: gpA0.theme || null,
      good_pair_level: gpA0.level || null,
      good_pair_content: gpA0.contentA ? { a: gpA0.contentA, b: gpA0.contentB } : null,
      winner_player_id: null,
      winner_display_name: null,
      winner_time_ms: null,
      errors: [],
      _startedAt: Date.now()
    });

    // ✅ Log round to monitoring dashboard
    const pairZones = zones.filter(z => z.pairId);
    _logArenaRound({
      id: `arena_${matchId.slice(-8)}_r0_${Date.now()}`,
      timestamp: new Date().toISOString(),
      mode: 'arena',
      source: 'arena:game-start',
      matchId: matchId.slice(-8),
      roundIndex: 0,
      validPairs: Math.floor(pairZones.length / 2),
      doublePairIssues: 0,
      issues: [],
      summary: { totalZones: zones.length, pairedCount: pairZones.length },
      zonesSnapshot: zones.map(z => ({ id: z.id, type: z.type, content: String(z.content || '').substring(0, 80), pairId: z.pairId || '', isDistractor: !!z.isDistractor })),
      zonesFull: zones.map(z => ({ id: z.id, type: z.type, content: z.content, pairId: z.pairId || '', isDistractor: !!z.isDistractor, points: z.points, arcPoints: z.arcPoints, angle: z.angle, mathOffset: z.mathOffset }))
    });
    
    this.io.to(matchId).emit('arena:game-start', gameStartPayload);

    // 💾 PERSISTENCE: Créer match_results initiaux en DB (skip si reprise après redémarrage)
    if (!isResume) {
      this.persistArenaMatchStart(matchId).catch(err => {
        logger.error('[CrazyArena][Arena] Erreur persistArenaMatchStart (non-bloquante)', { matchId, error: err.message });
      });
    } else {
      logger.info(`[CrazyArena] 🔄 Reprise: skip persistArenaMatchStart (match_results déjà en DB)`);
    }

    // ⏱️ CHRONO: Diffuser le temps restant toutes les secondes
    // ✅ CORRECTION: Timer TOTAL = rounds × duration (ex: 3 × 60s = 180s)
    const roundsPerMatch = match.config.rounds || match.config.roundsPerMatch || 3;
    const durationPerRound = match.config.duration || match.config.durationPerRound || 60;
    const totalDuration = roundsPerMatch * durationPerRound;
    
    logger.info(`[CrazyArena] ⏱️  Timer configuré: ${roundsPerMatch} rounds × ${durationPerRound}s = ${totalDuration}s TOTAL`);
    
    match.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - match.startTime) / 1000);
      const timeLeft = Math.max(0, totalDuration - elapsed);
      
      // ✅ NOUVELLE MANCHE toutes les durationPerRound secondes (60s, 120s, etc.)
      const currentRound = Math.floor(elapsed / durationPerRound);
      if (currentRound > match.roundsPlayed && currentRound < roundsPerMatch) {
        match.roundsPlayed = currentRound;
        logger.info(`[CrazyArena] 🔔 Nouvelle manche #${match.roundsPlayed + 1} démarrée (${elapsed}s écoulées)`);
        
        // Réinitialiser le verrou de paire (nouvelle manche = nouvelle carte)
        match._pairClaimLock = null;
        
        // Générer nouvelle carte pour la nouvelle manche
        this.generateZones(match.config, matchId).then(newZones => {
          match.zones = newZones;
          logger.info(`[CrazyArena] 🎯 Nouvelle carte pour manche ${match.roundsPlayed + 1}: ${newZones.length} zones`);
          
          // Valider les zones avant émission (monitoring double PA / fausse paire)
          try { validateZonesServer(newZones, { source: 'arena:round-new', matchId: matchId.slice(-8), roundIndex: match.roundsPlayed }); } catch (e) { logger.warn('[CrazyArena] Zone validation error (round-new):', e.message); }
          // 💾 Accumuler zones pour archivage
          if (!match._roundsData) match._roundsData = [];
          match._roundsData.push({
            roundIndex: match.roundsPlayed,
            timestamp: new Date().toISOString(),
            zones: newZones.map(z => ({ id: z.id, type: z.type, content: z.content, pairId: z.pairId || '', isDistractor: !!z.isDistractor, points: z.points, arcPoints: z.arcPoints, angle: z.angle, mathOffset: z.mathOffset }))
          });

          // 📊 DIAGNOSTIC: Pousser nouveau round (changement de manche par timer, Arena)
          if (match._roundHistory) {
            const gpATimer = match._lastGoodPairIds || {};
            match._roundHistory.push({
              round_number: match._roundHistory.length + 1,
              zones: newZones.map(z => ({ id: z.id, type: z.type, content: z.content, pairId: z.pairId || null, isDistractor: !!z.isDistractor })),
              good_pair_type: gpATimer.pairType || null,
              good_pair_theme: gpATimer.theme || null,
              good_pair_level: gpATimer.level || null,
              good_pair_content: gpATimer.contentA ? { a: gpATimer.contentA, b: gpATimer.contentB } : null,
              winner_player_id: null,
              winner_display_name: null,
              winner_time_ms: null,
              errors: [],
              _startedAt: Date.now()
            });
          }

          // ✅ Log round to monitoring
          const _pz = newZones.filter(z => z.pairId);
          _logArenaRound({
            id: `arena_${matchId.slice(-8)}_r${match.roundsPlayed}_${Date.now()}`,
            timestamp: new Date().toISOString(), mode: 'arena', source: 'arena:round-new',
            matchId: matchId.slice(-8), roundIndex: match.roundsPlayed,
            validPairs: Math.floor(_pz.length / 2), doublePairIssues: 0, issues: [],
            summary: { totalZones: newZones.length, pairedCount: _pz.length },
            zonesSnapshot: newZones.map(z => ({ id: z.id, type: z.type, content: String(z.content || '').substring(0, 80), pairId: z.pairId || '', isDistractor: !!z.isDistractor })),
            zonesFull: newZones.map(z => ({ id: z.id, type: z.type, content: z.content, pairId: z.pairId || '', isDistractor: !!z.isDistractor, points: z.points, arcPoints: z.arcPoints, angle: z.angle, mathOffset: z.mathOffset }))
          });
          // Émettre nouvelle carte à tous les joueurs
          this.io.to(matchId).emit('arena:round-new', {
            zones: newZones,
            roundIndex: match.roundsPlayed,
            totalRounds: roundsPerMatch,
            timestamp: Date.now()
          });
          
          logger.info(`[CrazyArena] ✅ Manche ${match.roundsPlayed + 1}/${roundsPerMatch} démarrée`);
        }).catch(err => {
          logger.error('[CrazyArena] Erreur génération nouvelle carte manche:', err);
        });
      }
      
      // ✅ FIX: Afficher temps restant dans la MANCHE ACTUELLE (pas global)
      const elapsedInRound = elapsed % durationPerRound;
      const timeLeftInRound = Math.max(0, durationPerRound - elapsedInRound);
      
      logger.info(`[CrazyArena] Émission arena:timer-tick: timeLeft=${timeLeftInRound}s (manche ${match.roundsPlayed + 1}/${roundsPerMatch})`);
      this.io.to(matchId).emit('arena:timer-tick', {
        timeLeft: timeLeftInRound,  // Temps restant dans la manche actuelle
        elapsed,
        duration: totalDuration,
        currentRound: match.roundsPlayed + 1,
        totalRounds: roundsPerMatch
      });
      
      if (timeLeft === 0) {
        logger.info(`[CrazyArena] ⏰ Timer terminé pour match ${matchId}`);
        clearInterval(match.timerInterval);
        this.endGame(matchId);
      }
    }, 1000);
  }

  /**
   * Générer les zones avec exclusion FIFO des paires déjà validées
   */
  async generateZones(config, matchId = null) {
    // Utiliser le générateur de zones du serveur
    const { generateRoundZones, createDeckState } = require('./utils/serverZoneGenerator');
    const seed = Math.floor(Math.random() * 1000000000);
    
    try {
      // ✅ FIX: themes vide = pas de filtre thème (tous domaines activés côté client)
      // NE PAS faire de fallback vers des thèmes par défaut — ça cassait le filtrage
      const finalClasses = Array.isArray(config.classes) && config.classes.length > 0 ? config.classes : [];
      const finalThemes = Array.isArray(config.themes) && config.themes.length > 0 ? config.themes : [];
      const finalExtras = Array.isArray(config.extras) ? config.extras.filter(Boolean) : [];
      
      // ✅ CRITIQUE: Récupérer les paires exclues du match (FIFO)
      let excludedPairIds = new Set();
      let deckState = null;
      if (matchId) {
        const match = this.matches.get(matchId);
        if (match) {
          if (match.validatedPairIds) {
            excludedPairIds = match.validatedPairIds;
            logger.info(`[ZoneGen] 🚫 Exclusion FIFO: ${excludedPairIds.size} paires`);
          }
          // Anti-repetition deck per match
          if (!match.deckState) match.deckState = createDeckState();
          deckState = match.deckState;
        }
      }
      
      // ✅ FIX: Transmettre selectedLevel pour filtrage LEVEL_INCLUDES côté serveur
      const selectedLevel = config.selectedLevel || config.level || null;
      
      logger.info('[ZoneGen] Config:', {
        seed,
        classes: finalClasses,
        themes: finalThemes,
        extras: finalExtras,
        selectedLevel,
        excludedCount: excludedPairIds.size,
        hasDeck: !!deckState
      });
      
      // IMPORTANT: Passer excludedPairIds + deckState + extras + selectedLevel au générateur
      const result = generateRoundZones(seed, {
        classes: finalClasses,
        themes: finalThemes,
        extras: finalExtras,
        selectedLevel: selectedLevel,
        excludedPairIds: excludedPairIds,
        deckState: deckState,
        logFn: (level, message, data) => {
          const wLevel = (level === 'error' || level === 'warn' || level === 'info') ? level : 'info';
          logger[wLevel](message, { room: matchId || 'arena', ...data });
        }
      });
      
      // generateRoundZones retourne {zones: [], goodPairIds: {}}
      const zones = result.zones || [];
      const goodPairIds = result.goodPairIds || {};
      
      // Stocker goodPairIds sur le match pour diagnostic pédagogique
      if (matchId) {
        const m = this.matches.get(matchId);
        if (m) m._lastGoodPairIds = goodPairIds;
      }
      
      logger.info('[ZoneGen] ✅ Zones générées:', zones.length);
      return zones;
    } catch (error) {
      logger.error('[ZoneGen] ❌ Erreur:', error);
      return [];
    }
  }

  /**
   * Un joueur valide une paire
   */
  pairValidated(socket, data) {
    let matchId = this.playerMatches.get(socket.id);
    
    // ✅ Fallback: essayer data.matchId si le mapping socket→match est perdu (reconnexion)
    if (!matchId && data.matchId) {
      const fallbackMatch = this.matches.get(data.matchId);
      if (fallbackMatch) {
        const playerByStudent = fallbackMatch.players.find(p => p.studentId === data.studentId);
        if (playerByStudent) {
          logger.info('[CrazyArena][Arena] pairValidated: Récupération mapping socket via data.matchId', { matchId: data.matchId, socketId: socket.id, studentId: data.studentId });
          playerByStudent.socketId = socket.id;
          this.playerMatches.set(socket.id, data.matchId);
          socket.join(data.matchId);
          matchId = data.matchId;
        }
      }
    }
    
    if (!matchId) {
      logger.warn('[CrazyArena][Arena] pairValidated: Aucun match pour socket', { socketId: socket.id, dataMatchId: data.matchId });
      socket.emit('arena:match-lost', { reason: 'Match introuvable. Le serveur a peut-être redémarré.' });
      return;
    }

    const match = this.matches.get(matchId);
    if (!match) {
      logger.error('[CrazyArena][Arena] pairValidated: Match introuvable', { matchId, socketId: socket.id });
      socket.emit('arena:match-lost', { reason: 'Match introuvable. Le serveur a peut-être redémarré.' });
      this.playerMatches.delete(socket.id);
      return;
    }
    
    if (match.status === 'paused') {
      // Match en pause — ne pas logger en warning, c'est un comportement normal
      socket.emit('arena:action-blocked', { reason: 'Match en pause — un joueur est déconnecté' });
      return;
    }
    if (match.status !== 'playing' && match.status !== 'tiebreaker' && match.status !== 'tiebreaker-countdown') {
      logger.warn('[CrazyArena][Arena] pairValidated: Statut invalide', { matchId, status: match.status, expected: ['playing', 'tiebreaker', 'tiebreaker-countdown'] });
      return;
    }

    const player = match.players.find(p => p.socketId === socket.id);
    if (!player) {
      logger.warn('[CrazyArena][Arena] pairValidated: Joueur introuvable', { matchId, socketId: socket.id });
      return;
    }

    const { studentId, isCorrect, timeMs, pairId, zoneAId, zoneBId } = data;

    logger.info('[CrazyArena][Arena] Paire validée', { 
      matchId, 
      studentId, 
      isCorrect, 
      timeMs,
      pairId, 
      zoneA: zoneAId, 
      zoneB: zoneBId,
      status: match.status
    });

    // ✅ ANTI-DOUBLON: Fenêtre d'égalité 200ms pour empêcher le double score Arena
    if (isCorrect && pairId) {
      // Validation serveur: vérifier que le pairId correspond à la carte actuelle
      if (match.zones && match.zones.length > 0) {
        const validPairZones = match.zones.filter(z => z.pairId === pairId);
        if (validPairZones.length < 2) {
          logger.warn('[CrazyArena][Arena] ❌ pairId invalide (pas dans la carte actuelle)', { matchId, studentId, pairId });
          return;
        }
      }

      const now = Date.now();
      if (match._pairClaimLock) {
        // Un verrou existe déjà pour cette carte
        if (match._pairClaimLock.claimants.has(studentId)) {
          logger.info('[CrazyArena][Arena] Claim ignoré (doublon même joueur)', { matchId, studentId });
          return;
        }
        const elapsed = now - match._pairClaimLock.timestamp;
        if (elapsed > ARENA_TIE_WINDOW_MS) {
          // Trop tard — la paire a déjà été validée par un autre joueur
          logger.info('[CrazyArena][Arena] ⏰ Claim rejeté (hors fenêtre)', { matchId, studentId, elapsed, window: ARENA_TIE_WINDOW_MS });
          socket.emit('arena:claim-rejected', { reason: 'late', pairId });
          return;
        }
        // Égalité dans la fenêtre → ajouter aux réclamants
        match._pairClaimLock.claimants.add(studentId);
        logger.info('[CrazyArena][Arena] ⚡ Égalité détectée dans la fenêtre', { matchId, studentId, elapsed, window: ARENA_TIE_WINDOW_MS });
        sTrace.push('arena:equality-window', {
          matchId: matchId.slice(-8), studentId: studentId.slice(-8),
          elapsed, windowMs: ARENA_TIE_WINDOW_MS,
          claimants: Array.from(match._pairClaimLock.claimants).length
        });
      } else {
        // Premier claim → créer le verrou
        match._pairClaimLock = { pairId, timestamp: now, claimants: new Set([studentId]), cardGenScheduled: false };
        logger.info('[CrazyArena][Arena] 🔒 Premier claim, verrou posé', { matchId, studentId, pairId });
      }
    }

    // Mettre à jour le score
    if (isCorrect) {
      // ✅ TIEBREAKER: Comptabiliser séparément pour addition finale
      if (match.status === 'tiebreaker' || match.status === 'tiebreaker-countdown') {
        const oldScore = player.tiebreakerScore || 0;
        player.tiebreakerScore = oldScore + 1;
        player.tiebreakerPairs = (player.tiebreakerPairs || 0) + 1;
        
        // Incrémenter pairsFound uniquement pour le premier réclamant (pas les égalités)
        const isFirstClaimTB = match._pairClaimLock && !match._pairClaimLock.cardGenScheduled;
        if (isFirstClaimTB) {
          match.tiebreakerPairsFound = (match.tiebreakerPairsFound || 0) + 1;
        }
        
        logger.info('[CrazyArena][Arena] Score tiebreaker mis à jour', { 
          matchId, 
          studentId,
          playerName: player.name,
          oldScore,
          newScore: player.tiebreakerScore,
          pairsFound: match.tiebreakerPairsFound,
          pairsToFind: match.tiebreakerPairsToFind,
          isFirstClaim: isFirstClaimTB
        });

        // 📊 MONITORING: Tracer tiebreaker pair dans sTrace
        const _tbPairIdx = (match._pairEventCount = (match._pairEventCount || 0) + 1);
        const _tbClaimants = match._pairClaimLock ? Array.from(match._pairClaimLock.claimants).map(sid => { const pl = match.players.find(p => p.studentId === sid); return pl?.name || sid.slice(-6); }) : [player.name];
        const _tbScores = match.players.map(p => ({ name: p.name, score: (p.scoreBeforeTiebreaker || 0) + (p.tiebreakerScore || 0) }));
        sTrace.push('arena:pair-validated', {
          matchId: matchId.slice(-8), pairEvent: _tbPairIdx, round: match.tiebreakerPairsFound,
          isTiebreaker: true, claimantsCount: _tbClaimants.length,
          claimantNames: _tbClaimants, scoresAfter: _tbScores
        });

        // 💾 PERSISTENCE: Sauvegarder le score tiebreaker Arena en DB
        this.persistArenaScoreUpdate(matchId, studentId);
        // 📊 MAÎTRISE: Enregistrer la tentative pour le suivi par thème
        this.persistAttempt(match, player, { isCorrect: true, pairId, zoneAId, zoneBId });
        
        // ✅ FIX: Émettre arena:pair-validated pour déclencher les bulles d'animation (comme mode normal)
        if (pairId) {
          const playerIdx = match.players.findIndex(p => p.studentId === studentId);
          this.io.to(matchId).emit('arena:pair-validated', {
            pairId,
            zoneAId,
            zoneBId,
            playerName: player.name,
            studentId,
            playerIdx,
            timestamp: Date.now()
          });
          
          logger.info('[CrazyArena][Arena] Événement arena:pair-validated émis (tiebreaker)', { 
            matchId, studentId, playerIdx, pairId, event: 'arena:pair-validated'
          });
        }
        
        if (match.tiebreakerPairsFound >= match.tiebreakerPairsToFind) {
          // ✅ FIX: Émettre scores-update AVANT de return (sinon UI figée)
          const tbScoresLast = {
            scores: match.players.map((p, idx) => ({
              studentId: p.studentId,
              name: p.name,
              playerIdx: idx,
              score: (p.scoreBeforeTiebreaker || 0) + (p.tiebreakerScore || 0),
              pairsValidated: (p.pairsBeforeTiebreaker || 0) + (p.tiebreakerPairs || 0)
            })).sort((a, b) => b.score - a.score)
          };
          this.io.to(matchId).emit('arena:scores-update', tbScoresLast);

          // ✅ FIX ÉGALITÉ TIEBREAKER: Ne pas terminer immédiatement !
          // Attendre la fenêtre d'égalité pour que le 2e joueur qui clique
          // simultanément puisse aussi marquer le point avant la fin.
          // Ensuite vérifier si c'est encore à égalité → prolonger si oui.
          if (!match._tiebreakerEndScheduled) {
            match._tiebreakerEndScheduled = true;
            if (match._pairClaimLock) match._pairClaimLock.cardGenScheduled = true;
            logger.info('[CrazyArena][Arena] Tiebreaker dernière paire trouvée — attente fenêtre égalité', { 
              matchId, 
              pairsFound: match.tiebreakerPairsFound,
              pairsToFind: match.tiebreakerPairsToFind,
              delayMs: ARENA_TIE_WINDOW_MS
            });
            setTimeout(async () => {
              // Vérifier si les scores tiebreaker sont encore à égalité
              const tbScores = match.players
                .filter(p => p.tiebreakerScore !== undefined)
                .map(p => p.tiebreakerScore || 0);
              const maxTbScore = Math.max(...tbScores);
              const playersAtMax = tbScores.filter(s => s === maxTbScore).length;

              if (playersAtMax > 1 && maxTbScore > 0) {
                // ⚡ Encore égalité ! Prolonger avec une carte supplémentaire
                logger.info('[CrazyArena][Arena] ⚡ Tiebreaker encore à égalité — prolongation !', {
                  matchId,
                  tbScores: match.players.map(p => ({ name: p.name, tbScore: p.tiebreakerScore })),
                  newPairsToFind: match.tiebreakerPairsToFind + 1
                });
                match.tiebreakerPairsToFind += 1;
                match._tiebreakerEndScheduled = false;
                match._pairClaimLock = null;

                // Notifier les joueurs de la prolongation
                this.io.to(matchId).emit('arena:tiebreaker-extended', {
                  reason: 'equality',
                  newPairsToFind: match.tiebreakerPairsToFind,
                  pairsFound: match.tiebreakerPairsFound,
                  scores: match.players.map(p => ({ studentId: p.studentId, name: p.name, tbScore: p.tiebreakerScore }))
                });

                // Générer et envoyer une nouvelle carte
                try {
                  const newZones = await this.generateZones(match.config, matchId);
                  match.zones = newZones;
                  
                  const payload = {
                    zones: newZones,
                    roundIndex: match.tiebreakerPairsFound,
                    totalRounds: match.tiebreakerPairsToFind,
                    timestamp: Date.now()
                  };
                  
                  try { validateZonesServer(newZones, { source: 'arena:tiebreaker-extension', matchId: matchId.slice(-8) }); } catch (e) { logger.warn('[CrazyArena] Zone validation error (tiebreaker ext):', e.message); }
                  this.io.to(matchId).emit('arena:round-new', payload);
                  
                  logger.info('[CrazyArena][Arena] Carte prolongation tiebreaker envoyée', {
                    matchId,
                    zonesCount: newZones?.length || 0,
                    newPairsToFind: match.tiebreakerPairsToFind
                  });
                } catch (err) {
                  logger.error('[CrazyArena][Arena] Erreur génération carte prolongation', { matchId, error: err.message });
                  this.endGame(matchId);
                }
              } else {
                // Un joueur est en avance → terminer normalement
                this.endGame(matchId);
              }
            }, ARENA_TIE_WINDOW_MS);
          }
          return;
        }
        
        // ✅ Émettre scores-update pendant le tiebreaker (sinon UI reste à 0)
        const tbScoresPayload = {
          scores: match.players.map((p, idx) => ({
            studentId: p.studentId,
            name: p.name,
            playerIdx: idx,
            score: (p.scoreBeforeTiebreaker || 0) + (p.tiebreakerScore || 0),
            pairsValidated: (p.pairsBeforeTiebreaker || 0) + (p.tiebreakerPairs || 0)
          })).sort((a, b) => b.score - a.score)
        };
        this.io.to(matchId).emit('arena:scores-update', tbScoresPayload);

        // ✅ Générer nouvelle carte tiebreaker UNIQUEMENT pour le premier réclamant
        if (isFirstClaimTB && match._pairClaimLock) {
          match._pairClaimLock.cardGenScheduled = true;
          setTimeout(async () => {
            try {
              // Libérer le verrou — nouvelle carte = nouveaux claims possibles
              match._pairClaimLock = null;

              // ✅ FIX RACE CONDITION: Vérifier que le match est toujours en tiebreaker
              if (match.status === 'finished') {
                logger.info('[CrazyArena][Arena] ⚠️ Carte tiebreaker annulée — match déjà terminé', { matchId });
                return;
              }
              logger.info('[CrazyArena][Arena] Génération nouvelle carte tiebreaker', { 
                matchId, 
                cardNumber: match.tiebreakerPairsFound + 1,
                totalCards: match.tiebreakerPairsToFind,
                pairsRemaining: match.tiebreakerPairsToFind - match.tiebreakerPairsFound
              });
              
              const newZones = await this.generateZones(match.config, matchId);
              match.zones = newZones;
              
              logger.info('[CrazyArena][Arena] Carte tiebreaker générée', { 
                matchId, 
                zonesCount: newZones?.length || 0,
                cardNumber: match.tiebreakerPairsFound + 1
              });
              
              const payload = {
                zones: newZones,
                roundIndex: match.tiebreakerPairsFound,
                totalRounds: match.tiebreakerPairsToFind,
                timestamp: Date.now()
              };
              
              // Valider les zones avant émission (monitoring double PA / fausse paire)
              try { validateZonesServer(newZones, { source: 'arena:tiebreaker-round', matchId: matchId.slice(-8) }); } catch (e) { logger.warn('[CrazyArena] Zone validation error (tiebreaker):', e.message); }
              this.io.to(matchId).emit('arena:round-new', payload);
              
              logger.info('[CrazyArena][Arena] Événement arena:round-new émis (tiebreaker)', { 
                matchId, 
                zonesCount: newZones?.length || 0,
                roundIndex: match.tiebreakerPairsFound,
                event: 'arena:round-new'
              });
            } catch (err) {
              logger.error('[CrazyArena][Arena] Erreur génération carte tiebreaker', { 
                matchId, 
                error: err.message,
                stack: err.stack?.slice(0, 200)
              });
            }
          }, 1500);
        }
        
        return; // Sortir pour éviter double génération
      } else {
        const oldScore = player.score || 0;
        player.score = oldScore + 1;
        player.pairsValidated = (player.pairsValidated || 0) + 1;
        
        logger.info('[CrazyArena][Arena] Score mis à jour (mode normal)', { 
          matchId, 
          studentId,
          oldScore,
          newScore: player.score,
          pairsValidated: player.pairsValidated
        });

        // 📊 MONITORING: Tracer dans sTrace pour le rapport
        const _arenaScoresBefore = match.players.map(p => ({ name: p.name, score: (p.studentId === studentId ? oldScore : p.score) }));
        const _arenaScoresAfter = match.players.map(p => ({ name: p.name, score: p.score }));
        const _arenaPairIdx = (match._pairEventCount = (match._pairEventCount || 0) + 1);
        const _claimantNames = match._pairClaimLock ? Array.from(match._pairClaimLock.claimants).map(sid => { const pl = match.players.find(p => p.studentId === sid); return pl?.name || sid.slice(-6); }) : [player.name];
        sTrace.push('arena:pair-validated', {
          matchId: matchId.slice(-8), pairEvent: _arenaPairIdx, round: match.roundsPlayed,
          isTiebreaker: false, claimantsCount: _claimantNames.length,
          claimantNames: _claimantNames, scoresBeforeUpdate: _arenaScoresBefore
        });
        sTrace.push('arena:score-update', {
          matchId: matchId.slice(-8), pairEvent: _arenaPairIdx, claimantsCount: _claimantNames.length,
          claimantNames: _claimantNames, isTiebreaker: false,
          scoresAfter: _arenaScoresAfter
        });
      }

      // 💾 PERSISTENCE: Sauvegarder le score Arena en DB (fire-and-forget)
      this.persistArenaScoreUpdate(matchId, studentId);
    } else {
      // Mauvaise paire: aucune pénalité, juste compteur erreurs
      logger.info('[CrazyArena][Arena] Paire incorrecte - pas de pénalité', { 
        matchId, 
        studentId,
        status: match.status
      });
      player.errors = (player.errors || 0) + 1;

      // 📊 DIAGNOSTIC: Enregistrer l'erreur dans le roundHistory courant (Arena)
      if (match._roundHistory && match._roundHistory.length > 0) {
        const lastEntryA = match._roundHistory[match._roundHistory.length - 1];
        lastEntryA.errors.push({ player_id: studentId, display_name: player.name, timestamp: Date.now() });
      }

      // 💾 PERSISTENCE: Sauvegarder les erreurs Arena en DB
      this.persistArenaScoreUpdate(matchId, studentId);
    }

    // 📊 MAÎTRISE: Enregistrer la tentative pour le suivi par thème (correct et incorrect)
    this.persistAttempt(match, player, { isCorrect, pairId, zoneAId, zoneBId });

    match.scores[studentId] = {
      score: player.score,
      pairsValidated: player.pairsValidated,
      errors: player.errors,
      timeMs: Date.now() - match.startTime
    };

    // ✅ SYNCHRONISER la paire validée à TOUS les joueurs
    if (isCorrect && pairId) {
      const playerIdx = match.players.findIndex(p => p.studentId === studentId);
      const pairValidatedPayload = {
        studentId,
        playerName: player.name,
        playerIdx,
        pairId,
        zoneAId,
        zoneBId,
        timestamp: Date.now()
      };
      
      this.io.to(matchId).emit('arena:pair-validated', pairValidatedPayload);
      
      logger.info('[CrazyArena][Arena] Événement arena:pair-validated émis', { 
        matchId, 
        studentId,
        playerName: player.name,
        pairId,
        zoneA: zoneAId,
        zoneB: zoneBId,
        event: 'arena:pair-validated'
      });
      
      // ✅ FIFO + Génération nouvelle carte: UNIQUEMENT pour le premier réclamant
      const isFirstClaimNormal = match._pairClaimLock && !match._pairClaimLock.cardGenScheduled;
      if (isFirstClaimNormal) {
        match._pairClaimLock.cardGenScheduled = true;

        if (!match.validatedPairIds) match.validatedPairIds = new Set();
        
        const MAX_EXCLUDED_PAIRS = 15;
        
        if (match.validatedPairIds.size >= MAX_EXCLUDED_PAIRS) {
          const pairIdsArray = Array.from(match.validatedPairIds);
          const oldestPairId = pairIdsArray[0];
          match.validatedPairIds.delete(oldestPairId);
          logger.info('[CrazyArena][Arena] FIFO: Paire la plus ancienne supprimée', { matchId, oldestPairId, maxSize: MAX_EXCLUDED_PAIRS });
        }
        
        match.validatedPairIds.add(pairId);
        
        logger.info('[CrazyArena][Arena] FIFO: Paire ajoutée aux exclusions', { 
          matchId, 
          pairId,
          excludedCount: match.validatedPairIds.size,
          maxExcluded: MAX_EXCLUDED_PAIRS
        });
        
        // 📊 DIAGNOSTIC: Enregistrer le gagnant dans le roundHistory courant (Arena)
        if (match._roundHistory && match._roundHistory.length > 0) {
          const lastEntryAW = match._roundHistory[match._roundHistory.length - 1];
          if (!lastEntryAW.winner_player_id) {
            lastEntryAW.winner_player_id = studentId;
            lastEntryAW.winner_display_name = player.name;
            lastEntryAW.winner_time_ms = lastEntryAW._startedAt ? Date.now() - lastEntryAW._startedAt : (timeMs || null);
          }
        }

        logger.info('[CrazyArena][Arena] Démarrage génération nouvelle carte', { 
          matchId, 
          excludedPairs: match.validatedPairIds.size
        });
        
        setTimeout(async () => {
          try {
            // Libérer le verrou — nouvelle carte = nouveaux claims possibles
            match._pairClaimLock = null;

            logger.info('[CrazyArena][Arena] Génération nouvelle carte (mode normal)', { 
              matchId, 
              roundsPlayed: match.roundsPlayed || 0,
              totalRounds: match.config.rounds || null
            });
            
            const newZones = await this.generateZones(match.config, matchId);
            match.zones = newZones;
            
            logger.info('[CrazyArena][Arena] Nouvelle carte générée', { 
              matchId, 
              zonesCount: newZones?.length || 0
            });
            
            // 📊 DIAGNOSTIC: Pousser nouveau round dans l'historique (Arena)
            if (match._roundHistory) {
              const gpANew = match._lastGoodPairIds || {};
              match._roundHistory.push({
                round_number: match._roundHistory.length + 1,
                zones: newZones.map(z => ({ id: z.id, type: z.type, content: z.content, pairId: z.pairId || null, isDistractor: !!z.isDistractor })),
                good_pair_type: gpANew.pairType || null,
                good_pair_theme: gpANew.theme || null,
                good_pair_level: gpANew.level || null,
                good_pair_content: gpANew.contentA ? { a: gpANew.contentA, b: gpANew.contentB } : null,
                winner_player_id: null,
                winner_display_name: null,
                winner_time_ms: null,
                errors: [],
                _startedAt: Date.now()
              });
            }

            const roundPayload = {
              zones: newZones,
              roundIndex: match.roundsPlayed,
              totalRounds: match.config.rounds || null,
              timestamp: Date.now()
            };
            
            // Valider les zones avant émission (monitoring double PA / fausse paire)
            try { validateZonesServer(newZones, { source: 'arena:round-regen', matchId: matchId.slice(-8), roundIndex: match.roundsPlayed }); } catch (e) { logger.warn('[CrazyArena] Zone validation error (round-regen):', e.message); }
            this.io.to(matchId).emit('arena:round-new', roundPayload);
            
            logger.info('[CrazyArena][Arena] Événement arena:round-new émis (mode normal)', { 
              matchId, 
              zonesCount: newZones?.length || 0,
              roundIndex: match.roundsPlayed,
              event: 'arena:round-new'
            });
          } catch (err) {
            logger.error('[CrazyArena][Arena] Erreur génération carte (mode normal)', { 
              matchId, 
              error: err.message,
              stack: err.stack?.slice(0, 200)
            });
          }
        }, 1500);
      }
    }

    const scoresPayload = {
      scores: match.players.map((p, idx) => ({
        studentId: p.studentId,
        name: p.name,
        playerIdx: idx,
        score: p.score,
        pairsValidated: p.pairsValidated
      })).sort((a, b) => b.score - a.score)
    };
    
    this.io.to(matchId).emit('arena:scores-update', scoresPayload);
    
    logger.info('[CrazyArena][Arena] Événement arena:scores-update émis', { 
      matchId, 
      playerCount: match.players.length,
      event: 'arena:scores-update'
    });
  }

  /**
   * Terminer la partie
   */
  async endGame(matchId) {
    const match = this.matches.get(matchId);
    // ✅ FIX: Accepter aussi tiebreaker pour terminer le jeu
    if (!match || (match.status !== 'playing' && match.status !== 'tiebreaker' && match.status !== 'tiebreaker-countdown')) return;

    match.status = 'finished';
    match.endTime = Date.now();

    // Nettoyer les timers
    if (match.gameTimeout) {
      clearTimeout(match.gameTimeout);
    }
    if (match.timerInterval) {
      clearInterval(match.timerInterval);
    }
    if (match.tiebreakerTimeout) {
      clearTimeout(match.tiebreakerTimeout);
    }

    // ✅ FIX: Si on sort d'un tiebreaker, ADDITIONNER scores match normal + tiebreaker AVANT le log
    if (match.isTiebreaker) {
      match.players.forEach(p => {
        const scoreNormal = p.scoreBeforeTiebreaker || 0;
        const scoreTiebreaker = p.tiebreakerScore || 0;
        const pairsNormal = p.pairsBeforeTiebreaker || 0;
        const pairsTiebreaker = p.tiebreakerPairs || 0;
        
        p.score = scoreNormal + scoreTiebreaker;  // ADDITION
        p.pairsValidated = pairsNormal + pairsTiebreaker;
        
        logger.info(`[CrazyArena] 🏆 ${p.name}: Score final = ${scoreNormal} (normal) + ${scoreTiebreaker} (tiebreaker) = ${p.score} pts`);
      });
    }

    logger.info(`[CrazyArena] Partie terminée pour match ${matchId}`);
    _logMatchEvent('MATCH_END', matchId, { mode: 'arena', duration: match.endTime - match.startTime, playersCount: match.players.length, players: match.players.map(p => ({ studentId: p.studentId, name: p.name, score: p.score, pairsValidated: p.pairsValidated, errors: p.errors })) });

    // Calculer les temps finaux
    match.players.forEach(p => {
      p.timeMs = match.endTime - match.startTime;
    });

    // Trier les joueurs par score DESC, puis temps ASC
    const ranking = match.players.map(p => ({
      studentId: p.studentId,
      authId: p.authId || null,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      pairsValidated: p.pairsValidated,
      errors: p.errors,
      timeMs: p.timeMs
    })).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timeMs - b.timeMs;
    });

    // Ajouter les positions
    ranking.forEach((p, idx) => {
      p.position = idx + 1;
    });

    // Vérifier s'il y a égalité au premier rang
    const topPlayer = ranking[0];
    const tiedPlayers = ranking.filter(p => 
      p.pairsValidated === topPlayer.pairsValidated && p.errors === topPlayer.errors
    );
    
    if (tiedPlayers.length > 1 && !match.isTiebreaker) {
      // ÉGALITÉ DÉTECTÉE - Attendre décision du professeur
      logger.info(`[CrazyArena] ⚖️ ÉGALITÉ détectée ! ${tiedPlayers.length} joueurs à ${topPlayer.pairsValidated} paires, ${topPlayer.errors} erreurs`);
      logger.info(`[CrazyArena] ⏸️ En attente décision professeur pour départage...`);
      _logMatchEvent('TIE_DETECTED', matchId, { mode: 'arena', tiedCount: tiedPlayers.length, topPairs: topPlayer.pairsValidated, topErrors: topPlayer.errors, tiedPlayers: tiedPlayers.map(p => ({ studentId: p.studentId, name: p.name, score: p.score })) });
      
      // Mettre le match en attente de départage
      match.status = 'tie-waiting';
      match.tiedPlayers = tiedPlayers;
      
      // Notifier les joueurs de l'égalité (attente du prof)
      const tieData = {
        tiedPlayers: tiedPlayers.map(p => ({ name: p.name, score: p.score })),
        message: 'Égalité ! En attente du professeur pour le départage...'
      };
      
      logger.info(`[CrazyArena] 📢 Émission arena:tie-detected à room ${matchId}:`, tieData);
      this.io.to(matchId).emit('arena:tie-detected', tieData);
      
      // AUSSI en broadcast pour debug (au cas où room échoue)
      logger.info(`[CrazyArena] 📢 Émission arena:tie-detected en BROADCAST`);
      this.io.emit('arena:tie-detected', { ...tieData, matchId });
      
      // Notifier le dashboard professeur qu'il doit décider
      this.io.emit('arena:tie-waiting-teacher', {
        matchId,
        tiedPlayers: tiedPlayers.map(p => ({ 
          studentId: p.studentId,
          name: p.name, 
          score: p.score 
        })),
        ranking
      });
      
      logger.info(`[CrazyArena] 📢 Notification égalité envoyée à TOUS les clients pour match ${matchId}`);
      
      return; // Ne pas terminer le match - attendre décision prof
    }

    // Pas d'égalité ou après départage - Envoyer le podium final
    const winner = ranking[0];

    logger.info(`[CrazyArena] 🎉 Émission podium final à room ${matchId}`);
    this.io.to(matchId).emit('arena:game-end', {
      ranking,
      winner,
      duration: match.endTime - match.startTime,
      isTiebreaker: match.isTiebreaker || false
    });
    
    // Notifier dashboard professeur (broadcast)
    this.io.emit('arena:game-end', { matchId });

    // 💾 PERSISTENCE: Finaliser le match Arena en DB
    if (match._arenaResultIds) {
      await this.persistArenaMatchEnd(matchId, ranking);
      // Émettre arena:match-finished (comme le faisait saveResults)
      this.io.to(matchId).emit('arena:match-finished', { matchId });
      this.io.emit('arena:match-finished', { matchId });
    } else {
      // Fallback legacy (si persistArenaMatchStart n'a pas été appelé)
      await this.saveResults(matchId, ranking);
    }
    
    // Mode-specific extras (non-bloquant - ne doit PAS empêcher le marquage 'finished')
    try {
      if (match.mode === 'training') {
        logger.info(`[CrazyArena][Training] Extras mode Entraînement`);
        const trainingMode = new TrainingMode(this.io, this.supabase);
        trainingMode.matchId = matchId; // ✅ FIX: Injecter matchId manquant
        await trainingMode.saveTrainingStats(ranking);
      } else {
        logger.info(`[CrazyArena][Tournament] Extras mode Tournoi`);
        const tournamentMode = new TournamentMode(this.io, this.supabase);
        tournamentMode.matchId = matchId; // ✅ FIX: Injecter matchId manquant
        tournamentMode.groupId = match.groupId;
        if (ranking[0]) {
          await tournamentMode.markGroupWinner(ranking[0]);
        }
      }
    } catch (error) {
      logger.error(`[CrazyArena] Erreur extras mode spécialisé (non-bloquant):`, error);
    }

    // Nettoyer après 30s
    setTimeout(() => {
      this.cleanupMatch(matchId);
    }, 30000);
  }

  playerReadyForTiebreaker(matchId, studentId, playerName, io) {
    logger.info('[CrazyArena][Arena] playerReadyForTiebreaker appelé', { matchId, studentId, playerName });
    
    const match = this.matches.get(matchId);
    if (!match) {
      logger.error('[CrazyArena][Arena] Match introuvable pour tiebreaker', { matchId, studentId, matchesCount: this.matches.size });
      return;
    }

    logger.info('[CrazyArena][Arena] Match trouvé pour tiebreaker', { matchId, status: match.status });
    
    if (match.status !== 'tie-waiting') {
      logger.error('[CrazyArena][Arena] Match pas en attente départage', { matchId, status: match.status, expected: 'tie-waiting' });
      return;
    }

    // Initialiser le set de joueurs prêts si nécessaire
    if (!match.playersReadyForTiebreaker) {
      match.playersReadyForTiebreaker = new Set();
      logger.info('[CrazyArena][Arena] Set playersReadyForTiebreaker initialisé', { matchId });
    }

    // Ajouter le joueur aux prêts
    match.playersReadyForTiebreaker.add(studentId);
    
    const readyCount = match.playersReadyForTiebreaker.size;
    const totalCount = match.tiedPlayers.length;
    
    logger.info('[CrazyArena][Arena] Joueur marqué prêt pour départage', { 
      matchId, 
      studentId, 
      playerName,
      readyCount,
      totalCount,
      allReady: readyCount === totalCount
    });

    const payload = {
      matchId,
      readyCount,
      totalCount,
      readyPlayers: Array.from(match.playersReadyForTiebreaker)
    };
    
    logger.info('[CrazyArena][Arena] Émission arena:tiebreaker-ready-update', payload);
    
    // Notifier le dashboard du professeur
    io.emit('arena:tiebreaker-ready-update', payload);
    
    logger.info('[CrazyArena][Arena] arena:tiebreaker-ready-update émis avec succès', { matchId, readyCount, totalCount });
  }

  async startTiebreakerByTeacher(matchId) {
    const match = this.matches.get(matchId);
    if (!match) {
      logger.error(`[CrazyArena] ❌ Match ${matchId} introuvable`);
      return;
    }

    if (match.status !== 'tie-waiting') {
      logger.error(`[CrazyArena] ❌ Match ${matchId} n'est pas en attente de départage (status: ${match.status})`);
      return;
    }

    const tiedPlayers = match.tiedPlayers;
    if (!tiedPlayers || tiedPlayers.length < 2) {
      logger.error(`[CrazyArena] ❌ Pas de joueurs à égalité pour match ${matchId}`);
      return;
    }

    logger.info(`[CrazyArena] 🎯 Professeur lance départage pour match ${matchId} (${tiedPlayers.length} joueurs à égalité)`);
    
    match.isTiebreaker = true;
    match.status = 'playing';
    match.startTime = Date.now();
    
    // Générer seulement 3 cartes pour le départage
    const tiebreakerConfig = {
      ...match.config,
      rounds: 1 // Une seule manche avec moins de zones
    };
    
    const zonesResult = await this.generateZones(tiebreakerConfig, matchId);
    
    // ✅ FIX: generateZones retourne {zones: [...]} pas [...]
    const zonesArray = Array.isArray(zonesResult) ? zonesResult : (zonesResult?.zones || []);
    
    logger.info(`[CrazyArena] 🔍 Zones générées pour tiebreaker:`, { count: zonesArray.length });
    
    // ✅ UTILISER TOUTES les zones générées (comme démarrage normal)
    match.zones = zonesArray;
    match.tiebreakerPairsToFind = 3;
    match.tiebreakerPairsFound = 0;
    
    logger.info(`[CrazyArena] 🎴 Tiebreaker: ${match.zones.length} zones, objectif ${match.tiebreakerPairsToFind} paires`);
    
    const tiedStudentIds = tiedPlayers.map(p => p.studentId);
    logger.info(`[CrazyArena] 🔍 studentIds à égalité:`, tiedStudentIds);
    
    // ✅ FIX: Sauvegarder scores du match normal avant tiebreaker (pour addition finale)
    match.players.forEach(p => {
      if (tiedStudentIds.includes(p.studentId)) {
        logger.info(`[CrazyArena] 💾 Sauvegarde score match normal pour ${p.studentId}: ${p.score} pts`);
        p.scoreBeforeTiebreaker = p.score;  // Sauvegarder score existant
        p.pairsBeforeTiebreaker = p.pairsValidated;
        // Reset UNIQUEMENT les compteurs tiebreaker (pas le score total)
        p.tiebreakerScore = 0;
        p.tiebreakerPairs = 0;
        p.errors = 0;
      }
    });
    
    logger.info(`[CrazyArena] 📡 Countdown 3-2-1 pour tiebreaker...`);
    
    // ✅ Countdown 3-2-1 comme au démarrage initial
    match.status = 'tiebreaker-countdown';
    let count = 3;
    const countdownInterval = setInterval(() => {
      logger.info(`[CrazyArena] Countdown tiebreaker: ${count}`);
      this.io.to(matchId).emit('arena:countdown', { count });
      count--;
      
      if (count < 0) {
        clearInterval(countdownInterval);
        
        // Après countdown, envoyer les zones (COMME démarrage normal)
        try {
          match.status = 'tiebreaker'; // Passer en mode tiebreaker actif
          
          const payload = {
            zones: match.zones,  // Zones complètes avec TOUS les champs
            duration: 999, // Pas de limite de temps, juste 3 paires
            startTime: Date.now(),
            tiedPlayers: tiedPlayers.map(p => ({ 
              studentId: p.studentId, 
              name: p.name,
              score: p.score 
            })),
            pairsToFind: match.tiebreakerPairsToFind
          };
          
          logger.info(`[CrazyArena] 🔍 Payload tiebreaker:`, {
            zonesCount: payload.zones?.length,
            tiedPlayersCount: payload.tiedPlayers?.length,
            firstZone: payload.zones?.[0]
          });
          
          logger.info(`[CrazyArena] 📡 Émission arena:tiebreaker-start...`);
          this.io.to(matchId).emit('arena:tiebreaker-start', payload);
          this.io.emit('arena:tiebreaker-start', { ...payload, matchId });
          
          logger.info(`[CrazyArena] ✅ arena:tiebreaker-start émis (room + broadcast)`);
          
          // ✅ FIX: Pas de timeout pour le tiebreaker — il se termine quand les 3 paires sont trouvées
          // (cohérent avec le mode Training qui n'a pas de timeout)
          
        } catch (error) {
          logger.error(`[CrazyArena] ❌ ERREUR émission arena:tiebreaker-start:`, error);
          logger.error(`[CrazyArena] Stack:`, error.stack);
          this.endGame(matchId);
        }
      }
    }, 1000);
  }

  // ==========================================
  // PERSISTENCE TEMPS RÉEL - Training
  // Sauvegarde progressive via Supabase direct
  // ==========================================

  /**
   * Persister le début du match en DB (crée session + résultats initiaux)
   */
  async persistMatchStart(matchId) {
    if (!this.supabase) return;
    const match = this.matches.get(matchId);
    if (!match) return;

    // Si le match a été restauré depuis la DB, ne pas recréer la session
    if (match._sessionId && match._recoveredFromDB) {
      logger.info('[CrazyArena][Training] Match restauré depuis DB, skip persistMatchStart (session existante)', { matchId, sessionId: match._sessionId });
      return;
    }

    try {
      const sessionId = uuidv4();
      match._sessionId = sessionId;
      match._resultIds = {};

      // match_id doit être un UUID valide (la colonne est UUID en production)
      const isValidUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
      const rawMatchUuid = matchId ? matchId.replace(/^match_/, '') : '';
      const safeMatchId = isValidUuid(rawMatchUuid) ? rawMatchUuid : uuidv4();
      const sessionPayload = {
        id: sessionId,
        match_id: safeMatchId,
        teacher_id: match.teacherId || null,
        session_name: match.config?.sessionName || 'Session Entraînement',
        config: match.config || {},
        class_id: match.classId || 'training',
        completed_at: null,
        created_at: new Date().toISOString()
      };

      const { error: sessErr } = await this.supabase
        .from('training_sessions')
        .insert(sessionPayload);

      if (sessErr) {
        logger.error('[CrazyArena][Training] ❌ Erreur insert training_sessions', { matchId, error: sessErr.message });
        _logMatchEvent('PERSIST_START_FAIL', matchId, { mode: 'training', error: sessErr.message, code: sessErr.code });
        match._sessionId = null; // Permettre le fallback saveTrainingResults si l'insert échoue
        return;
      }

      for (const player of match.players) {
        const resultId = uuidv4();
        match._resultIds[player.studentId] = resultId;

        // Résoudre le student_id en UUID valide pour la colonne DB (type UUID)
        // Priorité: 1) authId du client 2) studentId si déjà UUID 3) lookup user_student_mapping
        let dbStudentId = player.authId || (isValidUuid(player.studentId) ? player.studentId : null);
        if (!dbStudentId && this.supabase) {
          try {
            const { data: mapping } = await this.supabase
              .from('user_student_mapping')
              .select('user_id')
              .eq('student_id', player.studentId)
              .eq('active', true)
              .single();
            if (mapping?.user_id) {
              dbStudentId = mapping.user_id;
              player.authId = dbStudentId; // Cache pour persistMatchEnd
              logger.info('[CrazyArena][Training] 🔍 Lookup user_student_mapping OK', { studentId: player.studentId, authId: dbStudentId });
            }
          } catch (lookupErr) {
            logger.warn('[CrazyArena][Training] ⚠️ Lookup user_student_mapping échoué', { studentId: player.studentId, error: lookupErr.message });
          }
        }
        if (!dbStudentId) {
          logger.error('[CrazyArena][Training] ❌ Pas d\'UUID valide pour student_id, skip insert', { matchId, studentId: player.studentId });
          continue;
        }

        const { error: resErr } = await this.supabase
          .from('training_results')
          .insert({
            id: resultId,
            session_id: sessionId,
            student_id: dbStudentId,
            position: 0,
            score: 0,
            time_ms: 0,
            pairs_validated: 0,
            errors: 0
          });

        if (resErr) {
          logger.error('[CrazyArena][Training] ❌ Erreur insert training_results', { matchId, studentId: player.studentId, dbStudentId, error: resErr.message });
        }
      }

      logger.info('[CrazyArena][Training] 💾 Match persisté en DB (start)', { matchId, sessionId, players: match.players.length });
      _logMatchEvent('PERSIST_START_OK', matchId, { mode: 'training', sessionId, players: match.players.length });
    } catch (err) {
      logger.error('[CrazyArena][Training] ❌ Erreur persistMatchStart', { matchId, error: err.message });
      _logMatchEvent('PERSIST_START_FAIL', matchId, { mode: 'training', error: err.message });
    }
  }

  /**
   * Enregistrer une tentative dans la table `attempts` pour le suivi de maîtrise
   * (aligné avec le mode Solo qui utilise la même table via progress.js)
   */
  persistAttempt(match, player, { isCorrect, pairId, zoneAId, zoneBId }) {
    if (!this.supabase) return;
    const dbStudentId = player.authId;
    if (!dbStudentId) return;

    try {
      // Latence: temps depuis la dernière paire validée par ce joueur
      const now = Date.now();
      const latencyMs = now - (player._lastPairTs || match.startTime || now);
      player._lastPairTs = now;

      // Extraire thème et type depuis les zones du match
      let theme = null;
      let item_type = null;
      let item_id = pairId || `${zoneAId}|${zoneBId}`;

      const zones = match.zones || [];
      const zA = zones.find(z => String(z.id) === String(zoneAId));
      const zB = zones.find(z => String(z.id) === String(zoneBId));

      const calcZone = [zA, zB].find(z => z && z.type === 'calcul');
      const numZone = [zA, zB].find(z => z && z.type === 'chiffre');
      const imgZone = [zA, zB].find(z => z && z.type === 'image');
      const txtZone = [zA, zB].find(z => z && z.type === 'texte');

      if (calcZone && numZone) {
        item_type = 'calcnum';
        const calcText = String(calcZone.content || '').trim();
        const chiffreText = String(numZone.content || '').trim();
        const mulMatch = calcText.match(/(\d+)\s*[×x*]\s*(\d+)/);
        const addMatch = !mulMatch && calcText.match(/(\d+)\s*[+]\s*(\d+)/);
        const subMatch = !mulMatch && !addMatch && calcText.match(/(\d+)\s*[-]\s*(\d+)/);
        if (mulMatch) {
          const table = Math.min(parseInt(mulMatch[1], 10), parseInt(mulMatch[2], 10));
          theme = `Table de ${table}`;
        } else if (addMatch) {
          theme = 'Additions';
        } else if (subMatch) {
          theme = 'Soustractions';
        } else {
          theme = 'Calculs divers';
        }
        item_id = calcText ? `${calcText} = ${chiffreText}` : (pairId || item_id);
      } else if (imgZone || txtZone) {
        item_type = 'imgtxt';
        const textContent = String((txtZone || {}).content || '').trim();
        // PRIORITÉ: 1) pairId (fiable) > 2) texteId+imageId > 3) texte > 4) image
        let zoneTheme = '';
        try {
          const ad = _getAssocData();
          const rawPairId = String(zA?.pairId || zB?.pairId || '').trim();
          // 1) Lookup direct par pairId (format: assoc-img-{imageId}-txt-{texteId})
          if (rawPairId && ad.associations) {
            const m = rawPairId.match(/^assoc-img-(.+)-txt-(.+)$/);
            if (m) {
              const assocEntry = ad.associations.find(a => a.imageId === m[1] && a.texteId === m[2]);
              if (assocEntry && Array.isArray(assocEntry.themes)) zoneTheme = _bestTheme(assocEntry.themes);
            }
          }
          // 2) Fallback: texteId+imageId par matching de contenu
          if (!zoneTheme) {
            const lc = textContent.toLowerCase().trim();
            const imgUrl = imgZone ? String(imgZone.content || '').toLowerCase().trim() : '';
            const texteEntry = lc ? (ad.textes || []).find(t => String(t.content || '').toLowerCase().trim() === lc) : null;
            const imgEntry = imgUrl ? (ad.images || []).find(img => String(img.url || img.src || '').toLowerCase().trim() === imgUrl) : null;
            if (texteEntry && imgEntry) {
              const assocEntry = (ad.associations || []).find(a => a.texteId === texteEntry.id && a.imageId === imgEntry.id);
              if (assocEntry && Array.isArray(assocEntry.themes)) zoneTheme = _bestTheme(assocEntry.themes);
            }
            if (!zoneTheme && texteEntry && Array.isArray(texteEntry.themes)) zoneTheme = _bestTheme(texteEntry.themes);
            if (!zoneTheme && imgEntry && Array.isArray(imgEntry.themes)) zoneTheme = _bestTheme(imgEntry.themes);
          }
        } catch {}
        const cfgTheme = (match.config && match.config.themes && match.config.themes[0]) || '';
        theme = zoneTheme || _themeLabel(cfgTheme) || cfgTheme || null;
        if (textContent) {
          item_id = JSON.stringify({ text: textContent, img: imgZone ? imgZone.content : null });
        }
      }

      // Fire-and-forget insert
      this.supabase.from('attempts').insert({
        session_id: null,
        user_id: dbStudentId,
        item_type,
        item_id,
        objective_key: theme ? `training:${theme}` : null,
        correct: isCorrect,
        latency_ms: latencyMs > 0 && latencyMs < 300000 ? Math.round(latencyMs) : null,
        level_class: (match.config && match.config.classes && match.config.classes[0]) || null,
        theme,
        round_index: match.roundsPlayed || 0
      }).then(({ error }) => {
        if (error) {
          logger.warn('[CrazyArena][Training] ⚠️ persistAttempt insert failed', { error: error.message, studentId: player.studentId });
        }
      });
    } catch (err) {
      // best-effort, ne pas bloquer le jeu
    }
  }

  /**
   * Mettre à jour le score d'un joueur en DB (appelé à chaque paire validée)
   */
  persistScoreUpdate(matchId, studentId) {
    if (!this.supabase) return;
    const match = this.matches.get(matchId);
    if (!match || !match._resultIds || !match._resultIds[studentId]) return;

    const player = match.players.find(p => p.studentId === studentId);
    if (!player) return;

    const isTiebreaker = match.status === 'tiebreaker' || match.status === 'tiebreaker-countdown';
    const score = isTiebreaker
      ? (player.scoreBeforeTiebreaker || 0) + (player.tiebreakerScore || 0)
      : (player.score || 0);
    const pairs = isTiebreaker
      ? (player.pairsBeforeTiebreaker || 0) + (player.tiebreakerPairs || 0)
      : (player.pairsValidated || 0);

    // Fire-and-forget: ne pas bloquer le jeu pour un UPDATE DB
    this.supabase
      .from('training_results')
      .update({
        score,
        pairs_validated: pairs,
        errors: player.errors || 0,
        time_ms: Date.now() - (match.startTime || Date.now())
      })
      .eq('id', match._resultIds[studentId])
      .then(({ error }) => {
        if (error) {
          logger.error('[CrazyArena][Training] ❌ Erreur persistScoreUpdate', { matchId, studentId, error: error.message });
        }
      });
  }

  /**
   * Finaliser le match en DB (positions finales, completed_at)
   */
  async persistMatchEnd(matchId, ranking) {
    if (!this.supabase) return;
    const match = this.matches.get(matchId);
    if (!match || !match._sessionId) return;

    try {
      // Attendre que persistMatchStart soit terminé (éviter race condition)
      if (match._persistStartPromise) {
        await match._persistStartPromise;
        logger.info('[CrazyArena][Training] ✅ persistMatchStart terminé, mise à jour des scores...');
      }
      
      // Marquer la session comme terminée + sauvegarder rounds_data (cartes jouées)
      const sessionUpdate = { completed_at: new Date().toISOString() };
      if (match._roundsData && match._roundsData.length > 0) {
        sessionUpdate.rounds_data = JSON.stringify(match._roundsData);
        logger.info('[CrazyArena][Training] 📸 Archivage cartes: ' + match._roundsData.length + ' rounds sauvegardés', { matchId });
      }
      await this.supabase
        .from('training_sessions')
        .update(sessionUpdate)
        .eq('id', match._sessionId);

      // Mettre à jour chaque résultat avec position finale
      for (const player of ranking) {
        let resultId = match._resultIds?.[player.studentId];
        
        // Fallback: essayer avec authId si studentId n'a pas de mapping
        if (!resultId && player.authId) {
          resultId = match._resultIds?.[player.authId];
        }
        
        // Fallback DB: chercher le résultat directement par session_id + student_id
        if (!resultId) {
          const dbStudentId = player.authId || player.studentId;
          logger.warn('[CrazyArena][Training] ⚠️ No resultId in _resultIds for', { studentId: player.studentId, authId: player.authId, keys: Object.keys(match._resultIds || {}) });
          try {
            const { data: found } = await this.supabase
              .from('training_results')
              .select('id')
              .eq('session_id', match._sessionId)
              .eq('student_id', dbStudentId)
              .single();
            if (found) {
              resultId = found.id;
              logger.info('[CrazyArena][Training] 🔍 Fallback DB lookup found resultId:', resultId);
            }
          } catch (lookupErr) {
            logger.warn('[CrazyArena][Training] ⚠️ Fallback lookup failed:', lookupErr.message);
          }
        }
        
        if (!resultId) {
          logger.error('[CrazyArena][Training] ❌ Cannot find resultId for player, skipping update', { studentId: player.studentId, authId: player.authId });
          continue;
        }

        logger.info('[CrazyArena][Training] 📝 Updating result', { resultId, studentId: player.studentId, score: player.score, pairs: player.pairsValidated, errors: player.errors, timeMs: player.timeMs });
        
        const { error: updateErr } = await this.supabase
          .from('training_results')
          .update({
            position: player.position,
            score: player.score,
            time_ms: player.timeMs,
            pairs_validated: player.pairsValidated || 0,
            errors: player.errors || 0
          })
          .eq('id', resultId);
        
        if (updateErr) {
          logger.error('[CrazyArena][Training] ❌ Update training_results failed', { resultId, error: updateErr.message });
        }
      }

      // Mettre à jour les stats cumulées (best-effort)
      const isValidUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
      for (const player of ranking) {
        const dbStudentId = player.authId || (isValidUuid(player.studentId) ? player.studentId : null);
        if (!dbStudentId) continue;
        try {
          await this.supabase.rpc('update_student_training_stats', {
            p_student_id: dbStudentId,
            p_sessions_played: 1,
            p_total_score: player.score,
            p_total_pairs: player.pairsValidated || 0,
            p_best_score: player.score
          });
        } catch (_) { /* best-effort */ }
      }

      // 📊 DIAGNOSTIC PÉDAGOGIQUE: Persister match_rounds + match_player_summary
      if (match._roundHistory && match._roundHistory.length > 0) {
        try {
          const roundRows = match._roundHistory.map(rh => ({
            session_id: match._sessionId,
            round_number: rh.round_number,
            zones: rh.zones,
            good_pair_type: rh.good_pair_type,
            good_pair_theme: rh.good_pair_theme,
            good_pair_level: rh.good_pair_level,
            good_pair_content: rh.good_pair_content,
            winner_player_id: rh.winner_player_id,
            winner_display_name: rh.winner_display_name,
            winner_time_ms: rh.winner_time_ms,
            errors: rh.errors || []
          }));
          const { error: mrInsertErr } = await this.supabase.from('match_rounds').insert(roundRows);
          if (mrInsertErr) {
            logger.error('[CrazyArena][Training] ❌ Erreur insert match_rounds:', { error: mrInsertErr.message, code: mrInsertErr.code, details: mrInsertErr.details, sessionId: match._sessionId, rowCount: roundRows.length });
            _logMatchEvent('DIAGNOSTIC_INSERT_FAIL', matchId, { mode: 'training', table: 'match_rounds', error: mrInsertErr.message, code: mrInsertErr.code, sessionId: match._sessionId, rowCount: roundRows.length });
          } else {
            logger.info('[CrazyArena][Training] 📊 match_rounds insérés:', roundRows.length);
            _logMatchEvent('DIAGNOSTIC_INSERT_OK', matchId, { mode: 'training', table: 'match_rounds', sessionId: match._sessionId, rowCount: roundRows.length });
          }
        } catch (mrErr) {
          logger.error('[CrazyArena][Training] ⚠️ Exception insert match_rounds:', mrErr.message);
          _logMatchEvent('DIAGNOSTIC_INSERT_FAIL', matchId, { mode: 'training', table: 'match_rounds', error: mrErr.message, exception: true });
        }

        // Calculer match_player_summary
        try {
          const playerMap = {};
          for (const rh of match._roundHistory) {
            // Winner stats
            if (rh.winner_player_id) {
              if (!playerMap[rh.winner_player_id]) playerMap[rh.winner_player_id] = { found: 0, errors: 0, themes: {}, types: {}, times: [], name: '' };
              const ps = playerMap[rh.winner_player_id];
              ps.found++;
              ps.name = rh.winner_display_name || ps.name;
              if (rh.winner_time_ms) ps.times.push(rh.winner_time_ms);
              if (rh.good_pair_theme) {
                if (!ps.themes[rh.good_pair_theme]) ps.themes[rh.good_pair_theme] = { found: 0, missed: 0, errors: 0 };
                ps.themes[rh.good_pair_theme].found++;
              }
              if (rh.good_pair_type) {
                if (!ps.types[rh.good_pair_type]) ps.types[rh.good_pair_type] = { found: 0 };
                ps.types[rh.good_pair_type].found++;
              }
            }
            // Error stats
            for (const err of (rh.errors || [])) {
              if (!playerMap[err.player_id]) playerMap[err.player_id] = { found: 0, errors: 0, themes: {}, types: {}, times: [], name: '' };
              playerMap[err.player_id].errors++;
              playerMap[err.player_id].name = err.display_name || playerMap[err.player_id].name;
              if (rh.good_pair_theme) {
                if (!playerMap[err.player_id].themes[rh.good_pair_theme]) playerMap[err.player_id].themes[rh.good_pair_theme] = { found: 0, missed: 0, errors: 0 };
                playerMap[err.player_id].themes[rh.good_pair_theme].errors++;
              }
            }
          }

          const summaryRows = Object.entries(playerMap).map(([pid, ps]) => {
            const matchPlayer = ranking.find(r => r.studentId === pid);
            const recommendations = [];
            // Auto-recommendations
            for (const [theme, stats] of Object.entries(ps.themes)) {
              if (stats.errors > stats.found) recommendations.push(`Renforcer le thème "${theme}" (${stats.errors} erreurs pour ${stats.found} réussites)`);
            }
            if (ps.times.length > 0) {
              const avg = Math.round(ps.times.reduce((a, b) => a + b, 0) / ps.times.length);
              if (avg > 10000) recommendations.push(`Temps de réponse élevé (${(avg / 1000).toFixed(1)}s en moyenne)`);
            }
            return {
              session_id: match._sessionId,
              player_id: pid,
              display_name: ps.name || (matchPlayer?.name) || pid,
              total_score: matchPlayer?.score || ps.found,
              total_pairs: ps.found,
              total_errors: ps.errors,
              stats_by_theme: ps.themes,
              stats_by_type: ps.types,
              avg_response_time_ms: ps.times.length > 0 ? Math.round(ps.times.reduce((a, b) => a + b, 0) / ps.times.length) : null,
              recommendations,
              teacher_notes: ''
            };
          });

          if (summaryRows.length > 0) {
            const { error: psInsertErr } = await this.supabase.from('match_player_summary').insert(summaryRows);
            if (psInsertErr) {
              logger.error('[CrazyArena][Training] ❌ Erreur insert match_player_summary:', { error: psInsertErr.message, code: psInsertErr.code, details: psInsertErr.details, sessionId: match._sessionId });
              _logMatchEvent('DIAGNOSTIC_INSERT_FAIL', matchId, { mode: 'training', table: 'match_player_summary', error: psInsertErr.message, code: psInsertErr.code });
            } else {
              logger.info('[CrazyArena][Training] 📊 match_player_summary insérés:', summaryRows.length);
              _logMatchEvent('DIAGNOSTIC_INSERT_OK', matchId, { mode: 'training', table: 'match_player_summary', rowCount: summaryRows.length });
            }
          }
        } catch (psErr) {
          logger.error('[CrazyArena][Training] ⚠️ Exception insert match_player_summary:', psErr.message);
          _logMatchEvent('DIAGNOSTIC_INSERT_FAIL', matchId, { mode: 'training', table: 'match_player_summary', error: psErr.message, exception: true });
        }
      }

      logger.info('[CrazyArena][Training] 💾 Match finalisé en DB', { matchId, sessionId: match._sessionId, players: ranking.length });
      _logMatchEvent('PERSIST_END_OK', matchId, { mode: 'training', sessionId: match._sessionId });
    } catch (err) {
      logger.error('[CrazyArena][Training] ❌ Erreur persistMatchEnd', { matchId, error: err.message });
    }
  }

  /**
   * Graceful shutdown: sauvegarder TOUS les matchs actifs avant arrêt serveur
   */
  async saveAllActiveMatches() {
    const activeStatuses = ['playing', 'tiebreaker', 'tiebreaker-countdown', 'tie-waiting'];
    const activeMatches = [...this.matches.entries()]
      .filter(([_, m]) => activeStatuses.includes(m.status));

    if (activeMatches.length === 0) {
      logger.info('[CrazyArena] Graceful shutdown: Aucun match actif à sauvegarder');
      return;
    }

    logger.info('[CrazyArena] Graceful shutdown: Sauvegarde de ' + activeMatches.length + ' match(s) actif(s)');

    for (const [matchId, match] of activeMatches) {
      try {
        const isTiebreaker = match.isTiebreaker;
        const ranking = match.players.map(p => ({
          studentId: p.studentId,
          authId: p.authId || null,
          name: p.name,
          score: isTiebreaker ? (p.scoreBeforeTiebreaker || 0) + (p.tiebreakerScore || 0) : (p.score || 0),
          pairsValidated: isTiebreaker ? (p.pairsBeforeTiebreaker || 0) + (p.tiebreakerPairs || 0) : (p.pairsValidated || 0),
          errors: p.errors || 0,
          timeMs: Date.now() - (match.startTime || Date.now())
        })).sort((a, b) => b.score !== a.score ? b.score - a.score : a.timeMs - b.timeMs);

        ranking.forEach((p, idx) => { p.position = idx + 1; });

        if (match.mode === 'training') {
          if (match._sessionId) {
            await this.persistMatchEnd(matchId, ranking);
          } else {
            await this.saveTrainingResults(matchId, ranking, match);
          }
        } else {
          // Arena mode
          if (match._arenaResultIds) {
            await this.persistArenaMatchEnd(matchId, ranking);
          } else {
            await this.saveResults(matchId, ranking);
          }
        }

        logger.info('[CrazyArena] Graceful shutdown: Match sauvegardé', { matchId, mode: match.mode });
      } catch (err) {
        logger.error('[CrazyArena] Graceful shutdown: Erreur sauvegarde match', { matchId, error: err.message });
      }
    }
  }

  // ==========================================
  // PERSISTENCE TEMPS RÉEL - Arena
  // Sauvegarde progressive via Supabase direct
  // ==========================================

  /**
   * Persister le début du match Arena en DB (crée match_results avec scores initiaux)
   */
  async persistArenaMatchStart(matchId) {
    if (!this.supabase) return;
    const match = this.matches.get(matchId);
    if (!match) return;

    try {
      match._arenaResultIds = {};

      // match_results.student_id → FK vers students(id) qui contient 's001', 's002', etc.
      // PAS les UUIDs auth. Utiliser player.studentId directement.
      for (const player of match.players) {
        const resultId = uuidv4();
        match._arenaResultIds[player.studentId] = resultId;

        const { error: resErr } = await this.supabase
          .from('match_results')
          .insert({
            id: resultId,
            match_id: matchId,
            student_id: player.studentId,
            position: 0,
            score: 0,
            time_ms: 0,
            pairs_validated: 0,
            errors: 0
          });

        if (resErr) {
          logger.error('[CrazyArena][Arena] ❌ Erreur insert match_results', { matchId, studentId: player.studentId, error: resErr.message });
        } else {
          logger.info('[CrazyArena][Arena] ✅ match_results inséré', { matchId, studentId: player.studentId, resultId });
        }
      }

      // Mettre à jour le status du match en DB → 'in_progress'
      const { error: statusErr } = await this.supabase
        .from('tournament_matches')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', matchId);
      
      if (statusErr) {
        logger.error('[CrazyArena][Arena] ❌ Erreur update tournament_matches status', { matchId, error: statusErr.message });
      } else {
        logger.info('[CrazyArena][Arena] ✅ tournament_matches.status → in_progress', { matchId });
      }

      logger.info('[CrazyArena][Arena] 💾 Match Arena persisté en DB (start)', { matchId, players: match.players.length });
    } catch (err) {
      logger.error('[CrazyArena][Arena] ❌ Erreur persistArenaMatchStart', { matchId, error: err.message });
    }
  }

  /**
   * Mettre à jour le score Arena d'un joueur en DB (appelé à chaque paire validée)
   */
  persistArenaScoreUpdate(matchId, studentId) {
    if (!this.supabase) return;
    const match = this.matches.get(matchId);
    if (!match || !match._arenaResultIds || !match._arenaResultIds[studentId]) return;

    const player = match.players.find(p => p.studentId === studentId);
    if (!player) return;

    const isTiebreaker = match.status === 'tiebreaker' || match.status === 'tiebreaker-countdown';
    const score = isTiebreaker
      ? (player.scoreBeforeTiebreaker || 0) + (player.tiebreakerScore || 0)
      : (player.score || 0);
    const pairs = isTiebreaker
      ? (player.pairsBeforeTiebreaker || 0) + (player.tiebreakerPairs || 0)
      : (player.pairsValidated || 0);

    this.supabase
      .from('match_results')
      .update({
        score,
        pairs_validated: pairs,
        errors: player.errors || 0,
        time_ms: Date.now() - (match.startTime || Date.now())
      })
      .eq('id', match._arenaResultIds[studentId])
      .then(({ error }) => {
        if (error) {
          logger.error('[CrazyArena][Arena] ❌ Erreur persistArenaScoreUpdate', { matchId, studentId, error: error.message });
        }
      });
  }

  /**
   * Finaliser le match Arena en DB (positions finales)
   */
  async persistArenaMatchEnd(matchId, ranking) {
    if (!this.supabase) return;
    const match = this.matches.get(matchId);
    if (!match || !match._arenaResultIds) return;

    try {
      for (const player of ranking) {
        const resultId = match._arenaResultIds?.[player.studentId];
        if (!resultId) continue;

        await this.supabase
          .from('match_results')
          .update({
            position: player.position,
            score: player.score,
            time_ms: player.timeMs,
            pairs_validated: player.pairsValidated || 0,
            errors: player.errors || 0
          })
          .eq('id', resultId);
      }

      // Marquer tournament_matches comme finished + sauvegarder rounds_data (cartes jouées)
      const updateData = {
        status: 'finished',
        finished_at: new Date().toISOString(),
        players: ranking,
        winner: ranking[0] || null
      };
      if (match._roundsData && match._roundsData.length > 0) {
        updateData.rounds_data = match._roundsData;
        logger.info('[CrazyArena][Arena] 📸 Archivage cartes: ' + match._roundsData.length + ' rounds sauvegardés', { matchId });
      }
      await this.supabase
        .from('tournament_matches')
        .update(updateData)
        .eq('id', matchId);

      logger.info('[CrazyArena][Arena] 💾 Match Arena finalisé en DB', { matchId, players: ranking.length });

      // ✅ FIX: Mettre à jour le groupe (status=finished + winner_id) directement via Supabase
      // Les appels HTTP internes échouent car requireAuth exige un JWT
      const winner = ranking[0];
      if (winner) {
        const { data: matchRow } = await this.supabase
          .from('tournament_matches')
          .select('group_id')
          .eq('id', matchId)
          .single();

        if (matchRow?.group_id) {
          const { error: groupErr } = await this.supabase
            .from('tournament_groups')
            .update({ status: 'finished', winner_id: winner.studentId })
            .eq('id', matchRow.group_id);

          if (groupErr) {
            logger.error('[CrazyArena][Arena] ❌ Erreur update groupe', { groupId: matchRow.group_id, error: groupErr.message });
          } else {
            logger.info(`[CrazyArena][Arena] ✅ Groupe ${matchRow.group_id} → finished, winner=${winner.studentId} (${winner.name})`);
          }
        }
      }
      // 📊 DIAGNOSTIC PÉDAGOGIQUE: Persister match_rounds + match_player_summary (Arena)
      if (match._roundHistory && match._roundHistory.length > 0) {
        try {
          const roundRows = match._roundHistory.map(rh => ({
            session_id: matchId,
            round_number: rh.round_number,
            zones: rh.zones,
            good_pair_type: rh.good_pair_type,
            good_pair_theme: rh.good_pair_theme,
            good_pair_level: rh.good_pair_level,
            good_pair_content: rh.good_pair_content,
            winner_player_id: rh.winner_player_id,
            winner_display_name: rh.winner_display_name,
            winner_time_ms: rh.winner_time_ms,
            errors: rh.errors || []
          }));
          const { error: mrInsertErrA } = await this.supabase.from('match_rounds').insert(roundRows);
          if (mrInsertErrA) {
            logger.error('[CrazyArena][Arena] ❌ Erreur insert match_rounds:', { error: mrInsertErrA.message, code: mrInsertErrA.code, details: mrInsertErrA.details, matchId, rowCount: roundRows.length });
          } else {
            logger.info('[CrazyArena][Arena] 📊 match_rounds insérés:', roundRows.length);
          }
        } catch (mrErr) {
          logger.error('[CrazyArena][Arena] ⚠️ Exception insert match_rounds:', mrErr.message);
        }

        try {
          const playerMapA = {};
          for (const rh of match._roundHistory) {
            if (rh.winner_player_id) {
              if (!playerMapA[rh.winner_player_id]) playerMapA[rh.winner_player_id] = { found: 0, errors: 0, themes: {}, types: {}, times: [], name: '' };
              const ps = playerMapA[rh.winner_player_id];
              ps.found++;
              ps.name = rh.winner_display_name || ps.name;
              if (rh.winner_time_ms) ps.times.push(rh.winner_time_ms);
              if (rh.good_pair_theme) {
                if (!ps.themes[rh.good_pair_theme]) ps.themes[rh.good_pair_theme] = { found: 0, missed: 0, errors: 0 };
                ps.themes[rh.good_pair_theme].found++;
              }
              if (rh.good_pair_type) {
                if (!ps.types[rh.good_pair_type]) ps.types[rh.good_pair_type] = { found: 0 };
                ps.types[rh.good_pair_type].found++;
              }
            }
            for (const err of (rh.errors || [])) {
              if (!playerMapA[err.player_id]) playerMapA[err.player_id] = { found: 0, errors: 0, themes: {}, types: {}, times: [], name: '' };
              playerMapA[err.player_id].errors++;
              playerMapA[err.player_id].name = err.display_name || playerMapA[err.player_id].name;
              if (rh.good_pair_theme) {
                if (!playerMapA[err.player_id].themes[rh.good_pair_theme]) playerMapA[err.player_id].themes[rh.good_pair_theme] = { found: 0, missed: 0, errors: 0 };
                playerMapA[err.player_id].themes[rh.good_pair_theme].errors++;
              }
            }
          }

          const summaryRowsA = Object.entries(playerMapA).map(([pid, ps]) => {
            const matchPlayer = ranking.find(r => r.studentId === pid);
            const recommendations = [];
            for (const [theme, stats] of Object.entries(ps.themes)) {
              if (stats.errors > stats.found) recommendations.push(`Renforcer le thème "${theme}" (${stats.errors} erreurs pour ${stats.found} réussites)`);
            }
            if (ps.times.length > 0) {
              const avg = Math.round(ps.times.reduce((a, b) => a + b, 0) / ps.times.length);
              if (avg > 10000) recommendations.push(`Temps de réponse élevé (${(avg / 1000).toFixed(1)}s en moyenne)`);
            }
            return {
              session_id: matchId,
              player_id: pid,
              display_name: ps.name || (matchPlayer?.name) || pid,
              total_score: matchPlayer?.score || ps.found,
              total_pairs: ps.found,
              total_errors: ps.errors,
              stats_by_theme: ps.themes,
              stats_by_type: ps.types,
              avg_response_time_ms: ps.times.length > 0 ? Math.round(ps.times.reduce((a, b) => a + b, 0) / ps.times.length) : null,
              recommendations,
              teacher_notes: ''
            };
          });

          if (summaryRowsA.length > 0) {
            const { error: psInsertErrA } = await this.supabase.from('match_player_summary').insert(summaryRowsA);
            if (psInsertErrA) {
              logger.error('[CrazyArena][Arena] ❌ Erreur insert match_player_summary:', { error: psInsertErrA.message, code: psInsertErrA.code, details: psInsertErrA.details, matchId });
            } else {
              logger.info('[CrazyArena][Arena] 📊 match_player_summary insérés:', summaryRowsA.length);
            }
          }
        } catch (psErr) {
          logger.error('[CrazyArena][Arena] ⚠️ Exception insert match_player_summary:', psErr.message);
        }
      }

    } catch (err) {
      logger.error('[CrazyArena][Arena] ❌ Erreur persistArenaMatchEnd', { matchId, error: err.message });
    }
  }

  /**
   * Sauvegarder les résultats Training en BDD (training_sessions + training_results)
   * LEGACY: Utilisé comme fallback si persistMatchStart n'a pas été appelé
   */
  async saveTrainingResults(matchId, ranking, match) {
    const selfPort = process.env.PORT || 4000;
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${selfPort}`;

    logger.info(`[CrazyArena][Training] 💾 Sauvegarde résultats Training pour match ${matchId}`);
    
    try {
      const url = `${backendUrl}/api/training/sessions`;
      const payload = {
        matchId,
        classId: match.classId || null,
        teacherId: match.teacherId || null,
        sessionName: match.config?.sessionName || 'Session Entraînement',
        config: match.config || {},
        completedAt: new Date().toISOString(),
        results: ranking.map(p => ({
          studentId: p.authId || p.studentId,
          position: p.position,
          score: p.score,
          timeMs: p.timeMs,
          pairsValidated: p.pairsValidated || 0,
          errors: p.errors || 0
        }))
      };
      
      logger.info(`[CrazyArena][Training] 📡 Appel API: ${url}`, { 
        matchId, 
        resultsCount: ranking.length,
        classId: match.classId 
      });
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      logger.info(`[CrazyArena][Training] 📥 Réponse API status: ${res.status}`);
      
      if (!res.ok) {
        const text = await res.text();
        logger.error(`[CrazyArena][Training] ❌ API erreur: ${res.status} - ${text}`);
        return false;
      }
      
      const data = await res.json();
      logger.info('[CrazyArena][Training] ✅ Résultats Training sauvegardés:', data);
      return true;
    } catch (error) {
      logger.error('[CrazyArena][Training] ❌ Erreur sauvegarde Training:', error);
      return false;
    }
  }

  /**
   * Sauvegarder les résultats Arena en BDD
   */
  async saveResults(matchId, ranking) {
    // Appeler l'API REST pour enregistrer les résultats
    const selfPort = process.env.PORT || 4000;
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${selfPort}`;

    logger.info(`[CrazyArena] 💾 Sauvegarde résultats pour match ${matchId}`);
    logger.info(`[CrazyArena] 🌐 Backend URL: ${backendUrl}`);
    
    try {
      const url = `${backendUrl}/api/tournament/matches/${matchId}/finish`;
      logger.info(`[CrazyArena] 📡 Appel API: ${url}`);
      
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results: ranking.map(p => ({
            studentId: p.studentId,
            score: p.score,
            timeMs: p.timeMs,
            pairsValidated: p.pairsValidated,
            errors: p.errors
          }))
        })
      });
      
      logger.info(`[CrazyArena] 📥 Réponse API status: ${res.status}`);
      
      if (!res.ok) {
        const text = await res.text();
        logger.error(`[CrazyArena] ❌ API erreur: ${res.status} - ${text}`);
        return false;
      }
      
      const data = await res.json();
      logger.info('[CrazyArena] ✅ Résultats sauvegardés:', data);
      
      // Notifier le dashboard que le match est terminé (room)
      this.io.to(matchId).emit('arena:match-finished', {
        matchId,
        winner: data.winner
      });
      
      // ✅ BROADCAST GLOBAL pour retirer notifications des élèves hors room
      this.io.emit('arena:match-finished', { matchId });
      
      return true;
    } catch (error) {
      logger.error('[CrazyArena] ❌ Erreur sauvegarde API:', error);
      return false;
    }
  }

  /**
   * Nettoyer un match terminé
   */
  cleanupMatch(matchId) {
    const match = this.matches.get(matchId);
    if (!match) return;

    // Retirer les joueurs de la map
    match.players.forEach(p => {
      this.playerMatches.delete(p.socketId);
    });

    // Supprimer le match
    this.matches.delete(matchId);
    logger.info(`[CrazyArena] Match ${matchId} nettoyé`);
  }

  /**
   * Supprimer un match manuellement (depuis dashboard prof)
   * Notifie les joueurs et nettoie toutes les ressources
   */
  async deleteMatch(matchId) {
    const match = this.matches.get(matchId);
    
    // Si match pas en RAM, tenter suppression Supabase directement
    if (!match) {
      logger.warn('[CrazyArena] deleteMatch: Match introuvable en RAM', { matchId });
      
      // Tenter suppression Supabase pour matchs Arena orphelins
      if (this.supabase) {
        logger.info('[CrazyArena] Tentative suppression match orphelin depuis Supabase', { matchId });
        
        try {
          const { error } = await this.supabase
            .from('tournament_matches')
            .update({ status: 'deleted' })
            .eq('id', matchId);
          
          if (error) {
            logger.error('[CrazyArena] Erreur suppression Supabase', { matchId, error: error.message });
            return { ok: false, error: 'Match introuvable en RAM et échec suppression DB' };
          }
          
          logger.info('[CrazyArena] Match orphelin supprimé de Supabase', { matchId });
          return { ok: true, orphan: true };
        } catch (err) {
          logger.error('[CrazyArena] Exception suppression Supabase', { matchId, error: err.message });
          return { ok: false, error: 'Match introuvable' };
        }
      }
      
      return { ok: false, error: 'Match introuvable' };
    }

    logger.info('[CrazyArena] Suppression manuelle du match', { 
      matchId, 
      mode: match.mode,
      playersCount: match.players.length 
    });

    // Notifier tous les joueurs que le match a été supprimé
    const eventName = match.mode === 'training' ? 'training:match-deleted' : 'arena:match-deleted';
    this.io.to(matchId).emit(eventName, {
      matchId,
      reason: 'Match supprimé par le professeur'
    });

    // Déconnecter les joueurs de la room Socket.IO
    match.players.forEach(player => {
      const socketId = player.socketId;
      if (socketId) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.leave(matchId);
        }
        this.playerMatches.delete(socketId);
      }
    });

    // Supprimer le match de la Map RAM
    this.matches.delete(matchId);
    
    // Si match Arena, supprimer aussi de Supabase
    if (match.mode === 'arena' && this.supabase) {
      logger.info('[CrazyArena] Suppression match Arena de Supabase', { matchId });
      
      try {
        const { error } = await this.supabase
          .from('tournament_matches')
          .update({ status: 'deleted' })
          .eq('id', matchId);
        
        if (error) {
          logger.error('[CrazyArena] Erreur suppression Supabase', { matchId, error: error.message });
        } else {
          logger.info('[CrazyArena] Match Arena supprimé de Supabase', { matchId });
        }
      } catch (err) {
        logger.error('[CrazyArena] Exception suppression Supabase', { matchId, error: err.message });
      }
    }
    
    logger.info('[CrazyArena] Match supprimé avec succès', { matchId, mode: match.mode });
    return { ok: true };
  }

  /**
   * Déconnexion d'un joueur (GÉNÉRIQUE: Training + Arena)
   * Approche Chess.com: pause le match, grace period 15s, forfait si pas de reconnexion
   */
  handleDisconnect(socket) {
    const matchId = this.playerMatches.get(socket.id);
    if (!matchId) return;

    const match = this.matches.get(matchId);
    if (!match) return;

    const player = match.players.find(p => p.socketId === socket.id);
    if (!player) {
      // ✅ Socket obsolète (le joueur a déjà reconnecté avec un nouveau socket) — juste nettoyer le mapping
      this.playerMatches.delete(socket.id);
      return;
    }

    const mode = match.mode || 'arena';
    logger.info(`[CrazyArena]${mode === 'training' ? '[Training]' : ''} ${player.name} s'est déconnecté du match ${matchId} (status=${match.status})`);
    _logMatchEvent('PLAYER_DISCONNECT', matchId, { mode, studentId: player.studentId, name: player.name, matchStatus: match.status });

    // Si le match est en cours (playing/tiebreaker), mettre en PAUSE au lieu de retirer le joueur
    // ✅ FIX: Inclure 'paused' — quand 2 joueurs déconnectent simultanément (ex: navigation page jeu),
    // le 1er déclenche pauseMatch, le 2nd arrive avec status='paused' et serait RETIRÉ du match sinon
    if (match.status === 'playing' || match.status === 'tiebreaker' || match.status === 'paused') {
      player.disconnected = true;
      player.disconnectedAt = Date.now();
      // NE PAS supprimer le mapping playerMatches ici — on le garde pour la reconnexion éventuelle
      // Mais marquer l'ancien socketId comme invalide
      player._oldSocketId = socket.id;

      // Ne déclencher pauseMatch que si le match n'est pas déjà en pause
      if (match.status !== 'paused') {
        this.pauseMatch(matchId, player);
      } else {
        logger.info(`[CrazyArena] ⏸️ Match ${matchId} déjà en pause — ${player.name} aussi marqué déconnecté`);
      }
      return;
    }

    // En dehors du jeu (waiting, countdown, ended) : retirer le joueur normalement
    const playerIndex = match.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex !== -1) {
      match.players.splice(playerIndex, 1);
    }
    this.playerMatches.delete(socket.id);

    // Notifier les autres joueurs
    if (match.players.length > 0) {
      const eventName = mode === 'training' ? 'training:player-left' : 'arena:player-left';
      this.io.to(matchId).emit(eventName, {
        studentId: player.studentId,
        name: player.name,
        remainingPlayers: match.players.length
      });
    }

    // Si plus personne, nettoyer
    if (match.players.length === 0) {
      this.cleanupMatch(matchId);
    }
  }

  /**
   * Mettre un match en PAUSE (un joueur s'est déconnecté pendant la partie)
   * Timer gelé pour tous, grace period de 15s avant forfait
   */
  pauseMatch(matchId, disconnectedPlayer) {
    const match = this.matches.get(matchId);
    if (!match) return;

    // Sauvegarder l'état avant pause pour pouvoir reprendre
    const now = Date.now();
    match._pauseState = {
      previousStatus: match.status,
      pausedAt: now,
      elapsedBeforePause: Math.floor((now - match.startTime) / 1000),
      disconnectedStudentId: disconnectedPlayer.studentId,
      disconnectedPlayerName: disconnectedPlayer.name
    };

    match.status = 'paused';

    // Geler le timer
    if (match.timerInterval) {
      clearInterval(match.timerInterval);
      match.timerInterval = null;
      logger.info(`[CrazyArena] ⏸️ Timer gelé pour match ${matchId}`);
    }

    const GRACE_PERIOD_MS = 30000; // 30 secondes (20s ping timeout + marge reconnexion)

    // Notifier tous les joueurs connectés (préfixe selon le mode)
    const pausePrefix = (match.mode === 'training') ? 'training' : 'arena';
    this.io.to(matchId).emit(`${pausePrefix}:match-paused`, {
      matchId,
      reason: 'player-disconnected',
      disconnectedPlayer: disconnectedPlayer.name,
      disconnectedStudentId: disconnectedPlayer.studentId,
      gracePeriodMs: GRACE_PERIOD_MS,
      pausedAt: now
    });

    logger.info(`[CrazyArena] ⏸️ Match ${matchId} en PAUSE — ${disconnectedPlayer.name} déconnecté — grace period ${GRACE_PERIOD_MS / 1000}s`);
    _logMatchEvent('MATCH_PAUSE', matchId, { mode: match.mode, disconnectedPlayer: disconnectedPlayer.name, disconnectedStudentId: disconnectedPlayer.studentId, gracePeriodMs: GRACE_PERIOD_MS, elapsedBeforePause: match._pauseState?.elapsedBeforePause });

    // Lancer le timeout forfait
    match._forfeitTimeout = setTimeout(() => {
      const m = this.matches.get(matchId);
      if (!m || m.status !== 'paused') return;

      logger.info(`[CrazyArena] ⏰ Grace period expirée pour match ${matchId} — forfait de ${disconnectedPlayer.name}`);
      this.forfeitPlayer(matchId, disconnectedPlayer.studentId);
    }, GRACE_PERIOD_MS);
  }

  /**
   * Reprendre un match après reconnexion du joueur déconnecté
   */
  resumeMatch(matchId) {
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'paused' || !match._pauseState) return;

    // Annuler le timeout forfait
    if (match._forfeitTimeout) {
      clearTimeout(match._forfeitTimeout);
      match._forfeitTimeout = null;
    }

    const pauseState = match._pauseState;
    const pauseDuration = Date.now() - pauseState.pausedAt;

    // Restaurer le status
    match.status = pauseState.previousStatus;

    // Ajuster startTime pour compenser la durée de la pause (le timer reprend là où il était)
    match.startTime += pauseDuration;

    logger.info(`[CrazyArena] ▶️ Match ${matchId} REPRIS — pause de ${Math.round(pauseDuration / 1000)}s — ${pauseState.disconnectedPlayerName} reconnecté`);
    _logMatchEvent('MATCH_RESUME', matchId, { mode: match.mode, pauseDurationMs: pauseDuration, reconnectedPlayer: pauseState.disconnectedPlayerName, reconnectedStudentId: pauseState.disconnectedStudentId });

    // Relancer le timer
    this._restartTimer(matchId);

    // Notifier tous les joueurs (préfixe selon le mode)
    const resumePrefix = (match.mode === 'training') ? 'training' : 'arena';
    this.io.to(matchId).emit(`${resumePrefix}:match-resumed`, {
      matchId,
      reconnectedPlayer: pauseState.disconnectedPlayerName,
      reconnectedStudentId: pauseState.disconnectedStudentId,
      pauseDurationMs: pauseDuration
    });

    delete match._pauseState;
  }

  /**
   * Relancer le timer après une pause (réutilise la même logique que startGame)
   */
  _restartTimer(matchId) {
    const match = this.matches.get(matchId);
    if (!match) return;

    // ✅ FIX CRITIQUE: Utiliser le bon préfixe selon le mode du match
    const prefix = (match.mode === 'training') ? 'training' : 'arena';
    const roundsPerMatch = match.config.rounds || match.config.roundsPerMatch || 3;
    const durationPerRound = match.config.duration || match.config.durationPerRound || 60;
    const totalDuration = roundsPerMatch * durationPerRound;

    logger.info(`[CrazyArena] ▶️ _restartTimer: mode=${match.mode}, prefix=${prefix}, ${roundsPerMatch} rounds × ${durationPerRound}s`);

    match.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - match.startTime) / 1000);
      const timeLeft = Math.max(0, totalDuration - elapsed);

      const currentRound = Math.floor(elapsed / durationPerRound);
      if (currentRound > match.roundsPlayed && currentRound < roundsPerMatch) {
        match.roundsPlayed = currentRound;
        this.generateZones(match.config, matchId).then(newZones => {
          match.zones = newZones;
          this.io.to(matchId).emit(`${prefix}:round-new`, {
            zones: newZones,
            roundIndex: match.roundsPlayed,
            totalRounds: roundsPerMatch,
            timestamp: Date.now()
          });
        }).catch(err => {
          logger.error(`[CrazyArena] Erreur génération nouvelle carte manche (${prefix}):`, err);
        });
      }

      const elapsedInRound = elapsed % durationPerRound;
      const timeLeftInRound = Math.max(0, durationPerRound - elapsedInRound);

      this.io.to(matchId).emit(`${prefix}:timer-tick`, {
        timeLeft: timeLeftInRound,
        elapsed,
        duration: totalDuration,
        currentRound: match.roundsPlayed + 1,
        totalRounds: roundsPerMatch
      });

      if (timeLeft === 0) {
        clearInterval(match.timerInterval);
        if (match.mode === 'training') {
          this.endTrainingGame(matchId);
        } else {
          this.endGame(matchId);
        }
      }
    }, 1000);
  }

  /**
   * Forfait d'un joueur déconnecté (grace period expirée)
   */
  forfeitPlayer(matchId, studentId) {
    const match = this.matches.get(matchId);
    if (!match) return;

    // Annuler le timeout forfait si encore actif
    if (match._forfeitTimeout) {
      clearTimeout(match._forfeitTimeout);
      match._forfeitTimeout = null;
    }

    logger.info(`[CrazyArena] 🏳️ Forfait de ${studentId} dans match ${matchId}`);
    _logMatchEvent('PLAYER_FORFEIT', matchId, { mode: match.mode, studentId, remainingPlayers: match.players.length - 1 });

    // Retirer le joueur forfait
    const playerIndex = match.players.findIndex(p => p.studentId === studentId);
    if (playerIndex !== -1) {
      const player = match.players[playerIndex];
      this.playerMatches.delete(player.socketId);
      if (player._oldSocketId) this.playerMatches.delete(player._oldSocketId);
      match.players.splice(playerIndex, 1);
    }

    // Notifier tous les joueurs du forfait (préfixe selon le mode)
    const forfeitPrefix = (match.mode === 'training') ? 'training' : 'arena';
    this.io.to(matchId).emit(`${forfeitPrefix}:player-forfeit`, {
      matchId,
      forfeitStudentId: studentId,
      remainingPlayers: match.players.length
    });

    // S'il reste des joueurs, reprendre le match
    if (match.players.length >= 1) {
      // Restaurer le status et relancer
      if (match._pauseState) {
        match.status = match._pauseState.previousStatus;
        const pauseDuration = Date.now() - match._pauseState.pausedAt;
        match.startTime += pauseDuration;
        delete match._pauseState;
      } else {
        match.status = 'playing';
      }

      this._restartTimer(matchId);
      logger.info(`[CrazyArena] ▶️ Match ${matchId} repris après forfait — ${match.players.length} joueur(s) restant(s)`);
    } else {
      // Plus personne → terminer
      this.cleanupMatch(matchId);
    }
  }

}

module.exports = CrazyArenaManager;
