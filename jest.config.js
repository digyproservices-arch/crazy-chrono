// =============================================
// Configuration Jest — suites serveur uniquement
//
// Les tests frontend passent par `react-scripts test` (config CRA interne) ;
// ce fichier ne concerne que `npm run test:server` et le workflow CI
// « Tests serveur (parité + persistance) ».
// =============================================

module.exports = {
  testEnvironment: '<rootDir>/server/jest-node-environment.js',
  testMatch: ['<rootDir>/server/__tests__/**/*.test.js'],
};
