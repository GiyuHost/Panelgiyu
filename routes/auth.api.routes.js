const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.post('/register-admin', authController.registerAdmin);
router.post('/login-admin', authController.loginAdmin);
router.get('/me', authMiddleware.isAdmin, authController.getMe);

module.exports = router;