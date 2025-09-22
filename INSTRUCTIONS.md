# Instructions pour ajouter vos images de carte

Pour que l'application fonctionne correctement, vous devez ajouter vos propres images de carte :

## 1. Préparation des images

- Vous avez besoin de deux images :
  - `carte-vide.png` : L'image de la carte sans texte (celle sur laquelle vous voulez ajouter du texte)
  - `carte-remplie.png` : Un exemple de la carte avec du texte (facultatif, pour référence)

## 2. Placement des images

### Option 1 : Dans le dossier public (recommandé)

1. Placez vos images dans le dossier `public/images/`
2. Assurez-vous qu'elles sont nommées exactement `carte-vide.png` et `carte-remplie.png`

### Option 2 : Dans le dossier src

1. Placez vos images dans le dossier `src/images/`
2. Modifiez le fichier `src/App.js` pour importer correctement vos images

## 3. Adaptation des dimensions

Si vos images ont des dimensions différentes de celles prévues dans l'application, vous devrez peut-être ajuster les styles CSS dans `src/styles/Carte.css` pour que le texte soit correctement positionné.

## 4. Lancement de l'application

Une fois les images ajoutées, lancez l'application avec :

```
npm start
```

Vous devriez voir votre carte vide avec la possibilité d'ajouter du texte aux différentes positions.
