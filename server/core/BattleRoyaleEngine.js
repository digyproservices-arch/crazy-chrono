const { v4: uuidv4 } = require('uuid');
const { generateZones } = require('../utils/zoneGenerator');

class BattleRoyaleEngine {
  constructor(io, config) {
    this.io = io;
    this.matchId = config.matchId || `match_${uuidv4()}`;
    this.mode = config.mode; // 'training' | 'tournament'
    
    this.players = new Map();
    this.zones = [];
    this.currentRound = 0;
    this.status = 'pending'; // pending | countdown | playing | tiebreaker | finished
    
    this.config = {
      roundsPerMatch: config.roundsPerMatch || 3,
      durationPerRound: config.durationPerRound || 60,
      groupSize: config.groupSize || 4,
      ...config
    };
    
    this.timerInterval = null;
    this.startTime = null;
    this.roundStartTime = null;
  }

  addPlayer(studentId, playerData) {
    this.players.set(studentId, {
      studentId,
      name: playerData.name,
      socketId: playerData.socketId,
      ready: false,
      connected: true,
      score: 0,
      pairsValidated: 0,
      errors: 0,
      timeMs: 0,
      scoreBeforeTiebreaker: 0,
      pairsBeforeTiebreaker: 0,
      tiebreakerScore: 0,
      tiebreakerPairs: 0
    });
    
    console.log(`[BattleRoyale][${this.matchId}] Joueur ajouté: ${playerData.name} (${studentId})`);
  }

  removePlayer(studentId) {
    const player = this.players.get(studentId);
    if (player) {
      player.connected = false;
      console.log(`[BattleRoyale][${this.matchId}] Joueur déconnecté: ${player.name}`);
    }
  }

  setPlayerReady(studentId, ready = true) {
    const player = this.players.get(studentId);
    if (player) {
      player.ready = ready;
      this.io.to(this.matchId).emit('arena:player-ready', {
        studentId,
        ready,
        readyCount: this.getReadyCount(),
        totalPlayers: this.players.size
      });
    }
  }

  getReadyCount() {
    return Array.from(this.players.values()).filter(p => p.ready).length;
  }

  canStart() {
    return this.players.size >= 2 && this.getReadyCount() === this.players.size;
  }

  async startCountdown() {
    this.status = 'countdown';
    console.log(`[BattleRoyale][${this.matchId}] Démarrage countdown...`);

    for (let count = 3; count >= 0; count--) {
      this.io.to(this.matchId).emit('arena:countdown', { count });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async startMatch() {
    console.log(`[BattleRoyale][${this.matchId}] Démarrage du match!`);
    
    this.status = 'playing';
    this.startTime = Date.now();
    this.currentRound = 1;

    await this.startRound();
  }

  async startRound() {
    console.log(`[BattleRoyale][${this.matchId}] Round ${this.currentRound}/${this.config.roundsPerMatch}`);
    
    this.roundStartTime = Date.now();
    this.zones = await this.generateZones();

    this.io.to(this.matchId).emit('arena:round-new', {
      zones: this.zones,
      roundIndex: this.currentRound,
      totalRounds: this.config.roundsPerMatch
    });

    this.startTimer();
  }

  startTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    this.timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.roundStartTime) / 1000);
      const timeLeft = Math.max(0, this.config.durationPerRound - elapsed);

      this.io.to(this.matchId).emit('arena:timer-tick', {
        timeLeft,
        elapsed,
        duration: this.config.durationPerRound,
        currentRound: this.currentRound,
        totalRounds: this.config.roundsPerMatch
      });

      if (timeLeft === 0) {
        clearInterval(this.timerInterval);
        this.onRoundEnd();
      }
    }, 1000);
  }

  async generateZones() {
    const zones = await generateZones({
      level: this.config.level || 'CE1',
      theme: this.config.theme,
      count: 16
    });
    return zones;
  }

  validatePair(studentId, pairId, timeMs) {
    const player = this.players.get(studentId);
    if (!player) {
      console.error(`[BattleRoyale][${this.matchId}] Joueur ${studentId} introuvable`);
      return false;
    }

    const isTiebreaker = this.status === 'tiebreaker' || this.status === 'tiebreaker-countdown';

    if (isTiebreaker) {
      player.tiebreakerScore += 10;
      player.tiebreakerPairs++;
      
      if (timeMs < 3000) {
        player.tiebreakerScore += 1;
      }
      
      console.log(`[BattleRoyale][${this.matchId}] Tiebreaker - ${player.name}: ${player.tiebreakerScore} pts (${player.tiebreakerPairs} paires)`);
    } else {
      player.score += 10;
      player.pairsValidated++;
      
      if (timeMs < 3000) {
        player.score += 1;
      }
      
      console.log(`[BattleRoyale][${this.matchId}] ${player.name}: ${player.score} pts (${player.pairsValidated} paires)`);
    }

    player.timeMs = Date.now() - this.startTime;

    this.io.to(this.matchId).emit('arena:pair-validated', {
      studentId,
      score: isTiebreaker ? player.tiebreakerScore : player.score,
      pairsValidated: isTiebreaker ? player.tiebreakerPairs : player.pairsValidated
    });

    if (isTiebreaker) {
      this.checkTiebreakerEnd();
    }

    return true;
  }

  recordError(studentId) {
    const player = this.players.get(studentId);
    if (player) {
      player.errors++;
      player.score = Math.max(0, player.score - 2);
      
      this.io.to(this.matchId).emit('arena:error', {
        studentId,
        errors: player.errors,
        score: player.score
      });
    }
  }

  async onRoundEnd() {
    console.log(`[BattleRoyale][${this.matchId}] Fin du round ${this.currentRound}`);

    if (this.currentRound < this.config.roundsPerMatch) {
      this.currentRound++;
      await this.startRound();
    } else {
      await this.endMatch();
    }
  }

  calculateRanking() {
    const players = Array.from(this.players.values());
    
    return players.sort((a, b) => {
      const aScore = a.scoreBeforeTiebreaker + a.tiebreakerScore || a.score;
      const bScore = b.scoreBeforeTiebreaker + b.tiebreakerScore || b.score;
      
      if (bScore !== aScore) return bScore - aScore;
      return a.timeMs - b.timeMs;
    }).map((p, index) => ({
      position: index + 1,
      studentId: p.studentId,
      name: p.name,
      score: p.scoreBeforeTiebreaker + p.tiebreakerScore || p.score,
      timeMs: p.timeMs,
      pairsValidated: p.pairsBeforeTiebreaker + p.tiebreakerPairs || p.pairsValidated,
      errors: p.errors
    }));
  }

  hasTie(ranking) {
    if (ranking.length < 2) return false;
    return ranking[0].score === ranking[1].score;
  }

  async startTiebreaker() {
    console.log(`[BattleRoyale][${this.matchId}] Égalité détectée - Tiebreaker!`);
    
    this.status = 'tiebreaker';
    
    const ranking = this.calculateRanking();
    const tiedPlayers = ranking.filter(p => p.score === ranking[0].score);

    for (const tp of tiedPlayers) {
      const player = this.players.get(tp.studentId);
      if (player) {
        player.scoreBeforeTiebreaker = player.score;
        player.pairsBeforeTiebreaker = player.pairsValidated;
        player.tiebreakerScore = 0;
        player.tiebreakerPairs = 0;
      }
    }

    this.io.to(this.matchId).emit('arena:tie-detected', {
      tiedPlayers: tiedPlayers.map(p => ({
        studentId: p.studentId,
        name: p.name,
        score: p.score
      })),
      message: 'Égalité ! Départage en cours...'
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    for (let count = 3; count >= 0; count--) {
      this.io.to(this.matchId).emit('arena:countdown', { count });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.status = 'tiebreaker';
    this.zones = await this.generateZones();
    
    this.io.to(this.matchId).emit('arena:tiebreaker-start', {
      zones: this.zones,
      pairsToFind: 3,
      message: '3 paires à trouver - Pas de timer!'
    });
  }

  checkTiebreakerEnd() {
    const players = Array.from(this.players.values());
    const maxPairs = Math.max(...players.map(p => p.tiebreakerPairs));
    
    if (maxPairs >= 3) {
      this.endMatch();
    }
  }

  async endMatch() {
    console.log(`[BattleRoyale][${this.matchId}] Fin du match`);
    
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    this.status = 'finished';

    const players = Array.from(this.players.values());
    for (const p of players) {
      if (p.scoreBeforeTiebreaker > 0) {
        p.score = p.scoreBeforeTiebreaker + p.tiebreakerScore;
        p.pairsValidated = p.pairsBeforeTiebreaker + p.tiebreakerPairs;
      }
    }

    const ranking = this.calculateRanking();

    if (this.status !== 'tiebreaker' && this.hasTie(ranking)) {
      await this.startTiebreaker();
      return;
    }

    const winner = ranking[0];
    const duration = Date.now() - this.startTime;

    this.io.to(this.matchId).emit('arena:game-end', {
      ranking,
      winner,
      duration,
      matchId: this.matchId
    });

    await this.onMatchEnd(ranking);
  }

  async onMatchEnd(ranking) {
    throw new Error('onMatchEnd must be implemented by subclass (TrainingMode or TournamentMode)');
  }

  cleanup() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    this.players.clear();
    console.log(`[BattleRoyale][${this.matchId}] Cleanup effectué`);
  }
}

module.exports = BattleRoyaleEngine;
