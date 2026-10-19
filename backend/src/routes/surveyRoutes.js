const express = require('express');
const surveyController = require('../controllers/surveyController');
const responseController = require('../controllers/responseController');
const {
  authenticateToken,
  requireAdmin,
  requireStudent,
} = require('../middleware/authMiddleware');
const {
  validateIntegerParam,
  validateSurveyCreate,
  validateSurveyStatus,
  validateResponseSubmission,
} = require('../middleware/validateRequest');

const router = express.Router();

// All survey routes require authentication
router.use(authenticateToken);

// --- Survey Management Endpoints ---
router.get('/', surveyController.getSurveys);
router.get('/:id', validateIntegerParam('id'), surveyController.getSurveyById);
router.post('/', requireAdmin, validateSurveyCreate, surveyController.createSurvey);
router.patch('/:id', requireAdmin, validateIntegerParam('id'), surveyController.updateSurvey);
router.patch('/:id/status', requireAdmin, validateIntegerParam('id'), validateSurveyStatus, surveyController.updateSurveyStatus);
router.delete('/:id', requireAdmin, validateIntegerParam('id'), surveyController.deleteSurvey);

// --- Survey Response Sub-endpoints (/api/surveys/:id/responses) ---
router.post(
  '/:id/responses',
  requireStudent,
  validateIntegerParam('id'),
  validateResponseSubmission,
  responseController.submitResponse
);

router.get(
  '/:id/responses',
  requireAdmin,
  validateIntegerParam('id'),
  responseController.getSurveyResponses
);

module.exports = router;
