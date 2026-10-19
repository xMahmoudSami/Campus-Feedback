const express = require('express');
const healthController = require('../controllers/healthController');

const router = express.Router();

router.get('/', healthController.getLiveness);
router.get('/db', healthController.getDatabaseHealth);

module.exports = router;
