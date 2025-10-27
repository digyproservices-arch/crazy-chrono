# Configuration Sentry (GRATUIT)

## Plan gratuit : 5,000 erreurs/mois + 50 replays

### 1. Créer un compte
- Allez sur https://sentry.io/signup/
- Choisissez "Developer" (gratuit)
- Créez un projet "React"

### 2. Installer
```bash
npm install @sentry/react
```

### 3. Copier votre DSN
Dans Sentry > Settings > Projects > [Votre projet] > Client Keys (DSN)

### 4. Ajouter dans Vercel
Vercel Dashboard > Settings > Environment Variables:
- `REACT_APP_SENTRY_DSN` = votre DSN
- `REACT_APP_SENTRY_ENVIRONMENT` = production

### 5. Initialiser dans src/index.js
```javascript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  environment: process.env.REACT_APP_SENTRY_ENVIRONMENT || 'development',
  tracesSampleRate: 0.1,
});
```

C'est tout ! Les erreurs seront automatiquement capturées.
