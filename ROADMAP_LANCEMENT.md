# ROADMAP LANCEMENT MONDIAL — Crazy Chrono

> **Dernière mise à jour** : 25 mai 2026
> **Objectif** : Lancer Crazy Chrono comme jeu éducatif mondial
> **Règle** : On ne passe à la phase suivante que quand TOUTES les cases de la phase en cours sont cochées.

---

## Où en sommes-nous aujourd'hui ?

| Élément | État |
|---------|------|
| Mode Solo | ✅ Stable, en production |
| Mode Salle Privée (MP) | ⚠️ 42 fixes sur staging, pas encore en production |
| Mode Grande Salle | ⚠️ Idem (fixes + persistance DB sur staging) |
| Mode Arena (tournoi) | ⚠️ Idem |
| Mode Training (prof/élèves) | ⚠️ Idem |
| PWA | ✅ Installable sur iOS/Android |
| Admin Dashboard | ✅ Onboarding écoles, gestion élèves |
| Sécurité | ✅ Helmet, rate limiting, CORS, auth JWT |
| Tests automatisés | ✅ 30 tests serveur |
| Monitoring | ✅ Rapport automatique, sTrace |
| Infrastructure | ⚠️ 1 seul serveur Render (free/starter) |

---

## PHASE A : Stabiliser la production (MAINTENANT)

> **Durée estimée : 1 session (aujourd'hui)**
> **Risque : faible — tout est déjà testé sur staging**

- [ ] **A.1** Tester mode solo sur staging
- [ ] **A.2** Tester mode Arena sur staging
- [ ] **A.3** Tester mode Training sur staging
- [ ] **A.4** Merger staging → main
- [ ] **A.5** Vérifier que le deploy Vercel (frontend) + Render (backend) fonctionne
- [ ] **A.6** Tester une partie rapide en production

**✅ GATE A : La production est stable avec tous les bug fixes.**

---

## PHASE B : Refactoring progressif (2-4 sessions)

> **Durée estimée : 2-4 sessions sur 2-3 semaines**
> **Pourquoi maintenant** : Si tu ajoutes des features sur 10 000 lignes, chaque ajout sera plus lent et plus risqué.
> **Règle : chaque extraction = 1 commit, 1 test, 1 merge.**

- [ ] **B.1** Extraire `useGameTimer` hook (timer logic, ~100 lignes) → tester solo + MP
- [ ] **B.2** Extraire overlays (résultat manche, tiebreaker, confetti) → composants séparés (~500 lignes)
- [ ] **B.3** Extraire socket handlers par mode (solo / MP / GS) → fichiers séparés (~2000 lignes)
- [ ] **B.4** Carte.js passe sous 6 000 lignes
- [ ] **B.5** server.js : extraire les handlers MP dans un module dédié (~1500 lignes)
- [ ] **B.6** Build OK + 30 tests OK + modes solo/MP/Arena/Training OK

**✅ GATE B : Le code est maintenable. Ajouter une feature prend des heures, pas des jours.**

---

## PHASE C : Scalabilité (2-3 sessions)

> **Durée estimée : 2-3 sessions**
> **Pourquoi** : Ton serveur Render actuel supporte ~50 joueurs simultanés max. Pour un jeu mondial, il faut 500-5000+.

- [ ] **C.1** Load test : mesurer combien de joueurs simultanés le serveur supporte (outil : Artillery ou k6)
- [ ] **C.2** Passer Render en plan payant (Pro ou Team) — ~$25/mois pour un serveur stable sans cold start
- [ ] **C.3** Configurer Redis pour les sessions Socket.IO (permet plusieurs serveurs si besoin)
- [ ] **C.4** Optimiser les events Socket.IO : réduire la taille des payloads (zones, scores)
- [ ] **C.5** Tester 200 connexions simultanées sans dégradation
- [ ] **C.6** Mettre en place un CDN pour les assets statiques (images cartes, SVG)

**✅ GATE C : Le serveur tient 200+ joueurs simultanés sans problème.**

---

## PHASE D : UX et Polish (3-5 sessions)

> **Durée estimée : 3-5 sessions**
> **Pourquoi** : Un jeu mondial doit être irréprochable visuellement et ergonomiquement. Les utilisateurs ne donnent pas de 2e chance.

- [ ] **D.1** Onboarding premier lancement : tutoriel interactif (3 écrans max)
- [ ] **D.2** Écran de chargement élégant (pas de flash blanc)
- [ ] **D.3** Animations fluides : transitions entre écrans, feedback tactile
- [ ] **D.4** Responsive parfait : tablette, téléphone, desktop
- [ ] **D.5** Accessibilité : contraste, taille des zones tactiles, mode daltonien
- [ ] **D.6** Internationalisation (i18n) : français + anglais minimum
- [ ] **D.7** Sons et musique : ambiance de jeu (optionnel mais fort impact)
- [ ] **D.8** Test UX avec 5 vrais utilisateurs (enfants + parents + profs) — recueillir feedback

**✅ GATE D : Un utilisateur qui découvre le jeu comprend comment jouer en 30 secondes.**

---

## PHASE E : Infrastructure production (2 sessions)

> **Durée estimée : 2 sessions**
> **Pourquoi** : En production mondiale, tu dois savoir quand quelque chose casse AVANT tes utilisateurs.

- [ ] **E.1** Error tracking : Sentry (gratuit jusqu'à 5K events/mois) — erreurs client + serveur
- [ ] **E.2** Uptime monitoring : UptimeRobot ou Better Stack (alertes si le serveur tombe)
- [ ] **E.3** Backup automatique Supabase (déjà inclus dans le plan gratuit, vérifier la config)
- [ ] **E.4** Logs structurés serveur (pas juste console.log — format JSON pour recherche)
- [ ] **E.5** Dashboard métriques : nombre de parties/jour, joueurs actifs, taux d'erreur
- [ ] **E.6** Domaine custom propre : crazy-chrono.com (déjà fait ?) + SSL + email contact

**✅ GATE E : Si le serveur plante à 3h du matin, tu reçois une alerte en 2 minutes.**

---

## PHASE F : Legal et RGPD (1-2 sessions)

> **Durée estimée : 1-2 sessions (partiellement fait)**
> **Pourquoi** : OBLIGATOIRE pour un jeu destiné aux enfants (RGPD + COPPA si international).

- [ ] **F.1** Politique de confidentialité à jour (mentions RGPD, données collectées, durée de conservation)
- [ ] **F.2** CGU (Conditions Générales d'Utilisation)
- [ ] **F.3** Consentement parental : mécanisme pour les moins de 16 ans (si applicable)
- [ ] **F.4** Droit à la suppression : bouton "Supprimer mon compte" fonctionnel
- [ ] **F.5** Conformité COPPA si marché US (enfants < 13 ans)
- [ ] **F.6** Validation par un juriste (recommandé, pas obligatoire au lancement)

**✅ GATE F : Tu es en conformité légale pour la France et l'UE minimum.**

---

## PHASE G : Beta publique (2-4 semaines)

> **Durée estimée : 2-4 semaines de test réel**
> **Pourquoi** : Tes tests perso ne suffisent pas. Il faut des vrais utilisateurs qui trouvent les vrais problèmes.

- [ ] **G.1** Inviter 20-50 beta testeurs (profs, parents, enfants) via un lien privé
- [ ] **G.2** Formulaire feedback simple (Google Forms ou Tally)
- [ ] **G.3** Monitorer les erreurs Sentry + les métriques pendant 2 semaines
- [ ] **G.4** Corriger les bugs critiques remontés
- [ ] **G.5** Atteindre : 0 crash en 7 jours consécutifs
- [ ] **G.6** NPS (Net Promoter Score) > 7/10 sur les beta testeurs

**✅ GATE G : 50 personnes ont joué pendant 2 semaines sans bug critique.**

---

## PHASE H : Lancement public 🚀

> **Quand : quand TOUTES les gates A→G sont cochées**
> **Estimation réaliste : 2-3 mois à partir d'aujourd'hui (été 2026)**

- [ ] **H.1** Page de lancement (landing page) avec vidéo démo
- [ ] **H.2** Présence App Store / Google Play (PWA ou wrapper TWA)
- [ ] **H.3** Réseaux sociaux : compte Instagram/TikTok avec contenu éducatif
- [ ] **H.4** Partenariats : 3-5 écoles pilotes
- [ ] **H.5** Communiqué de presse / blog post de lancement
- [ ] **H.6** Tarification activée : vérifier que le paiement fonctionne (Stripe ?)
- [ ] **H.7** Support utilisateur : email ou chat (Crisp, Intercom free tier)
- [ ] **H.8** **GO LIVE** 🎉

**✅ GATE H : Crazy Chrono est un produit public, payant, et utilisé par des vraies écoles.**

---

## Résumé des phases

| Phase | Quoi | Durée | Prérequis |
|-------|------|-------|-----------|
| **A** | Stabiliser production | 1 jour | — |
| **B** | Refactoring code | 2-3 semaines | Gate A |
| **C** | Scalabilité serveur | 1-2 semaines | Gate A |
| **D** | UX et Polish | 3-5 semaines | Gate A |
| **E** | Infrastructure prod | 1 semaine | Gate A |
| **F** | Legal / RGPD | 1 semaine | — (parallèle) |
| **G** | Beta publique | 2-4 semaines | Gates B+C+D+E+F |
| **H** | Lancement public | 1 semaine | Gate G |

> **B, C, D, E peuvent avancer en parallèle après la Gate A.**
> **F peut commencer dès maintenant (pas de code nécessaire).**
> **G ne commence que quand tout le reste est prêt.**

---

## Règles du mentor

1. **On ne saute pas de phase.** Chaque gate doit être cochée avant de passer à la suivante.
2. **On ne merge sur main que quand c'est testé.** Jamais de YOLO en production.
3. **On priorise ce qui rapporte le plus pour le moins d'effort.** Si une tâche prend 1h et débloque 10 choses, on la fait en premier.
4. **On mesure tout.** Pas de "je crois que ça marche" — on vérifie avec des données.
5. **Le mode solo est sacré.** C'est ce que 90% des utilisateurs utilisent. Ne jamais le casser.
