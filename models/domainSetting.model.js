const mongoose = require('mongoose');

const DomainSettingSchema = new mongoose.Schema({
    tld: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    zoneId: {
        type: String,
        required: true,
        trim: true
    },
    apiProvider: {
        type: String,
        default: 'cloudflare',
        trim: true
    },
    nameservers: [{
        type: String,
        trim: true
    }],
    defaultIp: {
        type: String,
        trim: true
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

DomainSettingSchema.pre('save', function(next) {
    this.lastUpdated = Date.now();
    next();
});

module.exports = mongoose.model('DomainSetting', DomainSettingSchema);