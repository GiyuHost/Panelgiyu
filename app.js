require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');

const connectDB = require('./config/database');
require('./config/cloudinary.config'); 

const viewRoutes = require('./routes/view.routes');
const authApiRoutes = require('./routes/auth.api.routes');
const productApiRoutes = require('./routes/product.api.routes');
const orderApiRoutes = require('./routes/order.api.routes');
const subdomainApiRoutes = require('./routes/subdomain.api.routes');
const vpsApiRoutes = require('./routes/vps.api.routes');
const pterodactylApiRoutes = require('./routes/pterodactyl.api.routes');
const settingApiRoutes = require('./routes/setting.api.routes');

const errorHandler = require('./middlewares/errorHandler.middleware');

const app = express();

connectDB();

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*' 
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

app.use(express.static(path.join(__dirname, 'public')));


app.use('/api/auth', authApiRoutes);
app.use('/api/products', productApiRoutes);
app.use('/api/orders', orderApiRoutes);
app.use('/api/subdomains', subdomainApiRoutes);
app.use('/api/vps', vpsApiRoutes);
app.use('/api/pterodactyl', pterodactylApiRoutes);
app.use('/api/settings', settingApiRoutes);

app.use('/', viewRoutes);

app.use((req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error);
});

app.use(errorHandler);

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    console.log(`Server GIYU HOST berjalan di port ${PORT} dalam mode ${process.env.NODE_ENV || 'development'}`);
});

process.on('unhandledRejection', (err, promise) => {
    console.error(`Unhandled Rejection Error: ${err.message}`);
    console.error(err.stack)
    server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
    console.error(`Uncaught Exception Error: ${err.message}`);
    console.error(err.stack);
    server.close(() => process.exit(1));
});

module.exports = app;