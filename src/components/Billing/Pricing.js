import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// ==========================================
// PAGE TARIFICATION — CRAZY CHRONO
// Charte graphique: Teal #1AACBE | Yellow #F5A623 | Brown #4A3728
// ==========================================

const CC = {
  teal: '#1AACBE',
  tealDark: '#148A9C',
  tealDeep: '#0D6A7A',
  yellow: '#F5A623',
  yellowLt: '#FFC940',
  brown: '#4A3728',
  brownLt: '#6B5443',
  white: '#FFFFFF',
  cream: '#FFF9F0',
};

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://crazy-chrono-backend.onrender.com';

// --- Données tarifaires ---
const PLANS_PARTICULIERS = [
  {
    id: 'solidaire',
    name: 'Solidaire',
    subtitle: 'Accès complet à petit prix',
    price: '5,90',
    period: '/mois',
    badge: null,
    description: 'Pour les familles à revenus modestes. Même accès complet que le plan Standard.',
    priceId: 'price_solidaire_monthly',
    highlight: false,
    icon: '💛',
  },
  {
    id: 'standard',
    name: 'Standard',
    subtitle: 'Le plus populaire',
    price: '9,90',
    period: '/mois',
    badge: 'Populaire',
    description: 'Accès illimité à tous les modes de jeu, thématiques et niveaux.',
    priceId: 'price_standard_monthly',
    highlight: true,
    icon: '⭐',
  },
  {
    id: 'annuel',
    name: 'Annuel',
    subtitle: 'Économisez 2 mois',
    price: '89,90',
    period: '/an',
    badge: '2 mois offerts',
    description: 'Le meilleur rapport qualité-prix. Équivalent à 7,49€/mois.',
    priceId: 'price_annual',
    highlight: false,
    icon: '🏆',
  },
];

const TIERS_INSTITUTIONS = [
  { min: 1, max: 10, price: '9,90', annual: '99,00', example: '1 professeur qui teste' },
  { min: 11, max: 50, price: '6,90', annual: '69,00', example: '2 classes' },
  { min: 51, max: 200, price: '4,90', annual: '49,00', example: '1 école' },
  { min: 201, max: 1000, price: '3,90', annual: '39,00', example: '1 circonscription' },
  { min: 1001, max: 2000, price: '2,90', annual: '29,00', example: 'Grande circonscription' },
  { min: 2001, max: null, price: '1,90', annual: '19,00', example: 'Rectorat / Académie' },
];

const FEATURES_ALL = [
  { icon: '🎮', text: 'Mode Solo — entraînement individuel illimité' },
  { icon: '👥', text: 'Mode Multijoueur — sessions temps réel' },
  { icon: '🏟️', text: 'Mode Entraînement de classe — sessions dirigées par le professeur' },
  { icon: '🌿', text: 'Toutes les thématiques (botanique, maths, français…)' },
  { icon: '📊', text: 'Tous les niveaux (CE1, CE2, CM1, CM2)' },
  { icon: '📈', text: 'Historique de performance et statistiques' },
  { icon: '🔄', text: 'Mises à jour et nouveaux contenus inclus' },
];

const FEATURES_INSTITUTIONS = [
  { icon: '👩‍🏫', text: 'Dashboard professeur — suivi par élève' },
  { icon: '🏫', text: 'Dashboard admin — vue école / circonscription' },
  { icon: '📋', text: 'Import CSV des élèves et codes d\'accès' },
  { icon: '🔑', text: 'Gestion des licences en masse' },
  { icon: '📧', text: 'Support prioritaire par email' },
];

const FAQ_ITEMS = [
  {
    q: 'Puis-je tester gratuitement avant de m\'abonner ?',
    a: 'Oui ! Sans compte, vous bénéficiez de 3 sessions gratuites par jour en mode Solo. Pour les institutions, nous offrons un mois de pilote gratuit pour 2-3 classes sur demande.',
  },
  {
    q: 'Quelle est la durée d\'engagement ?',
    a: 'Particuliers : aucun engagement, résiliable à tout moment. Institutions : engagement annuel (10 mois scolaires, septembre → juin), renouvelable tacitement.',
  },
  {
    q: 'Comment fonctionne la facturation pour les institutions ?',
    a: 'Facturation en début d\'année scolaire (1 facture annuelle) ou trimestrielle. Nous acceptons les bons de commande pour toutes les institutions publiques. Paiement par virement bancaire sous 30 jours.',
  },
  {
    q: 'Le palier de prix s\'applique par école ou au total ?',
    a: 'Le palier s\'applique au nombre TOTAL d\'élèves dans le contrat, pas par école. Plus le volume est important, plus le prix unitaire baisse.',
  },
  {
    q: 'Y a-t-il des offres spéciales ?',
    a: 'Oui ! Pilote gratuit 1 mois pour les écoles, -10% sur engagement 2 ans, -5% pour commande avant le 15 septembre (pack rentrée), et 1 mois offert pour le parrainage entre écoles.',
  },
  {
    q: 'Qu\'est-ce que le tarif Solidaire ?',
    a: 'Le tarif Solidaire (5,90€/mois) est destiné aux familles à revenus modestes. Il donne exactement le même accès que le tarif Standard. Aucun justificatif n\'est demandé, nous faisons confiance.',
  },
];

export default function Pricing() {
  const navigate = useNavigate();
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [error, setError] = useState('');
  const [openFaq, setOpenFaq] = useState(null);
  const [showInstitutionForm, setShowInstitutionForm] = useState(false);

  const handleSubscribe = useCallback(async (plan) => {
    try {
      setLoadingPlan(plan.id);
      setError('');
      let userId = null;
      try { userId = JSON.parse(localStorage.getItem('cc_auth') || 'null')?.id || null; } catch {}

      const resp = await fetch(`${BACKEND_URL}/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price_id: plan.priceId,
          user_id: userId || undefined,
          success_url: window.location.origin + '/account?checkout=success',
          cancel_url: window.location.origin + '/pricing?checkout=cancel',
        }),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.url) throw new Error(json?.error || 'checkout_failed');
      window.location.assign(json.url);
    } catch (e) {
      const msg = e.message || String(e);
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed')) {
        setError('Le système de paiement n\'est pas encore configuré. Contactez-nous pour souscrire.');
      } else {
        setError(msg);
      }
    } finally {
      setLoadingPlan(null);
    }
  }, []);

  // --- Styles ---
  const pageStyle = {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${CC.cream} 0%, #f0fdff 40%, #ffffff 100%)`,
    fontFamily: "'Nunito', 'Segoe UI', system-ui, sans-serif",
    paddingBottom: 60,
  };

  const sectionStyle = {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '0 20px',
  };

  return (
    <div style={pageStyle}>
      {/* ===== HERO ===== */}
      <div style={{
        textAlign: 'center',
        padding: '48px 20px 32px',
        background: `linear-gradient(135deg, ${CC.tealDeep} 0%, ${CC.teal} 60%, ${CC.tealDark} 100%)`,
        color: CC.white,
        marginBottom: 40,
      }}>
        <h1 style={{ fontSize: 36, fontWeight: 900, margin: 0, letterSpacing: -0.5 }}>
          Nos Tarifs
        </h1>
        <p style={{ fontSize: 18, opacity: 0.9, marginTop: 8, maxWidth: 600, margin: '8px auto 0' }}>
          Apprendre en s'amusant, accessible à tous — familles et institutions
        </p>
        <div style={{
          display: 'inline-flex', gap: 8, marginTop: 20,
          background: 'rgba(255,255,255,0.15)', borderRadius: 30, padding: '6px 8px',
        }}>
          <TabButton label="Particuliers" active href="#particuliers" />
          <TabButton label="Institutions" href="#institutions" />
        </div>
      </div>

      {/* ===== SECTION 1: PARTICULIERS ===== */}
      <section id="particuliers" style={sectionStyle}>
        <SectionTitle icon="👨‍👩‍👧‍👦" title="Particuliers" subtitle="Choisissez la formule adaptée à votre famille" />

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
          marginTop: 24,
        }}>
          {PLANS_PARTICULIERS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              loading={loadingPlan === plan.id}
              onSubscribe={() => handleSubscribe(plan)}
            />
          ))}
        </div>

        {error && (
          <div style={{
            marginTop: 16, padding: '12px 16px', borderRadius: 10,
            background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
            textAlign: 'center', fontSize: 14,
          }}>
            {error}
          </div>
        )}

        <div style={{
          textAlign: 'center', marginTop: 16, fontSize: 13, color: '#94a3b8',
        }}>
          🆓 Sans compte : 3 sessions gratuites/jour en mode Solo
        </div>
      </section>

      {/* ===== SECTION 2: INSTITUTIONS ===== */}
      <section id="institutions" style={{ ...sectionStyle, marginTop: 56 }}>
        <SectionTitle
          icon="🏫"
          title="Institutions"
          subtitle="Tarif dégressif par élève — 10 mois scolaires (sept → juin)"
        />

        <div style={{
          marginTop: 24, borderRadius: 16, overflow: 'hidden',
          border: '2px solid #e2e8f0', background: CC.white,
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr 1fr 1.5fr',
            background: `linear-gradient(135deg, ${CC.tealDeep}, ${CC.tealDark})`,
            color: CC.white, fontWeight: 700, fontSize: 13, textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>
            <div style={{ padding: '14px 16px' }}>Nombre d'élèves</div>
            <div style={{ padding: '14px 16px', textAlign: 'center' }}>Par élève/mois</div>
            <div style={{ padding: '14px 16px', textAlign: 'center' }}>Par élève/an</div>
            <div style={{ padding: '14px 16px' }}>Exemple</div>
          </div>

          {/* Table rows */}
          {TIERS_INSTITUTIONS.map((tier, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr 1fr 1.5fr',
                borderTop: '1px solid #f1f5f9',
                background: i % 2 === 0 ? '#fafcff' : CC.white,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f0fdff'}
              onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? '#fafcff' : CC.white}
            >
              <div style={{ padding: '14px 16px', fontWeight: 700, color: CC.brown }}>
                {tier.max ? `${tier.min} — ${tier.max}` : `${tier.min}+`} élèves
              </div>
              <div style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, fontSize: 18, color: CC.tealDeep }}>
                {tier.price}€
              </div>
              <div style={{ padding: '14px 16px', textAlign: 'center', color: '#64748b' }}>
                {tier.annual}€
              </div>
              <div style={{ padding: '14px 16px', color: '#64748b', fontSize: 13 }}>
                {tier.example}
              </div>
            </div>
          ))}
        </div>

        {/* CTA Institution */}
        <div style={{
          marginTop: 24, textAlign: 'center',
          background: `linear-gradient(135deg, ${CC.cream}, #fff7ed)`,
          borderRadius: 16, padding: '28px 24px',
          border: '2px solid #fde68a',
        }}>
          {!showInstitutionForm ? (
            <>
              <p style={{ fontSize: 16, color: CC.brown, fontWeight: 600, margin: 0 }}>
                Vous êtes une école, une circonscription ou un rectorat ?
              </p>
              <p style={{ fontSize: 14, color: '#6B5443', marginTop: 4 }}>
                Pilote gratuit 1 mois • Bon de commande accepté • Facturation annuelle ou trimestrielle
              </p>
              <button
                onClick={() => setShowInstitutionForm(true)}
                style={{
                  marginTop: 16, padding: '14px 32px', borderRadius: 12, border: 'none',
                  background: `linear-gradient(135deg, ${CC.yellow}, ${CC.yellowLt})`,
                  color: CC.brown, fontWeight: 800, fontSize: 16, cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(245,166,35,0.35)',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={(e) => { e.target.style.transform = 'translateY(-2px)'; e.target.style.boxShadow = '0 6px 20px rgba(245,166,35,0.45)'; }}
                onMouseLeave={(e) => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = '0 4px 14px rgba(245,166,35,0.35)'; }}
              >
                📩 Demander un devis
              </button>
            </>
          ) : (
            <InstitutionContactForm onClose={() => setShowInstitutionForm(false)} />
          )}
        </div>
      </section>

      {/* ===== SECTION 3: FONCTIONNALITÉS INCLUSES ===== */}
      <section style={{ ...sectionStyle, marginTop: 56 }}>
        <SectionTitle icon="✅" title="Ce qui est inclus" subtitle="Tous les plans donnent accès à l'ensemble des fonctionnalités" />

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 20, marginTop: 24,
        }}>
          {/* Tous les plans */}
          <div style={{
            background: CC.white, borderRadius: 16, padding: 24,
            border: '2px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
          }}>
            <h3 style={{ margin: '0 0 16px', color: CC.tealDeep, fontSize: 18 }}>
              🎯 Tous les plans
            </h3>
            {FEATURES_ALL.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none' }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{f.icon}</span>
                <span style={{ color: '#374151', fontSize: 14, lineHeight: 1.5 }}>{f.text}</span>
              </div>
            ))}
          </div>

          {/* Institutions uniquement */}
          <div style={{
            background: `linear-gradient(135deg, #f0fdff, ${CC.cream})`, borderRadius: 16, padding: 24,
            border: `2px solid ${CC.teal}33`, boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
          }}>
            <h3 style={{ margin: '0 0 16px', color: CC.tealDeep, fontSize: 18 }}>
              🏫 Institutions uniquement
            </h3>
            {FEATURES_INSTITUTIONS.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i > 0 ? '1px solid #e0f2fe' : 'none' }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{f.icon}</span>
                <span style={{ color: '#374151', fontSize: 14, lineHeight: 1.5 }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SECTION 4: FAQ ===== */}
      <section style={{ ...sectionStyle, marginTop: 56 }}>
        <SectionTitle icon="❓" title="Questions fréquentes" subtitle="" />

        <div style={{ marginTop: 20, maxWidth: 800, margin: '20px auto 0' }}>
          {FAQ_ITEMS.map((item, i) => (
            <FaqItem
              key={i}
              question={item.q}
              answer={item.a}
              open={openFaq === i}
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
            />
          ))}
        </div>
      </section>

      {/* ===== FOOTER CTA ===== */}
      <div style={{
        textAlign: 'center', marginTop: 56, padding: '40px 20px',
        background: `linear-gradient(135deg, ${CC.tealDeep}, ${CC.teal})`,
        color: CC.white,
      }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>
          Prêt à apprendre en s'amusant ?
        </h2>
        <p style={{ marginTop: 8, opacity: 0.9, fontSize: 16 }}>
          3 sessions gratuites/jour — Aucun engagement pour commencer
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '14px 32px', borderRadius: 12, border: 'none',
              background: CC.white, color: CC.tealDeep, fontWeight: 800, fontSize: 16,
              cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
            }}
          >
            Créer un compte gratuit
          </button>
          <button
            onClick={() => window.location.href = 'mailto:contact@crazy-chrono.com?subject=Demande de devis institution'}
            style={{
              padding: '14px 32px', borderRadius: 12,
              border: `2px solid ${CC.white}`,
              background: 'transparent', color: CC.white, fontWeight: 700, fontSize: 16,
              cursor: 'pointer',
            }}
          >
            Contacter l'équipe
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== SUB-COMPONENTS =====

function TabButton({ label, active, href }) {
  return (
    <a
      href={href}
      style={{
        padding: '8px 20px', borderRadius: 24, fontSize: 14, fontWeight: 700,
        textDecoration: 'none',
        background: active ? CC.white : 'transparent',
        color: active ? CC.tealDeep : 'rgba(255,255,255,0.85)',
        transition: 'all 0.2s',
      }}
    >
      {label}
    </a>
  );
}

function SectionTitle({ icon, title, subtitle }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <h2 style={{
        fontSize: 28, fontWeight: 800, color: '#1e293b', margin: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 32 }}>{icon}</span> {title}
      </h2>
      {subtitle && (
        <p style={{ color: '#64748b', fontSize: 15, marginTop: 6 }}>{subtitle}</p>
      )}
    </div>
  );
}

function PlanCard({ plan, loading, onSubscribe }) {
  const [hovered, setHovered] = useState(false);

  const cardStyle = {
    position: 'relative',
    background: plan.highlight
      ? `linear-gradient(160deg, #f0fdff, ${CC.white})`
      : CC.white,
    borderRadius: 20,
    padding: '28px 24px',
    border: plan.highlight ? `3px solid ${CC.teal}` : '2px solid #e2e8f0',
    boxShadow: hovered
      ? '0 12px 40px rgba(26,172,190,0.18)'
      : plan.highlight
        ? '0 8px 30px rgba(26,172,190,0.12)'
        : '0 2px 10px rgba(0,0,0,0.04)',
    transition: 'all 0.25s ease',
    transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <div
      style={cardStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {plan.badge && (
        <div style={{
          position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
          background: plan.highlight
            ? `linear-gradient(135deg, ${CC.teal}, ${CC.tealDark})`
            : `linear-gradient(135deg, ${CC.yellow}, ${CC.yellowLt})`,
          color: plan.highlight ? CC.white : CC.brown,
          padding: '5px 16px', borderRadius: 20, fontSize: 12, fontWeight: 800,
          textTransform: 'uppercase', letterSpacing: 0.5,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
          {plan.badge}
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: plan.badge ? 8 : 0 }}>
        <div style={{ fontSize: 36, marginBottom: 4 }}>{plan.icon}</div>
        <h3 style={{ fontSize: 22, fontWeight: 800, color: CC.brown, margin: 0 }}>
          {plan.name}
        </h3>
        <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0' }}>{plan.subtitle}</p>
      </div>

      <div style={{ textAlign: 'center', margin: '20px 0' }}>
        <span style={{ fontSize: 42, fontWeight: 900, color: CC.tealDeep }}>{plan.price}€</span>
        <span style={{ fontSize: 16, color: '#64748b', fontWeight: 600 }}>{plan.period}</span>
        {plan.id === 'annuel' && (
          <div style={{ fontSize: 13, color: CC.teal, fontWeight: 700, marginTop: 2 }}>
            soit 7,49€/mois
          </div>
        )}
      </div>

      <p style={{ fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 1.5, flex: 1 }}>
        {plan.description}
      </p>

      <button
        onClick={onSubscribe}
        disabled={loading}
        style={{
          marginTop: 16, width: '100%', padding: '14px 16px', borderRadius: 12,
          border: 'none', fontWeight: 800, fontSize: 15, cursor: loading ? 'wait' : 'pointer',
          background: plan.highlight
            ? `linear-gradient(135deg, ${CC.teal}, ${CC.tealDark})`
            : `linear-gradient(135deg, #f1f5f9, #e2e8f0)`,
          color: plan.highlight ? CC.white : CC.brown,
          boxShadow: plan.highlight ? '0 4px 16px rgba(26,172,190,0.3)' : '0 2px 6px rgba(0,0,0,0.06)',
          transition: 'all 0.2s',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Redirection…' : 'S\'abonner'}
      </button>
    </div>
  );
}

function FaqItem({ question, answer, open, onClick }) {
  return (
    <div style={{
      borderBottom: '1px solid #e2e8f0',
      overflow: 'hidden',
    }}>
      <button
        onClick={onClick}
        style={{
          width: '100%', padding: '16px 0', border: 'none', background: 'none',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', paddingRight: 16 }}>
          {question}
        </span>
        <span style={{
          fontSize: 20, color: CC.teal, flexShrink: 0, fontWeight: 700,
          transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
        }}>
          +
        </span>
      </button>
      <div style={{
        maxHeight: open ? 200 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.3s ease',
        paddingBottom: open ? 16 : 0,
      }}>
        <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
          {answer}
        </p>
      </div>
    </div>
  );
}

function InstitutionContactForm({ onClose }) {
  const [form, setForm] = useState({ name: '', email: '', school: '', students: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      // Envoyer par email (mailto fallback en attendant un endpoint backend)
      const subject = encodeURIComponent(`Demande de devis — ${form.school || 'Institution'}`);
      const body = encodeURIComponent(
        `Nom: ${form.name}\nEmail: ${form.email}\nÉtablissement: ${form.school}\nNombre d'élèves: ${form.students}\n\nMessage:\n${form.message}`
      );
      window.location.href = `mailto:contact@crazy-chrono.com?subject=${subject}&body=${body}`;
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div style={{ textAlign: 'center', padding: 16 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
        <p style={{ fontWeight: 700, color: CC.tealDeep, fontSize: 16 }}>
          Votre client email va s'ouvrir avec le devis pré-rempli.
        </p>
        <button onClick={onClose} style={{
          marginTop: 12, padding: '10px 24px', borderRadius: 8, border: 'none',
          background: CC.tealDeep, color: CC.white, fontWeight: 700, cursor: 'pointer',
        }}>
          Fermer
        </button>
      </div>
    );
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid #d1d5db', fontSize: 14,
    fontFamily: "'Nunito', sans-serif",
    boxSizing: 'border-box',
  };

  return (
    <form onSubmit={handleSubmit} style={{ textAlign: 'left', maxWidth: 500, margin: '0 auto' }}>
      <h3 style={{ margin: '0 0 16px', textAlign: 'center', color: CC.brown }}>📩 Demande de devis</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Nom *</label>
          <input required style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Mme Martin" />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Email *</label>
          <input required type="email" style={inputStyle} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@ecole.fr" />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Établissement</label>
          <input style={inputStyle} value={form.school} onChange={e => setForm(f => ({ ...f, school: e.target.value }))} placeholder="École Lamentin" />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Nombre d'élèves</label>
          <input type="number" style={inputStyle} value={form.students} onChange={e => setForm(f => ({ ...f, students: e.target.value }))} placeholder="200" />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Message</label>
        <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Précisions sur votre projet..." />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'center' }}>
        <button type="submit" disabled={sending} style={{
          padding: '12px 28px', borderRadius: 10, border: 'none',
          background: `linear-gradient(135deg, ${CC.yellow}, ${CC.yellowLt})`,
          color: CC.brown, fontWeight: 800, fontSize: 15, cursor: 'pointer',
        }}>
          {sending ? 'Envoi…' : 'Envoyer la demande'}
        </button>
        <button type="button" onClick={onClose} style={{
          padding: '12px 20px', borderRadius: 10, border: '1px solid #d1d5db',
          background: CC.white, color: '#64748b', fontWeight: 600, cursor: 'pointer',
        }}>
          Annuler
        </button>
      </div>
    </form>
  );
}
