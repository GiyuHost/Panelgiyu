const express = require('express');
const router = express.Router();
const pterodactylController = require('../controllers/pterodactyl.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.post('/provision-server', authMiddleware.isAdmin, pterodactylController.provisionPterodactylServer);

module.exports = router;