# 🎯 Installation Sentry - TERMINÉE ✅

## ✅ Ce qui a été fait

1. **Package installé** : `@sentry/react`
2. **Configuration créée** : `src/sentry.js`
3. **Intégration** : `src/index.js` modifié

## 📝 Prochaines étapes (5 minutes)

### Étape 1 : Créer un compte Sentry (GRATUIT)

1. Allez sur https://sentry.io/signup/
2. Choisissez "Sign up with GitHub" (plus rapide)
3. Sélectionnez le plan **"Developer"** (gratuit, 5k erreurs/mois)

### Étape 2 : Créer un projet

1. Cliquez sur "Create Project"
2. Sélectionnez **"React"** comme plateforme
3. Nommez-le "crazy-chrono"
4. Cliquez sur "Create Project"

### Étape 3 : Copier votre DSN

Vous verrez une page avec un code comme :
```
Sentry.init({
  dsn: "https://abc123...@o123.ingest.sentry.io/456",
  ...
});
```

**Copiez uniquement la valeur du DSN** (la longue URL entre guillemets)

### Étape 4 : Configuration locale (pour tester)

Créez un fichier `.env.local` à la racine du projet :

```bash
# Dans le terminal
echo REACT_APP_SENTRY_DSN=https://votre-dsn-ici > .env.local
echo REACT_APP_SENTRY_ENVIRONMENT=development >> .env.local
```

Ou créez manuellement le fichier `.env.local` avec :
```
REACT_APP_SENTRY_DSN=https://abc123...@o123.ingest.sentry.io/456
REACT_APP_SENTRY_ENVIRONMENT=development
```

### Étape 5 : Tester en local

```bash
npm start
```

Ouvrez la console, vous devriez voir :
```
[Sentry] Initialisé avec succès
```

Pour tester la capture d'erreur, ouvrez la console du navigateur et tapez :
```javascript
throw new Error("Test Sentry");
```

Allez sur Sentry.io, vous verrez l'erreur apparaître ! 🎉

### Étape 6 : Configuration production (Vercel)

1. Allez sur https://vercel.com/digyproservices-archs/projects
2. Sélectionnez votre projet "crazy-chrono"
3. Allez dans **Settings** > **Environment Variables**
4. Ajoutez :
   - **Name** : `REACT_APP_SENTRY_DSN`
   - **Value** : Votre DSN
   - **Environment** : Production ✅
   - Cliquez "Save"
5. Ajoutez :
   - **Name** : `REACT_APP_SENTRY_ENVIRONMENT`
   - **Value** : `production`
   - **Environment** : Production ✅
   - Cliquez "Save"

### Étape 7 : Redéployer

Vercel redéploiera automatiquement. Sinon :
```bash
git add .
git commit -m "feat: ajouter Sentry monitoring"
git push
```

## 🎉 C'est terminé !

Toutes les erreurs de production seront automatiquement capturées et envoyées à Sentry.

## 📊 Utilisation de Sentry

### Voir les erreurs
- Allez sur https://sentry.io
- Cliquez sur votre projet "crazy-chrono"
- Vous verrez toutes les erreurs en temps réel

### Informations capturées
- Type d'erreur
- Stack trace complète
- Navigateur et OS de l'utilisateur
- URL où l'erreur s'est produite
- Session replay (vidéo de ce qui s'est passé)

### Quota gratuit
- 5,000 erreurs/mois
- 50 session replays/mois
- Suffisant pour 1,000-5,000 utilisateurs

## 🆘 Besoin d'aide ?

Si vous voyez `[Sentry] Non configuré - monitoring désactivé` dans la console, c'est normal si vous n'avez pas encore ajouté le DSN dans `.env.local`.

Une fois le DSN ajouté, redémarrez `npm start` et vous devriez voir `[Sentry] Initialisé avec succès`.
