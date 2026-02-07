// ==========================================
// CRAZY ARENA MANAGER - Socket.IO
// Gestion des matchs 4 joueurs en temps réel
// ==========================================

// NOTE: TrainingMode/TournamentMode sont des classes alternatives complètes
// qui étendent BattleRoyaleEngine. Elles ne peuvent pas être instanciées
// depuis crazyArenaManager car elles nécessitent tout le contexte du match.
// TODO: Créer helpers de sauvegarde séparés si besoin de logique spécialisée

const logger = require('./logger');

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
        .eq('status', 'pending')
        .single();

      if (error || !data) {
        console.log(`[CrazyArena] Match ${matchId} non trouvé en base:`, error?.message);
        return null;
      }

      // Recréer le match en RAM
      const config = typeof data.config === 'string' ? JSON.parse(data.config) : data.config;
      this.createMatch(matchId, data.room_code, config);
      
      return this.matches.get(matchId);
    } catch (err) {
      console.error('[CrazyArena] Erreur chargement match depuis Supabase:', err);
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
        duration: config.durationPerRound || 60,
        classes: config.classes || ['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e', '5e', '4e', '3e'],
        themes: config.themes || [],
        level: config.level || 'CE1',
        sessionName: config.sessionName || 'Session Entraînement'
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

    // Notifier chaque élève via Socket.IO
    studentIds.forEach(studentId => {
      this.io.emit(`training:invite:${studentId}`, {
        matchId,
        sessionName: config.sessionName || 'Session Entraînement',
        groupSize: studentIds.length,
        config: {
          rounds: config.rounds || 3,
          duration: config.durationPerRound || 60,
          level: config.level || 'CE1'
        }
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
    const match = this.matches.get(matchId);
    
    if (!match) {
      console.error(`[CrazyArena][Training] Match ${matchId} introuvable`);
      socket.emit('training:error', { message: 'Match introuvable' });
      return false;
    }

    // Vérifier si le joueur fait déjà partie du match (reconnexion)
    const existingPlayer = match.players.find(p => p.studentId === studentData.studentId);
    
    if (existingPlayer) {
      // RECONNEXION : Mettre à jour le socketId et rejoindre la room
      console.log(`[CrazyArena][Training] ${studentData.name} reconnecté au match ${matchId}`);
      existingPlayer.socketId = socket.id;
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
      
      return true;
    }

    const player = {
      socketId: socket.id,
      studentId: studentData.studentId,
      name: studentData.name,
      avatar: studentData.avatar || '/avatars/default.png',
      ready: false,
      score: 0,
      pairsValidated: 0,
      errors: 0,
      timeMs: 0
    };

    match.players.push(player);
    this.playerMatches.set(socket.id, matchId);  // ✅ Mapping socket → matchId
    socket.join(matchId);

    console.log(`[CrazyArena][Training] ${studentData.name} a rejoint le match ${matchId} (${match.players.length}/${match.expectedPlayers.length})`);

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

    console.log(`[CrazyArena][Training] 🚀 Démarrage forcé du match ${matchId} avec ${match.players.length} joueur(s)`);
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
    
    console.log('[CrazyArena][Training] 🚀 Émission training:game-start avec config:', {
      matchId: matchId.slice(-8),
      hasConfig: !!gameStartPayload.config,
      configThemes: gameStartPayload.config?.themes,
      configClasses: gameStartPayload.config?.classes,
      zonesCount: zones.length
    });
    
    this.io.to(matchId).emit('training:game-start', gameStartPayload);

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
          
          // Émettre nouvelle carte à tous les joueurs
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
  endTrainingGame(matchId) {
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
    const matchId = this.playerMatches.get(socket.id);
    if (!matchId) {
      logger.warn('[CrazyArena][Training] trainingPairValidated: Aucun match pour socket', { socketId: socket.id });
      return;
    }

    const match = this.matches.get(matchId);
    if (!match) {
      logger.error('[CrazyArena][Training] trainingPairValidated: Match introuvable', { matchId, socketId: socket.id });
      return;
    }
    
    if (match.status !== 'playing' && match.status !== 'tiebreaker' && match.status !== 'tiebreaker-countdown') {
      logger.warn('[CrazyArena][Training] trainingPairValidated: Statut invalide', { matchId, status: match.status, expected: ['playing', 'tiebreaker', 'tiebreaker-countdown'] });
      return;
    }

    const player = match.players.find(p => p.socketId === socket.id);
    if (!player) {
      logger.warn('[CrazyArena][Training] trainingPairValidated: Joueur introuvable', { matchId, socketId: socket.id });
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
        
        // ✅ CRITIQUE: Émettre scores tiebreaker aux clients
        const playersData = match.players.map(p => ({
          studentId: p.studentId,
          name: p.name,
          avatar: p.avatar,
          score: p.tiebreakerScore || 0,
          pairsValidated: p.tiebreakerPairs || 0,
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
    } else {
      // Erreur: retirer points
      if (match.status === 'tiebreaker' || match.status === 'tiebreaker-countdown') {
        const oldScore = player.tiebreakerScore || 0;
        player.tiebreakerScore = Math.max(0, oldScore - 2);
        
        logger.info('[CrazyArena][Training] Paire incorrecte - pénalité tiebreaker', { 
          matchId, 
          studentId,
          oldScore,
          newScore: player.tiebreakerScore,
          penalty: -2
        });
        
        // ✅ Émettre scores tiebreaker après erreur
        const playersData = match.players.map(p => ({
          studentId: p.studentId,
          name: p.name,
          avatar: p.avatar,
          score: p.tiebreakerScore || 0,
          pairsValidated: p.tiebreakerPairs || 0,
          errors: p.errors || 0,
          ready: p.ready || false
        }));
        
        this.io.to(matchId).emit('training:players-update', playersData);
        
        logger.info('[CrazyArena][Training] Événement training:players-update émis après erreur (tiebreaker)', { 
          matchId,
          event: 'training:players-update'
        });
      } else {
        const oldScore = player.score;
        player.score = Math.max(0, oldScore - 2);
        
        logger.info('[CrazyArena][Training] Paire incorrecte - pénalité (mode normal)', { 
          matchId, 
          studentId,
          oldScore,
          newScore: player.score,
          penalty: -2
        });
      }
      player.errors = (player.errors || 0) + 1;
    }

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

    // Diffuser les scores
    const scoresPayload = {
      scores: match.players.map(p => ({
        studentId: p.studentId,
        name: p.name,
        score: p.score || 0,
        pairsValidated: p.pairsValidated || 0
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
   * Récupérer l'état d'un match (pour dashboard professeur)
   */
  getMatchState(matchId) {
    const match = this.matches.get(matchId);
    if (!match) return null;

    return {
      matchId: match.id,
      roomCode: match.roomCode,
      status: match.status,
      players: match.players.map(p => ({
        studentId: p.studentId,
        name: p.name,
        avatar: p.avatar,
        ready: p.ready,
        score: p.score
      })),
      currentRound: 0
    };
  }

  /**
   * Un joueur rejoint un match
   */
  async joinMatch(socket, matchId, studentData) {
    let match = this.matches.get(matchId);
    
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
      console.log(`[CrazyArena] 🔄 Reconnexion de ${studentData.name} (status=${match.status})`);
      existingPlayer.socketId = socket.id;
      this.playerMatches.set(socket.id, matchId);
      
      // Rejoindre la room Socket.IO
      console.log(`[CrazyArena] AVANT socket.join(${matchId}) [RECONNECT] pour ${studentData.name}`);
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
      
      return true;
    }

    // NOUVEAU JOUEUR : Vérifier les conditions d'entrée
    if (match.status !== 'waiting') {
      socket.emit('arena:error', { message: 'Match déjà commencé - impossible de rejoindre' });
      return false;
    }

    if (match.players.length >= 4) {
      socket.emit('arena:error', { message: 'Match complet (4/4)' });
      return false;
    }

    // Ajouter le joueur
    const player = {
      socketId: socket.id,
      studentId: studentData.studentId,
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

    // Ne PAS démarrer automatiquement - attendre que tous soient prêts
    // Le countdown se lancera via playerReady() quand tous seront prêts

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

    if (match.status !== 'waiting') {
      console.warn(`[CrazyArena] forceStart: Match ${matchId} déjà en statut ${match.status}`);
      return false;
    }

    if (match.players.length < 2) {
      console.warn(`[CrazyArena] forceStart: Match ${matchId} a seulement ${match.players.length} joueur(s) (min 2)`);
      return false;
    }

    console.log(`[CrazyArena] 🚀 Démarrage forcé du match ${matchId} avec ${match.players.length} joueur(s)`);
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
  async startGame(matchId) {
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
    
    this.io.to(matchId).emit('arena:game-start', gameStartPayload);

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
    const { generateRoundZones } = require('./utils/serverZoneGenerator');
    const seed = Math.floor(Math.random() * 1000000000);
    
    try {
      // Fallback pour classes et themes
      const defaultClasses = ['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e', '5e', '4e', '3e'];
      const defaultThemes = ['botanique', 'multiplication'];
      
      const finalClasses = (config.classes && config.classes.length > 0) ? config.classes : defaultClasses;
      const finalThemes = (config.themes && config.themes.length > 0) ? config.themes : defaultThemes;
      
      // ✅ CRITIQUE: Récupérer les paires exclues du match (FIFO)
      let excludedPairIds = new Set();
      if (matchId) {
        const match = this.matches.get(matchId);
        if (match && match.validatedPairIds) {
          excludedPairIds = match.validatedPairIds;
          console.log(`[ZoneGen] 🚫 Exclusion FIFO: ${excludedPairIds.size} paires`);
        }
      }
      
      console.log('[ZoneGen] Config:', {
        seed,
        classes: finalClasses,
        themes: finalThemes,
        excludedCount: excludedPairIds.size
      });
      
      // IMPORTANT: Passer excludedPairIds au générateur
      const result = generateRoundZones(seed, {
        classes: finalClasses,
        themes: finalThemes,
        excludedPairIds: excludedPairIds
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
    const matchId = this.playerMatches.get(socket.id);
    if (!matchId) {
      logger.warn('[CrazyArena][Arena] pairValidated: Aucun match pour socket', { socketId: socket.id });
      return;
    }

    const match = this.matches.get(matchId);
    if (!match) {
      logger.error('[CrazyArena][Arena] pairValidated: Match introuvable', { matchId, socketId: socket.id });
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
    } else {
      if (match.status === 'tiebreaker' || match.status === 'tiebreaker-countdown') {
        const oldScore = player.tiebreakerScore || 0;
        player.tiebreakerScore = Math.max(0, oldScore - 2);
        
        logger.info('[CrazyArena][Arena] Paire incorrecte - pénalité tiebreaker', { 
          matchId, 
          studentId,
          oldScore,
          newScore: player.tiebreakerScore,
          penalty: -2
        });
      } else {
        const oldScore = player.score;
        player.score = Math.max(0, oldScore - 2);
        
        logger.info('[CrazyArena][Arena] Paire incorrecte - pénalité (mode normal)', { 
          matchId, 
          studentId,
          oldScore,
          newScore: player.score,
          penalty: -2
        });
      }
      player.errors = (player.errors || 0) + 1;
    }

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

    // ==========================================
    // DÉLÉGUER SAUVEGARDE AU MODE SPÉCIALISÉ
    // ==========================================
    try {
      if (match.mode === 'training') {
        // Mode Entraînement
        console.log(`[CrazyArena][Training] Délégation sauvegarde mode Entraînement`);
        const trainingMode = new TrainingMode(this.io, this.supabase);
        await trainingMode.onMatchEnd(matchId, match, ranking);
      } else {
        // Mode Tournoi (par défaut)
        console.log(`[CrazyArena][Tournament] Délégation sauvegarde mode Tournoi`);
        const tournamentMode = new TournamentMode(this.io, this.supabase);
        await tournamentMode.onMatchEnd(matchId, match, ranking);
      }
    } catch (error) {
      console.error(`[CrazyArena] Erreur délégation mode spécialisé:`, error);
      // Fallback: sauvegarder avec méthode classique
      await this.saveResults(matchId, ranking);
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
          
        } catch (error) {
          console.error(`[CrazyArena] ❌ ERREUR émission arena:tiebreaker-start:`, error);
          console.error(`[CrazyArena] Stack:`, error.stack);
          this.endGame(matchId);
        }
      }
    }, 1000);
  }

  /**
   * Sauvegarder les résultats en BDD
   */
  async saveResults(matchId, ranking) {
    // Appeler l'API REST pour enregistrer les résultats
    const fetch = require('node-fetch');
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';

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
   */
  handleDisconnect(socket) {
    const matchId = this.playerMatches.get(socket.id);
    if (!matchId) return;

    const match = this.matches.get(matchId);
    if (!match) return;

    const playerIndex = match.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex === -1) return;

    const player = match.players[playerIndex];
    const mode = match.mode || 'arena'; // Détecter le mode
    console.log(`[CrazyArena]${mode === 'training' ? '[Training]' : ''} ${player.name} s'est déconnecté du match ${matchId}`);

    // Retirer le joueur
    match.players.splice(playerIndex, 1);
    this.playerMatches.delete(socket.id);

    // Notifier les autres joueurs avec le bon event selon le mode
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
   * Obtenir l'état d'un match
   */
  getMatchState(matchId) {
    return this.matches.get(matchId);
  }
}

module.exports = CrazyArenaManager;
