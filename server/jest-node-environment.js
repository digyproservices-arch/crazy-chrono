// =============================================
// Environnement de test Jest pour les suites serveur
//
// Jest 27 (jest-environment-node) crée un contexte VM qui n'expose pas les
// API Web natives de Node 18+ (fetch, Headers, Request, Response, FormData…).
// @supabase/supabase-js v2 s'appuie sur ces globales : sans elles, tout test
// qui instancie un client Supabase échoue avec « ReferenceError: Headers is
// not defined ».
//
// On réinjecte donc, et uniquement si elles manquent, les globales déjà
// fournies par le runtime Node hôte. Aucun comportement n'est simulé : si une
// API est absente de Node, elle reste absente et le test échoue réellement.
// =============================================

const NodeEnvironment = require('jest-environment-node');

// Globales standard de Node >= 18 attendues par les dépendances HTTP modernes.
const WEB_GLOBALS = [
  'fetch',
  'Headers',
  'Request',
  'Response',
  'FormData',
  'Blob',
  'File',
  'ReadableStream',
  'WritableStream',
  'TransformStream',
  'structuredClone',
  'crypto',
];

class ServerTestEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);

    for (const name of WEB_GLOBALS) {
      if (typeof this.global[name] === 'undefined' && typeof globalThis[name] !== 'undefined') {
        this.global[name] = globalThis[name];
      }
    }
  }
}

module.exports = ServerTestEnvironment;
