const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const {
  authenticateToken,
  requireAdmin,
  requireStudent,
} = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authenticateToken);

router.get('/admin', requireAdmin, dashboardController.getAdminDashboard);
router.get('/student', requireStudent, dashboardController.getStudentDashboard);

module.exports = router;
