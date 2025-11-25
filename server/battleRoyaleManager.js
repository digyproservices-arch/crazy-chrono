// ==========================================
// BATTLE ROYALE MANAGER - Socket.IO
// Gestion des matchs 4 joueurs en temps réel
// ==========================================

class BattleRoyaleManager {
  constructor(io) {
    this.io = io;
    this.matches = new Map(); // matchId -> { players, status, scores, zones, config }
    this.playerMatches = new Map(); // socketId -> matchId
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

    console.log(`[BattleRoyale] Match créé: ${matchId} (code: ${roomCode})`);
    return this.matches.get(matchId);
  }

  /**
   * Un joueur rejoint un match
   */
  joinMatch(socket, matchId, studentData) {
    const match = this.matches.get(matchId);
    
    if (!match) {
      socket.emit('battle:error', { message: 'Match introuvable' });
      return false;
    }

    if (match.status !== 'waiting') {
      socket.emit('battle:error', { message: 'Match déjà commencé' });
      return false;
    }

    if (match.players.length >= 4) {
      socket.emit('battle:error', { message: 'Match complet (4/4)' });
      return false;
    }

    // Vérifier que le joueur n'est pas déjà dans le match
    const alreadyJoined = match.players.find(p => p.studentId === studentData.studentId);
    if (alreadyJoined) {
      socket.emit('battle:error', { message: 'Vous êtes déjà dans ce match' });
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
    socket.join(matchId);

    console.log(`[BattleRoyale] ${studentData.name} a rejoint le match ${matchId} (${match.players.length}/4)`);

    // Notifier tous les joueurs
    this.io.to(matchId).emit('battle:player-joined', {
      players: match.players.map(p => ({
        studentId: p.studentId,
        name: p.name,
        avatar: p.avatar,
        ready: p.ready
      })),
      count: match.players.length
    });

    // Si 4 joueurs, démarrer le countdown automatiquement
    if (match.players.length === 4) {
      setTimeout(() => this.startCountdown(matchId), 1000);
    }

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
      
      this.io.to(matchId).emit('battle:player-ready', {
        studentId,
        players: match.players.map(p => ({ studentId: p.studentId, name: p.name, ready: p.ready }))
      });

      // Si tous prêts, démarrer countdown
      const allReady = match.players.length === 4 && match.players.every(p => p.ready);
      if (allReady && match.status === 'waiting') {
        this.startCountdown(matchId);
      }
    }
  }

  /**
   * Countdown 3...2...1...GO!
   */
  startCountdown(matchId) {
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'waiting') return;

    match.status = 'countdown';
    console.log(`[BattleRoyale] Countdown démarré pour match ${matchId}`);

    let count = 3;
    const interval = setInterval(() => {
      this.io.to(matchId).emit('battle:countdown', { count });
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

    console.log(`[BattleRoyale] Partie démarrée pour match ${matchId}`);

    // Générer les zones (utiliser la même logique que le mode multijoueur classique)
    const zones = await this.generateZones(match.config);
    match.zones = zones;

    // Initialiser les scores
    match.players.forEach(p => {
      match.scores[p.studentId] = { score: 0, pairsValidated: 0, errors: 0, timeMs: 0 };
    });

    // Notifier le démarrage avec les zones
    this.io.to(matchId).emit('battle:game-start', {
      zones,
      duration: match.config.duration || 60,
      startTime: match.startTime,
      players: match.players.map(p => ({
        studentId: p.studentId,
        name: p.name,
        avatar: p.avatar,
        score: 0
      }))
    });

    // Timer auto-fin de partie
    const duration = (match.config.duration || 60) * 1000;
    match.gameTimeout = setTimeout(() => {
      this.endGame(matchId);
    }, duration);
  }

  /**
   * Générer les zones (réutiliser la logique existante)
   */
  async generateZones(config) {
    // TODO: Importer votre générateur de zones existant
    // Pour l'instant, retourner des zones factices
    const zonesGenerator = require('./zonesGenerator');
    const seed = Math.floor(Math.random() * 1000000000);
    
    try {
      const zones = await zonesGenerator.generateZones({
        seed,
        classes: config.classes || ['CE1'],
        themes: config.themes || [],
        excludedPairs: []
      });
      return zones;
    } catch (error) {
      console.error('[BattleRoyale] Erreur génération zones:', error);
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

    const { studentId, isCorrect, timeMs } = data;

    // Mettre à jour le score
    if (isCorrect) {
      player.score += 10;
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

    // Diffuser les scores à tous les joueurs
    this.io.to(matchId).emit('battle:scores-update', {
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

    if (match.gameTimeout) {
      clearTimeout(match.gameTimeout);
    }

    console.log(`[BattleRoyale] Partie terminée pour match ${matchId}`);

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

    const winner = ranking[0];

    // Envoyer le podium
    this.io.to(matchId).emit('battle:game-end', {
      ranking,
      winner,
      duration: match.endTime - match.startTime
    });

    // Enregistrer les résultats dans la BDD
    try {
      await this.saveResults(matchId, ranking);
    } catch (error) {
      console.error('[BattleRoyale] Erreur sauvegarde résultats:', error);
    }

    // Nettoyer après 30s
    setTimeout(() => {
      this.cleanupMatch(matchId);
    }, 30000);
  }

  /**
   * Sauvegarder les résultats en BDD
   */
  async saveResults(matchId, ranking) {
    // TODO: Appeler l'API REST pour enregistrer les résultats
    const fetch = require('node-fetch');
    
    try {
      const res = await fetch('http://localhost:4000/api/tournament/matches/' + matchId + '/finish', {
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
      
      const data = await res.json();
      console.log('[BattleRoyale] Résultats sauvegardés:', data);
    } catch (error) {
      console.error('[BattleRoyale] Erreur sauvegarde API:', error);
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
    console.log(`[BattleRoyale] Match ${matchId} nettoyé`);
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
    console.log(`[BattleRoyale] ${player.name} s'est déconnecté du match ${matchId}`);

    // Retirer le joueur
    match.players.splice(playerIndex, 1);
    this.playerMatches.delete(socket.id);

    // Notifier les autres joueurs
    if (match.players.length > 0) {
      this.io.to(matchId).emit('battle:player-left', {
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

module.exports = BattleRoyaleManager;
