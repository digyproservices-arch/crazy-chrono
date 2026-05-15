# Schéma des zones — Crazy Chrono

> Phase 4 du plan d'optimisation
> Ce document décrit la structure exacte de chaque zone générée par `serverZoneGenerator.js`

---

## Structure commune (tous types)

| Champ | Type | Obligatoire | Description |
|-------|------|:-----------:|-------------|
| `id` | number | ✅ | Identifiant unique de la zone (timestamp) |
| `type` | string | ✅ | `"texte"`, `"image"`, `"calcul"` ou `"chiffre"` |
| `content` | string | ✅ | Contenu principal affiché (voir détails par type) |
| `label` | string | ✅ | Texte secondaire / nom lisible |
| `pairId` | string | ❌ | Présent uniquement sur les 2 zones de la bonne paire |

---

## Détails par type

### Type `texte`
> Utilisé pour : noms de plantes, animaux, lieux, etc.

| Champ | Contenu | Exemple |
|-------|---------|---------|
| `content` | Le mot/nom affiché | `"Cannelle"` |
| `label` | Identique à `content` | `"Cannelle"` |

### Type `image`
> Utilisé pour : photos/illustrations associées à un texte

| Champ | Contenu | Exemple |
|-------|---------|---------|
| `content` | Chemin ou URL de l'image | `"images/cannelle.jpeg"` |
| `label` | Nom de l'élément associé (pour accessibilité) | `"Cannelle"` |

### Type `calcul`
> Utilisé pour : expressions mathématiques (additions, multiplications, etc.)

| Champ | Contenu | Exemple |
|-------|---------|---------|
| `content` | **L'expression mathématique** | `"2 × 3"` |
| `label` | **Le résultat (nombre)** | `"6"` |

⚠️ **Règle critique** : pour les zones calcul, `content` = l'expression, `label` = le résultat.
C'est l'inverse de la priorité habituelle. Le client utilise `textForCalc()` qui priorise `content` sur `label`.

### Type `chiffre`
> Utilisé pour : le résultat numérique associé à un calcul

| Champ | Contenu | Exemple |
|-------|---------|---------|
| `content` | Le nombre/résultat | `"6"` |
| `label` | Identique à `content` | `"6"` |

---

## Champs optionnels (calcul/chiffre)

| Champ | Type | Description |
|-------|------|-------------|
| `angle` | number | Rotation CSS (depuis `math_positions.json`) |
| `mathOffset` | object | Décalage position `{ top, left }` (depuis `math_positions.json`) |

---

## Paire correcte (`pairId`)

Seules **2 zones sur 16** ont un `pairId`. Format :
- Paire texte↔image : `assoc-img-{imageId}-txt-{texteId}`
- Paire calcul↔chiffre : `assoc-calc-{calculId}-num-{chiffreId}`

Les 14 autres zones sont des **distracteurs** (pas de `pairId`).

---

## `goodPairIds` (retourné par `generateRoundZones`)

```json
{
  "pairId": "assoc-img-i123-txt-t1",
  "pairType": "TI",
  "texteId": "t1",
  "imageId": "i123",
  "theme": "botanique",
  "level": "CP",
  "contentA": "Cannelle",
  "contentB": "images/cannelle.jpeg"
}
```

| Champ | Paire TI | Paire CC |
|-------|----------|----------|
| `pairType` | `"TI"` | `"CC"` |
| `texteId` | ID du texte | — |
| `imageId` | ID de l'image | — |
| `calculId` | — | ID du calcul |
| `chiffreId` | — | ID du chiffre |
| `contentA` | Nom (texte) | Expression (calcul) |
| `contentB` | URL image | Résultat (chiffre) |

---

## Fonctions d'affichage côté client

| Fonction | Fichier | Usage |
|----------|---------|-------|
| `textFor(zone)` | `src/utils/pairDisplay.js` | Zones texte/image : priorise `label` > `content` |
| `textForCalc(zone)` | `src/utils/pairDisplay.js` | Zones calcul/chiffre : priorise `content` > `label` |

---

*Dernière mise à jour : Phase 4 — Mai 2026*
