# 🏛️ GUIDE TESTS DASHBOARD RECTORAT

**Date:** 2 janvier 2026  
**Version:** Routes API complètes (close, activate, PDF)

---

## 🎯 OBJECTIF

Tester le **Dashboard Rectorat** pour gestion manuelle des phases tournois.

---

## 📋 PRÉREQUIS

### **Comptes requis:**
- ✅ 1 compte **Admin/Rectorat**

### **Données BDD requises:**
```sql
-- 1. Tournoi créé
INSERT INTO tournaments (id, name, status, created_at)
VALUES ('test_tournament_001', 'Tournoi Test Guadeloupe 2025', 'active', NOW());

-- 2. Phase 1 (Classe) créée
INSERT INTO tournament_phases (id, tournament_id, level, status, created_at)
VALUES 
  ('phase_1_test', 'test_tournament_001', 1, 'active', NOW()),
  ('phase_2_test', 'test_tournament_001', 2, 'pending', NOW()),
  ('phase_3_test', 'test_tournament_001', 3, 'pending', NOW()),
  ('phase_4_test', 'test_tournament_001', 4, 'pending', NOW());

-- 3. Groupes Phase 1 (minimum 2 groupes de 4)
INSERT INTO tournament_groups (id, phase_id, student_ids, status, winner_id)
VALUES
  ('group_1_test', 'phase_1_test', ARRAY['student_1', 'student_2', 'student_3', 'student_4'], 'finished', 'student_1'),
  ('group_2_test', 'phase_1_test', ARRAY['student_5', 'student_6', 'student_7', 'student_8'], 'finished', 'student_5');
```

### **Backend/Frontend:**
- ✅ Backend: Routes `/api/tournament/phases/:id/close`, `/activate`, `/:id/ranking/pdf` déployées
- ✅ Frontend: `RectoratDashboard.js` déployé

---

## 🧪 TEST 1: ACCÈS DASHBOARD

### **Étape 1.1: Connexion Admin**
1. Connexion: `https://app.crazy-chrono.com/login`
2. Email admin: `admin@crazy-chrono.com` / Mot de passe
3. Aller sur: `https://app.crazy-chrono.com/admin/rectorat`

**✅ Attendu:**
- Page Dashboard Rectorat affichée
- Titre: "🏛️ Tableau de Bord Rectorat"
- Sélecteur tournoi visible

**📸 Screenshot requis:** Page dashboard

---

### **Étape 1.2: Sélection Tournoi**
1. Sélecteur tournoi: Choisir "Tournoi Test Guadeloupe 2025"

**✅ Attendu:**
- Détails tournoi affichés:
  - Nom: Tournoi Test Guadeloupe 2025
  - Statut: active
  - Phases: 4 phases
- Bouton **📥 EXPORTER CLASSEMENT PDF** visible

**📸 Screenshot requis:** Détails tournoi

---

## 🧪 TEST 2: AFFICHAGE PHASES

### **Étape 2.1: Voir Phases**
**✅ Attendu:**
- 4 cartes phases affichées:
  1. **Phase 1 - CRAZY WINNER CLASSE** (En cours 🔵)
  2. **Phase 2 - CRAZY WINNER ÉCOLE** (En attente ⚫)
  3. **Phase 3 - CRAZY WINNER CIRCONSCRIPTION** (En attente ⚫)
  4. **Phase 4 - CRAZY WINNER ACADÉMIQUE** (En attente ⚫)

**📸 Screenshot requis:** Grille 4 phases

---

### **Étape 2.2: Stats Phase 1**
**✅ Attendu (Phase 1):**
- Status badge: "En cours" (bleu)
- Stats:
  - Groupes: 2
  - Terminés: 2/2
  - Progression: **100%**
- Barre progression: 100% verte
- Bouton **🔒 CLÔTURER PHASE** visible (car 100%)

**📸 Screenshot requis:** Phase 1 avec 100% progression

---

## 🧪 TEST 3: CLÔTURE PHASE 1

### **Étape 3.1: Cliquer Clôturer**
1. Phase 1 → Cliquer **🔒 CLÔTURER PHASE**
2. Popup confirmation: "Voulez-vous vraiment clôturer cette phase ?"
3. Cliquer **OK**

**✅ Attendu:**
- Loader pendant traitement
- Alert success: "Phase clôturée avec succès! 2 gagnant(s) qualifié(s) pour la phase suivante."
- Page se rafraîchit

**Console backend logs:**
```
[Tournament API] Clôture phase phase_1_test
[Tournament API] 2 gagnants qualifiés pour phase suivante
[Tournament API] 1 groupes créés pour phase phase_2_test
```

**📸 Screenshot requis:** Alert succès

---

### **Étape 3.2: Vérifier Phase 1 Mise à Jour**
**✅ Attendu:**
- Phase 1 status badge: "Terminée" (vert ✅)
- Barre progression: 100%
- Bouton "Clôturer" disparu
- Nouveau bouton apparu: **🚀 ACTIVER PHASE SUIVANTE**

**📸 Screenshot requis:** Phase 1 terminée

---

### **Étape 3.3: Vérifier BDD**
```sql
-- 1. Phase 1 status → 'finished'
SELECT id, level, status FROM tournament_phases WHERE id = 'phase_1_test';
-- Attendu: status = 'finished'

-- 2. Groupes Phase 2 créés avec gagnants Phase 1
SELECT id, phase_id, student_ids, status FROM tournament_groups 
WHERE phase_id = 'phase_2_test';
-- Attendu: 1 groupe avec student_ids = ['student_1', 'student_5']
```

**✅ Attendu:**
- Phase 1: `status = 'finished'`
- Phase 2: 1 groupe créé avec 2 gagnants (student_1, student_5)

**📸 Screenshot requis:** Requête SQL résultats

---

## 🧪 TEST 4: ACTIVATION PHASE 2

### **Étape 4.1: Cliquer Activer**
1. Phase 1 → Cliquer **🚀 ACTIVER PHASE SUIVANTE**
2. Popup confirmation: "Activer la phase suivante ?"
3. Cliquer **OK**

**✅ Attendu:**
- Alert success: "Phase suivante activée avec succès!"
- Page se rafraîchit

**Console backend logs:**
```
[Tournament API] Activation phase phase_2_test
[Tournament API] Phase phase_2_test activée avec succès
```

**📸 Screenshot requis:** Alert activation

---

### **Étape 4.2: Vérifier Phase 2 Activée**
**✅ Attendu:**
- Phase 2 status badge: "En cours" (bleu)
- Stats:
  - Groupes: 1
  - Terminés: 0/1
  - Progression: 0%
- Barre progression: 0%
- Bouton "Activer" disparu

**📸 Screenshot requis:** Phase 2 active

---

### **Étape 4.3: Vérifier BDD**
```sql
SELECT id, level, status, started_at FROM tournament_phases 
WHERE id = 'phase_2_test';
-- Attendu: status = 'active', started_at NOT NULL
```

**✅ Attendu:**
- Phase 2: `status = 'active'`
- `started_at`: timestamp actuel

**📸 Screenshot requis:** Requête SQL

---

## 🧪 TEST 5: EXPORT PDF CLASSEMENT

### **Étape 5.1: Cliquer Export**
1. En haut page → Cliquer **📥 EXPORTER CLASSEMENT PDF**

**✅ Attendu:**
- Téléchargement fichier PDF démarre
- Nom fichier: `classement_Tournoi_Test_Guadeloupe_2025_TIMESTAMP.pdf`
- Alert: "Classement téléchargé avec succès!"

**Console backend logs:**
```
[Tournament API] Export PDF classement tournoi test_tournament_001
[Tournament API] PDF généré avec succès pour tournoi test_tournament_001
```

**📸 Screenshot requis:** Alert téléchargement

---

### **Étape 5.2: Ouvrir PDF**
1. Ouvrir fichier PDF téléchargé

**✅ Attendu (contenu PDF):**
- **Titre:** 🏆 CRAZY CHRONO TOURNOI
- **Sous-titre:** Tournoi Test Guadeloupe 2025
- **Date:** Date actuelle
- **Ligne bleue séparation**
- **Section Phase 1:**
  - Titre: "Phase 1 - CRAZY WINNER CLASSE"
  - Status: Terminée
  - Groupe 1:
    - 🥇 1. [Nom élève 1] - [score] pts
    - 🥈 2. [Nom élève 2] - [score] pts
    - 🥉 3. [Nom élève 3] - [score] pts
  - Groupe 2:
    - 🥇 1. [Nom élève 5] - [score] pts
    - ...
- **Section Phase 2:**
  - Titre: "Phase 2 - CRAZY WINNER ÉCOLE"
  - Status: En cours
  - Groupe 1: (vide si pas encore joué)

**Pied de page:**
- "Généré par Crazy Chrono - [Date/Heure]"

**📸 Screenshot requis:** PDF ouvert (page 1)

---

## 🧪 TEST 6: PHASES 3-4 (Même Process)

### **Simulation Phases Suivantes:**

Pour tester phases 3-4, répéter:

1. **Jouer matchs Phase 2** (via profs)
2. **Rectorat clôture Phase 2** (quand 100%)
3. **Rectorat active Phase 3**
4. **Répéter pour Phase 4**

**Phase 4 = Finale Académique:**
- 1 seul groupe avec 4 finalistes
- PDF final affiche **Champion Académique** en page dédiée

---

## ✅ CHECKLIST VALIDATION

### **Dashboard:**
- [ ] Page /admin/rectorat accessible (admin uniquement)
- [ ] Sélecteur tournoi fonctionne
- [ ] 4 phases affichées avec status corrects
- [ ] Stats phases correctes (groupes, progression %)
- [ ] Barres progression visuelles

### **Clôture Phase:**
- [ ] Bouton "Clôturer" visible si 100%
- [ ] Popup confirmation affichée
- [ ] API PATCH /phases/:id/close appelée
- [ ] Alert succès affichée
- [ ] Phase status → 'finished' en BDD
- [ ] Groupes phase suivante créés avec gagnants

### **Activation Phase:**
- [ ] Bouton "Activer" visible après clôture précédente
- [ ] Popup confirmation affichée
- [ ] API PATCH /phases/:id/activate appelée
- [ ] Alert succès affichée
- [ ] Phase status → 'active' en BDD
- [ ] Profs peuvent créer matchs phase active

### **Export PDF:**
- [ ] Bouton "Export PDF" visible
- [ ] API GET /:tournamentId/ranking/pdf appelée
- [ ] Fichier PDF téléchargé (nom correct)
- [ ] Alert téléchargement affichée
- [ ] PDF contient toutes phases avec résultats
- [ ] Champion académique en fin (si Phase 4 terminée)

---

## 🐛 BUGS POTENTIELS

### **1. Clôture phase non 100%**
**Symptôme:** Bouton "Clôturer" visible à 50%  
**Attendu:** Bouton caché si < 100%

### **2. Groupes vides Phase 2**
**Symptôme:** Phase 2 sans groupes après clôture Phase 1  
**Attendu:** 1 groupe créé avec gagnants Phase 1

### **3. PDF vide**
**Symptôme:** PDF téléchargé sans contenu  
**Vérifier:** Résultats matchs sauvegardés en BDD (`tournament_matches.results`)

### **4. Activation phase déjà active**
**Symptôme:** Erreur "Phase déjà active"  
**Attendu:** Vérification status avant activation

---

## 🔄 WORKFLOW COMPLET (4 PHASES)

```
PHASE 1 (Classe):
1. Profs créent matchs classe (groupes 4 élèves)
2. Matchs joués → Gagnants enregistrés
3. Rectorat voit 100% → Clôture Phase 1
4. Groupes Phase 2 créés automatiquement
5. Rectorat active Phase 2

PHASE 2 (École):
6. Profs créent matchs école (gagnants Phase 1)
7. Matchs joués → Gagnants enregistrés
8. Rectorat voit 100% → Clôture Phase 2
9. Groupes Phase 3 créés
10. Rectorat active Phase 3

PHASE 3 (Circonscription):
11-15. Répéter process Phase 2

PHASE 4 (Académique - FINALE):
16. 1 groupe avec 4 finalistes
17. Match final joué
18. Rectorat clôture Phase 4
19. Champion Académique déclaré
20. Export PDF complet
```

---

## 📊 RÉSULTAT ATTENDU GLOBAL

**Si tout fonctionne:**
- ✅ Rectorat peut clôturer phases (100%)
- ✅ Gagnants qualifiés automatiquement
- ✅ Rectorat active phases suivantes manuellement
- ✅ PDF exporté avec classement complet
- ✅ Progression visuelle correcte (0% → 100%)

**Temps estimé test complet (4 phases):** ~30 minutes

---

## 🚀 URL RAPIDES

**Dashboard:** `https://app.crazy-chrono.com/admin/rectorat`

**API Endpoints:**
- `PATCH /api/tournament/phases/:id/close`
- `PATCH /api/tournament/phases/:id/activate`
- `GET /api/tournament/:id/ranking/pdf`

---

**Date:** 2 janvier 2026  
**Version:** Routes API Rectorat complètes  
**Prochaine étape:** Refactorisation crazyArenaManager
