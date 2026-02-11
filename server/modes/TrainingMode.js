const BattleRoyaleEngine = require('../core/BattleRoyaleEngine');
// Node 18+ has native fetch - no need for node-fetch

class TrainingMode extends BattleRoyaleEngine {
  constructor(io, config) {
    super(io, { ...config, mode: 'training' });
    
    this.classId = config.classId;
    this.teacherId = config.teacherId;
    this.sessionName = config.sessionName || 'Session Entraînement';
    
    console.log(`[TrainingMode][${this.matchId}] Création session entraînement pour classe ${this.classId}`);
  }

  async beforeStart() {
    console.log(`[TrainingMode][${this.matchId}] Vérification licences élèves...`);
    
    const playersWithoutLicense = [];
    
    for (const player of this.players.values()) {
      const hasLicense = await this.checkLicense(player.studentId);
      
      if (!hasLicense) {
        playersWithoutLicense.push(player.name);
        console.error(`[TrainingMode][${this.matchId}] ❌ ${player.name} (${player.studentId}) - Licence inactive`);
      } else {
        console.log(`[TrainingMode][${this.matchId}] ✅ ${player.name} - Licence valide`);
      }
    }
    
    if (playersWithoutLicense.length > 0) {
      throw new Error(`Licences manquantes pour: ${playersWithoutLicense.join(', ')}`);
    }
    
    console.log(`[TrainingMode][${this.matchId}] ✅ Toutes les licences sont valides`);
  }

  async checkLicense(studentId) {
    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
      const res = await fetch(`${backendUrl}/api/students/${studentId}`);
      
      if (!res.ok) {
        console.error(`[TrainingMode] Erreur API students/${studentId}: ${res.status}`);
        return false;
      }
      
      const data = await res.json();
      return data.success && data.student && data.student.licensed === true;
    } catch (error) {
      console.error(`[TrainingMode] Erreur vérification licence ${studentId}:`, error);
      return false;
    }
  }

  async onMatchEnd(ranking) {
    console.log(`[TrainingMode][${this.matchId}] Session entraînement terminée - Sauvegarde stats`);
    
    await this.saveTrainingStats(ranking);
    
    // ✅ CRUCIAL: Marquer le match comme 'finished' dans la DB pour retirer les notifications
    await this.markMatchFinished(ranking);
    
    console.log(`[TrainingMode][${this.matchId}] ✅ Stats entraînement sauvegardées`);
    console.log(`[TrainingMode][${this.matchId}] ℹ️  Pas de progression - Session indépendante`);
  }

  async saveTrainingStats(ranking) {
    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
      
      const res = await fetch(`${backendUrl}/api/training/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: this.matchId,
          classId: this.classId,
          teacherId: this.teacherId,
          sessionName: this.sessionName,
          mode: 'training',
          results: ranking.map(p => ({
            studentId: p.studentId,
            position: p.position,
            score: p.score,
            timeMs: p.timeMs,
            pairsValidated: p.pairsValidated,
            errors: p.errors
          })),
          config: {
            rounds: this.config.roundsPerMatch,
            duration: this.config.durationPerRound,
            level: this.config.level
          },
          completedAt: new Date().toISOString()
        })
      });
      
      if (!res.ok) {
        const text = await res.text();
        console.error(`[TrainingMode] Erreur sauvegarde stats: ${res.status} - ${text}`);
        return false;
      }
      
      const data = await res.json();
      console.log(`[TrainingMode] ✅ Stats sauvegardées:`, data);
      
      return true;
    } catch (error) {
      console.error(`[TrainingMode] Erreur sauvegarde stats:`, error);
      return false;
    }
  }

  async markMatchFinished(ranking) {
    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
      
      console.log(`[TrainingMode][${this.matchId}] Marquage match comme 'finished' dans DB...`);
      
      const res = await fetch(`${backendUrl}/api/tournament/matches/${this.matchId}/finish`, {
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
      
      if (!res.ok) {
        const text = await res.text();
        console.error(`[TrainingMode] Erreur marquage finished: ${res.status} - ${text}`);
        return false;
      }
      
      const data = await res.json();
      console.log(`[TrainingMode] ✅ Match marqué 'finished' dans DB:`, data);
      
      // Broadcast pour retirer les notifications
      this.io.emit('training:match-finished', { matchId: this.matchId });
      console.log(`[TrainingMode] 📢 Broadcast training:match-finished pour ${this.matchId}`);
      
      return true;
    } catch (error) {
      console.error(`[TrainingMode] Erreur markMatchFinished:`, error);
      return false;
    }
  }
}

module.exports = TrainingMode;
