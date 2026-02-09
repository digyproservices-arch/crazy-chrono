import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import supabase from '../../utils/supabaseClient';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!supabase) {
      setError('Supabase non configuré');
      return;
    }

    const emailTrimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setError('Adresse email invalide');
      return;
    }

    try {
      setLoading(true);
      
      // Envoyer l'email de réinitialisation avec Supabase
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        emailTrimmed,
        {
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );

      if (resetError) throw resetError;

      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Erreur lors de l\'envoi de l\'email de réinitialisation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'linear-gradient(135deg, #0D6A7A 0%, #1AACBE 50%, #148A9C 100%)' }}>
      <div style={{ width: 420, maxWidth: '92vw', background: '#fff', border: 'none', borderRadius: 16, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 24, fontWeight: 700, color: '#4A3728' }}>
          Mot de passe oublié ?
        </h2>
        <p style={{ marginTop: 0, marginBottom: 20, color: '#6b7280', fontSize: 14 }}>
          Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
        </p>

        {success ? (
          <div>
            <div style={{ padding: 16, borderRadius: 8, background: '#d1fae5', border: '1px solid #10b981', marginBottom: 16 }}>
              <div style={{ fontWeight: 600, color: '#065f46', marginBottom: 4 }}>
                ✓ Email envoyé avec succès !
              </div>
              <div style={{ fontSize: 14, color: '#047857' }}>
                Vérifiez votre boîte de réception et cliquez sur le lien pour réinitialiser votre mot de passe.
              </div>
            </div>
            <Link
              to="/login"
              style={{
                display: 'inline-block',
                width: '100%',
                textAlign: 'center',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#374151',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
              Adresse email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                fontSize: 14,
                marginBottom: 16,
              }}
            />

            {error && (
              <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: '#fee2e2', border: '1px solid #ef4444' }}>
                <div style={{ fontSize: 14, color: '#b91c1c' }}>{error}</div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: 'none',
                background: loading ? '#9ca3af' : '#1AACBE',
                color: '#fff',
                fontWeight: 600,
                fontSize: 14,
                cursor: loading ? 'not-allowed' : 'pointer',
                marginBottom: 12,
              }}
            >
              {loading ? 'Envoi en cours...' : 'Envoyer le lien de réinitialisation'}
            </button>

            <div style={{ textAlign: 'center' }}>
              <Link
                to="/login"
                style={{
                  color: '#1AACBE',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                ← Retour à la connexion
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
