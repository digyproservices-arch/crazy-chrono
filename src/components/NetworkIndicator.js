import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getBackendUrl } from '../utils/apiHelpers';

// ==========================================
// NETWORK INDICATOR — Ping latency monitor
// Colors: 🟢 <100ms  🟡 100-300ms  🔴 >300ms  ⚫ offline
// ==========================================

const PING_INTERVAL = 8000; // 8 seconds
const PING_TIMEOUT = 5000;  // 5 seconds timeout

const STATUS = {
  excellent: { color: '#22c55e', label: 'Excellent', icon: '🟢' },
  good:      { color: '#F5A623', label: 'Correct',   icon: '🟡' },
  poor:      { color: '#ef4444', label: 'Faible',    icon: '🔴' },
  offline:   { color: '#6b7280', label: 'Hors ligne', icon: '⚫' },
};

function getStatus(latency) {
  if (latency === null) return STATUS.offline;
  if (latency < 100) return STATUS.excellent;
  if (latency <= 300) return STATUS.good;
  return STATUS.poor;
}

const NetworkIndicator = () => {
  const [latency, setLatency] = useState(null);
  const [history, setHistory] = useState([]);
  const [showTooltip, setShowTooltip] = useState(false);
  const [stable, setStable] = useState(true);
  const intervalRef = useRef(null);

  const ping = useCallback(async () => {
    const backendUrl = getBackendUrl();
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT);
      await fetch(`${backendUrl}/healthz`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const ms = Math.round(performance.now() - start);
      setLatency(ms);
      setHistory(prev => {
        const next = [...prev, ms].slice(-10);
        // Detect instability: high variance in last 5 pings
        if (next.length >= 3) {
          const recent = next.slice(-5);
          const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
          const variance = recent.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / recent.length;
          setStable(Math.sqrt(variance) < 150);
        }
        return next;
      });
    } catch {
      setLatency(null);
      setStable(false);
      setHistory(prev => [...prev, null].slice(-10));
    }
  }, []);

  useEffect(() => {
    ping(); // Initial ping
    intervalRef.current = setInterval(ping, PING_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [ping]);

  const status = getStatus(latency);
  const avgLatency = history.filter(Boolean).length > 0
    ? Math.round(history.filter(Boolean).reduce((a, b) => a + b, 0) / history.filter(Boolean).length)
    : null;

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Signal bars */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 2,
        cursor: 'pointer', padding: '4px 6px', borderRadius: 8,
        background: 'rgba(255,255,255,0.08)',
        transition: 'background 0.2s',
      }}>
        {[1, 2, 3, 4].map(bar => {
          const barHeight = 4 + bar * 4;
          let barColor = 'rgba(255,255,255,0.2)';
          if (latency !== null) {
            if (latency < 100 && bar <= 4) barColor = STATUS.excellent.color;
            else if (latency < 200 && bar <= 3) barColor = STATUS.good.color;
            else if (latency < 300 && bar <= 2) barColor = STATUS.good.color;
            else if (latency >= 300 && bar <= 1) barColor = STATUS.poor.color;
            else if (bar > (latency < 100 ? 4 : latency < 200 ? 3 : latency < 300 ? 2 : 1)) {
              barColor = 'rgba(255,255,255,0.15)';
            }
          }
          if (latency === null) barColor = bar === 1 ? STATUS.offline.color : 'rgba(255,255,255,0.1)';
          return (
            <div
              key={bar}
              style={{
                width: 4,
                height: barHeight,
                borderRadius: 1.5,
                background: barColor,
                transition: 'background 0.3s, height 0.3s',
              }}
            />
          );
        })}
        {/* Latency number */}
        <span style={{
          fontSize: 10, fontWeight: 600,
          color: status.color,
          marginLeft: 4,
          minWidth: 30,
          textAlign: 'right',
          fontFamily: 'monospace',
        }}>
          {latency !== null ? `${latency}ms` : '---'}
        </span>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          background: '#fff',
          border: '2px solid #1AACBE',
          borderRadius: 12,
          padding: '12px 16px',
          minWidth: 220,
          boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
          zIndex: 1010,
          color: '#334155',
          fontSize: 13,
        }}>
          {/* Status header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: status.color,
              boxShadow: `0 0 6px ${status.color}`,
              animation: latency === null ? 'none' : undefined,
            }} />
            <span style={{ fontWeight: 700, color: status.color }}>{status.label}</span>
            {!stable && latency !== null && (
              <span style={{ fontSize: 11, color: '#F5A623', fontWeight: 600 }}>⚡ Instable</span>
            )}
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Latence actuelle</span>
              <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                {latency !== null ? `${latency} ms` : 'N/A'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Moyenne</span>
              <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                {avgLatency !== null ? `${avgLatency} ms` : 'N/A'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Stabilité</span>
              <span style={{ fontWeight: 600, color: stable ? '#22c55e' : '#F5A623' }}>
                {stable ? '✓ Stable' : '⚡ Variable'}
              </span>
            </div>
          </div>

          {/* Mini bar chart of recent pings */}
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Historique récent</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 30 }}>
              {history.slice(-10).map((ms, i) => {
                const maxH = 28;
                const h = ms === null ? 2 : Math.max(4, Math.min(maxH, (ms / 500) * maxH));
                const c = ms === null ? STATUS.offline.color : getStatus(ms).color;
                return (
                  <div key={i} style={{
                    flex: 1, height: h, borderRadius: 2,
                    background: c, opacity: 0.8,
                    transition: 'height 0.3s, background 0.3s',
                  }} />
                );
              })}
              {/* Fill empty slots */}
              {Array.from({ length: Math.max(0, 10 - history.length) }).map((_, i) => (
                <div key={`empty-${i}`} style={{
                  flex: 1, height: 2, borderRadius: 2,
                  background: 'rgba(0,0,0,0.06)',
                }} />
              ))}
            </div>
          </div>

          {/* Warning message */}
          {(latency === null || latency > 300) && (
            <div style={{
              marginTop: 10, padding: '8px 10px',
              background: latency === null ? '#fef2f2' : '#fffbeb',
              borderRadius: 8, fontSize: 12,
              color: latency === null ? '#dc2626' : '#d97706',
              fontWeight: 500,
            }}>
              {latency === null
                ? '⚠️ Connexion au serveur perdue. Vérifiez votre réseau.'
                : '⚠️ Latence élevée. Le jeu pourrait être affecté.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NetworkIndicator;
