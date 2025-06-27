
const Order = require('../models/order.model');
const Product = require('../models/product.model');
const User = require('../models/user.model');
const cloudinaryService = require('../services/cloudinary.service');
const telegramService = require('../services/telegram.service');
const orkutQrisService = require('../services/orkutQris.service');

exports.initiateOrder = async (req, res) => { 
    const { items, paymentMethod, customerEmail, customerName, customerPhone } = req.body;
    let parsedItems;
    let paymentProofUrl = '';
    let paymentProofPublicId = '';
    let orderIdForQrisNote = `GIYU${Date.now().toString().slice(-6)}`;

    try {
        if (typeof items === 'string') {
            try { parsedItems = JSON.parse(items); } 
            catch (e) { return res.status(400).json({ success: false, message: 'Format data item tidak valid.' }); }
        } else { parsedItems = items; }

        if (!parsedItems || !Array.isArray(parsedItems) || parsedItems.length === 0) {
            return res.status(400).json({ success: false, message: 'Item pesanan (array) diperlukan.' });
        }
        
        if (paymentMethod !== 'ORKUT_QRIS_DYNAMIC' && (!req.file || !req.file.path)) {
            return res.status(400).json({ success: false, message: 'Bukti pembayaran (file) diperlukan untuk metode transfer manual.' });
        }

        if (paymentMethod === 'ORKUT_QRIS_DYNAMIC' && (!customerEmail || !customerName)) {
             return res.status(400).json({ success: false, message: 'Nama dan Email pelanggan diperlukan untuk pembuatan QRIS.' });
        }

        const orderItemsForDb = [];
        let calculatedTotalAmount = 0;

        for (const item of parsedItems) {
            if (!item.productId) {
                if (paymentProofPublicId && paymentMethod !== 'ORKUT_QRIS_DYNAMIC') await cloudinaryService.deleteImage(paymentProofPublicId).catch(console.error);
                return res.status(400).json({ success: false, message: `Item pesanan tidak memiliki productId.` });
            }
            const product = await Product.findById(item.productId);
            if (!product) {
                if (paymentProofPublicId && paymentMethod !== 'ORKUT_QRIS_DYNAMIC') await cloudinaryService.deleteImage(paymentProofPublicId).catch(console.error);
                return res.status(404).json({ success: false, message: `Produk dengan ID ${item.productId} tidak ditemukan.` });
            }
            const itemQuantity = parseInt(item.quantity) || 1;
            if (product.stock < itemQuantity) {
                if (paymentProofPublicId && paymentMethod !== 'ORKUT_QRIS_DYNAMIC') await cloudinaryService.deleteImage(paymentProofPublicId).catch(console.error);
                return res.status(400).json({ success: false, message: `Stok produk ${product.name} tidak mencukupi.` });
            }
            calculatedTotalAmount += (parseFloat(item.price) || product.price) * itemQuantity;
            orderItemsForDb.push({
                product: product._id, name: item.name || product.name,
                quantity: itemQuantity, price: parseFloat(item.price) || product.price
            });
        }

        const tempCustomerName = customerName || 'PENDING_DETAILS';
        const tempCustomerEmail = customerEmail || 'pending@details.com';
        const tempCustomerPhone = customerPhone || '';

        const newOrder = new Order({
            items: orderItemsForDb, totalAmount: calculatedTotalAmount,
            paymentMethod: paymentMethod || 'TRANSFER_MANUAL', status: 'pending_customer_details',
            customerName: tempCustomerName, customerEmail: tempCustomerEmail, customerPhone: tempCustomerPhone
        });
        
        orderIdForQrisNote = newOrder._id.toString();

        if (paymentMethod === 'ORKUT_QRIS_DYNAMIC') {
            const qrisResult = await orkutQrisService.createDynamicOrkutQris(calculatedTotalAmount, `Order ${orderIdForQrisNote.slice(-6)}`);
            if (qrisResult.success) {
                newOrder.paymentDetails = {
                    method: 'ORKUT_QRIS_DYNAMIC', orkutReffId: qrisResult.orkutReffId,
                    amountToPay: qrisResult.amountToPay, qrImageUrl: qrisResult.qrImageUrl,
                    expiredAt: qrisResult.expiredAt, qrString: qrisResult.qrString,
                    feeAmount: qrisResult.feeAmount
                };
                newOrder.status = 'pending_payment_orkut';
            } else {
                return res.status(500).json({ success: false, message: qrisResult.message || 'Gagal membuat QRIS Dinamis.' });
            }
        } else if (req.file && req.file.path) { // Hanya untuk transfer manual
            const uploadResult = await cloudinaryService.uploadImage(req.file.path, 'payment_proofs_temp');
            if (uploadResult.success) {
                newOrder.paymentProofUrl = uploadResult.secure_url;
                newOrder.paymentProofPublicId = uploadResult.public_id;
                paymentProofPublicId = uploadResult.public_id; 
            } else {
                return res.status(500).json({ success: false, message: 'Gagal mengunggah bukti pembayaran.', error: uploadResult.error });
            }
        }
        
        await newOrder.save();

        let responseData = {
            orderId: newOrder._id,
            status: newOrder.status
        };
        if (newOrder.paymentMethod === 'ORKUT_QRIS_DYNAMIC' && newOrder.paymentDetails) {
            responseData.qrImageUrl = newOrder.paymentDetails.qrImageUrl;
            responseData.amountToPay = newOrder.paymentDetails.amountToPay;
            responseData.expiredAt = newOrder.paymentDetails.expiredAt;
            responseData.orkutReffId = newOrder.paymentDetails.orkutReffId;
            responseData.paymentMethod = 'ORKUT_QRIS_DYNAMIC';
        } else {
            responseData.paymentProofUrl = newOrder.paymentProofUrl;
        }

        res.status(201).json({
            success: true,
            message: newOrder.status === 'pending_payment_orkut' ? 'QRIS berhasil dibuat, silakan lakukan pembayaran.' : 'Bukti pembayaran diterima, silakan lengkapi detail pesanan.',
            data: responseData
        });

    } catch (error) {
        if (paymentProofPublicId && paymentMethod !== 'ORKUT_QRIS_DYNAMIC') {
            await cloudinaryService.deleteImage(paymentProofPublicId).catch(err => console.error("Error deleting temp proof after initiation failure:", err.message));
        }
        res.status(500).json({ success: false, message: error.message || 'Server Error saat memproses permintaan.', error: error.toString() });
    }
};


exports.finalizeOrder = async (req, res) => {
    const {
        orderId, customerName, customerEmail, customerPhone, type,
        hostingUsername, vpsOs, vpsRegion, vpsHostname, vpsRootPassword,
        subdomainFullName, subdomainRecordType, subdomainRecordValue
    } = req.body;
    let newPaymentProofUrl = '';
    let newPaymentProofPublicId = '';

    try {
        if (!orderId) {
            return res.status(400).json({ success: false, message: 'Order ID diperlukan.' });
        }
        if (!customerName || !customerEmail || !customerPhone) {
            return res.status(400).json({ success: false, message: 'Detail pelanggan (nama, email, telepon) diperlukan.' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
        }

        const oldStatusForStockLogic = order.status;

        order.customerName = customerName;
        order.customerEmail = customerEmail;
        order.customerPhone = customerPhone;
        
        if (order.status === 'pending_customer_details' || order.status === 'pending_payment_orkut') {
             order.status = 'pending_payment_confirmation';
        }


        let itemSpecificDetails = {};
        if (type === 'hosting' && hostingUsername) {
            itemSpecificDetails.hostingUsername = hostingUsername;
        } else if (type === 'vps') {
            itemSpecificDetails.vpsOs = vpsOs; itemSpecificDetails.vpsRegion = vpsRegion;
            itemSpecificDetails.vpsHostname = vpsHostname; itemSpecificDetails.vpsRootPassword = vpsRootPassword;
        } else if (type === 'subdomain') {
            itemSpecificDetails.subdomainFullName = subdomainFullName;
            itemSpecificDetails.subdomainRecordType = subdomainRecordType;
            itemSpecificDetails.subdomainRecordValue = subdomainRecordValue;
        }

        if (order.items && order.items.length > 0 && Object.keys(itemSpecificDetails).length > 0) {
            if (!order.items[0].selectedOptions) order.items[0].selectedOptions = {};
            order.items[0].selectedOptions = { ...order.items[0].selectedOptions, ...itemSpecificDetails };
        }

        if (req.file && req.file.path) {
            if (order.paymentProofPublicId) {
                await cloudinaryService.deleteImage(order.paymentProofPublicId).catch(err => console.warn("Gagal menghapus bukti bayar lama saat finalisasi:", err.message));
            }
            const uploadResult = await cloudinaryService.uploadImage(req.file.path, 'payment_proofs_final');
            if (uploadResult.success) {
                newPaymentProofUrl = uploadResult.secure_url;
                newPaymentProofPublicId = uploadResult.public_id;
                order.paymentProofUrl = newPaymentProofUrl;
                order.paymentProofPublicId = newPaymentProofPublicId;
            } else {
                console.warn("Gagal mengunggah bukti bayar baru saat finalisasi:", uploadResult.error);
            }
        }
        
        if (order.status === 'pending_payment_confirmation' && (oldStatusForStockLogic === 'pending_customer_details' || oldStatusForStockLogic === 'pending_payment_orkut')) {
            for (const item of order.items) {
                const product = await Product.findById(item.product);
                if (product) {
                    const itemQuantity = parseInt(item.quantity) || 1;
                    if (product.stock < itemQuantity) { 
                        if (newPaymentProofPublicId) await cloudinaryService.deleteImage(newPaymentProofPublicId).catch(console.error);
                        return res.status(400).json({ success: false, message: `Stok produk ${product.name} tidak mencukupi saat finalisasi.` });
                    }
                    product.stock -= itemQuantity;
                    await product.save();
                }
            }
        }
        
        await order.save();

        const telegramMessage = `Pesanan Difinalisasi (ID: ${order._id})\nPelanggan: ${customerName} (${customerEmail})\nTotal: Rp ${order.totalAmount.toLocaleString('id-ID')}\nProduk: ${order.items[0].name}\n${order.paymentProofUrl ? `Bukti Manual: ${order.paymentProofUrl}\n` : ''}${order.paymentDetails && order.paymentDetails.method === 'ORKUT_QRIS_DYNAMIC' ? `QRIS Reff: ${order.paymentDetails.orkutReffId}\n` : ''}Status: ${order.status.replace(/_/g, ' ')}.`;
        await telegramService.sendAdminNotification(telegramMessage).catch(err => console.error("Gagal mengirim notif Telegram finalisasi:", err.message));

        res.status(200).json({
            success: true,
            message: 'Pesanan berhasil difinalisasi.',
            data: { orderId: order._id }
        });

    } catch (error) {
        if (newPaymentProofPublicId) {
             await cloudinaryService.deleteImage(newPaymentProofPublicId).catch(err => console.error("Error deleting new proof after finalization failure:", err.message));
        }
        res.status(500).json({ success: false, message: error.message || 'Server Error saat memfinalisasi pesanan.', error: error.toString() });
    }
};

exports.checkOrkutPaymentAndUpdateOrder = async (req, res) => {
    const { orderId } = req.params;
    try {
        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: "Pesanan tidak ditemukan." });
        if (order.status !== 'pending_payment_orkut' || !order.paymentDetails || !order.paymentDetails.orkutReffId) {
            return res.status(400).json({ success: false, message: "Pesanan tidak valid untuk pengecekan status QRIS Orkut." });
        }
        if (new Date(order.paymentDetails.expiredAt) < new Date()) {
            order.status = 'payment_failed';
            order.adminNotes = (order.adminNotes || '') + "\nQRIS Orkut kedaluwarsa.";
            await order.save();
            return res.status(200).json({ success: true, isPaid: false, message: "QRIS Orkut telah kedaluwarsa." });
        }

        const statusResult = await orkutQrisService.checkOrkutQrisPaymentStatus(
            order.paymentDetails.orkutReffId,
            order.paymentDetails.amountToPay,
            order.lastPaymentCheckTimestamp 
        );
        
        order.lastPaymentCheckTimestamp = new Date();

        if (statusResult.success && statusResult.isPaid) {
            const oldStatus = order.status;
            order.status = 'pending_payment_confirmation'; 
            order.paymentDetails.transactionData = statusResult.transaction;
            order.paymentDetails.paidAt = new Date();
            order.statusHistory.push({ status: order.status, changedAt: Date.now(), notes: `QRIS Orkut paid (Reff: ${order.paymentDetails.orkutReffId})` });
            
            if (oldStatus === 'pending_payment_orkut') {
                 for (const item of order.items) {
                    const product = await Product.findById(item.product);
                    if (product) {
                        const itemQuantity = parseInt(item.quantity) || 1;
                        if (product.stock < itemQuantity) {
                            console.warn(`Stok produk ${product.name} tidak cukup setelah pembayaran QRIS dikonfirmasi. Order ID: ${order._id}`);
                        } else {
                            product.stock -= itemQuantity;
                            await product.save();
                        }
                    }
                }
            }

            await order.save();

            await telegramService.sendAdminNotification(`Pembayaran QRIS Orkut DITERIMA!\nOrder ID: ${order._id}\nReff ID: ${order.paymentDetails.orkutReffId}\nPelanggan: ${order.customerName}\nTotal: Rp ${order.paymentDetails.amountToPay.toLocaleString('id-ID')}`);
            await telegramService.sendUserNotification(order.customerEmail, `Pembayaran QRIS Anda untuk pesanan #${order._id.toString().slice(-6).toUpperCase()} telah BERHASIL diterima. Pesanan Anda akan segera diproses.`);
            
            return res.status(200).json({ success: true, isPaid: true, message: "Pembayaran QRIS Orkut berhasil dikonfirmasi.", orderStatus: order.status });
        } else {
            await order.save(); 
            return res.status(200).json({ success: true, isPaid: false, message: statusResult.message || "Pembayaran belum dikonfirmasi." });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message || "Gagal memeriksa status pembayaran QRIS Orkut.", error: error.toString() });
    }
};

exports.getAllOrders = async (req, res) => {
    try {
        const { status, page = 1, limit = 10, search } = req.query;
        const query = {};
        if (status) query.status = status;
        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            query.$or = [
                { customerName: searchRegex }, { customerEmail: searchRegex },
                { 'items.name': searchRegex }, { 'paymentDetails.orkutReffId': searchRegex }
            ];
            if (search.match(/^[0-9a-fA-F]{24}$/)) {
                query.$or.push({ _id: search });
            } else if (search.length === 6 && /^[0-9A-F]+$/.test(search.toUpperCase())) {
                 query.$or.push({ _id: { $regex: `${search.toUpperCase()}$`, $options: 'i' } });
            }
        }

        const orders = await Order.find(query)
            .populate('items.product', 'name type')
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .sort({ createdAt: -1 });
        const count = await Order.countDocuments(query);
        res.status(200).json({
            success: true, data: orders, totalPages: Math.ceil(count / parseInt(limit)),
            currentPage: parseInt(page), totalOrders: count
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Server Error', error: error.toString() });
    }
};

exports.getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('items.product', 'name type imageUrl specs');
        if (!order) {
            return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
        }
        res.status(200).json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Server Error', error: error.toString() });
    }
};

exports.updateOrderStatus = async (req, res) => {
    const { id } = req.params;
    const { status, adminNotes } = req.body;
    const validStatuses = [
        'pending_payment', 'pending_customer_details', 'pending_payment_orkut',
        'pending_payment_confirmation', 'payment_confirmed', 'processing',
        'provisioning_vps', 'provisioning_subdomain', 'provisioning_pterodactyl',
        'completed', 'cancelled', 'refunded', 'failed'
    ];

    if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: 'Status tidak valid.' });
    }

    try {
        const order = await Order.findById(id).populate('items.product', 'type');
        if (!order) {
            return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
        }

        const oldStatus = order.status;
        order.status = status;
        if (adminNotes) order.adminNotes = adminNotes;
        
        let provisionTriggered = false;
        let provisionMessage = '';
        const userNotifMessage = `Status pesanan Anda #${order._id.toString().slice(-6).toUpperCase()} telah diperbarui menjadi: *${status.replace(/_/g, ' ')}*. ${adminNotes ? `\nCatatan Admin: ${adminNotes}` : ''}`;

        if (status === 'payment_confirmed' && oldStatus !== 'payment_confirmed') {
            if (order.items && order.items.length > 0 && order.items[0].product) {
                const productType = order.items[0].product.type;
                if (productType === 'vps') { order.status = 'provisioning_vps'; provisionTriggered = true; }
                else if (productType === 'subdomain') { order.status = 'provisioning_subdomain'; provisionTriggered = true; }
                else if (productType === 'pterodactyl') { order.status = 'provisioning_pterodactyl'; provisionTriggered = true; }
                 if(provisionTriggered) {
                    provisionMessage = `Status pesanan ${order._id} otomatis diubah ke ${order.status} setelah pembayaran dikonfirmasi. Layanan akan segera diproses.`;
                 }
            }
        }
        
        await order.save();
        
        const adminTelegramMessage = `Status Pesanan ID: ${order._id} diperbarui dari ${oldStatus} menjadi: ${order.status}. Catatan: ${adminNotes || '-'}`;
        await telegramService.sendAdminNotification(adminTelegramMessage).catch(err => console.error("Gagal mengirim notif admin status:", err.message));

        if (provisionMessage) {
            await telegramService.sendAdminNotification(provisionMessage).catch(err => console.error("Gagal mengirim notif admin provisi:", err.message));
        }
        
        if (order.customerEmail) {
            await telegramService.sendUserNotification(order.customerEmail, userNotifMessage).catch(err => console.error("Gagal mengirim notif user status:", err.message));
        }

        res.status(200).json({ success: true, message: 'Status pesanan berhasil diperbarui.', data: order });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Server Error', error: error.toString() });
    }
};