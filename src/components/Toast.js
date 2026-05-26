import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

let globalId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const addToast = useCallback((message, type = 'success', duration = 3500) => {
    const id = ++globalId;
    setToasts(prev => [...prev, { id, message, type }]);
    timersRef.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete timersRef.current[id];
    }, duration);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback si pas dans le Provider (safety)
    return {
      success: (msg) => console.log('[Toast]', msg),
      error: (msg) => console.error('[Toast]', msg),
      info: (msg) => console.info('[Toast]', msg),
    };
  }
  return {
    success: (msg) => ctx.addToast(msg, 'success'),
    error: (msg) => ctx.addToast(msg, 'error', 5000),
    info: (msg) => ctx.addToast(msg, 'info'),
  };
}

const ICONS = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
};

const COLORS = {
  success: { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
  error: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
  info: { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' },
};

function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 20,
      right: 20,
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      maxWidth: 380,
      width: '90vw',
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          style={{
            padding: '14px 18px',
            borderRadius: 12,
            background: COLORS[t.type].bg,
            border: `1px solid ${COLORS[t.type].border}`,
            color: COLORS[t.type].text,
            fontSize: 14,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            animation: 'toastSlideIn 0.3s ease-out',
          }}
        >
          <span style={{ fontSize: 18, flexShrink: 0 }}>{ICONS[t.type]}</span>
          <span style={{ flex: 1 }}>{t.message}</span>
          <span style={{ fontSize: 16, opacity: 0.5, flexShrink: 0 }}>×</span>
        </div>
      ))}
    </div>
  );
}
