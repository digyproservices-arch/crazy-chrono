# Refactorisation Game State Machine

## Objectif
Rendre le code du jeu fiable, solide et performant pour une utilisation mondiale.

## Problème actuel
- `Carte.js` fait ~9600 lignes — tous les modes de jeu dans un seul fichier
- Logique de fin de partie dispersée, difficile à auditer
- Pas de tests sur les transitions critiques (timer, rounds, session end)
- État serveur en mémoire uniquement (perdu au restart)

## Plan de refactorisation

### Phase 1 : Game State Machine (cette branche)
- [ ] Extraire la logique de timer/rounds/session dans un hook `useGameStateMachine`
- [ ] Couvrir les transitions critiques avec des tests
- [ ] Valider que tous les modes fonctionnent identiquement

### Phase 2 : Séparation par mode (branches futures)
- [ ] Solo → `useSoloGame`
- [ ] Multijoueur → `useMultiplayerGame`
- [ ] Arena → `useArenaGame`
- [ ] Training → `useTrainingGame`

### Phase 3 : Résilience serveur (branche future)
- [ ] Persister les rooms dans Redis/DB
- [ ] Survie aux restarts serveur

## Règle d'or
⚠️ `main` reste stable pour les tests école. Rien n'est mergé tant que ce n'est pas validé.
