# ⚠️ ACTION REQUISE — node_modules dans OneDrive

## Problème détecté
Le dossier `node_modules` (~70 000 fichiers, dépendances NPM) est synchronisé
dans OneDrive. Cela ralentit massivement votre PC et votre synchronisation cloud.

## Solution recommandée : Déplacer le projet hors OneDrive

### Option A — La meilleure (recommandée)
Créez un dossier `C:\Dev\` hors OneDrive et travaillez depuis là :
```
C:\Dev\CRAZY-CHRONO\   ← votre projet ici (hors OneDrive)
```
Étapes :
1. Dans Windsurf, fermez le projet
2. Copiez le dossier CRAZY CHRONO vers C:\Dev\
3. Rouvrez dans Windsurf depuis C:\Dev\CRAZY-CHRONO\
4. Supprimez l'ancien dossier dans OneDrive
5. Poussez votre code sur GitHub pour la sauvegarde cloud

### Option B — Garder dans OneDrive mais exclure node_modules
Exécutez dans PowerShell (en admin) :
```powershell
cd "$env:USERPROFILE\OneDrive\Documents\DIGIKAZ\Windsurf\CRAZY CHRONO"
# Exclure node_modules de la sync OneDrive
attrib +P node_modules /S /D
```

## Votre .gitignore actuel
Vérifiez qu'il contient bien ces lignes (critiques) :
```
node_modules/
.env
.env.local
.env.production
build/
dist/
e2e-report/
```

## Note importante
Votre CODE SOURCE est 100% intact et non modifié.
Les dépendances se régénèrent avec : `npm install`
