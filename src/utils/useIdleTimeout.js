/**
 * useIdleTimeout — Auto-déconnexion après inactivité.
 * Protège les tablettes partagées en école :
 * - Élèves : 15 min d'inactivité → déconnexion automatique
 * - Sessions temporaires (remember=false) : 30 min
 * - Comptes avec "Se souvenir de moi" : pas de timeout
 *
 * Activité détectée : toucher, clic, clavier, scroll, mouvement souris.
 */
import { useEffect, useRef, useCallback } from 'react';
import supabase from './supabaseClient';

const STUDENT_TIMEOUT_MS = 15 * 60 * 1000;  // 15 minutes
const SESSION_ONLY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE_MS = 60 * 1000; // Avertissement 60s avant déconnexion

export default function useIdleTimeout(auth) {
  const timerRef = useRef(null);
  const warningTimerRef = useRef(null);
  const warningShownRef = useRef(false);

  const getTimeoutMs = useCallback(() => {
    if (!auth) return null;
    // Élèves : toujours un timeout court
    if (auth.role === 'student') return STUDENT_TIMEOUT_MS;
    // Sessions temporaires (remember=false)
    try {
      if (localStorage.getItem('cc_session_only') === '1') return SESSION_ONLY_TIMEOUT_MS;
    } catch {}
    // "Se souvenir de moi" activé → pas de timeout
    return null;
  }, [auth]);

  const performLogout = useCallback(async () => {
    console.log('[IdleTimeout] Déconnexion automatique pour inactivité');
    try { await supabase?.auth?.signOut?.(); } catch {}
    const keysToRemove = [
      'cc_auth', 'cc_student_name', 'cc_student_id', 'cc_user_id',
      'cc_session_cfg', 'cc_subscription_status', 'cc_class_id',
      'cc_auth_logs', 'cc_last_me_fetch_ts', 'cc_arena_cfg',
      'cc_training_cfg', 'cc_crazy_arena_game', 'cc_training_arena_game',
      'cc_player_zone', 'cc_free_quota', 'cc_admin_ui', 'cc_session_only',
    ];
    keysToRemove.forEach(k => { try { localStorage.removeItem(k); } catch {} });
    try {
      const sbPrefix = 'sb-' + (process.env.REACT_APP_SUPABASE_URL || '').replace(/https?:\/\//, '').split('.')[0];
      localStorage.removeItem(sbPrefix + '-auth-token');
    } catch {}
    try { window.dispatchEvent(new Event('cc:authChanged')); } catch {}
    window.location.replace('/login');
  }, []);

  const showWarning = useCallback(() => {
    if (warningShownRef.current) return;
    warningShownRef.current = true;
    // Créer un overlay d'avertissement
    const overlay = document.createElement('div');
    overlay.id = 'cc-idle-warning';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:32px;max-width:400px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="font-size:48px;margin-bottom:12px;">⏰</div>
        <h2 style="margin:0 0 8px;color:#b91c1c;font-size:20px;">Êtes-vous encore là ?</h2>
        <p style="margin:0 0 16px;color:#374151;font-size:14px;">Vous allez être déconnecté dans <strong>60 secondes</strong> pour protéger votre compte.</p>
        <button id="cc-idle-stay" style="padding:12px 32px;border:none;border-radius:10px;background:#1AACBE;color:#fff;font-weight:700;font-size:15px;cursor:pointer;">Je suis là !</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const btn = document.getElementById('cc-idle-stay');
    if (btn) {
      btn.addEventListener('click', () => {
        try { document.body.removeChild(overlay); } catch {}
        warningShownRef.current = false;
      });
    }
  }, []);

  const resetTimers = useCallback(() => {
    const timeoutMs = getTimeoutMs();
    if (!timeoutMs) return;

    // Supprimer l'avertissement s'il est affiché
    if (warningShownRef.current) {
      try {
        const existing = document.getElementById('cc-idle-warning');
        if (existing) document.body.removeChild(existing);
      } catch {}
      warningShownRef.current = false;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    // Timer avertissement (X - 60s)
    warningTimerRef.current = setTimeout(() => {
      showWarning();
    }, timeoutMs - WARNING_BEFORE_MS);

    // Timer déconnexion
    timerRef.current = setTimeout(() => {
      performLogout();
    }, timeoutMs);
  }, [getTimeoutMs, showWarning, performLogout]);

  useEffect(() => {
    const timeoutMs = getTimeoutMs();
    if (!timeoutMs) return; // Pas de timeout pour cet utilisateur

    const EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'touchmove', 'click'];

    // Throttle pour ne pas appeler resetTimers à chaque pixel de mouvement souris
    let lastReset = Date.now();
    const throttledReset = () => {
      const now = Date.now();
      if (now - lastReset > 10000) { // Reset max toutes les 10 secondes
        lastReset = now;
        resetTimers();
      }
    };

    EVENTS.forEach(evt => window.addEventListener(evt, throttledReset, { passive: true }));
    resetTimers(); // Démarrer le premier timer

    return () => {
      EVENTS.forEach(evt => window.removeEventListener(evt, throttledReset));
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      // Nettoyer l'overlay s'il existe
      try {
        const existing = document.getElementById('cc-idle-warning');
        if (existing) document.body.removeChild(existing);
      } catch {}
    };
  }, [getTimeoutMs, resetTimers]);
}
