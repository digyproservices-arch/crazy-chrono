import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';

const getBackendUrl = () => {
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
};

/**
 * Badge notification in-app pour invitations match Arena
 * Affiche un badge avec le nombre d'invitations en attente
 * Clic → Modal avec liste des invitations + rejoindre en 1 clic
 */
export default function NotificationBadge() {
  const navigate = useNavigate();
  const [invitations, setInvitations] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [studentId, setStudentId] = useState(null);

  // Récupérer studentId au montage
  useEffect(() => {
    // Priorité 1 : Récupérer depuis localStorage (plus fiable)
    const storedStudentId = localStorage.getItem('cc_student_id');
    if (storedStudentId) {
      setStudentId(storedStudentId);
      return;
    }
    
    // Priorité 2 : Essayer via API /me si token disponible
    const auth = JSON.parse(localStorage.getItem('cc_auth') || '{}');
    if (auth.token) {
      fetch(`${getBackendUrl()}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${auth.token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.ok && data.student) {
            setStudentId(data.student.id);
            localStorage.setItem('cc_student_id', data.student.id);
          }
        })
        .catch(err => console.error('[NotificationBadge] Erreur récupération student:', err));
    }
  }, []);

  // Charger les invitations toutes les 30 secondes
  useEffect(() => {
    if (!studentId) return;

    const loadInvitations = async () => {
      try {
        const res = await fetch(`${getBackendUrl()}/api/tournament/students/${studentId}/invitations`);
        const data = await res.json();
        
        if (data.success) {
          setInvitations(data.invitations || []);
        }
      } catch (error) {
        console.error('[NotificationBadge] Erreur chargement invitations:', error);
      }
    };

    loadInvitations();
    const interval = setInterval(loadInvitations, 30000); // Refresh toutes les 30s

    return () => clearInterval(interval);
  }, [studentId]);

  // ✅ FIX: Écouter Socket.IO pour retirer notification immédiatement après match
  useEffect(() => {
    if (!studentId) return;

    const socket = io(getBackendUrl(), {
      transports: ['websocket', 'polling'],
      reconnection: true
    });

    // Écouter fin de match pour retirer l'invitation
    socket.on('arena:match-finished', ({ matchId }) => {
      console.log(`[NotificationBadge] Match ${matchId} terminé - Retrait invitation`);
      setInvitations(prev => prev.filter(inv => inv.matchId !== matchId));
    });

    // Écouter game-end aussi (au cas où)
    socket.on('arena:game-end', ({ matchId }) => {
      if (matchId) {
        console.log(`[NotificationBadge] Game end ${matchId} - Retrait invitation`);
        setInvitations(prev => prev.filter(inv => inv.matchId !== matchId));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [studentId]);

  const handleJoinMatch = (roomCode) => {
    setShowModal(false);
    navigate(`/crazy-arena/lobby/${roomCode}`);
  };

  if (!studentId || invitations.length === 0) {
    return null; // Pas de badge si aucune invitation
  }

  return (
    <>
      {/* Badge notification */}
      <button
        onClick={() => setShowModal(true)}
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: '3px solid #f59e0b',
          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          color: '#fff',
          fontSize: 24,
          fontWeight: 900,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(245,158,11,0.4)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'pulse 2s infinite',
          transition: 'transform 0.2s'
        }}
        onMouseEnter={(e) => e.target.style.transform = 'scale(1.1)'}
        onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
        title={`${invitations.length} invitation(s) en attente`}
      >
        🔔
        {invitations.length > 0 && (
          <span style={{
            position: 'absolute',
            top: -5,
            right: -5,
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: '#ef4444',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #fff'
          }}>
            {invitations.length}
          </span>
        )}
      </button>

      {/* Modal invitations */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20
        }}
        onClick={() => setShowModal(false)}
        >
          <div style={{
            background: '#fff',
            borderRadius: 16,
            padding: 24,
            maxWidth: 500,
            width: '100%',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>
                🔔 Invitations Match Arena
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 28,
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: 0,
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>

            {invitations.length === 0 ? (
              <p style={{ color: '#6b7280', textAlign: 'center' }}>
                Aucune invitation en attente
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {invitations.map(inv => (
                  <div
                    key={inv.matchId}
                    style={{
                      padding: 16,
                      border: '2px solid #e5e7eb',
                      borderRadius: 12,
                      background: '#f9fafb',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                        {inv.groupName}
                      </div>
                      <div style={{ fontSize: 14, color: '#6b7280' }}>
                        Code: <strong>{inv.roomCode}</strong>
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                        {inv.status === 'playing' ? '🎮 En cours' : '⏳ En attente'}
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleJoinMatch(inv.roomCode)}
                      style={{
                        padding: '12px 20px',
                        borderRadius: 8,
                        border: 'none',
                        background: '#10b981',
                        color: '#fff',
                        fontSize: 16,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = '#059669';
                        e.target.style.transform = 'scale(1.02)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = '#10b981';
                        e.target.style.transform = 'scale(1)';
                      }}
                    >
                      🚀 Rejoindre le match
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 4px 12px rgba(245,158,11,0.4); }
          50% { box-shadow: 0 4px 20px rgba(245,158,11,0.8); }
        }
      `}</style>
    </>
  );
}
