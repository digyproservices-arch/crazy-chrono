# Éditeur de Carte

Cette application React permet d'ajouter du texte sur une image de carte vide. L'utilisateur peut modifier le texte à différentes positions sur la carte.

## Installation

1. Clonez ce dépôt
2. Installez les dépendances avec `npm install`
3. Lancez l'application avec `npm start`

## Configuration des images

Pour utiliser vos propres images de carte, vous devez ajouter les fichiers suivants :

1. Placez votre image de carte vide dans le dossier `public/images/` et nommez-la `carte-vide.png`
2. Si vous avez un exemple de carte remplie, placez-la également dans le dossier `public/images/` et nommez-la `carte-remplie.png`

## Utilisation

L'application affiche une interface avec :

- Une prévisualisation de la carte avec le texte positionné
- Des champs de texte pour modifier le contenu à chaque position

Modifiez le texte dans les champs pour voir les changements en temps réel sur la carte.

## Structure du projet

- `src/components/Carte.js` : Composant principal pour l'affichage et l'édition de la carte
- `src/styles/Carte.css` : Styles pour le composant Carte
- `src/App.js` : Point d'entrée de l'application
- `public/images/` : Dossier contenant les images de carte

## Personnalisation

Vous pouvez personnaliser l'apparence et le comportement de l'application en modifiant les fichiers CSS et les composants React.

## Scripts disponibles

### `npm start`

Lance l'application en mode développement.
Ouvrez [http://localhost:3000](http://localhost:3000) pour la voir dans votre navigateur.

### `npm run build`

Compile l'application pour la production dans le dossier `build`.

## Licence

Ce projet est sous licence MIT.
