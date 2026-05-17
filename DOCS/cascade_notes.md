# Notes Cascade

Ce fichier sert à garder une trace des échanges importants avec Cascade, synchronisée entre tous tes PC via Git.

---

## Session du : 2026-05-17 — Parité des fonctionnalités (5 modes)

### Contexte
- Audit complet des 5 modes de jeu (Solo, Salle Privée, Grande Salle, Training, Arena) pour identifier et corriger les disparités.

### Tâches terminées ✅
- [x] Arena: navigation Résultats → GroupMatchHistory + endpoint
- [x] Arena: scores élèves dans la carte du groupe
- [x] Training: fenêtre d'égalité 200ms + anti-doublon (_pairClaimLock)
- [x] featureParity.json étendu aux 5 modes
- [x] Suppression bonus rapidité caché (Training + Arena)
- [x] Grande Salle: persistance résultats en DB (training_sessions + training_results)
- [x] Grande Salle: suivi tentatives (persistMPAttempt) + mastery
- [x] Grande Salle: sessions visibles dans StudentPerformance (mode 'grande-salle' détecté)
- [x] Grande Salle: record personnel (best score + meilleure position)

### Décisions prises
- Le bonus rapidité caché (+1 si <3s) a été **supprimé** de tous les modes (confusion scores)
- Les items jugés **non pertinents** ont été marqués na/ignorés :
  - Fenêtre d'égalité GS (chaque joueur joue seul)
  - Pause/reprise en Salle Privée (sessions trop courtes)
  - Score temps réel en DB (fin de session suffit)
  - Bilan auto par joueur en Solo/SP/GS (pas de supervision prof)

### Disparités restantes (faible priorité)
- [ ] Stats perf dans carte groupe (Arena) — cosmétique
- [ ] Historique détaillé manches (Solo + GS) — complexe, valeur limitée
- [ ] Récupération matchs après crash serveur (SP + GS) — sessions courtes

### Commits associés
- `1fdfce3` — persistance résultats GS en DB
- `69c87ce` — suivi tentatives + détection mode grande-salle
- `082eb48` — record personnel Grande Salle

### Fichier de référence
- `server/data/featureParity.json` — registre complet avec statut ok/missing/na par mode

---

Rappelle-toi :
- Ce fichier est versionné avec Git.
- Il sera disponible sur tous tes PC après un `git pull`.
