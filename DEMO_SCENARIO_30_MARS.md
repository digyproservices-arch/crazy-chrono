# 🎬 SCÉNARIO DE DÉMONSTRATION — 30 MARS 2026
## Tournoi Interscolaire CrazyChrono 2025-2026 — Académie de Guadeloupe

---

## 🎯 Objectif de la démo
Montrer le parcours complet : du cadre rectorat qui ouvre la compétition → au professeur qui crée des groupes et lance des matchs → aux élèves qui jouent → aux résultats visibles dans le dashboard rectorat.

---

## 👥 Comptes nécessaires

| Rôle | Email | Comment |
|------|-------|---------|
| **Admin** | (votre compte admin) | Pour envoyer l'invitation rectorat |
| **Rectorat** | (compte avec rôle rectorat) | Créé via invitation admin |
| **Professeur** | (compte enseignant lié à une classe) | Avec classe + élèves importés |
| **Élèves** | Codes d'accès élèves | Générés automatiquement (ex: ENZO-CPA-4701) |

---

## 📋 DÉROULEMENT (15–20 min)

### ACTE 1 — Le Rectorat ouvre la compétition (3 min)

1. **Se connecter en tant que Rectorat** → `/rectorat`
2. **Montrer le dashboard** :
   - Vue d'ensemble : nombre d'écoles, élèves licenciés, matchs
   - Onglet Écoles : les 22 écoles de Guadeloupe par circonscription
   - Onglet Classes : toutes les classes avec enseignants
3. **Montrer le bandeau compétition** :
   - 🔴 "Tournoi Interscolaire CrazyChrono 2025-2026 — FERMÉE"
   - Expliquer : "Tant que la compétition est fermée, les enseignants ne peuvent pas accéder au tournoi officiel"
4. **Cliquer "🟢 Ouvrir la compétition"** → Confirmer
   - Le bandeau passe à 🟢 OUVERTE
   - Message : "Les enseignants peuvent maintenant lancer des matchs Arena officiels"

### ACTE 2 — Le Professeur prépare sa classe (3 min)

5. **Se connecter en tant que Professeur** → `/teacher`
6. **Montrer le bouton "TOURNOI OFFICIEL"** maintenant **actif** (plus grisé !)
   - Expliquer : "Dès que le rectorat ouvre la compétition, les enseignants voient le bouton se débloquer"
7. **Cliquer "MA CLASSE"** → Montrer la liste des élèves, codes d'accès, export CSV, impression
8. **Cliquer "ENTRAÎNEMENT CLASSE"** → Montrer qu'il reste toujours accessible (indépendant de la compétition)
9. **Cliquer "VOIR TOURNOI"** → Page CrazyArenaSetup :
   - Voir les élèves de la classe
   - Créer 2-3 groupes de 4 élèves (drag & drop ou sélection)

### ACTE 3 — Les élèves jouent ! (5–7 min)

10. **Lancer les matchs** depuis la page CrazyArenaSetup → "Lancer tous les matchs"
11. **Ouvrir le Manager Dashboard** → `/crazy-arena/manager`
    - Voir les matchs en attente de joueurs
12. **Sur 4 appareils/onglets** → Se connecter en tant qu'élèves avec leurs codes d'accès
    - Les élèves rejoignent le lobby automatiquement
    - Le prof voit les joueurs se connecter en temps réel
13. **Démarrer le match** depuis le Manager
    - Countdown 3-2-1
    - Les 4 élèves jouent simultanément
    - Paires image↔nom ou calcul↔résultat
    - 3 rounds de 60 secondes
14. **Fin du match** → Classement affiché
    - 🥇🥈🥉 + scores + temps

### ACTE 4 — Le Rectorat supervise (3 min)

15. **Revenir au dashboard Rectorat** → `/rectorat`
16. **Onglet "Compétitions"** :
    - Activer le filtre "Officielles uniquement"
    - Voir le match qui vient d'être joué
17. **Cliquer sur un match** → "Voir les cartes jouées"
    - Montrer les zones de chaque round (archivage pédagogique)
18. **Onglet "Vue d'ensemble"** :
    - Le compteur "Matchs officiels" a augmenté

### ÉPILOGUE — Fermeture (1 min)

19. **Revenir au bandeau compétition** → "🔴 Fermer la compétition"
20. **Montrer côté Prof** → Le bouton "TOURNOI OFFICIEL" redevient grisé avec "Compétition non ouverte par le rectorat"

---

## 💡 Points clés à souligner pendant la démo

- **Sécurité** : Seul le rectorat peut ouvrir/fermer la compétition
- **Temps réel** : Le prof voit les élèves se connecter en direct (WebSocket)
- **Archivage** : Chaque carte jouée est sauvegardée pour suivi pédagogique
- **Scalabilité** : 22 écoles, 110 classes, 440 élèves déjà dans le système
- **Simplicité** : Les élèves se connectent avec un simple code (pas d'email)
- **4 phases** : Classe → École → Circonscription → Académique (progression pyramidale)

---

## ⚠️ Prérequis avant la démo

- [ ] SQL `migration_competition.sql` exécuté sur Supabase
- [ ] SQL `demo_guadeloupe_data.sql` exécuté (22 écoles, 440 élèves)
- [ ] Compte admin fonctionnel
- [ ] Invitation rectorat envoyée et acceptée (rôle vérifié)
- [ ] Professeur lié à au moins une classe avec 4+ élèves licenciés
- [ ] Serveur backend déployé avec les dernières modifications
- [ ] Frontend buildé et déployé
- [ ] Tester le flow complet au moins 1 fois avant le jour J
- [ ] Préparer 4 appareils/onglets pour simuler les élèves

---

## 🔧 En cas de problème

| Problème | Solution |
|----------|----------|
| Bouton tournoi reste grisé | Vérifier que `tour_2025_gp` existe dans `tournaments` avec `status = 'active'` |
| Dashboard rectorat inaccessible | Vérifier que `user_profiles.role = 'rectorat'` pour l'utilisateur |
| Élèves ne se connectent pas au match | Vérifier les codes d'accès dans `/teacher/dashboard` |
| Matchs ne démarrent pas | Vérifier les logs serveur, s'assurer que 4 joueurs sont connectés |
| "ZERO_VALID_PAIRS" dans les logs | Bug corrigé — relancer le match |
