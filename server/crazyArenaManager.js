// ==========================================
// CRAZY ARENA MANAGER - Socket.IO
// Gestion des matchs 4 joueurs en temps réel
// ==========================================

// NOTE: TrainingMode/TournamentMode sont des classes alternatives complètes
// qui étendent BattleRoyaleEngine. Elles ne peuvent pas être instanciées
// depuis crazyArenaManager car elles nécessitent tout le contexte du match.
// TODO: Créer helpers de sauvegarde séparés si besoin de logique spécialisée

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
        classes: [config.level || 'CE1'],
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
      console.error(`[CrazyArena][Training] trainingPlayerReady: Match ${matchId} introuvable`);
      return;
    }

    const player = match.players.find(p => p.studentId === studentId);
    if (player) {
      player.ready = true;
      
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
    }
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

    if (match.players.length === 0) {
      console.warn(`[CrazyArena][Training] forceStart: Aucun joueur connecté`);
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
        this.generateZones(match.config).then(newZones => {
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
   * Terminer le match Training
   */
  endTrainingGame(matchId) {
    const match = this.matches.get(matchId);
    if (!match) return;

    match.status = 'finished';
    if (match.timerInterval) {
      clearInterval(match.timerInterval);
    }

    console.log(`[CrazyArena][Training] 🏁 Match ${matchId} terminé`);

    // Envoyer résultats finaux
    const playersArray = Array.from(match.players.values());
    const finalScores = playersArray.map(p => ({
      studentId: p.studentId,
      name: p.name,
      score: p.score || 0,
      pairsValidated: p.pairsValidated || 0
    })).sort((a, b) => b.score - a.score);

    this.io.to(matchId).emit('training:game-end', {
      scores: finalScores,
      duration: match.config.durationPerRound || 60
    });
    
    // ✅ BROADCAST GLOBAL pour retirer notifications des élèves
    this.io.emit('training:match-finished', { matchId });
    console.log(`[Training] 📢 Broadcast training:match-finished pour ${matchId}`);
  }

  /**
   * Validation de paire en mode Training (COPIE EXACTE de pairValidated Battle Royale)
   */
  trainingPairValidated(matchId, studentId, zoneAId, zoneBId, pairId, isCorrect, timeMs) {
    const match = this.matches.get(matchId);
    if (!match || (match.status !== 'playing' && match.status !== 'tiebreaker' && match.status !== 'tiebreaker-countdown')) return;

    const player = Array.from(match.players.values()).find(p => p.studentId === studentId);
    if (!player) return;

    console.log(`[Training] Paire validée: ${studentId}, correct=${isCorrect}, pairId=${pairId}`);

    // Mettre à jour le score (MÊME LOGIQUE QUE ARENA)
    if (isCorrect) {
      // Mode tiebreaker
      if (match.status === 'tiebreaker' || match.status === 'tiebreaker-countdown') {
        player.tiebreakerScore = (player.tiebreakerScore || 0) + 1;
        player.tiebreakerPairs = (player.tiebreakerPairs || 0) + 1;
        
        if (timeMs < 3000) {
          player.tiebreakerScore += 1;
        }
        
        match.tiebreakerPairsFound = (match.tiebreakerPairsFound || 0) + 1;
        console.log(`[Training] 🎯 TIEBREAKER: ${match.tiebreakerPairsFound}/${match.tiebreakerPairsToFind} paires trouvées`);
        
        if (match.tiebreakerPairsFound >= match.tiebreakerPairsToFind) {
          console.log(`[Training] 🏁 TIEBREAKER TERMINÉ`);
          this.trainingEndGame(matchId);
          return;
        }
        
        // Générer nouvelle carte tiebreaker
        setTimeout(async () => {
          try {
            const newZones = await this.generateZones(match.config, matchId);
            match.zones = newZones;
            
            this.io.to(matchId).emit('training:round-new', {
              zones: newZones,
              roundIndex: match.tiebreakerPairsFound,
              totalRounds: match.tiebreakerPairsToFind,
              timestamp: Date.now()
            });
          } catch (err) {
            console.error('[Training] Erreur génération carte tiebreaker:', err);
          }
        }, 1500);
        
        return;
      } else {
        // Mode normal
        player.score = (player.score || 0) + 1;
        player.pairsValidated = (player.pairsValidated || 0) + 1;
        
        if (timeMs < 3000) {
          player.score += 1;
        }
      }
    } else {
      // Erreur: retirer points
      if (match.status === 'tiebreaker' || match.status === 'tiebreaker-countdown') {
        player.tiebreakerScore = Math.max(0, (player.tiebreakerScore || 0) - 2);
      } else {
        player.score = Math.max(0, (player.score || 0) - 2);
      }
      player.errors = (player.errors || 0) + 1;
    }

    // ✅ SYNCHRONISER la paire validée à TOUS les joueurs
    if (isCorrect && pairId) {
      console.log(`[Training] Émission training:pair-validated à room ${matchId}`);
      this.io.to(matchId).emit('training:pair-validated', {
        studentId,
        playerName: player.name,
        pairId,
        zoneAId,
        zoneBId,
        timestamp: Date.now()
      });
      
      // ✅ FIFO: Tracker les 15 dernières paires validées
      if (!match.validatedPairIds) match.validatedPairIds = new Set();
      
      const MAX_EXCLUDED_PAIRS = 15;
      if (match.validatedPairIds.size >= MAX_EXCLUDED_PAIRS) {
        const pairIdsArray = Array.from(match.validatedPairIds);
        const oldestPairId = pairIdsArray[0];
        match.validatedPairIds.delete(oldestPairId);
      }
      
      match.validatedPairIds.add(pairId);
      console.log(`[Training] 📊 FIFO: ${match.validatedPairIds.size}/${MAX_EXCLUDED_PAIRS} paires exclues`);
      
      // ✅ NOUVELLE CARTE IMMÉDIATEMENT
      console.log(`[Training] 🎉 Génération nouvelle carte avec exclusions...`);
      
      setTimeout(async () => {
        try {
          const newZones = await this.generateZones(match.config, matchId);
          match.zones = newZones;
          
          console.log(`[Training] 🎯 Nouvelle carte: ${newZones.length} zones`);
          
          this.io.to(matchId).emit('training:round-new', {
            zones: newZones,
            roundIndex: match.roundsPlayed || 0,
            totalRounds: match.config.rounds || null,
            timestamp: Date.now()
          });
        } catch (err) {
          console.error('[Training] Erreur génération carte:', err);
        }
      }, 1500);
    }

    // Diffuser les scores
    const playersArray = Array.from(match.players.values());
    this.io.to(matchId).emit('training:scores-update', {
      scores: playersArray.map(p => ({
        studentId: p.studentId,
        name: p.name,
        score: p.score || 0,
        pairsValidated: p.pairsValidated || 0
      })).sort((a, b) => b.score - a.score)
    });
  }

  /**
   * Créer une salle Battle Royale (mode TOURNOI)
   */
  createMatch(matchId, roomCode, config) {
    this.matches.set(matchId, {
      id: matchId,
      mode: 'arena',  // ✅ Ajouter mode pour cohérence avec Training
      roomCode,
      players: [], // Max 4 joueurs
      status: 'waiting', // waiting | countdown | playing | finished
      scores: {},
      zones: null,
      config: config || { rounds: 3, duration: 60, classes: ['CE1'], themes: [] },
      startTime: null,
      endTime: null,
      roundsPlayed: 0,  // ✅ Comme Training
      validatedPairIds: null,  // ✅ Sera initialisé dans startGame
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
        players: match.players.map(p => ({ studentId: p.studentId, name: p.name, score: p.score })),
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
      players: playersData,
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
    if (!matchId) return;

    const match = this.matches.get(matchId);
    if (!match) return;

    const player = match.players.find(p => p.socketId === socket.id);
    if (player) {
      player.ready = true;
      
      const playersData = match.players.map(p => ({ 
        studentId: p.studentId, 
        name: p.name, 
        avatar: p.avatar,
        ready: p.ready,
        score: p.score
      }));
      
      this.io.to(matchId).emit('arena:player-ready', {
        studentId,
        players: playersData
      });
      
      // Notifier aussi le dashboard professeur
      this.io.to(matchId).emit('arena:players-update', {
        matchId,
        players: playersData
      });

      // NE PLUS démarrer automatiquement - attendre arena:force-start du professeur
    }
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
    if (!matchId) return;

    const match = this.matches.get(matchId);
    // ✅ FIX: Accepter aussi status tiebreaker (pas seulement 'playing')
    if (!match || (match.status !== 'playing' && match.status !== 'tiebreaker' && match.status !== 'tiebreaker-countdown')) return;

    const player = match.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const { studentId, isCorrect, timeMs, pairId, zoneAId, zoneBId } = data;

    // Mettre à jour le score
    if (isCorrect) {
      // ✅ TIEBREAKER: Comptabiliser séparément pour addition finale
      if (match.status === 'tiebreaker' || match.status === 'tiebreaker-countdown') {
        // Incrémenter compteurs tiebreaker séparés
        player.tiebreakerScore = (player.tiebreakerScore || 0) + 1;
        player.tiebreakerPairs = (player.tiebreakerPairs || 0) + 1;
        
        // Bonus vitesse (< 3s)
        if (timeMs < 3000) {
          player.tiebreakerScore += 1;
        }
        
        match.tiebreakerPairsFound = (match.tiebreakerPairsFound || 0) + 1;
        console.log(`[CrazyArena] 🎯 TIEBREAKER: ${match.tiebreakerPairsFound}/${match.tiebreakerPairsToFind} paires trouvées (${player.name}: ${player.tiebreakerScore} pts)`);
        
        if (match.tiebreakerPairsFound >= match.tiebreakerPairsToFind) {
          console.log(`[CrazyArena] 🏁 TIEBREAKER TERMINÉ: ${match.tiebreakerPairsToFind} paires trouvées!`);
          
          // Terminer le match immédiatement
          this.endGame(matchId);
          return;
        }
        
        // Générer nouvelle carte pour la paire suivante (3 cartes successives)
        console.log(`[CrazyArena] 🎴 Génération carte ${match.tiebreakerPairsFound + 1}/3 pour tiebreaker...`);
        setTimeout(async () => {
          try {
            const newZones = await this.generateZones(match.config, matchId);
            match.zones = newZones;
            
            console.log(`[CrazyArena] ✅ Carte tiebreaker ${match.tiebreakerPairsFound + 1}/3: ${newZones.length} zones`);
            
            this.io.to(matchId).emit('arena:round-new', {
              zones: newZones,
              roundIndex: match.tiebreakerPairsFound,
              totalRounds: match.tiebreakerPairsToFind,
              timestamp: Date.now()
            });
          } catch (err) {
            console.error('[CrazyArena] Erreur génération carte tiebreaker:', err);
          }
        }, 1500);
        
        return; // Sortir pour éviter double génération
      } else {
        // Mode normal (pas tiebreaker): incrémenter score normal
        player.score += 1;
        player.pairsValidated += 1;
        
        // Bonus vitesse (< 3s)
        if (timeMs < 3000) {
          player.score += 1;
        }
      }
    } else {
      // Erreur: retirer points
      if (match.status === 'tiebreaker' || match.status === 'tiebreaker-countdown') {
        player.tiebreakerScore = Math.max(0, (player.tiebreakerScore || 0) - 2);
      } else {
        player.score = Math.max(0, player.score - 2);
      }
      player.errors += 1;
    }

    match.scores[studentId] = {
      score: player.score,
      pairsValidated: player.pairsValidated,
      errors: player.errors,
      timeMs: Date.now() - match.startTime
    };

    // ✅ SYNCHRONISER la paire validée à TOUS les joueurs
    if (isCorrect && pairId) {
      console.log(`[CrazyArena] Émission arena:pair-validated à room ${matchId}: player=${player.name}, pairId=${pairId}`);
      this.io.to(matchId).emit('arena:pair-validated', {
        studentId,
        playerName: player.name,
        pairId,
        zoneAId,
        zoneBId,
        timestamp: Date.now()
      });
      console.log(`[CrazyArena] arena:pair-validated émis avec succès`);
      
      // ✅ FIFO: Tracker les 15 dernières paires validées (éviter répétition)
      if (!match.validatedPairIds) match.validatedPairIds = new Set();
      
      const MAX_EXCLUDED_PAIRS = 15;
      if (match.validatedPairIds.size >= MAX_EXCLUDED_PAIRS) {
        const pairIdsArray = Array.from(match.validatedPairIds);
        const oldestPairId = pairIdsArray[0];
        match.validatedPairIds.delete(oldestPairId);
        console.log(`[CrazyArena] FIFO: Supprimé paire la plus ancienne: ${oldestPairId}`);
      }
      
      match.validatedPairIds.add(pairId);
      console.log(`[CrazyArena] 📊 Paire validée ajoutée au FIFO: ${pairId} (total: ${match.validatedPairIds.size}/${MAX_EXCLUDED_PAIRS})`);
      
      // ✅ NOUVELLE CARTE IMMÉDIATEMENT (REGLES_CRITIQUES.md ligne 159)
      console.log(`[CrazyArena] 🎉 Paire trouvée! Génération nouvelle carte...`);
      
      // Générer nouvelle carte avec exclusion FIFO
      setTimeout(async () => {
        try {
          const newZones = await this.generateZones(match.config, matchId);
          match.zones = newZones;
          
          console.log(`[CrazyArena] 🎯 Nouvelle carte générée: ${newZones.length} zones, 1 paire`);
          
          // Émettre nouvelle carte à tous les joueurs
          this.io.to(matchId).emit('arena:round-new', {
            zones: newZones,
            roundIndex: match.roundsPlayed,
            totalRounds: match.config.rounds || null,
            timestamp: Date.now()
          });
          
          console.log(`[CrazyArena] ✅ arena:round-new émis`);
        } catch (err) {
          console.error('[CrazyArena] Erreur génération nouvelle carte:', err);
        }
      }, 1500); // Délai 1.5s pour laisser temps aux joueurs de voir la dernière paire
    }

    // Diffuser les scores à tous les joueurs
    this.io.to(matchId).emit('arena:scores-update', {
      scores: match.players.map(p => ({
        studentId: p.studentId,
        name: p.name,
        score: p.score,
        pairsValidated: p.pairsValidated
      })).sort((a, b) => b.score - a.score) // Trier par score DESC
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
    console.log(`[CrazyArena] 🔍 playerReadyForTiebreaker appelé: ${playerName} (${studentId}) pour match ${matchId}`);
    
    const match = this.matches.get(matchId);
    if (!match) {
      console.error(`[CrazyArena] ❌ Match ${matchId} introuvable dans matches (${this.matches.size} matchs actifs)`);
      return;
    }

    console.log(`[CrazyArena] 🔍 Match trouvé, status: ${match.status}`);
    
    if (match.status !== 'tie-waiting') {
      console.error(`[CrazyArena] ❌ Match ${matchId} n'est pas en attente de départage (status: ${match.status})`);
      return;
    }

    // Initialiser le set de joueurs prêts si nécessaire
    if (!match.playersReadyForTiebreaker) {
      match.playersReadyForTiebreaker = new Set();
      console.log(`[CrazyArena] 🔍 Set playersReadyForTiebreaker initialisé`);
    }

    // Ajouter le joueur aux prêts
    match.playersReadyForTiebreaker.add(studentId);
    console.log(`[CrazyArena] ✋ ${playerName} prêt pour départage (${match.playersReadyForTiebreaker.size}/${match.tiedPlayers.length})`);

    const payload = {
      matchId,
      readyCount: match.playersReadyForTiebreaker.size,
      totalCount: match.tiedPlayers.length,
      readyPlayers: Array.from(match.playersReadyForTiebreaker)
    };
    
    console.log(`[CrazyArena] 📢 Émission arena:tiebreaker-ready-update (broadcast):`, payload);
    
    // Notifier le dashboard du professeur
    io.emit('arena:tiebreaker-ready-update', payload);
    
    console.log(`[CrazyArena] ✅ arena:tiebreaker-ready-update émis avec succès`);
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
              name: p.name 
            }))
          };
          
          console.log(`[CrazyArena] 🔍 Payload tiebreaker:`, {
            zonesCount: payload.zones?.length,
            tiedPlayersCount: payload.tiedPlayers?.length,
            firstZone: payload.zones?.[0]
          });
          
          console.log(`[CrazyArena] 📡 Émission arena:tiebreaker-start en BROADCAST...`);
          this.io.emit('arena:tiebreaker-start', { ...payload, matchId });
          
          console.log(`[CrazyArena] ✅ arena:tiebreaker-start émis - Pas de timer, juste 3 paires`);
          
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
   * Déconnexion d'un joueur
   */
  handleDisconnect(socket) {
    const matchId = this.playerMatches.get(socket.id);
    if (!matchId) return;

    const match = this.matches.get(matchId);
    if (!match) return;

    const playerIndex = match.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex === -1) return;

    const player = match.players[playerIndex];
    console.log(`[CrazyArena] ${player.name} s'est déconnecté du match ${matchId}`);

    // Retirer le joueur
    match.players.splice(playerIndex, 1);
    this.playerMatches.delete(socket.id);

    // Notifier les autres joueurs
    if (match.players.length > 0) {
      this.io.to(matchId).emit('arena:player-left', {
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
