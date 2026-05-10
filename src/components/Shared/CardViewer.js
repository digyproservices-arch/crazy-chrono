// ==========================================
// COMPOSANT RÉUTILISABLE: Vue des 16 zones (cartes jouées)
// Utilisé dans: Résultats prof, Rectorat dashboard
// ==========================================

import React from 'react';

const typeColors = { image: '#3b82f6', texte: '#10b981', calcul: '#f59e0b', chiffre: '#a855f7' };
const typeLabels = { image: '🖼️ Image', texte: '📝 Texte', calcul: '🔢 Calcul', chiffre: '#️⃣ Chiffre' };

/**
 * Affiche visuellement les 16 zones d'un round
 * @param {Object} props
 * @param {Array} props.zones - Les zones du round [{type, content, pairId, isDistractor}]
 * @param {string} props.goodPairType - 'TI' ou 'CC'
 * @param {Object} props.goodPairContent - {a, b}
 * @param {string} props.winnerDisplayName - Nom du gagnant
 * @param {number} props.winnerTimeMs - Temps en ms
 * @param {Array} props.errors - [{player_id, display_name, timestamp}]
 * @param {number} props.roundNumber - Numéro du round
 * @param {string} props.goodPairTheme - Thématique
 * @param {string} props.goodPairLevel - Niveau
 */
export function RoundCard({ zones, goodPairType, goodPairContent, winnerDisplayName, winnerTimeMs, errors, roundNumber, goodPairTheme, goodPairLevel }) {
  if (!zones || zones.length === 0) return null;

  const pairedZones = zones.filter(z => z.pairId);
  const distractorZones = zones.filter(z => !z.pairId || z.isDistractor);

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
    }}>
      {/* Header du round */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            background: '#1AACBE',
            color: '#fff',
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 700
          }}>
            Round {roundNumber}
          </span>
          {goodPairTheme && (
            <span style={{ fontSize: 12, color: '#6b7280', background: '#f3f4f6', padding: '3px 8px', borderRadius: 4 }}>
              {goodPairTheme}
            </span>
          )}
          {goodPairLevel && (
            <span style={{ fontSize: 12, color: '#6b7280', background: '#f3f4f6', padding: '3px 8px', borderRadius: 4 }}>
              {goodPairLevel}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {winnerDisplayName && (
            <span style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>
              🏆 {winnerDisplayName}
              {winnerTimeMs && ` (${(winnerTimeMs / 1000).toFixed(1)}s)`}
            </span>
          )}
          {errors && errors.length > 0 && (
            <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
              ❌ {errors.length} erreur{errors.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Paire correcte mise en avant */}
      {goodPairContent && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          padding: '8px 12px',
          background: '#fef9c3',
          borderRadius: 8,
          border: '1px solid #fde047'
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#854d0e' }}>⭐ Paire :</span>
          <span style={{ fontSize: 13, color: '#1f2937' }}>
            {goodPairContent.a}
          </span>
          <span style={{ color: '#9ca3af' }}>↔</span>
          <span style={{ fontSize: 13, color: '#1f2937' }}>
            {goodPairType === 'TI' ? '🖼️' : ''}{goodPairContent.b?.length > 50 ? '(image)' : goodPairContent.b}
          </span>
        </div>
      )}

      {/* Résumé */}
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
        {zones.length} zones | {pairedZones.length} avec pairId | {distractorZones.length} distracteurs
      </div>

      {/* Grille des 16 zones */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
        {zones.map((z, i) => {
          const bg = typeColors[z.type] || '#475569';
          const hasPair = !!(z.pairId);
          const isImage = z.type === 'image';
          const content = z.content || '';

          return (
            <div
              key={i}
              style={{
                padding: 8,
                borderRadius: 8,
                border: hasPair ? '2px solid #fbbf24' : '1px solid #e5e7eb',
                background: hasPair ? '#fefce8' : '#f9fafb',
                minHeight: isImage ? 80 : 44,
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Type badge */}
              <div style={{
                position: 'absolute',
                top: 3,
                right: 3,
                padding: '1px 5px',
                borderRadius: 4,
                background: bg + '22',
                color: bg,
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase'
              }}>
                {z.type}
              </div>
              {hasPair && (
                <div style={{
                  position: 'absolute',
                  top: 3,
                  left: 3,
                  fontSize: 12
                }}>
                  ⭐
                </div>
              )}
              {/* Contenu */}
              <div style={{ marginTop: hasPair ? 16 : 14 }}>
                {isImage ? (
                  <div style={{ textAlign: 'center' }}>
                    <img
                      src={content.startsWith('/') ? content : `/images/${content}`}
                      alt=""
                      style={{ maxWidth: '100%', maxHeight: 60, borderRadius: 4, objectFit: 'contain' }}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                    <div style={{ fontSize: 8, color: '#9ca3af', marginTop: 2, wordBreak: 'break-all' }}>
                      {content.split('/').pop()?.substring(0, 20)}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    fontSize: z.type === 'chiffre' ? 16 : 11,
                    fontWeight: z.type === 'chiffre' ? 700 : 500,
                    color: '#1f2937',
                    textAlign: z.type === 'chiffre' ? 'center' : 'left',
                    wordBreak: 'break-word'
                  }}>
                    {content.substring(0, 60)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Détail des erreurs sur ce round */}
      {errors && errors.length > 0 && (
        <div style={{ marginTop: 10, padding: 8, background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#991b1b', marginBottom: 4 }}>Erreurs sur ce round :</div>
          {errors.map((err, j) => (
            <div key={j} style={{ fontSize: 11, color: '#7f1d1d' }}>
              • {err.display_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Bilan pédagogique d'un élève
 */
export function PlayerSummaryCard({ summary, onNotesChange }) {
  const recommendations = summary.recommendations || [];
  const strengths = recommendations.filter(r => r.type === 'strength');
  const improvements = recommendations.filter(r => r.type === 'improve');
  const errorRecos = recommendations.filter(r => r.type === 'errors');
  const statsByTheme = summary.stats_by_theme || {};

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1f2937' }}>
          📊 {summary.display_name}
        </h3>
        <div style={{ display: 'flex', gap: 12, fontSize: 14 }}>
          <span style={{ fontWeight: 700, color: '#1AACBE' }}>{summary.total_score} pts</span>
          <span style={{ color: '#6b7280' }}>{summary.total_pairs} paires</span>
          <span style={{ color: summary.total_errors > 0 ? '#ef4444' : '#6b7280' }}>{summary.total_errors} erreurs</span>
          {summary.avg_response_time_ms && (
            <span style={{ color: '#6b7280' }}>⏱ {(summary.avg_response_time_ms / 1000).toFixed(1)}s moy.</span>
          )}
        </div>
      </div>

      {/* Stats par thématique */}
      {Object.keys(statsByTheme).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>Performance par thématique :</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(statsByTheme).map(([theme, stats]) => {
              const total = stats.found + stats.missed;
              const rate = total > 0 ? stats.found / total : 0;
              const color = rate >= 0.8 ? '#15803d' : rate >= 0.5 ? '#d97706' : '#dc2626';
              return (
                <div key={theme} style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: rate >= 0.8 ? '#dcfce7' : rate >= 0.5 ? '#fef3c7' : '#fef2f2',
                  border: `1px solid ${color}33`,
                  fontSize: 12,
                  color
                }}>
                  <strong>{theme}</strong>: {stats.found}/{total}
                  {stats.errors > 0 && ` (${stats.errors} err)`}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommandations auto */}
      {(strengths.length > 0 || improvements.length > 0 || errorRecos.length > 0) && (
        <div style={{ marginBottom: 12, padding: 10, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#166534', marginBottom: 6 }}>Recommandations automatiques :</div>
          {strengths.map((r, i) => (
            <div key={`s${i}`} style={{ fontSize: 12, color: '#15803d', marginBottom: 2 }}>✅ {r.message}</div>
          ))}
          {improvements.map((r, i) => (
            <div key={`i${i}`} style={{ fontSize: 12, color: '#d97706', marginBottom: 2 }}>⚠️ {r.message}</div>
          ))}
          {errorRecos.map((r, i) => (
            <div key={`e${i}`} style={{ fontSize: 12, color: '#dc2626', marginBottom: 2 }}>❌ {r.message}</div>
          ))}
        </div>
      )}

      {/* Notes du prof */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>
          📝 Notes du professeur :
        </label>
        <textarea
          value={summary.teacher_notes || ''}
          onChange={e => onNotesChange && onNotesChange(e.target.value)}
          placeholder="Ajouter des notes sur cet élève..."
          style={{
            width: '100%',
            minHeight: 60,
            padding: 8,
            borderRadius: 6,
            border: '1px solid #d1d5db',
            fontSize: 13,
            fontFamily: 'inherit',
            resize: 'vertical',
            background: '#fafafa'
          }}
        />
      </div>
    </div>
  );
}

export default { RoundCard, PlayerSummaryCard };
