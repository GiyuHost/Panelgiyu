const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ['hosting', 'vps', 'subdomain', 'pterodactyl', 'other'],
        default: 'other'
    },
    category: {
        type: String,
        trim: true
    },
    stock: {
        type: Number,
        default: 0 
    },
    imageUrl: {
        type: String,
        trim: true
    },
    imagePublicId: {
        type: String,
        trim: true
    },
    features: [{
        type: String
    }],
    specs: {
        type: mongoose.Schema.Types.Mixed 
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

ProductSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Product', ProductSchema);