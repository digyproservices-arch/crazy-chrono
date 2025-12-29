/**
 * Module de notifications email pour Crazy Arena
 * Pour l'instant: logs console (configurable plus tard avec SMTP)
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://app.crazy-chrono.com';
const EMAIL_ENABLED = process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true';

/**
 * Envoyer une invitation par email pour rejoindre un match Arena
 */
async function sendMatchInvitation(studentEmail, studentName, roomCode, matchId) {
  const lobbyUrl = `${FRONTEND_URL}/crazy-arena/lobby/${roomCode}`;
  
  const emailContent = {
    to: studentEmail,
    subject: '🎮 Invitation Match Crazy Arena',
    html: `
      <h2>Bonjour ${studentName},</h2>
      <p>Votre professeur vous invite à rejoindre un match Crazy Arena !</p>
      <p><strong>Code de salle :</strong> ${roomCode}</p>
      <p>
        <a href="${lobbyUrl}" style="
          display: inline-block;
          padding: 12px 24px;
          background: #3b82f6;
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-weight: bold;
        ">🚀 Rejoindre le match</a>
      </p>
      <p style="color: #6b7280; font-size: 14px;">
        Ou copiez ce lien dans votre navigateur :<br>
        ${lobbyUrl}
      </p>
    `
  };
  
  if (EMAIL_ENABLED) {
    // TODO: Implémenter envoi réel via SMTP/SendGrid/Resend quand configuré
    console.log('[Email] 📧 Email invitation envoyé:', emailContent);
  } else {
    console.log('[Email] 📧 Notification (mode log):', {
      to: studentEmail,
      name: studentName,
      roomCode,
      url: lobbyUrl
    });
  }
  
  return { success: true, email: studentEmail };
}

/**
 * Envoyer des invitations à plusieurs élèves d'un groupe
 */
async function sendGroupInvitations(students, roomCode, matchId) {
  const results = [];
  
  for (const student of students) {
    try {
      const result = await sendMatchInvitation(
        student.email,
        student.full_name || student.first_name,
        roomCode,
        matchId
      );
      results.push(result);
    } catch (error) {
      console.error(`[Email] Erreur envoi email à ${student.email}:`, error);
      results.push({ success: false, email: student.email, error: error.message });
    }
  }
  
  return results;
}

module.exports = {
  sendMatchInvitation,
  sendGroupInvitations
};
