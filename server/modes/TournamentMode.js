const BattleRoyaleEngine = require('../core/BattleRoyaleEngine');
// Node 18+ has native fetch - no need for node-fetch

class TournamentMode extends BattleRoyaleEngine {
  constructor(io, config) {
    super(io, { ...config, mode: 'tournament' });
    
    this.tournamentId = config.tournamentId;
    this.phaseLevel = config.phaseLevel; // 1=Classe, 2=École, 3=Circonscription, 4=Académique
    this.groupId = config.groupId;
    
    console.log(`[TournamentMode][${this.matchId}] Création match tournoi Phase ${this.phaseLevel}`);
    console.log(`[TournamentMode][${this.matchId}] Tournoi: ${this.tournamentId}, Groupe: ${this.groupId}`);
  }

  async beforeStart() {
    console.log(`[TournamentMode][${this.matchId}] Vérification licences élèves (tournoi officiel)...`);
    
    const playersWithoutLicense = [];
    
    for (const player of this.players.values()) {
      const hasLicense = await this.checkLicense(player.studentId);
      
      if (!hasLicense) {
        playersWithoutLicense.push(player.name);
        console.error(`[TournamentMode][${this.matchId}] ❌ ${player.name} (${player.studentId}) - Licence inactive`);
      } else {
        console.log(`[TournamentMode][${this.matchId}] ✅ ${player.name} - Licence valide`);
      }
    }
    
    if (playersWithoutLicense.length > 0) {
      throw new Error(`Licences manquantes pour tournoi: ${playersWithoutLicense.join(', ')}`);
    }
    
    console.log(`[TournamentMode][${this.matchId}] ✅ Toutes les licences validées pour le tournoi`);
  }

  async checkLicense(studentId) {
    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
      const res = await fetch(`${backendUrl}/api/students/${studentId}`);
      
      if (!res.ok) {
        console.error(`[TournamentMode] Erreur API students/${studentId}: ${res.status}`);
        return false;
      }
      
      const data = await res.json();
      return data.success && data.student && data.student.licensed === true;
    } catch (error) {
      console.error(`[TournamentMode] Erreur vérification licence ${studentId}:`, error);
      return false;
    }
  }

  async onMatchEnd(ranking) {
    const winner = ranking[0];
    console.log(`[TournamentMode][${this.matchId}] 🏆 Gagnant: ${winner.name} (${winner.score} pts)`);
    
    await this.saveTournamentResults(ranking);
    
    await this.markGroupWinner(winner);
    
    await this.notifyQualification(winner);
    
    console.log(`[TournamentMode][${this.matchId}] ✅ ${winner.name} qualifié pour Phase ${this.phaseLevel + 1}`);
    console.log(`[TournamentMode][${this.matchId}] ℹ️  Progression vers Phase ${this.phaseLevel + 1} EN ATTENTE activation Rectorat`);
  }

  async saveTournamentResults(ranking) {
    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
      
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
        console.error(`[TournamentMode] Erreur sauvegarde résultats: ${res.status} - ${text}`);
        return false;
      }
      
      const data = await res.json();
      console.log(`[TournamentMode] ✅ Résultats sauvegardés:`, data);
      
      this.io.to(this.matchId).emit('arena:match-finished', {
        matchId: this.matchId,
        winner: data.winner
      });
      
      this.io.emit('arena:match-finished', { matchId: this.matchId });
      
      return true;
    } catch (error) {
      console.error(`[TournamentMode] Erreur sauvegarde résultats:`, error);
      return false;
    }
  }

  async markGroupWinner(winner) {
    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
      
      const res = await fetch(`${backendUrl}/api/tournament/groups/${this.groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winnerId: winner.studentId,
          status: 'finished'
        })
      });
      
      if (!res.ok) {
        console.error(`[TournamentMode] Erreur mise à jour gagnant groupe: ${res.status}`);
        return false;
      }
      
      console.log(`[TournamentMode] ✅ Gagnant ${winner.name} enregistré pour groupe ${this.groupId}`);
      return true;
    } catch (error) {
      console.error(`[TournamentMode] Erreur markGroupWinner:`, error);
      return false;
    }
  }

  async notifyQualification(winner) {
    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
      
      const phaseName = this.getPhaseName(this.phaseLevel + 1);
      
      await fetch(`${backendUrl}/api/notifications/qualification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: winner.studentId,
          tournamentId: this.tournamentId,
          currentPhase: this.phaseLevel,
          nextPhase: this.phaseLevel + 1,
          nextPhaseName: phaseName,
          message: `Félicitations ! Vous êtes qualifié(e) pour la phase ${phaseName}`
        })
      });
      
      console.log(`[TournamentMode] ✅ Notification qualification envoyée à ${winner.name}`);
    } catch (error) {
      console.error(`[TournamentMode] Erreur notification qualification:`, error);
    }
  }

  getPhaseName(phaseLevel) {
    const phases = {
      1: 'CRAZY WINNER CLASSE',
      2: 'CRAZY WINNER ÉCOLE',
      3: 'CRAZY WINNER CIRCONSCRIPTION',
      4: 'CRAZY WINNER ACADÉMIQUE'
    };
    return phases[phaseLevel] || `Phase ${phaseLevel}`;
  }
}

module.exports = TournamentMode;
