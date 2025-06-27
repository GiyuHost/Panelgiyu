// routes/view.routes.js (Pastikan seperti ini)
const express = require('express');
const router = express.Router();
const path = require('path');

// Mengasumsikan views/ adalah direktori di root proyek, sejajar dengan app.js
const publicViewsPath = path.join(__dirname, '..', 'views'); // Naik satu level dari routes/, lalu masuk ke views/

router.get('/', (req, res) => {
    res.sendFile(path.join(publicViewsPath, 'index.html'));
});

router.get('/checkout', (req, res) => {
    res.sendFile(path.join(publicViewsPath, 'checkout.html'));
});

router.get('/payment-success', (req, res) => {
    res.sendFile(path.join(publicViewsPath, 'payment_success.html'));
});

// Rute untuk halaman admin
router.get('/admin/login', (req, res) => {
    res.sendFile(path.join(publicViewsPath, 'admin', 'login.html'));
});

router.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(publicViewsPath, 'admin', 'dashboard.html'));
});

router.get('/admin/products', (req, res) => {
    res.sendFile(path.join(publicViewsPath, 'admin', 'products.html'));
});

router.get('/admin/orders', (req, res) => {
    res.sendFile(path.join(publicViewsPath, 'admin', 'orders.html'));
});

router.get('/admin/settings', (req, res) => {
    res.sendFile(path.join(publicViewsPath, 'admin', 'settings.html'));
});

module.exports = router;