// ==========================================
// INPUT VALIDATION MIDDLEWARE
// Uses express-validator for request sanitization & validation
// ==========================================

const { body, param, query, validationResult } = require('express-validator');

// Generic handler: returns 400 with errors if validation fails
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      ok: false,
      success: false,
      error: 'validation_error',
      details: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
}

// ==========================================
// VALIDATION RULES FOR SPECIFIC ENDPOINTS
// ==========================================

// POST /api/auth/student-login
const validateStudentLogin = [
  body('code')
    .trim()
    .notEmpty().withMessage('Code d\'accès requis')
    .isLength({ min: 5, max: 20 }).withMessage('Code entre 5 et 20 caractères')
    .matches(/^[A-Za-z0-9\-_]+$/).withMessage('Code invalide (lettres, chiffres, tirets uniquement)'),
  handleValidation
];

// POST /api/tournament/groups
const validateCreateGroup = [
  body('tournamentId').trim().notEmpty().withMessage('tournamentId requis'),
  body('classId').trim().notEmpty().withMessage('classId requis'),
  body('name').trim().notEmpty().withMessage('Nom du groupe requis')
    .isLength({ max: 100 }).withMessage('Nom trop long (max 100)'),
  body('studentIds')
    .isArray({ min: 2, max: 4 }).withMessage('Entre 2 et 4 élèves requis'),
  body('studentIds.*').trim().notEmpty().withMessage('ID élève invalide'),
  handleValidation
];

// POST /api/tournament/matches
const validateCreateMatch = [
  body('tournamentId').trim().notEmpty().withMessage('tournamentId requis'),
  body('groupId').trim().notEmpty().withMessage('groupId requis'),
  body('config').optional().isObject().withMessage('config doit être un objet'),
  handleValidation
];

// POST /api/training/matches
const validateCreateTrainingMatch = [
  body('studentIds')
    .isArray({ min: 1 }).withMessage('Au moins 1 élève requis'),
  body('studentIds.*').trim().notEmpty().withMessage('ID élève invalide'),
  body('config').optional().isObject().withMessage('config doit être un objet'),
  handleValidation
];

// POST /api/training/sessions
const validateTrainingSession = [
  body('matchId').trim().notEmpty().withMessage('matchId requis'),
  body('results')
    .isArray({ min: 1 }).withMessage('Au moins 1 résultat requis'),
  body('results.*.studentId').trim().notEmpty().withMessage('studentId requis dans chaque résultat'),
  body('results.*.score').isInt({ min: 0 }).withMessage('Score doit être >= 0'),
  handleValidation
];

// POST /api/tournament/cleanup-old-matches
const validateCleanup = [
  body('studentId').trim().notEmpty().withMessage('studentId requis'),
  handleValidation
];

// PATCH /api/tournament/groups/:id
const validateUpdateGroup = [
  param('id').trim().notEmpty().withMessage('ID groupe requis'),
  handleValidation
];

// Param-based validators (reusable)
const validateParamId = [
  param('id').trim().notEmpty().withMessage('ID requis'),
  handleValidation
];

const validateParamClassId = [
  param('classId').trim().notEmpty().withMessage('classId requis'),
  handleValidation
];

const validateParamStudentId = [
  param('studentId').trim().notEmpty().withMessage('studentId requis'),
  handleValidation
];

module.exports = {
  handleValidation,
  validateStudentLogin,
  validateCreateGroup,
  validateCreateMatch,
  validateCreateTrainingMatch,
  validateTrainingSession,
  validateCleanup,
  validateUpdateGroup,
  validateParamId,
  validateParamClassId,
  validateParamStudentId
};
