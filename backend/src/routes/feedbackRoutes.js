const express = require('express');
const feedbackController = require('../controllers/feedbackController');
const {
  authenticateToken,
  requireStudent,
  requireAdmin,
} = require('../middleware/authMiddleware');
const { validateFeedbackCreate } = require('../middleware/validateRequest');

const router = express.Router();

// All feedback routes require authentication
router.use(authenticateToken);

router.post('/', requireStudent, validateFeedbackCreate, feedbackController.createFeedback);
router.get('/mine', requireStudent, feedbackController.getMyFeedback);
router.get('/', requireAdmin, feedbackController.getAllFeedback);

module.exports = router;
