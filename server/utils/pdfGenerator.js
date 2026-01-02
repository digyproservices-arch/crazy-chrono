const PDFDocument = require('pdfkit');

/**
 * Générer un PDF de classement tournoi
 * @param {Object} tournament - Données du tournoi
 * @param {Array} phases - Phases du tournoi avec résultats
 * @returns {PDFDocument} - Stream PDF
 */
function generateTournamentRankingPDF(tournament, phases) {
  const doc = new PDFDocument({ 
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 }
  });

  // En-tête
  doc.fontSize(24)
     .font('Helvetica-Bold')
     .text('🏆 CRAZY CHRONO TOURNOI', { align: 'center' })
     .moveDown(0.5);

  doc.fontSize(18)
     .font('Helvetica')
     .text(tournament.name || 'Tournoi Académique', { align: 'center' })
     .moveDown(0.3);

  doc.fontSize(12)
     .fillColor('#666666')
     .text(`Classement Officiel - ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' })
     .moveDown(2);

  // Ligne de séparation
  doc.strokeColor('#3b82f6')
     .lineWidth(2)
     .moveTo(50, doc.y)
     .lineTo(545, doc.y)
     .stroke()
     .moveDown(1);

  // Parcourir chaque phase
  phases.forEach((phase, phaseIndex) => {
    // Titre de la phase
    doc.fillColor('#1a1a1a')
       .fontSize(16)
       .font('Helvetica-Bold')
       .text(getPhaseName(phase.level), { underline: true })
       .moveDown(0.5);

    doc.fontSize(11)
       .fillColor('#666666')
       .font('Helvetica')
       .text(`Status: ${getPhaseStatusLabel(phase.status)}`)
       .moveDown(0.5);

    // Récupérer résultats des groupes de cette phase
    if (phase.groups && phase.groups.length > 0) {
      phase.groups.forEach((group, groupIndex) => {
        doc.fontSize(12)
           .fillColor('#374151')
           .font('Helvetica-Bold')
           .text(`Groupe ${groupIndex + 1}`, { indent: 20 })
           .moveDown(0.3);

        // Résultats du groupe
        if (group.results && group.results.length > 0) {
          group.results.forEach((result, resultIndex) => {
            const position = resultIndex + 1;
            const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : '  ';
            
            doc.fontSize(10)
               .fillColor(position === 1 ? '#10b981' : '#4b5563')
               .font('Helvetica')
               .text(
                 `${medal} ${position}. ${result.student_name || 'Inconnu'} - ${result.score} pts (${result.pairs_validated} paires, ${(result.time_ms / 1000).toFixed(1)}s)`,
                 { indent: 40 }
               );
          });
        } else if (group.winner_name) {
          doc.fontSize(10)
             .fillColor('#10b981')
             .text(`🏆 Gagnant: ${group.winner_name}`, { indent: 40 });
        } else {
          doc.fontSize(10)
             .fillColor('#9ca3af')
             .text('Résultats non disponibles', { indent: 40 });
        }

        doc.moveDown(0.5);
      });
    } else {
      doc.fontSize(10)
         .fillColor('#9ca3af')
         .text('Aucun groupe pour cette phase', { indent: 20 })
         .moveDown(0.5);
    }

    doc.moveDown(1);

    // Nouvelle page si besoin (sauf dernière phase)
    if (phaseIndex < phases.length - 1 && doc.y > 650) {
      doc.addPage();
    }
  });

  // Podium final (champion académique)
  const finalPhase = phases.find(p => p.level === 4);
  if (finalPhase && finalPhase.groups && finalPhase.groups.length > 0) {
    const finalGroup = finalPhase.groups[0];
    if (finalGroup.results && finalGroup.results.length > 0) {
      doc.addPage();
      
      doc.fontSize(20)
         .font('Helvetica-Bold')
         .fillColor('#1a1a1a')
         .text('🏆 CHAMPION ACADÉMIQUE', { align: 'center' })
         .moveDown(1);

      const champion = finalGroup.results[0];
      doc.fontSize(16)
         .fillColor('#10b981')
         .text(`${champion.student_name || 'Inconnu'}`, { align: 'center' })
         .moveDown(0.5);

      doc.fontSize(12)
         .fillColor('#666666')
         .text(`Score: ${champion.score} pts | Paires: ${champion.pairs_validated} | Temps: ${(champion.time_ms / 1000).toFixed(1)}s`, { align: 'center' });
    }
  }

  // Pied de page
  doc.fontSize(8)
     .fillColor('#9ca3af')
     .text(
       `Généré par Crazy Chrono - ${new Date().toLocaleString('fr-FR')}`,
       50,
       doc.page.height - 50,
       { align: 'center', width: doc.page.width - 100 }
     );

  return doc;
}

/**
 * Obtenir le nom d'une phase
 */
function getPhaseName(level) {
  const names = {
    1: 'Phase 1 - CRAZY WINNER CLASSE',
    2: 'Phase 2 - CRAZY WINNER ÉCOLE',
    3: 'Phase 3 - CRAZY WINNER CIRCONSCRIPTION',
    4: 'Phase 4 - CRAZY WINNER ACADÉMIQUE'
  };
  return names[level] || `Phase ${level}`;
}

/**
 * Obtenir le label status phase
 */
function getPhaseStatusLabel(status) {
  const labels = {
    pending: 'En attente',
    active: 'En cours',
    finished: 'Terminée'
  };
  return labels[status] || status;
}

module.exports = {
  generateTournamentRankingPDF
};
