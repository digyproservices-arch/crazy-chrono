import React from 'react';
import { useNavigate } from 'react-router-dom';
import './TeacherModeSelector.css';
import InteractiveDemo from '../InteractiveDemo';

const TeacherModeSelector = () => {
  const navigate = useNavigate();

  return (
    <div className="mode-selector-container">
      <div className="mode-selector-header">
        <h1>🎮 Choisissez un mode de jeu</h1>
        <p>Sélectionnez le type de session que vous souhaitez créer</p>
      </div>

      {/* --- Comment jouer ? Démo animée --- */}
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0D6A7A', margin: '0 0 6px' }}>
          🕐 Comment jouer ?
        </h2>
        <p style={{ color: '#6B5443', fontSize: 14, margin: '0 auto 20px', maxWidth: 440 }}>
          Trouvez les paires image↔nom ou calcul↔résultat avant la fin du chrono !
        </p>
        <InteractiveDemo />
      </div>

      <div className="mode-cards">
        <div className="mode-card" style={{ borderColor: '#0D6A7A', background: 'linear-gradient(135deg, #f0fdfa 0%, #ecfeff 100%)' }}>
          <div className="mode-icon">📋</div>
          <h2>MA CLASSE</h2>
          <p className="mode-description">
            Voir mes élèves, codes d'accès et résultats
          </p>
          
          <div className="mode-features">
            <div className="feature">👥 Liste des élèves</div>
            <div className="feature">🔑 Codes d'accès</div>
            <div className="feature">📊 Performances</div>
          </div>

          <button 
            className="mode-button training-button"
            onClick={() => navigate('/teacher/dashboard')}
          >
            VOIR MA CLASSE
          </button>
        </div>

        <div className="mode-card training-mode">
          <div className="mode-icon">📚</div>
          <h2>ENTRAÎNEMENT CLASSE</h2>
          <p className="mode-description">
            Entraîner mes élèves toute l'année
          </p>
          
          <div className="mode-features">
            <div className="feature">✅ Sessions libres</div>
            <div className="feature">✅ Répétable</div>
            <div className="feature">🔑 Licence requise</div>
          </div>

          <button 
            className="mode-button training-button"
            onClick={() => navigate('/training-arena/setup')}
          >
            CRÉER SESSION
          </button>
        </div>

        <div className="mode-card tournament-mode">
          <div className="mode-icon">🏆</div>
          <h2>TOURNOI OFFICIEL</h2>
          <p className="mode-description">
            Tournoi interscolaire Guadeloupe
          </p>
          
          <div className="mode-features">
            <div className="feature">🎯 4 phases</div>
            <div className="feature">🏅 Officiel</div>
            <div className="feature">🔑 Licence requise</div>
          </div>

          <button 
            className="mode-button tournament-button"
            onClick={() => navigate('/teacher/tournament')}
          >
            VOIR TOURNOI
          </button>
        </div>

        <div className="mode-card" style={{ borderColor: '#ff6b35', background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)' }}>
          <div className="mode-icon">📅</div>
          <h2>TOURNOIS GRANDE SALLE</h2>
          <p className="mode-description">
            Créer et programmer des tournois publics
          </p>
          
          <div className="mode-features">
            <div className="feature">🏟️ Salle publique</div>
            <div className="feature">📅 Programmable</div>
            <div className="feature">🎁 Récompenses</div>
          </div>

          <button 
            className="mode-button"
            style={{ background: 'linear-gradient(135deg, #ff6b35, #F5A623)', color: '#fff' }}
            onClick={() => navigate('/admin/tournaments')}
          >
            GÉRER TOURNOIS
          </button>
        </div>
      </div>

      {/* Séparateur */}
      <div style={{ margin: '32px 0 16px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 1, background: '#d1d5db' }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Jouer moi-même</span>
          <div style={{ flex: 1, height: 1, background: '#d1d5db' }} />
        </div>
      </div>

      {/* Modes de jeu personnels */}
      <div className="mode-cards" style={{ marginBottom: 24 }}>
        <div className="mode-card" style={{ background: 'linear-gradient(135deg, #1AACBE 0%, #148A9C 100%)', color: '#fff', borderColor: '#148A9C' }}>
          <div className="mode-icon">🎯</div>
          <h2 style={{ color: '#fff' }}>MODE SOLO</h2>
          <p className="mode-description" style={{ color: 'rgba(255,255,255,0.9)' }}>
            Jouez seul et améliorez vos compétences
          </p>
          <button 
            className="mode-button"
            style={{ background: '#fff', color: '#148A9C', fontWeight: 700 }}
            onClick={() => navigate('/config/solo')}
          >
            JOUER SOLO
          </button>
        </div>

        <div className="mode-card" style={{ background: 'linear-gradient(135deg, #F5A623 0%, #d4900e 100%)', color: '#fff', borderColor: '#d4900e' }}>
          <div className="mode-icon">�</div>
          <h2 style={{ color: '#fff' }}>SALLE PRIVÉE</h2>
          <p className="mode-description" style={{ color: 'rgba(255,255,255,0.9)' }}>
            Défiez vos amis en ligne
          </p>
          <button 
            className="mode-button"
            style={{ background: '#fff', color: '#d4900e', fontWeight: 700 }}
            onClick={() => navigate('/config/online')}
          >
            JOUER EN LIGNE
          </button>
        </div>

        <div className="mode-card" style={{ background: 'linear-gradient(135deg, #ff6b35 0%, #F5A623 100%)', color: '#fff', borderColor: '#ff6b35' }}>
          <div className="mode-icon">🏟️</div>
          <h2 style={{ color: '#fff' }}>GRANDE SALLE</h2>
          <p className="mode-description" style={{ color: 'rgba(255,255,255,0.9)' }}>
            Course éliminatoire ouverte à tous
          </p>
          <button 
            className="mode-button"
            style={{ background: '#fff', color: '#ff6b35', fontWeight: 700 }}
            onClick={() => navigate('/grande-salle')}
          >
            REJOINDRE
          </button>
        </div>

        <div className="mode-card" style={{ background: 'linear-gradient(135deg, #0D6A7A 0%, #148A9C 100%)', color: '#fff', borderColor: '#0D6A7A' }}>
          <div className="mode-icon">📊</div>
          <h2 style={{ color: '#fff' }}>MES PERFORMANCES</h2>
          <p className="mode-description" style={{ color: 'rgba(255,255,255,0.9)' }}>
            Analysez votre progression
          </p>
          <button 
            className="mode-button"
            style={{ background: '#fff', color: '#0D6A7A', fontWeight: 700 }}
            onClick={() => navigate('/my-performance')}
          >
            VOIR STATS
          </button>
        </div>

        <div className="mode-card" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', borderColor: '#059669' }}>
          <div className="mode-icon">📚</div>
          <h2 style={{ color: '#fff' }}>MODE APPRENDRE</h2>
          <p className="mode-description" style={{ color: 'rgba(255,255,255,0.9)' }}>
            Révisez les associations avec stratégies et audio
          </p>
          <button 
            className="mode-button"
            style={{ background: '#fff', color: '#059669', fontWeight: 700 }}
            onClick={() => navigate('/apprendre')}
          >
            APPRENDRE
          </button>
        </div>
      </div>

      <div className="mode-info">
        <p>
          💡 <strong>Mode Entraînement:</strong> Créez des sessions d'entraînement 
          pour améliorer les compétences de vos élèves. Sessions répétables sans limite.
        </p>
        <p>
          🏆 <strong>Mode Tournoi:</strong> Participez au tournoi officiel académique 
          avec progression en 4 phases (Classe → École → Circonscription → Académique).
        </p>
      </div>
    </div>
  );
};

export default TeacherModeSelector;
