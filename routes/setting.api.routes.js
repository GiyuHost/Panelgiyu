const express = require('express');
const router = express.Router();
const settingController = require('../controllers/setting.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const uploadMiddleware = require('../middlewares/upload.middleware');

router.get('/api-tokens', authMiddleware.isAdmin, settingController.getAllApiTokens);
router.put('/api-tokens/:provider', authMiddleware.isAdmin, settingController.updateApiToken);
router.delete('/api-tokens/:provider', authMiddleware.isAdmin, settingController.deleteApiToken);

router.get('/domain-settings', authMiddleware.isAdmin, settingController.getAllDomainSettings);
router.put('/domain-settings/:tld', authMiddleware.isAdmin, settingController.updateDomainSetting);
router.delete('/domain-settings/:tld', authMiddleware.isAdmin, settingController.deleteDomainSetting);

router.get('/payment-gateways', authMiddleware.isAdmin, settingController.getAllPaymentGateways);
router.put('/payment-gateways/:methodCode', authMiddleware.isAdmin, uploadMiddleware.single('gatewayImage'), settingController.updatePaymentGateway);
router.delete('/payment-gateways/:methodCode', authMiddleware.isAdmin, settingController.deletePaymentGateway);

module.exports = router;