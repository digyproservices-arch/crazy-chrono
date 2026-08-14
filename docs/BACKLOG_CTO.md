# Backlog CTO — bugs identifiés hors périmètre de la mission en cours

Ce fichier ne contient que des entrées de suivi. Aucun correctif n'y est apporté.

## BUG-SOLO-RESPONSIVE-001 — zones satellites hors cadre en plateau portrait plein écran

**Découvert** : test navigateur local du Solo (CTO-002), sur `fix/cto-002-payment-access-security`.
**Statut** : CORRIGÉ (CTO-008, branche `fix/cto-008-solo-responsive`)
**Gravité provisoire CTO** : P0 CANDIDAT AVANT COMMERCIALISATION

**Résolution CTO-008** : reproduit sur `main` (plateau rectangulaire dès que la colonne du plateau est plus étroite que haute : tablette portrait, tablette paysage 1080x810, desktop 1024x768). Le plateau est désormais dimensionné en carré à partir de la place réellement disponible, et la tablette portrait empile plateau + colonne d'infos. Non-régression : `npm run test:responsive` (12 breakpoints).

**Symptôme** : en plateau portrait plein écran, certaines zones satellites gauche/droite sortent du cadre visible ou sont masquées par la barre latérale. Quand l'unique paire valide d'une manche implique une de ces zones, la manche devient non validable au clic.

**Observation** : constaté aux manches 2 et 3 d'une session Solo locale. Aucun fichier de rendu du plateau n'est modifié par CTO-002 : le défaut est considéré comme préexistant, mais l'antériorité n'a pas été prouvée par bissection.

**À faire lors de la mission dédiée** :
1. reproduire sur la liste des breakpoints et orientations officiellement supportés (mobile portrait/paysage, tablette, desktop) ;
2. déterminer s'il s'agit d'un débordement du conteneur SVG ou d'un recouvrement par la barre latérale ;
3. vérifier par bissection si le défaut existe sur `main` ;
4. corriger le rendu et ajouter un test de non-régression sur la visibilité de toutes les zones cliquables.

**Interdit dans CTO-002** : aucun fichier de rendu ne doit être touché pour ce bug.
