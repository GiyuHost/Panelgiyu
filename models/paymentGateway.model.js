const mongoose = require('mongoose');

const PaymentGatewaySchema = new mongoose.Schema({
    methodCode: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    accountNumber: {
        type: String,
        trim: true
    },
    accountName: {
        type: String,
        trim: true
    },
    imageUrl: {
        type: String,
        trim: true
    },
    imagePublicId: {
        type: String,
        trim: true
    },
    instructions: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

PaymentGatewaySchema.pre('save', function(next) {
    this.lastUpdated = Date.now();
    next();
});

module.exports = mongoose.model('PaymentGateway', PaymentGatewaySchema);