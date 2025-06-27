const express = require('express');
const router = express.Router();
const vpsController = require('../controllers/vps.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.post('/provision', authMiddleware.isAdmin, vpsController.provisionVps);

module.exports = router;