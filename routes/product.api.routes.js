const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const uploadMiddleware = require('../middlewares/upload.middleware');

router.post('/', authMiddleware.isAdmin, uploadMiddleware.single('productImage'), productController.createProduct);
router.get('/', productController.getAllProducts);
router.get('/:id', productController.getProductById);
router.put('/:id', authMiddleware.isAdmin, uploadMiddleware.single('productImage'), productController.updateProduct);
router.delete('/:id', authMiddleware.isAdmin, productController.deleteProduct);

module.exports = router;