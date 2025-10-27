import * as Sentry from "@sentry/react";

/**
 * Initialise Sentry pour le monitoring d'erreurs
 * Plan gratuit: 5,000 événements/mois
 */
export const initSentry = () => {
  const dsn = process.env.REACT_APP_SENTRY_DSN;
  
  // Ne pas initialiser si pas de DSN configuré
  if (!dsn) {
    console.log('[Sentry] Non configuré - monitoring désactivé');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.REACT_APP_SENTRY_ENVIRONMENT || 'development',
    
    // Taux d'échantillonnage des traces de performance
    // 0.1 = 10% des transactions (économise le quota gratuit)
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Intégrations - Version simplifiée sans BrowserTracing
    integrations: [
      Sentry.replayIntegration({
        // Session replay pour reproduire les bugs
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    
    // Replay seulement sur erreurs (économise le quota)
    replaysSessionSampleRate: 0.0, // 0% des sessions normales
    replaysOnErrorSampleRate: 1.0, // 100% des sessions avec erreur
    
    // Filtrer les erreurs non pertinentes
    beforeSend(event, hint) {
      // Ignorer les erreurs de réseau temporaires
      if (event.exception?.values?.[0]?.type === 'NetworkError') {
        return null;
      }
      
      // Ignorer les erreurs de chargement de ressources
      if (event.message?.includes('ChunkLoadError')) {
        return null;
      }
      
      return event;
    },
  });

  console.log('[Sentry] Initialisé avec succès');
};

/**
 * Capturer une erreur personnalisée
 */
export const captureError = (error, context = {}) => {
  Sentry.captureException(error, {
    extra: context,
  });
};

/**
 * Capturer un message d'information
 */
export const captureMessage = (message, level = 'info') => {
  Sentry.captureMessage(message, level);
};

/**
 * Ajouter du contexte utilisateur
 */
export const setUserContext = (user) => {
  Sentry.setUser(user);
};
