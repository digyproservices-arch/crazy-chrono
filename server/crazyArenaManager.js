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
const { validateZonesServer } = require('./utils/validateZonesServer');

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
      console.warn('[CrazyArena] Supabase non configuré, impossible de récupérer le match');
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
        console.log(`[CrazyArena] Match ${matchId} non trouvé en base:`, error?.message);
        return null;
      }

      // Recréer le match en RAM
      const config = typeof data.config === 'string' ? JSON.parse(data.config) : data.config;
      this.createMatch(matchId, data.room_code, config);
      
      // Si le match était in_progress en DB, marquer pour auto-reprise quand les joueurs se reconnectent
      const match = this.matches.get(matchId);
      if (match && data.status === 'in_progress') {
        match.wasInProgress = true;
        console.log(`[CrazyArena] Match ${matchId} était in_progress en DB, marqué wasInProgress=true pour auto-reprise`);
      }
      
      return match;
    } catch (err) {
      console.error('[CrazyArena] Erreur chargement match depuis Supabase:', err);
      return null;
    }
  }

  /**
   * Charger un match TRAINING depuis Supabase (en cas de redémarrage du backend)
   * Cherche dans training_sessions par match_id (UUID sans préfixe match_)
   */
  async loadTrainingMatchFromDatabase(matchId) {
    if (!this.supabase) {
      console.warn('[CrazyArena][Training] Supabase non configuré, impossible de récupérer le match');
      return null;
    }

    try {
      const isValidUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
      const rawUuid = matchId.replace(/^match_/, '');
      if (!isValidUuid(rawUuid)) {
        console.log(`[CrazyArena][Training] Match ${matchId} - UUID invalide après strip: ${rawUuid}`);
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
        console.warn('[CrazyArena][Training] Erreur query training_sessions:', error.message);
        return null;
      }
      if (!session) {
        console.log(`[CrazyArena][Training] Aucune session active trouvée pour match_id=${rawUuid}`);
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

      console.log(`[CrazyArena][Training] 🔄 Restauration match ${matchId} depuis DB (session ${session.id}, ${studentIds.length} joueurs, wasInProgress=${wasInProgress})`);

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
          classes: config.classes || [],
          themes: config.themes || [],
          level: config.level || 'CE1',
          sessionName: config.sessionName || session.session_name || 'Session Entraînement'
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
      console.log(`[CrazyArena][Training] ✅ Match ${matchId} restauré depuis DB — ${wasInProgress ? '⚡ jeu en cours, redémarrage auto quand joueurs rejoignent' : 'en attente de reconnexion des joueurs'}`);
      return match;
    } catch (err) {
      console.error('[CrazyArena][Training] Erreur loadTrainingMatchFromDatabase:', err);
      return null;
    }
  }

  /**
   * Créer un match en mode ENTRAÎNEMENT (sans Supabase)
   */
  createTrainingMatch(matchId, studentIds, config, classId, teacherId) {
    console.log(`[CrazyArena][Training] Création match ${matchId} pour ${studentIds.length} élèves`);
    
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
        level: config.level || 'CE1',
        sessionName: config.sessionName || 'Session Entraînement',
        objectiveMode: !!config.objectiveMode,
        objectiveTarget: config.objectiveTarget || null,
        objectiveThemes: config.objectiveThemes || [],
        helpEnabled: !!config.helpEnabled,
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
    studentIds.forEach(studentId => {
      this.io.emit(`training:invite:${studentId}`, {
        matchId,
        sessionName: storedConfig.sessionName,
        groupSize: studentIds.length,
        config: storedConfig
      });
      console.log(`[CrazyArena][Training] Notification envoyée à l'élève ${studentId}`);
    });

    console.log(`[CrazyArena][Training] Match ${matchId} créé, en attente de ${studentIds.length} joueurs`);
    return this.matches.get(matchId);
  }

  /**
   * Un joueur rejoint un match training (clone de joinMatch pour Training)
   */
  async joinTrainingMatch(socket, matchId, studentData) {
    let match = this.matches.get(matchId);
    
    // Si match non trouvé en mémoire, tenter de restaurer depuis la DB
    if (!match) {
      console.log(`[CrazyArena][Training] Match ${matchId} non trouvé en mémoire, tentative de restauration depuis DB...`);
      match = await this.loadTrainingMatchFromDatabase(matchId);
    }
    
    if (!match) {
      console.error(`[CrazyArena][Training] Match ${matchId} introuvable (mémoire + DB)`);
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
      console.log(`[CrazyArena][Training] ${studentData.name} reconnecté au match ${matchId} (old=${oldSocketId?.slice(-6)}, new=${socket.id.slice(-6)})`);
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
      
      // ✅ Si le match était en pause (joueur déconnecté), reprendre automatiquement
      if (match.status === 'paused' && match._pauseState && 
          match._pauseState.disconnectedStudentId === studentData.studentId) {
        console.log(`[CrazyArena][Training] ▶️ Joueur déconnecté ${studentData.name} reconnecté → reprise du match`);
        this.resumeMatch(matchId);
      }

      // ✅ AUTO-RESTART sur reconnexion aussi (si dernier joueur attendu)
      if (match._needsGameRestart && match.status === 'waiting' && match.players.length >= match.expectedPlayers.length) {
        console.log(`[CrazyArena][Training] ⚡ Reconnexion complète pour match restauré ${matchId} — redémarrage automatique !`);
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

    console.log(`[CrazyArena][Training] ${studentData.name} a rejoint le match ${matchId} (${match.players.length}/${match.expectedPlayers.length})${restoredScore ? ` [score restauré: ${restoredScore.score}]` : ''}`);

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

    // ✅ AUTO-RESTART: Si le match était en cours avant le redémarrage serveur,
    // relancer automatiquement le jeu quand tous les joueurs attendus ont rejoint
    if (match._needsGameRestart && match.players.length >= match.expectedPlayers.length) {
      console.log(`[CrazyArena][Training] ⚡ Tous les joueurs ont rejoint le match restauré ${matchId} — redémarrage automatique du jeu !`);
      match._needsGameRestart = false;
      
      // Court countdown (2s) puis démarrage
      match.status = 'countdown';
      let count = 3;
      const interval = setInterval(() => {
        this.io.to(matchId).emit('training:countdown', { count });
        count--;
        if (count < 0) {
          clearInterval(interval);
          console.log(`[CrazyArena][Training] ⚡ Countdown terminé, redémarrage jeu restauré...`);
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
      return;
    }

    const player = match.players.find(p => p.studentId === studentId);
    if (!player) {
      logger.warn('[CrazyArena][Training] trainingPlayerReady: Joueur introuvable', { matchId, studentId });
      return;
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
    
    logger.info('[CrazyArena][Training] Événements Socket.IO émis', { 
      matchId, 
      events: ['training:player-ready', 'training:players-update'],
      readyCount,
      totalCount
    });
  }

  /**
   * Démarrage forcé training par le professeur
   */
  trainingForceStart(matchId) {
    const match = this.matches.get(matchId);
    
    if (!match) {
      console.error(`[CrazyArena][Training] forceStart: Match ${matchId} introuvable`);
      return false;
    }

    if (match.status !== 'waiting') {
      console.warn(`[CrazyArena][Training] forceStart: Match ${matchId} déjà en statut ${match.status}`);
      return false;
    }

    if (match.players.length < 2) {
      console.warn(`[CrazyArena][Training] forceStart: Match ${matchId} a seulement ${match.players.length} joueur(s) (min 2)`);
      return false;
    }

    const readyCount = match.players.filter(p => p.ready).length;
    if (readyCount !== match.players.length) {
      console.warn(`[CrazyArena][Training] forceStart: Match ${matchId} - tous les joueurs ne sont pas prêts (${readyCount}/${match.players.length})`);
      return false;
    }

    console.log(`[CrazyArena][Training] 🚀 Démarrage forcé du match ${matchId} avec ${match.players.length} joueur(s) (tous prêts)`);
    match.status = 'countdown';
    
    // Countdown 3, 2, 1, GO!
    console.log(`[CrazyArena][Training] Countdown démarré pour match ${matchId}`);
    
    let count = 3;
    const interval = setInterval(() => {
      this.io.to(matchId).emit('training:countdown', { count });
      count--;

      if (count < 0) {
        clearInterval(interval);
        console.log(`[CrazyArena][Training] Countdown terminé, démarrage jeu...`);
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

    console.log(`[CrazyArena][Training] Partie démarrée pour match ${matchId}`);

    // Générer les zones (utiliser la même logique que le mode multijoueur classique)
    const zones = await this.generateZones(match.config, matchId);
    match.zones = zones;
    
    console.log(`[CrazyArena][Training] 🎯 Carte générée: ${zones.length} zones, 1 paire à trouver (règle: 1 paire/carte)`);

    // Initialiser les scores (préserver les scores restaurés depuis DB si match récupéré)
    const isRecovered = match._recoveredFromDB;
    match.players.forEach(p => {
      if (isRecovered && match.scores[p.studentId] && match.scores[p.studentId].score > 0) {
        console.log(`[CrazyArena][Training] 🔄 Score restauré pour ${p.studentId}: ${match.scores[p.studentId].score} pts`);
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
    
    console.log('[CrazyArena][Training] 🚀 Émission training:game-start avec config:', {
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
    
    console.log(`[CrazyArena][Training] ⏱️  Timer configuré: ${roundsPerMatch} rounds × ${durationPerRound}s = ${totalDuration}s TOTAL`);
    
    match.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - match.startTime) / 1000);
      const timeLeft = Math.max(0, totalDuration - elapsed);
      
      // ✅ NOUVELLE MANCHE toutes les durationPerRound secondes (60s, 120s, etc.)
      const currentRound = Math.floor(elapsed / durationPerRound);
      if (currentRound > match.roundsPlayed && currentRound < roundsPerMatch) {
        match.roundsPlayed = currentRound;
        console.log(`[CrazyArena][Training] 🔔 Nouvelle manche #${match.roundsPlayed + 1} démarrée (${elapsed}s écoulées)`);
        
        // Générer nouvelle carte pour la nouvelle manche
        this.generateZones(match.config, matchId).then(newZones => {
          match.zones = newZones;
          console.log(`[CrazyArena][Training] 🎯 Nouvelle carte pour manche ${match.roundsPlayed + 1}: ${newZones.length} zones`);
          
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
          
          // Émettre nouvelle carte à tous les joueurs
          try { validateZonesServer(newZones, { source: 'training:round-new', matchId: matchId.slice(-8), roundIndex: match.roundsPlayed }); } catch (e) { logger.warn('[CrazyArena][Training] Zone validation error (round-new):', e.message); }
          this.io.to(matchId).emit('training:round-new', {
            zones: newZones,
            roundIndex: match.roundsPlayed,
            totalRounds: roundsPerMatch,
            timestamp: Date.now()
          });
          
          console.log(`[CrazyArena][Training] ✅ Manche ${match.roundsPlayed + 1}/${roundsPerMatch} démarrée`);
        }).catch(err => {
          console.error('[CrazyArena][Training] Erreur génération nouvelle carte manche:', err);
        });
      }
      
      // ✅ FIX: Afficher temps restant dans la MANCHE ACTUELLE (pas global)
      const elapsedInRound = elapsed % durationPerRound;
      const timeLeftInRound = Math.max(0, durationPerRound - elapsedInRound);
      
      console.log(`[CrazyArena][Training] Émission training:timer-tick: timeLeft=${timeLeftInRound}s (manche ${match.roundsPlayed + 1}/${roundsPerMatch})`);
      this.io.to(matchId).emit('training:timer-tick', {
        timeLeft: timeLeftInRound,  // Temps restant dans la manche actuelle
        elapsed,
        duration: totalDuration,
        currentRound: match.roundsPlayed + 1,
        totalRounds: roundsPerMatch
      });
      
      if (timeLeft === 0) {
        console.log(`[CrazyArena][Training] ⏰ Timer terminé pour match ${matchId}`);
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

    console.log(`[CrazyArena][Training] 🏁 Match ${matchId} terminé`);

    // ✅ FIX: Si on sort d'un tiebreaker, ADDITIONNER scores match normal + tiebreaker
    if (match.isTiebreaker) {
      match.players.forEach(p => {
        const scoreNormal = p.scoreBeforeTiebreaker || 0;
        const scoreTiebreaker = p.tiebreakerScore || 0;
        const pairsNormal = p.pairsBeforeTiebreaker || 0;
        const pairsTiebreaker = p.tiebreakerPairs || 0;
        
        p.score = scoreNormal + scoreTiebreaker;
        p.pairsValidated = pairsNormal + pairsTiebreaker;
        
        console.log(`[CrazyArena][Training] 🏆 ${p.name}: Score final = ${scoreNormal} (normal) + ${scoreTiebreaker} (tiebreaker) = ${p.score} pts`);
      });
    }

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
    const topScore = ranking[0].score;
    const tiedPlayers = ranking.filter(p => p.score === topScore);
    
    if (tiedPlayers.length > 1 && !match.isTiebreaker) {
      // ÉGALITÉ DÉTECTÉE - Attendre décision du professeur
      console.log(`[CrazyArena][Training] ⚖️ ÉGALITÉ détectée ! ${tiedPlayers.length} joueurs à ${topScore} pts`);
      console.log(`[CrazyArena][Training] ⏸️ En attente décision professeur pour départage...`);
      
      // Mettre le match en attente de départage
      match.status = 'tie-waiting';
      match.tiedPlayers = tiedPlayers;
      
      // Notifier les joueurs de l'égalité (attente du prof)
      const tieData = {
        tiedPlayers: tiedPlayers.map(p => ({ name: p.name, score: p.score })),
        message: 'Égalité ! En attente du professeur pour le départage...'
      };
      
      console.log(`[CrazyArena][Training] 📢 Émission training:tie-detected à room ${matchId}:`, tieData);
      this.io.to(matchId).emit('training:tie-detected', tieData);
      
      // AUSSI en broadcast pour debug
      console.log(`[CrazyArena][Training] 📢 Émission training:tie-detected en BROADCAST`);
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
      
      console.log(`[CrazyArena][Training] 📢 Notification égalité envoyée pour match ${matchId}`);
      
      return; // Ne pas terminer le match - attendre décision prof
    }

    // Pas d'égalité ou après départage - Envoyer le podium final
    const winner = ranking[0];

    console.log(`[CrazyArena][Training] 🎉 Émission podium final à room ${matchId}`);
    this.io.to(matchId).emit('training:game-end', {
      ranking,
      winner,
      duration: match.endTime - match.startTime,
      isTiebreaker: match.isTiebreaker || false
    });
    
    // ✅ BROADCAST GLOBAL pour retirer notifications des élèves
    this.io.emit('training:match-finished', { matchId });
    console.log(`[Training] 📢 Broadcast training:match-finished pour ${matchId}`);
    
    // 💾 PERSISTENCE: Finaliser le match en DB (positions finales + completed_at)
    if (match._sessionId) {
      await this.persistMatchEnd(matchId, ranking);
    } else {
      // Fallback legacy (si persistMatchStart n'a pas été appelé)
      await this.saveTrainingResults(matchId, ranking, match);
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
      console.error(`[CrazyArena][Training] ❌ Match ${matchId} introuvable`);
      return;
    }

    if (match.status !== 'tie-waiting') {
      console.error(`[CrazyArena][Training] ❌ Match ${matchId} n'est pas en attente de départage`);
      return;
    }

    const tiedPlayers = match.tiedPlayers;
    if (!tiedPlayers || tiedPlayers.length < 2) {
      console.error(`[CrazyArena][Training] ❌ Pas de joueurs à égalité`);
      return;
    }

    console.log(`[CrazyArena][Training] 🎯 Professeur lance départage (${tiedPlayers.length} joueurs)`);
    
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
    
    console.log(`[CrazyArena][Training] 📡 Countdown 3-2-1 pour tiebreaker...`);
    
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
          
          console.log(`[CrazyArena][Training] 📡 Émission training:tiebreaker-start...`);
          this.io.to(matchId).emit('training:tiebreaker-start', payload);
          this.io.emit('training:tiebreaker-start', { ...payload, matchId });
          
          console.log(`[CrazyArena][Training] ✅ training:tiebreaker-start émis`);
          
        } catch (error) {
          console.error(`[CrazyArena][Training] ❌ ERREUR tiebreaker:`, error);
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
      status: match.status,
      fastBonus: timeMs < 3000
    });

    // Mettre à jour le score
    if (isCorrect) {
      // Mode tiebreaker
      if (match.status === 'tiebreaker' || match.status === 'tiebreaker-countdown') {
        const oldScore = player.tiebreakerScore || 0;
        player.tiebreakerScore = oldScore + 1;
        player.tiebreakerPairs = (player.tiebreakerPairs || 0) + 1;
        
        if (timeMs < 3000) {
          player.tiebreakerScore += 1;
          logger.info('[CrazyArena][Training] Bonus rapidité tiebreaker', { matchId, studentId, timeMs, bonusPoints: 1 });
        }
        
        match.tiebreakerPairsFound = (match.tiebreakerPairsFound || 0) + 1;
        
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
          logger.info('[CrazyArena][Training] Tiebreaker terminé - toutes paires trouvées', { 
            matchId, 
            pairsFound: match.tiebreakerPairsFound,
            pairsToFind: match.tiebreakerPairsToFind
          });
          this.endTrainingGame(matchId);
          return;
        }
        
        // Générer nouvelle carte tiebreaker
        setTimeout(async () => {
          try {
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
        
        return;
      } else {
        // Mode normal
        const oldScore = player.score || 0;
        player.score = oldScore + 1;
        player.pairsValidated = (player.pairsValidated || 0) + 1;
        
        if (timeMs < 3000) {
          player.score += 1;
          logger.info('[CrazyArena][Training] Bonus rapidité (mode normal)', { matchId, studentId, timeMs, bonusPoints: 1 });
        }
        
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
      
      // ✅ FIFO: Tracker les 15 dernières paires validées
      if (!match.validatedPairIds) match.validatedPairIds = new Set();
      
      const MAX_EXCLUDED_PAIRS = 15;
      const oldSize = match.validatedPairIds.size;
      
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
      
      // ✅ NOUVELLE CARTE IMMÉDIATEMENT
      logger.info('[CrazyArena][Training] Démarrage génération nouvelle carte', { 
        matchId, 
        excludedPairs: match.validatedPairIds.size
      });
      
      setTimeout(async () => {
        try {
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

    // Diffuser les scores (combiné base + tiebreaker si départage en cours)
    const isTiebreaker = match.status === 'tiebreaker' || match.status === 'tiebreaker-countdown';
    const scoresPayload = {
      scores: match.players.map(p => ({
        studentId: p.studentId,
        name: p.name,
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

    console.log(`[CrazyArena] Match créé: ${matchId} (code: ${roomCode})`);
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
          console.log(`[CrazyArena] Résolution roomCode "${matchId}" → matchId "${id}"`);
          matchId = id;
          match = m;
          break;
        }
      }
    }
    
    // Si le match n'existe pas en RAM, essayer de le récupérer depuis Supabase
    if (!match) {
      console.log(`[CrazyArena] Match ${matchId} introuvable en RAM, tentative récupération depuis Supabase...`);
      match = await this.loadMatchFromDatabase(matchId);
      
      if (!match) {
        console.error(`[CrazyArena] Match ${matchId} introuvable dans Supabase`);
        socket.emit('arena:error', { message: 'Match introuvable' });
        return false;
      }
      
      console.log(`[CrazyArena] Match ${matchId} récupéré depuis Supabase avec succès`);
    }

    // Vérifier si le joueur fait déjà partie du match (reconnexion)
    const existingPlayer = match.players.find(p => p.studentId === studentData.studentId);
    
    if (existingPlayer) {
      // RECONNEXION : Mettre à jour le socketId et rejoindre la room
      console.log(`[CrazyArena] 🔄 Reconnexion de ${studentData.name} (status=${match.status}, wasDisconnected=${!!existingPlayer.disconnected})`);
      
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
      console.log(`[CrazyArena] APRÈS socket.join(${matchId}) [RECONNECT] - socket.rooms:`, Array.from(socket.rooms));
      
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
      
      // ✅ Si le match était en pause (joueur déconnecté), reprendre automatiquement
      if (match.status === 'paused' && match._pauseState && 
          match._pauseState.disconnectedStudentId === studentData.studentId) {
        console.log(`[CrazyArena] ▶️ Joueur déconnecté ${studentData.name} reconnecté → reprise du match`);
        this.resumeMatch(matchId);
      }
      
      return true;
    }

    // NOUVEAU JOUEUR : Vérifier les conditions d'entrée
    if (match.status !== 'waiting') {
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
    console.log(`[CrazyArena] AVANT socket.join(${matchId}) pour ${studentData.name}`);
    socket.join(matchId);
    console.log(`[CrazyArena] APRÈS socket.join(${matchId}) - socket.rooms:`, Array.from(socket.rooms));

    console.log(`[CrazyArena] ${studentData.name} a rejoint le match ${matchId} (${match.players.length}/4)`);

    // Notifier tous les joueurs
    console.log(`[CrazyArena] Émission arena:player-joined à room ${matchId}, count=${match.players.length}`);
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
    console.log(`[CrazyArena] arena:player-joined et arena:players-update émis avec succès`);

    // ✅ AUTO-REPRISE: Si le match était in_progress avant un redémarrage serveur,
    // relancer automatiquement dès que 2+ joueurs se sont reconnectés
    if (match.wasInProgress && match.players.length >= 2 && match.status === 'waiting') {
      console.log(`[CrazyArena] 🔄 Auto-reprise du match ${matchId} après redémarrage serveur (${match.players.length} joueurs reconnectés)`);
      // Petit délai pour laisser les autres joueurs se reconnecter aussi
      setTimeout(() => {
        const m = this.matches.get(matchId);
        if (m && m.status === 'waiting' && m.wasInProgress) {
          console.log(`[CrazyArena] 🚀 Reprise effective du match ${matchId} avec ${m.players.length} joueur(s)`);
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
      logger.warn('[CrazyArena][Arena] playerReady: Aucun match pour socket', { socketId: socket.id });
      return;
    }

    const match = this.matches.get(matchId);
    if (!match) {
      logger.error('[CrazyArena][Arena] playerReady: Match introuvable', { matchId, socketId: socket.id });
      return;
    }

    const player = match.players.find(p => p.socketId === socket.id);
    if (!player) {
      logger.warn('[CrazyArena][Arena] playerReady: Joueur introuvable', { matchId, socketId: socket.id });
      return;
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
    
    logger.info('[CrazyArena][Arena] Événements Socket.IO émis (lobby)', { 
      matchId, 
      events: ['arena:player-ready', 'arena:players-update'],
      readyCount,
      totalCount
    });

    // NE PLUS démarrer automatiquement - attendre arena:force-start du professeur
  }

  /**
   * Démarrage forcé par le professeur (2-4 joueurs)
   */
  forceStart(matchId) {
    const match = this.matches.get(matchId);
    
    if (!match) {
      console.error(`[CrazyArena] forceStart: Match ${matchId} introuvable`);
      return false;
    }

    if (match.status === 'countdown' || match.status === 'playing') {
      console.log(`[CrazyArena] forceStart: Match ${matchId} déjà en ${match.status} — OK`);
      return true; // ✅ Idempotent: already starting/playing is fine
    }
    if (match.status !== 'waiting') {
      console.warn(`[CrazyArena] forceStart: Match ${matchId} statut ${match.status} — refusé`);
      return false;
    }

    if (match.players.length < 2) {
      console.warn(`[CrazyArena] forceStart: Match ${matchId} a seulement ${match.players.length} joueur(s) (min 2)`);
      return false;
    }

    const readyCount = match.players.filter(p => p.ready).length;
    if (readyCount !== match.players.length) {
      console.warn(`[CrazyArena] forceStart: Match ${matchId} - tous les joueurs ne sont pas prêts (${readyCount}/${match.players.length})`);
      return false;
    }

    console.log(`[CrazyArena] 🚀 Démarrage forcé du match ${matchId} avec ${match.players.length} joueur(s) (tous prêts)`);
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
    console.log(`[CrazyArena] Countdown démarré pour match ${matchId}`);

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

    console.log(`[CrazyArena] Partie démarrée pour match ${matchId}`);

    // Générer les zones (utiliser la même logique que le mode multijoueur classique)
    const zones = await this.generateZones(match.config, matchId);
    match.zones = zones;
    
    console.log(`[CrazyArena] 🎯 Carte générée: ${zones.length} zones, 1 paire à trouver (règle: 1 paire/carte)`);

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
    
    console.log('[CrazyArena] 🚀 Émission arena:game-start avec config:', {
      matchId: matchId.slice(-8),
      hasConfig: !!gameStartPayload.config,
      configThemes: gameStartPayload.config?.themes,
      configClasses: gameStartPayload.config?.classes,
      zonesCount: zones.length
    });
    
    // Valider les zones avant émission (monitoring double PA / fausse paire)
    try { validateZonesServer(zones, { source: 'arena:game-start', matchId: matchId.slice(-8) }); } catch (e) { logger.warn('[CrazyArena] Zone validation error:', e.message); }
    this.io.to(matchId).emit('arena:game-start', gameStartPayload);

    // 💾 PERSISTENCE: Créer match_results initiaux en DB (skip si reprise après redémarrage)
    if (!isResume) {
      this.persistArenaMatchStart(matchId).catch(err => {
        logger.error('[CrazyArena][Arena] Erreur persistArenaMatchStart (non-bloquante)', { matchId, error: err.message });
      });
    } else {
      console.log(`[CrazyArena] 🔄 Reprise: skip persistArenaMatchStart (match_results déjà en DB)`);
    }

    // ⏱️ CHRONO: Diffuser le temps restant toutes les secondes
    // ✅ CORRECTION: Timer TOTAL = rounds × duration (ex: 3 × 60s = 180s)
    const roundsPerMatch = match.config.rounds || match.config.roundsPerMatch || 3;
    const durationPerRound = match.config.duration || match.config.durationPerRound || 60;
    const totalDuration = roundsPerMatch * durationPerRound;
    
    console.log(`[CrazyArena] ⏱️  Timer configuré: ${roundsPerMatch} rounds × ${durationPerRound}s = ${totalDuration}s TOTAL`);
    
    match.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - match.startTime) / 1000);
      const timeLeft = Math.max(0, totalDuration - elapsed);
      
      // ✅ NOUVELLE MANCHE toutes les durationPerRound secondes (60s, 120s, etc.)
      const currentRound = Math.floor(elapsed / durationPerRound);
      if (currentRound > match.roundsPlayed && currentRound < roundsPerMatch) {
        match.roundsPlayed = currentRound;
        console.log(`[CrazyArena] 🔔 Nouvelle manche #${match.roundsPlayed + 1} démarrée (${elapsed}s écoulées)`);
        
        // Générer nouvelle carte pour la nouvelle manche
        this.generateZones(match.config, matchId).then(newZones => {
          match.zones = newZones;
          console.log(`[CrazyArena] 🎯 Nouvelle carte pour manche ${match.roundsPlayed + 1}: ${newZones.length} zones`);
          
          // Valider les zones avant émission (monitoring double PA / fausse paire)
          try { validateZonesServer(newZones, { source: 'arena:round-new', matchId: matchId.slice(-8), roundIndex: match.roundsPlayed }); } catch (e) { logger.warn('[CrazyArena] Zone validation error (round-new):', e.message); }
          // Émettre nouvelle carte à tous les joueurs
          this.io.to(matchId).emit('arena:round-new', {
            zones: newZones,
            roundIndex: match.roundsPlayed,
            totalRounds: roundsPerMatch,
            timestamp: Date.now()
          });
          
          console.log(`[CrazyArena] ✅ Manche ${match.roundsPlayed + 1}/${roundsPerMatch} démarrée`);
        }).catch(err => {
          console.error('[CrazyArena] Erreur génération nouvelle carte manche:', err);
        });
      }
      
      // ✅ FIX: Afficher temps restant dans la MANCHE ACTUELLE (pas global)
      const elapsedInRound = elapsed % durationPerRound;
      const timeLeftInRound = Math.max(0, durationPerRound - elapsedInRound);
      
      console.log(`[CrazyArena] Émission arena:timer-tick: timeLeft=${timeLeftInRound}s (manche ${match.roundsPlayed + 1}/${roundsPerMatch})`);
      this.io.to(matchId).emit('arena:timer-tick', {
        timeLeft: timeLeftInRound,  // Temps restant dans la manche actuelle
        elapsed,
        duration: totalDuration,
        currentRound: match.roundsPlayed + 1,
        totalRounds: roundsPerMatch
      });
      
      if (timeLeft === 0) {
        console.log(`[CrazyArena] ⏰ Timer terminé pour match ${matchId}`);
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
      // Fallback pour classes et themes
      const defaultClasses = ['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e', '5e', '4e', '3e'];
      const defaultThemes = ['botanique', 'multiplication'];
      
      const finalClasses = (config.classes && config.classes.length > 0) ? config.classes : defaultClasses;
      const finalThemes = (config.themes && config.themes.length > 0) ? config.themes : defaultThemes;
      
      // ✅ CRITIQUE: Récupérer les paires exclues du match (FIFO)
      let excludedPairIds = new Set();
      let deckState = null;
      if (matchId) {
        const match = this.matches.get(matchId);
        if (match) {
          if (match.validatedPairIds) {
            excludedPairIds = match.validatedPairIds;
            console.log(`[ZoneGen] 🚫 Exclusion FIFO: ${excludedPairIds.size} paires`);
          }
          // Anti-repetition deck per match
          if (!match.deckState) match.deckState = createDeckState();
          deckState = match.deckState;
        }
      }
      
      console.log('[ZoneGen] Config:', {
        seed,
        classes: finalClasses,
        themes: finalThemes,
        excludedCount: excludedPairIds.size,
        hasDeck: !!deckState
      });
      
      // IMPORTANT: Passer excludedPairIds + deckState au générateur
      const result = generateRoundZones(seed, {
        classes: finalClasses,
        themes: finalThemes,
        excludedPairIds: excludedPairIds,
        deckState: deckState
      });
      
      // generateRoundZones retourne {zones: [], goodPairIds: {}}
      const zones = result.zones || [];
      
      console.log('[ZoneGen] ✅ Zones générées:', zones.length);
      return zones;
    } catch (error) {
      console.error('[ZoneGen] ❌ Erreur:', error);
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
      status: match.status,
      fastBonus: timeMs < 3000
    });

    // Mettre à jour le score
    if (isCorrect) {
      // ✅ TIEBREAKER: Comptabiliser séparément pour addition finale
      if (match.status === 'tiebreaker' || match.status === 'tiebreaker-countdown') {
        const oldScore = player.tiebreakerScore || 0;
        player.tiebreakerScore = oldScore + 1;
        player.tiebreakerPairs = (player.tiebreakerPairs || 0) + 1;
        
        if (timeMs < 3000) {
          player.tiebreakerScore += 1;
          logger.info('[CrazyArena][Arena] Bonus rapidité tiebreaker', { matchId, studentId, timeMs, bonusPoints: 1 });
        }
        
        match.tiebreakerPairsFound = (match.tiebreakerPairsFound || 0) + 1;
        
        logger.info('[CrazyArena][Arena] Score tiebreaker mis à jour', { 
          matchId, 
          studentId,
          playerName: player.name,
          oldScore,
          newScore: player.tiebreakerScore,
          pairsFound: match.tiebreakerPairsFound,
          pairsToFind: match.tiebreakerPairsToFind
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
          logger.info('[CrazyArena][Arena] Tiebreaker terminé - toutes paires trouvées', { 
            matchId, 
            pairsFound: match.tiebreakerPairsFound,
            pairsToFind: match.tiebreakerPairsToFind
          });
          
          this.endGame(matchId);
          return;
        }
        
        // ✅ Émettre scores-update pendant le tiebreaker (sinon UI reste à 0)
        const tbScoresPayload = {
          scores: match.players.map(p => ({
            studentId: p.studentId,
            name: p.name,
            score: (p.scoreBeforeTiebreaker || 0) + (p.tiebreakerScore || 0),
            pairsValidated: (p.pairsBeforeTiebreaker || 0) + (p.tiebreakerPairs || 0)
          })).sort((a, b) => b.score - a.score)
        };
        this.io.to(matchId).emit('arena:scores-update', tbScoresPayload);

        setTimeout(async () => {
          try {
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
        
        return; // Sortir pour éviter double génération
      } else {
        const oldScore = player.score || 0;
        player.score = oldScore + 1;
        player.pairsValidated = (player.pairsValidated || 0) + 1;
        
        if (timeMs < 3000) {
          player.score += 1;
          logger.info('[CrazyArena][Arena] Bonus rapidité (mode normal)', { matchId, studentId, timeMs, bonusPoints: 1 });
        }
        
        logger.info('[CrazyArena][Arena] Score mis à jour (mode normal)', { 
          matchId, 
          studentId,
          oldScore,
          newScore: player.score,
          pairsValidated: player.pairsValidated
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
      const pairValidatedPayload = {
        studentId,
        playerName: player.name,
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
      
      logger.info('[CrazyArena][Arena] Démarrage génération nouvelle carte', { 
        matchId, 
        excludedPairs: match.validatedPairIds.size
      });
      
      setTimeout(async () => {
        try {
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

    const scoresPayload = {
      scores: match.players.map(p => ({
        studentId: p.studentId,
        name: p.name,
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

    console.log(`[CrazyArena] Partie terminée pour match ${matchId}`);

    // ✅ FIX: Si on sort d'un tiebreaker, ADDITIONNER scores match normal + tiebreaker
    if (match.isTiebreaker) {
      match.players.forEach(p => {
        const scoreNormal = p.scoreBeforeTiebreaker || 0;
        const scoreTiebreaker = p.tiebreakerScore || 0;
        const pairsNormal = p.pairsBeforeTiebreaker || 0;
        const pairsTiebreaker = p.tiebreakerPairs || 0;
        
        p.score = scoreNormal + scoreTiebreaker;  // ADDITION
        p.pairsValidated = pairsNormal + pairsTiebreaker;
        
        console.log(`[CrazyArena] 🏆 ${p.name}: Score final = ${scoreNormal} (normal) + ${scoreTiebreaker} (tiebreaker) = ${p.score} pts`);
      });
    }

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
    const topScore = ranking[0].score;
    const tiedPlayers = ranking.filter(p => p.score === topScore);
    
    if (tiedPlayers.length > 1 && !match.isTiebreaker) {
      // ÉGALITÉ DÉTECTÉE - Attendre décision du professeur
      console.log(`[CrazyArena] ⚖️ ÉGALITÉ détectée ! ${tiedPlayers.length} joueurs à ${topScore} pts`);
      console.log(`[CrazyArena] ⏸️ En attente décision professeur pour départage...`);
      
      // Mettre le match en attente de départage
      match.status = 'tie-waiting';
      match.tiedPlayers = tiedPlayers;
      
      // Notifier les joueurs de l'égalité (attente du prof)
      const tieData = {
        tiedPlayers: tiedPlayers.map(p => ({ name: p.name, score: p.score })),
        message: 'Égalité ! En attente du professeur pour le départage...'
      };
      
      console.log(`[CrazyArena] 📢 Émission arena:tie-detected à room ${matchId}:`, tieData);
      this.io.to(matchId).emit('arena:tie-detected', tieData);
      
      // AUSSI en broadcast pour debug (au cas où room échoue)
      console.log(`[CrazyArena] 📢 Émission arena:tie-detected en BROADCAST`);
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
      
      console.log(`[CrazyArena] 📢 Notification égalité envoyée à TOUS les clients pour match ${matchId}`);
      
      return; // Ne pas terminer le match - attendre décision prof
    }

    // Pas d'égalité ou après départage - Envoyer le podium final
    const winner = ranking[0];

    console.log(`[CrazyArena] 🎉 Émission podium final à room ${matchId}`);
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
        console.log(`[CrazyArena][Training] Extras mode Entraînement`);
        const trainingMode = new TrainingMode(this.io, this.supabase);
        trainingMode.matchId = matchId; // ✅ FIX: Injecter matchId manquant
        await trainingMode.saveTrainingStats(ranking);
      } else {
        console.log(`[CrazyArena][Tournament] Extras mode Tournoi`);
        const tournamentMode = new TournamentMode(this.io, this.supabase);
        tournamentMode.matchId = matchId; // ✅ FIX: Injecter matchId manquant
        tournamentMode.groupId = match.groupId;
        if (ranking[0]) {
          await tournamentMode.markGroupWinner(ranking[0]);
        }
      }
    } catch (error) {
      console.error(`[CrazyArena] Erreur extras mode spécialisé (non-bloquant):`, error);
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
      console.error(`[CrazyArena] ❌ Match ${matchId} introuvable`);
      return;
    }

    if (match.status !== 'tie-waiting') {
      console.error(`[CrazyArena] ❌ Match ${matchId} n'est pas en attente de départage (status: ${match.status})`);
      return;
    }

    const tiedPlayers = match.tiedPlayers;
    if (!tiedPlayers || tiedPlayers.length < 2) {
      console.error(`[CrazyArena] ❌ Pas de joueurs à égalité pour match ${matchId}`);
      return;
    }

    console.log(`[CrazyArena] 🎯 Professeur lance départage pour match ${matchId} (${tiedPlayers.length} joueurs à égalité)`);
    
    match.isTiebreaker = true;
    match.status = 'playing';
    match.startTime = Date.now();
    
    // Générer seulement 3 cartes pour le départage
    const tiebreakerConfig = {
      ...match.config,
      rounds: 1 // Une seule manche avec moins de zones
    };
    
    const zonesResult = await this.generateZones(tiebreakerConfig);
    
    // ✅ FIX: generateZones retourne {zones: [...]} pas [...]
    const zonesArray = Array.isArray(zonesResult) ? zonesResult : (zonesResult?.zones || []);
    
    console.log(`[CrazyArena] 🔍 Zones générées pour tiebreaker:`, { count: zonesArray.length });
    
    // ✅ UTILISER TOUTES les zones générées (comme démarrage normal)
    match.zones = zonesArray;
    match.tiebreakerPairsToFind = 3;
    match.tiebreakerPairsFound = 0;
    
    console.log(`[CrazyArena] 🎴 Tiebreaker: ${match.zones.length} zones, objectif ${match.tiebreakerPairsToFind} paires`);
    
    const tiedStudentIds = tiedPlayers.map(p => p.studentId);
    console.log(`[CrazyArena] 🔍 studentIds à égalité:`, tiedStudentIds);
    
    // ✅ FIX: Sauvegarder scores du match normal avant tiebreaker (pour addition finale)
    match.players.forEach(p => {
      if (tiedStudentIds.includes(p.studentId)) {
        console.log(`[CrazyArena] 💾 Sauvegarde score match normal pour ${p.studentId}: ${p.score} pts`);
        p.scoreBeforeTiebreaker = p.score;  // Sauvegarder score existant
        p.pairsBeforeTiebreaker = p.pairsValidated;
        // Reset UNIQUEMENT les compteurs tiebreaker (pas le score total)
        p.tiebreakerScore = 0;
        p.tiebreakerPairs = 0;
        p.errors = 0;
      }
    });
    
    console.log(`[CrazyArena] 📡 Countdown 3-2-1 pour tiebreaker...`);
    
    // ✅ Countdown 3-2-1 comme au démarrage initial
    match.status = 'tiebreaker-countdown';
    let count = 3;
    const countdownInterval = setInterval(() => {
      console.log(`[CrazyArena] Countdown tiebreaker: ${count}`);
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
          
          console.log(`[CrazyArena] 🔍 Payload tiebreaker:`, {
            zonesCount: payload.zones?.length,
            tiedPlayersCount: payload.tiedPlayers?.length,
            firstZone: payload.zones?.[0]
          });
          
          console.log(`[CrazyArena] 📡 Émission arena:tiebreaker-start...`);
          this.io.to(matchId).emit('arena:tiebreaker-start', payload);
          this.io.emit('arena:tiebreaker-start', { ...payload, matchId });
          
          console.log(`[CrazyArena] ✅ arena:tiebreaker-start émis (room + broadcast)`);
          
          // ✅ Safety timeout: si tiebreaker ne finit pas en 30s, forcer la fin
          match.tiebreakerTimeout = setTimeout(() => {
            if (match.status === 'tiebreaker') {
              console.warn(`[CrazyArena] ⏰ Tiebreaker timeout 30s pour match ${matchId} — forceEnd`);
              this.endGame(matchId);
            }
          }, 30000);
          
        } catch (error) {
          console.error(`[CrazyArena] ❌ ERREUR émission arena:tiebreaker-start:`, error);
          console.error(`[CrazyArena] Stack:`, error.stack);
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
    } catch (err) {
      logger.error('[CrazyArena][Training] ❌ Erreur persistMatchStart', { matchId, error: err.message });
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
        const m = calcZone.content ? calcZone.content.match(/^(\d+)\s*×/) : null;
        theme = m ? `Table de ${m[1]}` : 'Multiplication';
        item_id = calcZone.content || pairId;
      } else if (imgZone || txtZone) {
        item_type = 'imgtxt';
        const THEME_DISPLAY = { 'botanique': 'Plantes médicinales', 'multiplication': 'Tables de multiplication', 'geographie': 'Géographie', 'animaux': 'Animaux', 'fruits': 'Fruits & Légumes' };
        const cfgTheme = (match.config && match.config.themes && match.config.themes[0]) || '';
        theme = THEME_DISPLAY[cfgTheme] || cfgTheme || 'Images & Textes';
        if (txtZone && txtZone.content) {
          item_id = JSON.stringify({ text: txtZone.content, img: imgZone ? imgZone.content : null });
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
      
      // Marquer la session comme terminée
      await this.supabase
        .from('training_sessions')
        .update({ completed_at: new Date().toISOString() })
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

      logger.info('[CrazyArena][Training] 💾 Match finalisé en DB', { matchId, sessionId: match._sessionId, players: ranking.length });
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

      // Marquer tournament_matches comme finished
      await this.supabase
        .from('tournament_matches')
        .update({
          status: 'finished',
          finished_at: new Date().toISOString(),
          players: JSON.stringify(ranking),
          winner: JSON.stringify(ranking[0] || null)
        })
        .eq('id', matchId);

      logger.info('[CrazyArena][Arena] 💾 Match Arena finalisé en DB', { matchId, players: ranking.length });
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

    console.log(`[CrazyArena][Training] 💾 Sauvegarde résultats Training pour match ${matchId}`);
    
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
      
      console.log(`[CrazyArena][Training] 📡 Appel API: ${url}`, { 
        matchId, 
        resultsCount: ranking.length,
        classId: match.classId 
      });
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      console.log(`[CrazyArena][Training] 📥 Réponse API status: ${res.status}`);
      
      if (!res.ok) {
        const text = await res.text();
        console.error(`[CrazyArena][Training] ❌ API erreur: ${res.status} - ${text}`);
        return false;
      }
      
      const data = await res.json();
      console.log('[CrazyArena][Training] ✅ Résultats Training sauvegardés:', data);
      return true;
    } catch (error) {
      console.error('[CrazyArena][Training] ❌ Erreur sauvegarde Training:', error);
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

    console.log(`[CrazyArena] 💾 Sauvegarde résultats pour match ${matchId}`);
    console.log(`[CrazyArena] 🌐 Backend URL: ${backendUrl}`);
    
    try {
      const url = `${backendUrl}/api/tournament/matches/${matchId}/finish`;
      console.log(`[CrazyArena] 📡 Appel API: ${url}`);
      
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
      
      console.log(`[CrazyArena] 📥 Réponse API status: ${res.status}`);
      
      if (!res.ok) {
        const text = await res.text();
        console.error(`[CrazyArena] ❌ API erreur: ${res.status} - ${text}`);
        return false;
      }
      
      const data = await res.json();
      console.log('[CrazyArena] ✅ Résultats sauvegardés:', data);
      
      // Notifier le dashboard que le match est terminé (room)
      this.io.to(matchId).emit('arena:match-finished', {
        matchId,
        winner: data.winner
      });
      
      // ✅ BROADCAST GLOBAL pour retirer notifications des élèves hors room
      this.io.emit('arena:match-finished', { matchId });
      
      return true;
    } catch (error) {
      console.error('[CrazyArena] ❌ Erreur sauvegarde API:', error);
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
    console.log(`[CrazyArena] Match ${matchId} nettoyé`);
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
    console.log(`[CrazyArena]${mode === 'training' ? '[Training]' : ''} ${player.name} s'est déconnecté du match ${matchId} (status=${match.status})`);

    // Si le match est en cours (playing/tiebreaker), mettre en PAUSE au lieu de retirer le joueur
    if (match.status === 'playing' || match.status === 'tiebreaker') {
      player.disconnected = true;
      player.disconnectedAt = Date.now();
      // NE PAS supprimer le mapping playerMatches ici — on le garde pour la reconnexion éventuelle
      // Mais marquer l'ancien socketId comme invalide
      player._oldSocketId = socket.id;

      this.pauseMatch(matchId, player);
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
      console.log(`[CrazyArena] ⏸️ Timer gelé pour match ${matchId}`);
    }

    const GRACE_PERIOD_MS = 15000; // 15 secondes

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

    console.log(`[CrazyArena] ⏸️ Match ${matchId} en PAUSE — ${disconnectedPlayer.name} déconnecté — grace period ${GRACE_PERIOD_MS / 1000}s`);

    // Lancer le timeout forfait
    match._forfeitTimeout = setTimeout(() => {
      const m = this.matches.get(matchId);
      if (!m || m.status !== 'paused') return;

      console.log(`[CrazyArena] ⏰ Grace period expirée pour match ${matchId} — forfait de ${disconnectedPlayer.name}`);
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

    console.log(`[CrazyArena] ▶️ Match ${matchId} REPRIS — pause de ${Math.round(pauseDuration / 1000)}s — ${pauseState.disconnectedPlayerName} reconnecté`);

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

    const roundsPerMatch = match.config.rounds || match.config.roundsPerMatch || 3;
    const durationPerRound = match.config.duration || match.config.durationPerRound || 60;
    const totalDuration = roundsPerMatch * durationPerRound;

    match.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - match.startTime) / 1000);
      const timeLeft = Math.max(0, totalDuration - elapsed);

      const currentRound = Math.floor(elapsed / durationPerRound);
      if (currentRound > match.roundsPlayed && currentRound < roundsPerMatch) {
        match.roundsPlayed = currentRound;
        this.generateZones(match.config, matchId).then(newZones => {
          match.zones = newZones;
          this.io.to(matchId).emit('arena:round-new', {
            zones: newZones,
            roundIndex: match.roundsPlayed,
            totalRounds: roundsPerMatch,
            timestamp: Date.now()
          });
        }).catch(err => {
          console.error('[CrazyArena] Erreur génération nouvelle carte manche:', err);
        });
      }

      const elapsedInRound = elapsed % durationPerRound;
      const timeLeftInRound = Math.max(0, durationPerRound - elapsedInRound);

      this.io.to(matchId).emit('arena:timer-tick', {
        timeLeft: timeLeftInRound,
        elapsed,
        duration: totalDuration,
        currentRound: match.roundsPlayed + 1,
        totalRounds: roundsPerMatch
      });

      if (timeLeft === 0) {
        clearInterval(match.timerInterval);
        this.endGame(matchId);
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

    console.log(`[CrazyArena] 🏳️ Forfait de ${studentId} dans match ${matchId}`);

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
      console.log(`[CrazyArena] ▶️ Match ${matchId} repris après forfait — ${match.players.length} joueur(s) restant(s)`);
    } else {
      // Plus personne → terminer
      this.cleanupMatch(matchId);
    }
  }

}

module.exports = CrazyArenaManager;
