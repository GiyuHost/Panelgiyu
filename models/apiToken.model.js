const mongoose = require('mongoose');

const ApiTokenSchema = new mongoose.Schema({
    provider: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        enum: ['cloudflare', 'linode', 'digitalocean', 'pterodactyl', 'telegram', 'other']
    },
    token: {
        type: String,
        required: true,
        trim: true
    },
    apiUrl: {
        type: String,
        trim: true
    },
    accountEmail: {
        type: String,
        trim: true
    },
    additionalConfig: {
        type: mongoose.Schema.Types.Mixed
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

ApiTokenSchema.pre('save', function(next) {
    this.lastUpdated = Date.now();
    next();
});

module.exports = mongoose.model('ApiToken', ApiTokenSchema);