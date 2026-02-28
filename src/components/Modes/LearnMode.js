import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../styles/LearnMode.css';

const STORAGE_KEY = 'cc_learn_strategies_edits';
const PUBLIC_URL = process.env.PUBLIC_URL || '';

function loadUserEdits() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveUserEdits(edits) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(edits)); } catch {}
}

const FILTER_LABELS = {
  'domain:zoology': '🐾 Zoologie',
  'domain:math': '🔢 Multiplications',
};

export default function LearnMode() {
  const navigate = useNavigate();
  const [assocData, setAssocData] = useState(null);
  const [strategies, setStrategies] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [editingSlide, setEditingSlide] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [userEdits, setUserEdits] = useState(loadUserEdits);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const slideRef = useRef(null);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [assocRes, stratRes] = await Promise.all([
          fetch(`${PUBLIC_URL}/data/associations.json`),
          fetch(`${PUBLIC_URL}/data/learn-strategies.json`)
        ]);
        const assoc = await assocRes.json();
        const strat = await stratRes.json();
        setAssocData(assoc);
        setStrategies(strat.strategies || {});
      } catch (err) {
        console.error('[LearnMode] Failed to load data:', err);
      }
    };
    loadData();
  }, []);

  // Build slides from associations that have strategies
  const slides = useMemo(() => {
    if (!assocData || !strategies) return [];
    const { textes = [], images = [], calculs = [], chiffres = [], associations = [] } = assocData;
    const textMap = Object.fromEntries(textes.map(t => [t.id, t]));
    const imgMap = Object.fromEntries(images.map(i => [i.id, i]));
    const calcMap = Object.fromEntries(calculs.map(c => [c.id, c]));
    const numMap = Object.fromEntries(chiffres.map(n => [n.id, n]));

    const merged = { ...strategies, ...userEdits };
    const result = [];

    for (const assoc of associations) {
      const isZoo = assoc.texteId && assoc.imageId;
      const isMath = assoc.calculId && assoc.chiffreId;
      if (!isZoo && !isMath) continue;

      let key, type, element1, element2;
      if (isZoo) {
        key = `${assoc.texteId}:${assoc.imageId}`;
        type = 'zoology';
        element1 = textMap[assoc.texteId];
        element2 = imgMap[assoc.imageId];
      } else {
        key = assoc.calculId;
        type = 'math';
        element1 = calcMap[assoc.calculId];
        element2 = numMap[assoc.chiffreId];
      }

      const strat = merged[key];
      if (!strat) continue;

      result.push({
        key,
        type,
        assoc,
        element1,
        element2,
        strategy: strat,
        levelClass: assoc.levelClass || element1?.levelClass || '',
        themes: assoc.themes || element1?.themes || [],
      });
    }

    return result;
  }, [assocData, strategies, userEdits]);

  // Filtered slides
  const filteredSlides = useMemo(() => {
    if (activeFilter === 'all') return slides;
    return slides.filter(s => s.themes.some(t => t === activeFilter));
  }, [slides, activeFilter]);

  // Reset index when filter changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [activeFilter]);

  const currentSlide = filteredSlides[currentIndex] || null;

  // TTS
  const speak = useCallback((text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  // Build full TTS text for current slide
  const getTTSText = useCallback((slide) => {
    if (!slide) return '';
    const parts = [];
    const strat = slide.strategy;
    if (strat.title) parts.push(strat.title);
    if (strat.strategy) parts.push(`Stratégie : ${strat.strategy}`);
    if (strat.ecoFact) parts.push(`Le savais-tu ? ${strat.ecoFact}`);
    if (strat.hint) parts.push(`Indice : ${strat.hint}`);
    return parts.join('. ');
  }, []);

  // Navigation
  const goNext = useCallback(() => {
    stopSpeaking();
    setCurrentIndex(i => Math.min(i + 1, filteredSlides.length - 1));
  }, [filteredSlides.length, stopSpeaking]);

  const goPrev = useCallback(() => {
    stopSpeaking();
    setCurrentIndex(i => Math.max(i - 1, 0));
  }, [stopSpeaking]);

  // Swipe handling
  const onTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback((e) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0) goNext();
      else goPrev();
    }
  }, [goNext, goPrev]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e) => {
      if (editingSlide) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev, editingSlide]);

  // Edit handlers
  const openEdit = useCallback((slide) => {
    const merged = { ...strategies, ...userEdits };
    const current = merged[slide.key] || {};
    setEditForm({
      strategy: current.strategy || '',
      ecoFact: current.ecoFact || '',
      hint: current.hint || '',
    });
    setEditingSlide(slide);
  }, [strategies, userEdits]);

  const saveEdit = useCallback(() => {
    if (!editingSlide) return;
    const newEdits = { ...userEdits };
    const base = strategies[editingSlide.key] || {};
    newEdits[editingSlide.key] = { ...base, ...newEdits[editingSlide.key], ...editForm };
    setUserEdits(newEdits);
    saveUserEdits(newEdits);
    setEditingSlide(null);
  }, [editingSlide, editForm, userEdits, strategies]);

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  // Loading
  if (!assocData || !strategies) {
    return (
      <div className="learn-mode">
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#6b7280' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
          <p>Chargement des fiches d'apprentissage...</p>
        </div>
      </div>
    );
  }

  const progress = filteredSlides.length > 0 ? ((currentIndex + 1) / filteredSlides.length) * 100 : 0;

  return (
    <div className="learn-mode">
      {/* Header */}
      <div className="learn-mode__header">
        <button className="learn-mode__back" onClick={() => navigate('/modes')}>
          ← Retour aux modes
        </button>
        <h1 className="learn-mode__title">📚 Mode Apprendre</h1>
        <p className="learn-mode__subtitle">
          Découvre les associations, leurs stratégies et des faits passionnants !
        </p>
      </div>

      {/* Filters */}
      <div className="learn-mode__filters">
        <button
          className={`learn-mode__filter-btn ${activeFilter === 'all' ? 'learn-mode__filter-btn--active' : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          Tout ({slides.length})
        </button>
        {Object.entries(FILTER_LABELS).map(([key, label]) => {
          const count = slides.filter(s => s.themes.some(t => t === key)).length;
          if (count === 0) return null;
          return (
            <button
              key={key}
              className={`learn-mode__filter-btn ${activeFilter === key ? 'learn-mode__filter-btn--active' : ''}`}
              onClick={() => setActiveFilter(key)}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Slide */}
      {filteredSlides.length === 0 ? (
        <div className="learn-mode__empty">
          <div className="learn-mode__empty-icon">🔍</div>
          <h3>Aucune fiche disponible</h3>
          <p>Aucune stratégie n'a encore été ajoutée pour ce filtre.</p>
        </div>
      ) : currentSlide && (
        <>
          <div
            className="learn-mode__slide-wrapper"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            ref={slideRef}
          >
            <div className="learn-mode__slide">
              {/* Image or Calcul header */}
              {currentSlide.type === 'zoology' && currentSlide.element2 ? (
                <div className="learn-mode__slide-image-area">
                  <button className="learn-mode__edit-btn" onClick={() => openEdit(currentSlide)} title="Modifier">
                    ✏️
                  </button>
                  <img
                    src={`${PUBLIC_URL}/${currentSlide.element2.url}`}
                    alt={currentSlide.element1?.content || ''}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
              ) : currentSlide.type === 'math' ? (
                <div className="learn-mode__slide-calcul">
                  <button className="learn-mode__edit-btn" onClick={() => openEdit(currentSlide)} title="Modifier">
                    ✏️
                  </button>
                  <div className="learn-mode__calcul-expression">
                    {currentSlide.element1?.content || '?'}
                  </div>
                  <div className="learn-mode__calcul-result">
                    = {currentSlide.element2?.content || '?'}
                  </div>
                </div>
              ) : null}

              {/* Body */}
              <div className="learn-mode__slide-body">
                <div className="learn-mode__slide-name">
                  <h2>{currentSlide.strategy.title || currentSlide.element1?.content || ''}</h2>
                  {currentSlide.levelClass && (
                    <span className="learn-mode__level-badge">{currentSlide.levelClass}</span>
                  )}
                </div>

                {/* Strategy */}
                {currentSlide.strategy.strategy && (
                  <div className="learn-mode__section">
                    <div className="learn-mode__section-title">
                      🧠 Stratégie
                    </div>
                    <p className="learn-mode__section-text">
                      {currentSlide.strategy.strategy}
                    </p>
                  </div>
                )}

                {/* Eco fact (zoology only) */}
                {currentSlide.strategy.ecoFact && (
                  <div className="learn-mode__eco-section">
                    <div className="learn-mode__eco-title">
                      🌿 Le savais-tu ?
                    </div>
                    <p className="learn-mode__eco-text">
                      {currentSlide.strategy.ecoFact}
                    </p>
                  </div>
                )}

                {/* Hint */}
                {currentSlide.strategy.hint && (
                  <div className="learn-mode__hint">
                    <span>💡</span>
                    <p className="learn-mode__hint-text">
                      {currentSlide.strategy.hint}
                    </p>
                  </div>
                )}

                {/* TTS Button */}
                <button
                  className={`learn-mode__tts-btn ${isSpeaking ? 'learn-mode__tts-btn--speaking' : ''}`}
                  onClick={() => {
                    if (isSpeaking) {
                      stopSpeaking();
                    } else {
                      speak(getTTSText(currentSlide));
                    }
                  }}
                >
                  {isSpeaking ? '⏹️ Arrêter' : '🔊 Écouter'}
                  <span style={{ fontSize: 12, opacity: 0.8, marginLeft: 'auto' }}>
                    {isSpeaking ? 'Lecture en cours...' : 'Lire à voix haute'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div className="learn-mode__nav">
            <button
              className="learn-mode__nav-btn"
              onClick={goPrev}
              disabled={currentIndex === 0}
            >
              ‹
            </button>
            <span className="learn-mode__nav-counter">
              {currentIndex + 1} / {filteredSlides.length}
            </span>
            <button
              className="learn-mode__nav-btn"
              onClick={goNext}
              disabled={currentIndex >= filteredSlides.length - 1}
            >
              ›
            </button>
          </div>

          {/* Progress bar */}
          <div className="learn-mode__progress">
            <div className="learn-mode__progress-bar" style={{ width: `${progress}%` }} />
          </div>
        </>
      )}

      {/* Edit Modal */}
      {editingSlide && (
        <div className="learn-mode__edit-overlay" onClick={() => setEditingSlide(null)}>
          <div className="learn-mode__edit-modal" onClick={(e) => e.stopPropagation()}>
            <h3>✏️ Modifier la fiche</h3>
            <div className="learn-mode__edit-field">
              <label>🧠 Stratégie</label>
              <textarea
                value={editForm.strategy}
                onChange={(e) => setEditForm(f => ({ ...f, strategy: e.target.value }))}
                placeholder="Comment trouver cette association ?"
              />
            </div>
            {editingSlide.type === 'zoology' && (
              <div className="learn-mode__edit-field">
                <label>🌿 Fait écologique</label>
                <textarea
                  value={editForm.ecoFact}
                  onChange={(e) => setEditForm(f => ({ ...f, ecoFact: e.target.value }))}
                  placeholder="Information écologique sur cette espèce"
                />
              </div>
            )}
            <div className="learn-mode__edit-field">
              <label>💡 Indice</label>
              <textarea
                value={editForm.hint}
                onChange={(e) => setEditForm(f => ({ ...f, hint: e.target.value }))}
                placeholder="Indice court pour retrouver l'association"
                style={{ minHeight: 50 }}
              />
            </div>
            <div className="learn-mode__edit-actions">
              <button className="learn-mode__edit-cancel" onClick={() => setEditingSlide(null)}>
                Annuler
              </button>
              <button className="learn-mode__edit-save" onClick={saveEdit}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
