const express = require('express');
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { validateLoginBody, validateRegisterBody } = require('../middleware/validateRequest');

const router = express.Router();

router.post('/register', validateRegisterBody, authController.register);
router.post('/signup', validateRegisterBody, authController.register);
router.post('/login', validateLoginBody, authController.login);
router.get('/me', authenticateToken, authController.getMe);
router.post('/logout', authController.logout);

module.exports = router;
