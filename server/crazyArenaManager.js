// ==========================================
// CRAZY ARENA MANAGER - Socket.IO
// Gestion des matchs 4 joueurs en temps réel
// ==========================================

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
   * Créer une salle Battle Royale
   */
  createMatch(matchId, roomCode, config) {
    this.matches.set(matchId, {
      id: matchId,
      roomCode,
      players: [], // Max 4 joueurs
      status: 'waiting', // waiting | countdown | playing | finished
      scores: {},
      zones: null,
      config: config || { rounds: 3, duration: 60, classes: ['CE1'], themes: [] },
      startTime: null,
      endTime: null,
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
    const zones = await this.generateZones(match.config);
    match.zones = zones;
    
    console.log(`[CrazyArena] 🎯 Carte générée: ${zones.length} zones, 1 paire à trouver (règle: 1 paire/carte)`);

    // Initialiser les scores
    match.players.forEach(p => {
      match.scores[p.studentId] = { score: 0, pairsValidated: 0, errors: 0, timeMs: 0 };
    });

    // Notifier le démarrage avec les zones ET la config
    const gameStartPayload = {
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
        this.generateZones(match.config).then(newZones => {
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
      
      console.log(`[CrazyArena] Émission arena:timer-tick: timeLeft=${timeLeft}s, manche=${match.roundsPlayed + 1}/${roundsPerMatch}`);
      this.io.to(matchId).emit('arena:timer-tick', {
        timeLeft,
        elapsed,
        duration: totalDuration,
        currentRound: match.roundsPlayed + 1,
        totalRounds: roundsPerMatch
      });
      
      if (timeLeft === 0) {
        console.log(`[CrazyArena] ⏰ Timer terminé pour match ${matchId}`);
        clearInterval(match.timerInterval);
      }
    }, 1000);

    // Timer auto-fin de partie (durée TOTALE)
    match.gameTimeout = setTimeout(() => {
      if (match.timerInterval) {
        clearInterval(match.timerInterval);
      }
      this.endGame(matchId);
    }, totalDuration * 1000);
  }

  /**
   * Générer les zones (réutiliser la logique existante)
   */
  async generateZones(config) {
    // Utiliser le générateur de zones du serveur
    const { generateRoundZones } = require('./utils/serverZoneGenerator');
    const seed = Math.floor(Math.random() * 1000000000);
    
    try {
      // Fallback pour classes et themes - vérifier si array vide
      const defaultClasses = ['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e', '5e', '4e', '3e'];
      const defaultThemes = ['botanique', 'multiplication'];
      
      const finalClasses = (config.classes && config.classes.length > 0) ? config.classes : defaultClasses;
      const finalThemes = (config.themes && config.themes.length > 0) ? config.themes : defaultThemes;
      
      console.log('[CrazyArena] Génération zones avec config:', {
        seed,
        classes: finalClasses,
        themes: finalThemes
      });
      
      // IMPORTANT: seed est le 1er paramètre, config le 2ème
      const result = generateRoundZones(seed, {
        classes: finalClasses,
        themes: finalThemes,
        excludedPairIds: new Set()
      });
      
      // generateRoundZones retourne {zones: [], goodPairIds: {}}
      const zones = result.zones || [];
      
      console.log('[CrazyArena] Zones générées:', zones.length);
      return zones;
    } catch (error) {
      console.error('[CrazyArena] Erreur génération zones:', error);
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
    if (!match || match.status !== 'playing') return;

    const player = match.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const { studentId, isCorrect, timeMs, pairId, zoneAId, zoneBId } = data;

    // Mettre à jour le score
    if (isCorrect) {
      // ✅ CORRECTION: +1 point par validation (selon REGLES_CRITIQUES.md ligne 157)
      player.score += 1;
      player.pairsValidated += 1;
      
      // Bonus vitesse (< 3s)
      if (timeMs < 3000) {
        player.score += 1;
      }
    } else {
      player.score = Math.max(0, player.score - 2);
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
          const newZones = await this.generateZones(match.config);
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
    if (!match || match.status !== 'playing') return;

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
      this.io.to(matchId).emit('arena:tie-detected', {
        tiedPlayers: tiedPlayers.map(p => ({ name: p.name, score: p.score })),
        message: 'Égalité ! En attente du professeur pour le départage...'
      });
      
      // Notifier le dashboard professeur qu'il doit décider
      this.io.to(matchId).emit('arena:tie-waiting-teacher', {
        matchId,
        tiedPlayers: tiedPlayers.map(p => ({ 
          studentId: p.studentId,
          name: p.name, 
          score: p.score 
        })),
        ranking
      });
      
      return; // Ne pas terminer le match - attendre décision prof
    }

    const winner = ranking[0];

    // Envoyer le podium
    this.io.to(matchId).emit('arena:game-end', {
      ranking,
      winner,
      duration: match.endTime - match.startTime,
      isTiebreaker: match.isTiebreaker || false
    });

    // Enregistrer les résultats dans la BDD
    try {
      await this.saveResults(matchId, ranking);
    } catch (error) {
      console.error('[CrazyArena] Erreur sauvegarde résultats:', error);
    }

    // Nettoyer après 30s
    setTimeout(() => {
      this.cleanupMatch(matchId);
    }, 30000);
  }

  /**
   * Lancer une manche de départage (3 cartes) - DÉCLENCHÉ PAR LE PROFESSEUR
   */
  async startTiebreakerByTeacher(matchId) {
    const match = this.matches.get(matchId);
    if (!match) {
      console.error(`[CrazyArena] ❌ startTiebreakerByTeacher: Match ${matchId} introuvable`);
      return;
    }

    if (match.status !== 'tie-waiting') {
      console.warn(`[CrazyArena] ⚠️ Match ${matchId} n'est pas en attente de départage (status: ${match.status})`);
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
    
    const zones = await this.generateZones(tiebreakerConfig);
    // Limiter à 3 zones pour le tiebreaker
    match.zones = zones.slice(0, 3);
    
    console.log(`[CrazyArena] 🎴 Tiebreaker: ${match.zones.length} cartes générées`);
    
    // Réinitialiser les scores des joueurs à égalité uniquement
    const tiedStudentIds = tiedPlayers.map(p => p.studentId);
    match.players.forEach(p => {
      if (tiedStudentIds.includes(p.studentId)) {
        p.score = 0;
        p.pairsValidated = 0;
        p.errors = 0;
      }
    });
    
    // Notifier le démarrage du tiebreaker
    this.io.to(matchId).emit('arena:tiebreaker-start', {
      zones: match.zones,
      duration: 30, // 30 secondes pour le tiebreaker
      startTime: match.startTime,
      tiedPlayers: tiedPlayers.map(p => ({ 
        studentId: p.studentId, 
        name: p.name 
      }))
    });
    
    // Timer de 30 secondes pour le tiebreaker
    match.gameTimeout = setTimeout(() => {
      this.endGame(matchId);
    }, 30000);
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
      
      // Notifier le dashboard que le match est terminé
      this.io.to(matchId).emit('arena:match-finished', {
        matchId,
        winner: data.winner
      });
      
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
