
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const uploadMiddleware = require('../middlewares/upload.middleware');

router.post(
    '/initiate', 
    uploadMiddleware.single('paymentProofFile'), 
    orderController.initiateOrder 
);

router.post(
    '/finalize', 
    uploadMiddleware.single('checkoutPaymentProofFile'), 
    orderController.finalizeOrder
);

router.post(
    '/:orderId/check_orkut_payment',
    authMiddleware.isAuthenticated, 
    orderController.checkOrkutPaymentAndUpdateOrder
);

router.get(
    '/', 
    authMiddleware.isAdmin, 
    orderController.getAllOrders
);

router.get(
    '/:id', 
    authMiddleware.isAdmin, 
    orderController.getOrderById
);

router.patch(
    '/:id/status', 
    authMiddleware.isAdmin, 
    orderController.updateOrderStatus
);

module.exports = router;