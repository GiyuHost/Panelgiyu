const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: [/\S+@\S+\.\S+/, 'is invalid']
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    firstName: {
        type: String,
        trim: true
    },
    lastName: {
        type: String,
        trim: true
    },
    telegram: {
        userId: { 
            type: String, 
            trim: true, 
            sparse: true 
        },
        chatId: { 
            type: String, 
            trim: true, 
            unique: true, 
            sparse: true 
        },
        username: { 
            type: String, 
            trim: true 
        },
        isVerified: { 
            type: Boolean, 
            default: false 
        },
        lastSeen: { 
            type: Date 
        }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
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

UserSchema.index({ 'telegram.chatId': 1 }, { unique: true, sparse: true });
UserSchema.index({ 'telegram.userId': 1 }, { sparse: true });


UserSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

UserSchema.virtual('fullName').get(function() {
    if (this.firstName && this.lastName) {
        return `${this.firstName} ${this.lastName}`;
    }
    if (this.firstName) {
        return this.firstName;
    }
    if (this.lastName) {
        return this.lastName;
    }
    return '';
});

UserSchema.set('toJSON', {
    virtuals: true,
    transform: (doc, ret) => {
        delete ret.password;
        delete ret.__v;
        return ret;
    }
});

module.exports = mongoose.model('User', UserSchema);