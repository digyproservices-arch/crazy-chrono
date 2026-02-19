# 💰 GRILLE TARIFAIRE OFFICIELLE — CRAZY CHRONO

**Date :** 18 février 2026  
**Version :** 1.0  
**Statut :** Document de référence — à mettre à jour à chaque évolution tarifaire

---

## 1. PARTICULIERS (Abonnement mensuel)

### Web (Stripe) — app.crazy-chrono.com

| Formule | Prix/mois | Prix annuel | Économie | Stripe net |
|---------|----------|-------------|----------|------------|
| **Standard** | **9,90€/mois** | — | — | 9,50€ |
| **Solidaire** (faible revenu) | **5,90€/mois** | — | — | 5,56€ |
| **Annuel** | — | **89,90€/an** | 2 mois offerts | 88,30€ |

### Application mobile (Apple App Store / Google Play Store)

| Formule | Prix affiché | Commission (15%) | RevenueCat (~1%) | Net reçu |
|---------|-------------|-----------------|------------------|----------|
| **Standard mensuel** | **9,90€/mois** | -1,49€ | -0,10€ | **8,31€** |
| **Solidaire mensuel** | **5,90€/mois** | -0,89€ | -0,06€ | **4,95€** |
| **Annuel** | **89,90€/an** | -13,49€ | -0,90€ | **75,51€** |

> **Note :** Commission Apple/Google = 15% (programme Small Business, CA < $1M/an).  
> Au-delà de $1M/an de CA app, la commission passe à 30%.

---

## 2. INSTITUTIONS (Par élève, mensuel, 10 mois scolaires)

### Paiement : Virement bancaire / Bon de commande (0% commission)

| Palier | Prix/élève/mois | Prix/élève/an (×10) | Exemple | CA annuel |
|--------|----------------|---------------------|---------|-----------|
| **1-10 élèves** | **9,90€** | 99,00€ | 1 prof qui teste (10 élèves) | 990€ |
| **11-50 élèves** | **6,90€** | 69,00€ | 2 classes (50 élèves) | 3 450€ |
| **51-200 élèves** | **4,90€** | 49,00€ | 1 école (200 élèves) | 9 800€ |
| **201-1000 élèves** | **3,90€** | 39,00€ | 1 circonscription (1000 élèves) | 39 000€ |
| **1001-2000 élèves** | **2,90€** | 29,00€ | Grande circonscription (2000 élèves) | 58 000€ |
| **2000+ élèves** | **1,90€** | 19,00€ | Rectorat / Académie (5000+ élèves) | 95 000€+ |

### Conditions institutions

- **Année scolaire** = 10 mois facturés (septembre → juin)
- **Facturation** : en début d'année scolaire (1 facture annuelle) ou trimestrielle
- **Bon de commande** : accepté pour toutes les institutions publiques
- **Pilote gratuit** : 1 mois offert pour 2-3 classes (sur demande)
- **Engagement** : annuel, renouvelable tacitement
- **Le palier s'applique au TOTAL d'élèves** dans le contrat (pas par école)

### Exemples concrets

| Client | Élèves | Palier | Mensuel | **Facture annuelle** |
|--------|--------|--------|---------|---------------------|
| Prof M. Dupont (test) | 8 | 9,90€ | 79,20€ | **792€** |
| École Lamentin | 180 | 4,90€ | 882€ | **8 820€** |
| Circ. Pointe-à-Pitre | 800 | 3,90€ | 3 120€ | **31 200€** |
| Circ. Basse-Terre | 1 500 | 2,90€ | 4 350€ | **43 500€** |
| Rectorat Guadeloupe | 5 000 | 1,90€ | 9 500€ | **95 000€** |
| Rectorat Guadeloupe | 25 000 | 1,90€ | 47 500€ | **475 000€** |

---

## 3. CE QUI EST INCLUS DANS LA LICENCE

### Tous les plans incluent :

- ✅ Mode Solo (entraînement individuel, illimité)
- ✅ Mode Entraînement (sessions de classe, multijoueur temps réel)
- ✅ Toutes les thématiques (botanique, mathématiques, français, etc.)
- ✅ Tous les niveaux (CE1, CE2, CM1, CM2)
- ✅ Historique de performance et statistiques
- ✅ Mises à jour et nouveaux contenus

### Institutions uniquement :

- ✅ Dashboard professeur (suivi par élève)
- ✅ Dashboard admin (vue école / circonscription)
- ✅ Import CSV des élèves
- ✅ Gestion des licences en masse
- ✅ Support prioritaire par email

### Non inclus (gratuit pour tous) :

- 🆓 3 sessions gratuites/jour sans compte
- 🆓 Mode Solo sans limite de temps (sans multijoueur)

---

## 4. OFFRES SPÉCIALES

| Offre | Conditions | Réduction |
|-------|-----------|-----------|
| **Pilote école** | 1er mois, max 3 classes | **Gratuit** |
| **Engagement 2 ans** | Contrat institution 2 ans | **-10%** sur le prix annuel |
| **Parrainage école** | 1 école recommande une autre | **1 mois offert** à l'école qui parraine |
| **Pack rentrée** | Commande avant le 15 septembre | **-5%** |

---

## 5. PROCESSUS DE VENTE

### Particulier

```
1. Parent crée un compte gratuit (3 sessions/jour)
2. Parent va sur /pricing → Stripe Checkout
3. Paiement CB → licence active immédiatement
4. Renouvellement automatique mensuel ou annuel
```

### Institution

```
1. Contact initial (email, démo, salon éducation)
2. Devis personnalisé selon nombre d'élèves
3. Pilote gratuit 1 mois (optionnel)
4. Bon de commande signé
5. Réception CSV élèves → import dans le système
6. Activation des licences
7. Facture envoyée → paiement virement 30 jours
8. Renouvellement annuel
```

---

## 6. CONFIGURATION TECHNIQUE

### Stripe (web)

| Produit | Price ID | Mode |
|---------|----------|------|
| Standard mensuel 9,90€ | `price_standard_monthly` | Subscription |
| Solidaire mensuel 5,90€ | `price_solidaire_monthly` | Subscription |
| Annuel 89,90€ | `price_annual` | Subscription |

> **À configurer dans Stripe Dashboard** → Products → Create Product  
> **Env vars** : `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`

### RevenueCat (app mobile)

| Offering | Entitlement | Produits |
|----------|------------|---------|
| `default` | `pro` | `cc_monthly_990`, `cc_monthly_590`, `cc_annual_8990` |

> **À configurer dans RevenueCat Dashboard** → Project → Offerings  
> **Env var** : `REVENUECAT_WEBHOOK_SECRET`

---

## 7. TVA

| Client | TVA applicable |
|--------|---------------|
| Particulier France métro | 20% |
| Particulier DOM (Guadeloupe) | 8,5% (taux réduit DOM) |
| Institution publique France | 20% (récupérable par l'institution) |
| Institution DOM | 8,5% |

> **Micro-entreprise** : franchise en base de TVA si CA < 36 800€/an (pas de TVA facturée).  
> **Au-delà** : TVA à collecter et reverser.

---

*Dernière mise à jour : 18 février 2026*  
*Voir aussi : `DOCS/ETUDE_RENTABILITE_SCALABILITE.md` pour l'analyse financière complète*
