
const mongoose = require('mongoose');

const OrderItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
        default: 1
    },
    price: {
        type: Number,
        required: true
    },
    selectedOptions: {
        type: mongoose.Schema.Types.Mixed
    },
    provisioningDetails: {
        type: mongoose.Schema.Types.Mixed
    }
}, { _id: true });


const StatusHistorySchema = new mongoose.Schema({
    status: {
        type: String,
        required: true
    },
    changedAt: {
        type: Date,
        default: Date.now
    },
    changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' 
    },
    notes: String
}, { _id: false });


const OrderSchema = new mongoose.Schema({
    customerName: {
        type: String,
        required: true,
        trim: true
    },
    customerEmail: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    customerPhone: {
        type: String,
        trim: true
    },
    items: [OrderItemSchema],
    totalAmount: {
        type: Number,
        required: true
    },
    paymentMethod: {
        type: String,
        required: true
    },
    paymentDetails: { // Tambahkan ini jika belum ada, untuk menyimpan detail QRIS Orkut
        method: String,
        orkutReffId: String,
        amountToPay: Number,
        qrImageUrl: String,
        expiredAt: Date,
        qrString: String,
        feeAmount: Number,
        transactionData: mongoose.Schema.Types.Mixed, // Untuk menyimpan data dari OkeConnect
        paidAt: Date
    },
    paymentProofUrl: {
        type: String,
        trim: true
    },
    paymentProofPublicId: {
        type: String,
        trim: true
    },
    lastPaymentCheckTimestamp: { // Untuk melacak kapan terakhir cek status Orkut
        type: Date
    },
    status: {
        type: String,
        enum: [
            'pending_payment', 
            'pending_customer_details',
            'pending_payment_orkut',
            'pending_payment_confirmation', 
            'payment_confirmed', 
            'processing', 
            'provisioning_vps',
            'provisioning_subdomain',
            'provisioning_pterodactyl',
            'completed', 
            'cancelled', 
            'refunded',
            'failed'
        ],
        default: 'pending_payment'
    },
    statusHistory: [StatusHistorySchema],
    notes: {
        type: String,
        trim: true
    },
    adminNotes: {
        type: String,
        trim: true
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

OrderSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    const lastStatusEntry = this.statusHistory.length > 0 ? this.statusHistory[this.statusHistory.length - 1] : null;
    if (!lastStatusEntry || lastStatusEntry.status !== this.status) {
        this.statusHistory.push({ 
            status: this.status, 
            changedAt: this.updatedAt,
        });
    }
    next();
});

module.exports = mongoose.model('Order', OrderSchema);