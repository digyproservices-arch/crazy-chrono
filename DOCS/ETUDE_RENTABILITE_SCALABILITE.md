# 📊 ÉTUDE APPROFONDIE : Rentabilité, Scalabilité & Fiscalité
# CRAZY CHRONO — DIGIKAZ

**Date :** 18 février 2026  
**Auteur :** Analyse Cascade AI  
**Statut :** Document stratégique — NE PAS SUPPRIMER

---

## TABLE DES MATIÈRES

1. [Grille tarifaire validée](#1-grille-tarifaire-validée)
2. [Le jeu peut-il supporter 25 000 élèves ?](#2-scalabilité-technique)
3. [Coûts infrastructure par palier](#3-coûts-infrastructure-par-palier)
4. [Fiscalité & charges sociales](#4-fiscalité--charges-sociales)
5. [Compte de résultat prévisionnel](#5-compte-de-résultat-prévisionnel)
6. [Risques et solutions](#6-risques-et-solutions)
7. [Plan d'action recommandé](#7-plan-daction-recommandé)

---

## 1. GRILLE TARIFAIRE VALIDÉE

### Particuliers (mensuel, via Stripe web ou App Store/Play Store)

| Formule | Prix affiché/mois | Commission | Tu reçois net/mois |
|---------|-------------------|------------|---------------------|
| **Standard** | **9,90€** | Stripe 1,5%+0,25€ / Apple-Google 15% | 9,50€ (web) / 8,42€ (app) |
| **Solidaire** (faible revenu) | **5,90€** | idem | 5,56€ (web) / 5,02€ (app) |
| **Annuel web** (Stripe) | **89,90€/an** (=7,49€/mois) | Stripe 1,5%+0,25€ | 88,30€/an |

### Institutions (mensuel par élève, virement/bon de commande, 0% commission)

| Palier | Prix/élève/mois | Prix/élève/an (10 mois scolaires) |
|--------|----------------|-----------------------------------|
| **1-10 élèves** | **9,90€** | 99,00€ |
| **11-50 élèves** | **6,90€** | 69,00€ |
| **51-200 élèves** | **4,90€** | 49,00€ |
| **201-1000 élèves** | **3,90€** | 39,00€ |
| **1001-2000 élèves** | **2,90€** | 29,00€ |
| **2000+ élèves** | **1,90€** | 19,00€ |

> **Année scolaire = 10 mois facturés** (septembre → juin)  
> **Paiement institutions : virement bancaire ou bon de commande (0% commission)**  
> **Paiement parents : Stripe (web) ou RevenueCat via Apple/Google (app)**

---

## 2. SCALABILITÉ TECHNIQUE

### Architecture actuelle

```
Frontend (Vercel)          Backend (Render)           Base de données (Supabase)
React SPA statique    →    Node.js + Express      →   PostgreSQL
                           Socket.IO (temps réel)      Auth (connexions)
                           1 instance, 512 MB RAM      500 MB (free) / 8 GB (pro)
```

### Combien de joueurs simultanés AUJOURD'HUI ?

| Composant | Limite actuelle | Goulot d'étranglement |
|-----------|----------------|----------------------|
| **Render Free** | ~50 connexions WebSocket simultanées | Sleep après 15 min, 512 MB RAM |
| **Render Starter ($7)** | ~200-300 connexions simultanées | 512 MB RAM, 1 CPU |
| **Render Standard ($25)** | ~800-1000 connexions simultanées | 2 GB RAM, 1 CPU |
| **Supabase Free** | 500 connexions BDD simultanées | Suffisant pour 5000+ users |
| **Vercel Free** | 100 GB bandwidth/mois | ~50 000 visites/mois |

### ⚠️ LE POINT CRITIQUE : Socket.IO sur 1 serveur

Le jeu utilise Socket.IO pour le temps réel (matchs multijoueurs). **1 serveur Node.js = 1 processus = 1 thread.** Chaque match occupe 4-8 connexions WebSocket. 

| Nb élèves simultanés en jeu | Matchs simultanés | RAM nécessaire | Plan Render |
|------------------------------|-------------------|----------------|-------------|
| 20 (5 matchs) | 5 | ~256 MB | Starter $7 |
| 100 (25 matchs) | 25 | ~512 MB | Starter $7 |
| 400 (100 matchs) | 100 | ~1 GB | Standard $25 |
| 1000 (250 matchs) | 250 | ~2.5 GB | Pro $85 |
| 4000 (1000 matchs) | 1000 | ~8 GB | **⛔ Refacto nécessaire** |

### IMPORTANT : Simultanéité ≠ Nombre total d'élèves inscrits

**25 000 élèves inscrits ≠ 25 000 élèves en ligne en même temps !**

En pratique :
- Les élèves jouent **en classe**, donc uniquement pendant les heures scolaires (8h-16h)
- 1 session dure ~5-15 minutes
- 1 prof lance 1 session à la fois pour sa classe (~25 élèves)
- Les sessions sont réparties dans la journée

**Estimation réaliste du pic de simultanéité :**

| Total inscrits | Pic simultané estimé (5% du total) | Plan nécessaire |
|---------------|-----------------------------------|-----------------|
| 500 | ~25 joueurs | Starter $7 ✅ |
| 2 000 | ~100 joueurs | Starter $7 ✅ |
| 5 000 | ~250 joueurs | Standard $25 ✅ |
| 10 000 | ~500 joueurs | Standard $25 ✅ |
| 25 000 | ~1 250 joueurs | Pro $85 ou scale ⚠️ |

### Bugs actuels : causes et solutions

| Bug observé | Cause probable | Solution | Coût |
|------------|---------------|----------|------|
| Render qui redémarre | Plan Free qui dort, ou healthcheck fail | Plan Starter (toujours actif) | +$7/mois |
| Déconnexions Socket.IO | Réseau instable + pas de reconnexion robuste | Améliorer reconnexion client | $0 (code) |
| Matchs perdus au restart | État en RAM uniquement | Déjà partiellement résolu (recovery DB) | $0 (fait) |
| Lenteurs Supabase | Plan Free, pool limité | Plan Pro si >5000 users | +$25/mois |

### Quand faudra-t-il repenser l'architecture ?

| Palier | Action requise | Quand |
|--------|---------------|-------|
| 0-5000 élèves | **Aucun changement.** L'archi actuelle suffit. | Maintenant |
| 5000-15000 | Passer Render en Standard, Supabase Pro | Quand CA le permet |
| 15000-50000 | Ajouter Redis pour Socket.IO + 2 instances Render | An 2 |
| 50000+ | Kubernetes ou managed containers (Fly.io, Railway) | An 3+ |

**Conclusion scalabilité : Ton architecture ACTUELLE supporte jusqu'à ~5000 élèves inscrits sans aucune modification.** Pour 25 000, il faudra upgrader Render + Supabase (~$110/mois au total). C'est largement couvert par le CA généré.

---

## 3. COÛTS INFRASTRUCTURE PAR PALIER

### Palier 1 : 0-500 élèves (Pilote)

| Service | Plan | Coût/mois |
|---------|------|-----------|
| Render | Starter (toujours actif) | $7 |
| Vercel | Free | $0 |
| Supabase | Free (500 MB, 50k auth) | $0 |
| Sentry | Free (5k erreurs) | $0 |
| GitHub | Free | $0 |
| Domaine | crazy-chrono.com | ~$1 |
| **TOTAL** | | **$8/mois ≈ 8€** |

### Palier 2 : 500-5000 élèves (Déploiement académique)

| Service | Plan | Coût/mois |
|---------|------|-----------|
| Render | Starter | $7 |
| Vercel | Pro | $20 |
| Supabase | Pro | $25 |
| Sentry | Team | $26 |
| GitHub | Free | $0 |
| Domaine | | $1 |
| Google Play (one-time $25) | amortissement | $2 |
| Apple Developer ($99/an) | | $8 |
| **TOTAL** | | **$89/mois ≈ 85€** |

### Palier 3 : 5000-25000 élèves (Multi-académies)

| Service | Plan | Coût/mois |
|---------|------|-----------|
| Render | Standard (2 GB RAM) | $25 |
| Vercel | Pro | $20 |
| Supabase | Pro + compute addon | $50 |
| Sentry | Team | $26 |
| GitHub | Free | $0 |
| Domaine | | $1 |
| Apple Developer | | $8 |
| Google Play | | $0 (payé) |
| RevenueCat | 1% si >$2500 MTR | ~$10-50 |
| **TOTAL** | | **$140-160/mois ≈ 140€** |

---

## 4. FISCALITÉ & CHARGES SOCIALES

### Option A : Micro-entreprise (le plus simple pour démarrer)

**Seuil de CA :** 77 700€/an pour prestations de services numériques

| Poste | Taux | Sur 50 000€ de CA |
|-------|------|-------------------|
| **Cotisations sociales (URSSAF)** | 21,1% du CA | 10 550€ |
| **Impôt sur le revenu** (versement libératoire) | 1,7% du CA | 850€ |
| **CFE** (cotisation foncière) | ~200-500€/an | ~350€ |
| **TVA** | Franchise en base si CA < 36 800€ | 0€ (ou 20% au-delà) |
| **TOTAL charges** | ~23% du CA | **11 750€** |
| **NET après charges** | ~77% du CA | **38 250€** |

> ⚠️ **Spécificité DOM-TOM (Guadeloupe)** : exonération partielle de cotisations sociales les premières années (dispositif LODEOM). Taux réduit possible à ~12-15% au lieu de 21,1%.

### Option B : SASU / SAS (si CA > 77 700€ ou besoin de crédibilité)

| Poste | Taux | Sur 100 000€ de CA |
|-------|------|-------------------|
| **Charges sociales sur salaire gérant** | ~45% du salaire brut | Variable |
| **Impôt sur les sociétés** | 15% jusqu'à 42 500€, 25% au-delà | ~15 000€ |
| **TVA collectée** (20%) | 20% sur ventes aux parents | Variable |
| **Expert-comptable** | | ~1 500-3 000€/an |
| **Assurance RC Pro** | | ~500-800€/an |

### Estimation fiscale par scénario de CA

| CA annuel | Statut recommandé | Charges totales (~) | **Net dans ta poche** |
|-----------|-------------------|--------------------|-----------------------|
| 10 000€ | Micro-entreprise | ~2 300€ (23%) | **7 700€** |
| 30 000€ | Micro-entreprise | ~6 900€ (23%) | **23 100€** |
| 50 000€ | Micro-entreprise | ~11 500€ (23%) | **38 500€** |
| 77 700€ | Micro (plafond) | ~17 900€ (23%) | **59 800€** |
| 100 000€ | SASU obligatoire | ~30 000€ (30%) | **70 000€** |
| 200 000€ | SASU | ~60 000€ (30%) | **140 000€** |
| 475 000€ | SASU | ~142 000€ (30%) | **333 000€** |

> **Attention :** ces chiffres sont des estimations. Consulte un expert-comptable pour ta situation exacte, surtout pour les avantages DOM-TOM.

---

## 5. COMPTE DE RÉSULTAT PRÉVISIONNEL

### Scénario An 1 : Lancement (5 écoles + parents)

| REVENUS | Détail | Montant |
|---------|--------|---------|
| 5 écoles (800 élèves, palier 4,90€) | 800 × 4,90€ × 10 mois | 39 200€ |
| 50 parents Standard (web) | 50 × 9,90€ × 10 mois | 4 950€ |
| 30 parents Solidaire (web) | 30 × 5,90€ × 10 mois | 1 770€ |
| 20 parents App Store | 20 × 9,90€ × 10 mois × 0,84 (net Apple) | 1 663€ |
| **TOTAL CA** | | **47 583€** |

| CHARGES | Détail | Montant |
|---------|--------|---------|
| Infrastructure (palier 2) | 85€ × 12 mois | 1 020€ |
| Cotisations sociales (micro 23%) | 23% × 47 583€ | 10 944€ |
| Impôt (versement libératoire 1,7%) | 1,7% × 47 583€ | 809€ |
| CFE | forfait | 350€ |
| Outils dev (Windsurf, etc.) | ~30€ × 12 | 360€ |
| Email pro + divers | ~10€ × 12 | 120€ |
| Comptabilité | micro = simple | 0€ |
| **TOTAL CHARGES** | | **13 603€** |

| | |
|---|---|
| **RÉSULTAT NET (dans ta poche)** | **33 980€** |
| **Marge nette** | **71%** |

### Scénario An 2 : 1 rectorat + 15 écoles + parents

| REVENUS | Détail | Montant |
|---------|--------|---------|
| 1 rectorat (3000 élèves, 2,90€) | 3000 × 2,90€ × 10 | 87 000€ |
| 15 écoles (2000 élèves, 3,90€) | 2000 × 3,90€ × 10 | 78 000€ |
| 200 parents Standard (web) | 200 × 9,90€ × 10 | 19 800€ |
| 100 parents App | 100 × 9,90€ × 10 × 0,84 | 8 316€ |
| 50 parents Solidaire | 50 × 5,90€ × 10 | 2 950€ |
| **TOTAL CA** | | **196 066€** |

| CHARGES | Détail | Montant |
|---------|--------|---------|
| Infrastructure (palier 3) | 140€ × 12 | 1 680€ |
| Passage SASU obligatoire (CA > 77 700€) | | |
| IS (impôt sociétés) | ~15% sur 42 500€ + 25% reste | ~32 000€ |
| Charges sociales (salaire 60k brut) | ~45% | 27 000€ |
| Salaire net gérant | | 36 000€ |
| Expert-comptable | | 2 400€ |
| Assurance RC Pro | | 600€ |
| Outils dev + divers | | 1 200€ |
| **TOTAL CHARGES (hors salaire)** | | **64 880€** |

| | |
|---|---|
| **CA - Charges (hors salaire)** | **131 186€** |
| **Salaire net gérant** | **36 000€** (3 000€/mois) |
| **Trésorerie restante (investissement/embauche)** | **95 186€** |

### Scénario An 3 : Multi-académies

| REVENUS | Détail | Montant |
|---------|--------|---------|
| 3 rectorats (10 000 élèves, 1,90€) | 10 000 × 1,90€ × 10 | 190 000€ |
| 30 écoles individuelles (4000 élèves) | 4000 × 4,90€ × 10 | 196 000€ |
| 500 parents (mixte) | estimé | 40 000€ |
| **TOTAL CA** | | **426 000€** |

| CHARGES | Détail | Montant |
|---------|--------|---------|
| Infrastructure | 200€ × 12 | 2 400€ |
| IS | ~25% sur bénéfice | ~75 000€ |
| Salaire gérant (5k net/mois) | | 60 000€ |
| 1 développeur (embauche) | 35k brut/an | 50 000€ (chargé) |
| 1 commercial/support | 30k brut/an | 43 000€ (chargé) |
| Comptable + juridique | | 5 000€ |
| Marketing | | 10 000€ |
| Divers | | 5 000€ |
| **TOTAL CHARGES** | | **250 400€** |

| | |
|---|---|
| **Résultat net après IS et salaires** | **~175 600€** |
| **Trésorerie disponible** | **~100 600€** |

---

## 6. RISQUES ET SOLUTIONS

### 🔴 Risque 1 : Bugs en production avec beaucoup d'élèves

| Problème | Probabilité | Impact | Solution | Coût |
|----------|------------|--------|----------|------|
| Serveur Render plante | Moyenne | Élevé | Upgrade plan + auto-restart | $18/mois |
| Socket.IO déconnexions | Élevée | Moyen | Reconnexion automatique robuste | $0 (code) |
| Supabase timeout | Faible | Moyen | Connection pooling + Pro plan | $25/mois |
| Perte de matchs en cours | Moyenne | Élevé | Recovery DB (déjà implémenté) | $0 (fait) |

**Recommandation :** Avant de signer le 1er contrat école, faire un **test de charge** avec 100 connexions simultanées. On peut simuler ça avec un script.

### 🟡 Risque 2 : Le rectorat dit "trop cher"

| Stratégie | Détail |
|-----------|--------|
| **Pilote gratuit** | Offrir 1 mois gratuit à 2-3 classes pour prouver la valeur |
| **Étude d'impact** | Mesurer avant/après (scores, engagement, temps d'apprentissage) |
| **Comparaison** | Montrer que 2,90€/mois < 1 cours particulier, < 1 cahier d'exercices |
| **Négociation** | Accepter 1,90€ pour 5000+ mais avec engagement 2 ans |

### 🟡 Risque 3 : Apple/Google rejettent l'app

| Problème | Solution |
|----------|---------|
| In-app purchase obligatoire | Utiliser RevenueCat correctement (déjà prévu) |
| Pas de lien web pour éviter commission | Apple interdit ça — il FAUT passer par leur système |
| Contenu éducatif pour enfants | Respecter COPPA/RGPD, pas de tracking, pas de pub |

### 🟢 Risque 4 : Dépassement seuil micro-entreprise

Ce n'est pas un risque, c'est une bonne nouvelle ! Passer en SASU quand CA > 77 700€. Prévoir la transition dès An 1 avec un expert-comptable.

---

## 7. PLAN D'ACTION RECOMMANDÉ

### Phase 1 : Maintenant → 3 mois (Stabilisation MVP)

- [ ] Corriger les bugs Socket.IO (reconnexion robuste)
- [ ] Test de charge 100 connexions simultanées
- [ ] Passer Render en plan Starter ($7/mois)
- [ ] Créer grille tarifaire officielle (page pricing du site)
- [ ] Configurer Stripe avec les vrais prix (9,90€ / 5,90€ / annuel)
- [ ] Préparer démo rectorat avec données réelles

### Phase 2 : 3-6 mois (Premiers contrats)

- [ ] Signer 3-5 écoles pilotes (800 élèves)
- [ ] Déployer le workflow CSV d'onboarding dans l'admin
- [ ] Lancer l'app Android (Play Store + RevenueCat)
- [ ] Ouvrir micro-entreprise (si pas déjà fait)
- [ ] Mesurer impact pédagogique (pour argumentaire rectorat)

### Phase 3 : 6-12 mois (Croissance)

- [ ] Proposer au rectorat Guadeloupe (fort de l'expérience pilote)
- [ ] Upgrader Supabase Pro si nécessaire
- [ ] Lancer app iOS
- [ ] Embaucher 1er salarié (dev ou commercial)
- [ ] Passage SASU si CA > 60k€

---

## RÉSUMÉ EXÉCUTIF

| Question | Réponse |
|----------|---------|
| **Le jeu peut-il supporter 25 000 élèves ?** | Oui, avec upgrade Render + Supabase (~140€/mois). Pas tous en même temps — pic réaliste = ~1 250 simultanés. |
| **Ta tarification est-elle viable ?** | Oui. Même au palier le plus bas (1,90€), tu es massivement rentable grâce à des coûts infra < 0,01€/élève. |
| **Combien de charges/impôts ?** | ~23% en micro-entreprise (< 77 700€ CA), ~30% en SASU au-delà. DOM-TOM peut réduire à ~15%. |
| **Peux-tu payer du personnel ?** | Dès ~100 000€ de CA (An 2), tu peux te verser 3 000€/mois net + embaucher 1 personne. |
| **Quel est le risque #1 ?** | Les bugs en production. Priorité absolue : stabiliser Socket.IO et tester en charge AVANT de vendre. |
| **Quand es-tu rentable ?** | Dès le 1er mois. 8€/mois d'infra = rentable dès 2 élèves payants. |

---

**Ce document est la référence stratégique de Crazy Chrono. Le mettre à jour à chaque évolution tarifaire ou technique.**

*Dernière mise à jour : 18 février 2026*
