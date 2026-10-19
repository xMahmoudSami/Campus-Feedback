const express = require('express');
const responseController = require('../controllers/responseController');
const { authenticateToken, requireStudent } = require('../middleware/authMiddleware');

const router = express.Router();

// Student-specific response queries
router.get('/mine', authenticateToken, requireStudent, responseController.getMyResponses);

module.exports = router;
