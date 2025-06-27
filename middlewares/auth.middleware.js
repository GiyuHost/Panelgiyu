const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

exports.isAuthenticated = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Tidak ada token, otorisasi ditolak.' });
    }
    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.user.id).select('-password');
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Token tidak valid, user tidak ditemukan.' });
        }
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
             return res.status(401).json({ success: false, message: 'Token kedaluwarsa.' });
        }
        res.status(401).json({ success: false, message: 'Token tidak valid.' });
    }
};

exports.isAdmin = (req, res, next) => {
    this.isAuthenticated(req, res, () => {
        if (req.user && req.user.role === 'admin') {
            next();
        } else {
            res.status(403).json({ success: false, message: 'Akses ditolak. Hanya untuk admin.' });
        }
    });
};