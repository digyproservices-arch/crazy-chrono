// Script temporaire pour patcher Carte.js (CRLF) avec le logging PAIR_REJECTED
const fs = require('fs');
const filePath = 'src/components/Carte.js';
let content = fs.readFileSync(filePath, 'utf8');

// Cible : juste après le console.log('[GAME] BAD pair', ...) on ajoute l'appel incidentReportIncident
const searchStr = "console.log('[GAME] BAD pair', { a, b, ZA: ZA && { id: ZA.id, type: ZA.type, pairId: ZA.pairId }, ZB: ZB && { id: ZB.id, type: ZB.type, pairId: ZB.pairId } });";

const idx = content.indexOf(searchStr);
if (idx < 0) {
  console.error('ERREUR: Chaîne cible non trouvée dans Carte.js');
  process.exit(1);
}

// Code à insérer après le console.log
const insertCode = `
        // MONITORING: Tracer factuellement chaque paire rejetée avec contexte complet
        try {
          const _rejReason = !ZA || !ZB ? 'zone_missing' : !allowed(t1, t2) ? 'type_mismatch' : !p1 || !p2 ? 'no_pairId' : p1 !== p2 ? 'pairId_mismatch' : 'unknown';
          const _goodPairZones = zones.filter(z => (z.pairId || '').trim());
          incidentReportIncident(INCIDENT_TYPES_TRACKER.PAIR_REJECTED, {
            zoneA: { id: a, type: t1, content: String(ZA?.content || ZA?.label || '').substring(0, 80), pairId: p1 || null, isDistractor: !!ZA?.isDistractor },
            zoneB: { id: b, type: t2, content: String(ZB?.content || ZB?.label || '').substring(0, 80), pairId: p2 || null, isDistractor: !!ZB?.isDistractor },
            reason: _rejReason,
            goodPair: _goodPairZones.map(z => ({ id: z.id, type: z.type, content: String(z.content || '').substring(0, 80), pairId: z.pairId })),
            round: Number(roundsPlayed) || 0,
            score: scoreRef.current,
            totalZones: zones.length,
            message: 'Paire cliquée rejetée: ' + _rejReason + ' — zoneA=' + String(ZA?.content || '').substring(0, 30) + ' zoneB=' + String(ZB?.content || '').substring(0, 30),
          });
        } catch (_rejErr) { console.warn('[PAIR_REJECTED] Erreur logging:', _rejErr); }`;

// Insérer après la ligne trouvée
const insertPoint = idx + searchStr.length;
const newContent = content.substring(0, insertPoint) + '\r\n' + insertCode.split('\n').join('\r\n') + content.substring(insertPoint);

fs.writeFileSync(filePath, newContent, 'utf8');

// Vérifier
const verify = fs.readFileSync(filePath, 'utf8');
const found = verify.indexOf('INCIDENT_TYPES_TRACKER.PAIR_REJECTED');
console.log('Patch appliqué avec succès. PAIR_REJECTED trouvé à index:', found);
const lineNum = verify.substring(0, found).split('\n').length;
console.log('Ligne approximative:', lineNum);
