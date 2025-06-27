const User = require('../models/user.model');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.registerAdmin = async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Username atau email sudah terdaftar.' });
        }

        const userCount = await User.countDocuments({ role: 'admin' });
        if (userCount > 0 && process.env.ALLOW_MULTIPLE_ADMINS !== 'true') {
             return res.status(403).json({ success: false, message: 'Registrasi admin dibatasi.' });
        }
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            role: 'admin' 
        });

        await newUser.save();

        const payload = { user: { id: newUser.id, role: newUser.role } };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });

        res.status(201).json({ 
            success: true, 
            message: 'Admin berhasil diregistrasi.',
            token,
            user: { id: newUser.id, username: newUser.username, email: newUser.email, role: newUser.role }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.loginAdmin = async (req, res) => {
    const { emailOrUsername, password } = req.body;
    try {
        const user = await User.findOne({ 
            $or: [{ email: emailOrUsername }, { username: emailOrUsername }],
            role: 'admin' 
        });

        if (!user) {
            return res.status(400).json({ success: false, message: 'Kredensial admin tidak valid.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Kredensial admin tidak valid.' });
        }

        const payload = { user: { id: user.id, role: user.role } };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });

        res.status(200).json({
            success: true,
            token,
            user: { id: user.id, username: user.username, email: user.email, role: user.role }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};