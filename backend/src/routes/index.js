const express = require('express');
const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');
const surveyRoutes = require('./surveyRoutes');
const responseRoutes = require('./responseRoutes');
const feedbackRoutes = require('./feedbackRoutes');
const dashboardRoutes = require('./dashboardRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/surveys', surveyRoutes);
router.use('/responses', responseRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/dashboard', dashboardRoutes);

module.exports = router;
