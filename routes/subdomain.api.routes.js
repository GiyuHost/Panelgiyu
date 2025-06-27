const express = require('express');
const router = express.Router();
const subdomainController = require('../controllers/subdomain.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.post('/provision', authMiddleware.isAdmin, subdomainController.provisionSubdomain);

module.exports = router;