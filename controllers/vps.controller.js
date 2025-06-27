const Order = require('../models/order.model');
const Product = require('../models/product.model');
const ApiToken = require('../models/apiToken.model');
const linodeService = require('../services/linode.service');
const digitalOceanService = require('../services/digitalocean.service');
const telegramService = require('../services/telegram.service');

exports.provisionVps = async (req, res) => {
    const { orderId, itemId, provider, region, plan, image, rootPassword, label, tags, sshKeys, userData } = req.body;

    try {
        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
        if (order.status !== 'provisioning_vps' && order.status !== 'payment_confirmed') {
            return res.status(400).json({ success: false, message: `Status pesanan tidak valid untuk provisi VPS (${order.status}).` });
        }

        const orderItem = order.items.find(item => item._id.toString() === itemId);
        if (!orderItem) return res.status(404).json({ success: false, message: 'Item pesanan tidak ditemukan.' });

        const product = await Product.findById(orderItem.product);
        if (!product || product.type !== 'vps') {
            return res.status(400).json({ success: false, message: 'Produk bukan tipe VPS.' });
        }
        
        const vpsProvider = provider || product.specs.defaultProvider || process.env.DEFAULT_VPS_PROVIDER;
        const apiConfig = await ApiToken.findOne({ provider: vpsProvider });
        if (!apiConfig || !apiConfig.token) {
            return res.status(500).json({ success: false, message: `API Token untuk ${vpsProvider} tidak dikonfigurasi.` });
        }

        const vpsDetails = {
            region: region || product.specs.defaultRegion,
            plan: plan || product.specs.defaultPlan,
            image: image || product.specs.defaultImage,
            root_pass: rootPassword, 
            label: label || `giyuhost-vps-${order._id.toString().slice(-6)}`,
            tags: tags || product.specs.defaultTags || ['giyuhost'],
            ssh_keys: sshKeys || product.specs.defaultSshKeys || [],
            user_data: userData || product.specs.defaultUserData || null
        };
        
        let provisionResult;
        if (vpsProvider === 'linode') {
            provisionResult = await linodeService.createVps(apiConfig.token, vpsDetails);
        } else if (vpsProvider === 'digitalocean') {
            provisionResult = await digitalOceanService.createDroplet(apiConfig.token, vpsDetails);
        } else {
            return res.status(400).json({ success: false, message: `Provider VPS ${vpsProvider} tidak didukung.` });
        }

        if (provisionResult.success) {
            orderItem.provisioningDetails = {
                service: vpsProvider,
                instanceId: provisionResult.data.id,
                ipAddress: provisionResult.data.ip_address || (provisionResult.data.networks?.v4[0]?.ip_address),
                label: vpsDetails.label,
                provisionedAt: new Date(),
                fullData: provisionResult.data 
            };
            order.status = 'completed';
            order.statusHistory.push({ status: 'completed', changedAt: Date.now(), changedBy: req.user.id });
            await order.save();

            const message = `VPS ${vpsDetails.label} (IP: ${orderItem.provisioningDetails.ipAddress}) untuk pesanan ID ${orderId} berhasil diprovisi.`;
            await telegramService.sendMessage(message).catch(err => console.error("Gagal kirim notif:", err));
            res.status(200).json({ success: true, message, data: provisionResult.data });
        } else {
            const errorMessage = `Gagal memprovisi VPS: ${provisionResult.error || `Unknown ${vpsProvider} Error`}`;
            order.status = 'failed';
            order.statusHistory.push({ status: 'failed', notes: errorMessage, changedAt: Date.now(), changedBy: req.user.id });
            await order.save();
            await telegramService.sendMessage(errorMessage).catch(err => console.error("Gagal kirim notif:", err));
            res.status(500).json({ success: false, message: errorMessage });
        }

    } catch (error) {
        const errorMessage = `Server error saat provisi VPS: ${error.message}`;
        await telegramService.sendMessage(errorMessage).catch(err => console.error("Gagal kirim notif:", err));
         if (orderId) {
            try {
                const orderToFail = await Order.findById(orderId);
                if (orderToFail) {
                    orderToFail.status = 'failed';
                    orderToFail.statusHistory.push({ status: 'failed', notes: `Server error: ${error.message}`, changedAt: Date.now(), changedBy: req.user.id });
                    await orderToFail.save();
                }
            } catch (saveError) {
                console.error("Gagal update status order ke failed:", saveError);
            }
        }
        res.status(500).json({ success: false, message: errorMessage, error: error.message });
    }
};