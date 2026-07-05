---
description: Mode Objectif Intelligent — seuils, tirage adaptatif, acquis + révision
---

# Objectif du projet

Transformer le mode objectif en entraîneur adaptatif :
- Parties courtes (5-6 min max, 2-3 min pour un joueur avancé) au lieu de 15 min.
- Objectifs = 100% des catégories du niveau choisi + extras (JAMAIS retirer une petite catégorie).
- Le contenu servi s'adapte à la maîtrise cumulée du joueur (paires jamais vues en priorité).
- Les catégories déjà acquises sont pré-validées mais re-vérifiées par un échantillon de révision.

# Spécification validée avec Marius (04/07/2026)

## États d'une catégorie (calculés depuis la Maîtrise cumulée, masteryTracker)
- NOUVEAU: aucune paire de la catégorie jamais trouvée (toutes sessions confondues)
- EN_COURS: au moins 1 paire trouvée, mais pas toutes (Bronze non atteint)
- ACQUIS: Bronze atteint (toutes les paires du pool niveau trouvées au moins 1 fois)

## Objectif de session par catégorie
- NOUVEAU / EN_COURS → trouver min(N, total_filtré) paires. N = 5 par défaut.
- ACQUIS → trouver R paires de révision (R = min(2, total_filtré)).
  Affichage pré-validé "✅ Acquis (à confirmer 0/R)".
  Échec de révision (erreur sur la catégorie OU session finie sans confirmer)
  → la catégorie repasse EN_COURS à la prochaine session.
- total_filtré = paires de la catégorie dans le pool niveau+extras
  (computeFilteredThemeTotals, src/utils/elementsLoader.js).

## Priorités du tirage de la bonne paire (elementsLoader)
1. Paires JAMAIS trouvées (maîtrise cumulée) dans les catégories non complétées de la session
2. Paires des catégories non complétées de la session
3. Paires de révision (catégories ACQUIS non confirmées)
4. Reste du pool niveau+extras (comportement actuel, fallback)

## Fin de session
allComplete = toutes les catégories (y compris révisions) confirmées.

## Garde-fous
- Ne JAMAIS filtrer une catégorie par sa taille (1 paire = catégorie légitime, contenu enrichi plus tard).
- Totaux TOUJOURS sur le pool filtré niveau+extras (jamais tous-niveaux).
- Les paliers Maîtrise (Bronze/Argent/Or) restent inchangés — on les LIT, on ne les modifie pas.
- UI enfant lisible: états visibles, pas de mécanique cachée.

# Étapes d'exécution

## Phase 1 — Socle: seuil N + fin de session
1. Ajouter le calcul d'objectif de session par catégorie (min(N, total_filtré)) dans Carte.js
   (zone objProgress, ~ligne 4410) — N constant = 5 pour l'instant.
2. Adapter le panneau "Objectifs thématiques" (x/N au lieu de x/total) + HUD compteurs.
3. Tests: étendre src/utils/__tests__/objectiveModeRepro.test.js (objectif atteignable en N paires/catégorie).
// turbo
4. Lancer les tests: $env:CI='true'; npx.cmd react-scripts test --watchAll=false
5. Commit + push staging. VALIDATION MARIUS sur staging avant Phase 2.

## Phase 2 — Tirage priorisé (session)
1. Exposer depuis masteryTracker la liste des pairIds jamais trouvés (cumulé).
2. Dans elementsLoader.assignElementsToZones: pondérer le choix de la bonne paire
   selon les priorités 1→4 (nouvelle option cfg ou paramètre; PAS de changement en mode normal).
3. Tests: distribution du tirage sur 100 manches simulées (les catégories non complétées sortent d'abord).
// turbo
4. Tests + commit + push staging. VALIDATION MARIUS.

## Phase 3 — Acquis + révision
1. Calcul de l'état NOUVEAU/EN_COURS/ACQUIS par catégorie au démarrage de session.
2. Objectif révision R=2 pour les ACQUIS + logique d'échec (repasse EN_COURS via flag localStorage/serveur).
3. UI: affichage "✅ Acquis (à confirmer 0/2)" dans le panneau objectifs.
4. Tests unitaires des transitions d'état.
// turbo
5. Tests + commit + push staging. VALIDATION MARIUS.

## Phase 4 — Réglages & finitions
1. Rendre N réglable dans PedagogicConfig (prof/parent), défaut 5, bornes 3-10.
2. Retirer les traces temporaires [OBJ-TRACE] (Carte.js, PedagogicConfig.js, elementsLoader.js).
3. Vérifier la parité solo / salle privée / Grande Salle / Arena si le mode objectif y est actif.
// turbo
4. Tests complets + commit + push staging. VALIDATION MARIUS puis déploiement production (sur son ordre UNIQUEMENT).

# Règles pour l'agent
- Une phase à la fois; ne jamais commencer la phase suivante sans validation staging de Marius.
- Chaque phase se termine par: tests verts + push staging + résumé de ce qu'il faut tester.
- En cas de bug découvert en route: corriger la cause racine, ajouter un test de régression.
