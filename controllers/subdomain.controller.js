const Order = require('../models/order.model');
const Product = require('../models/product.model');
const ApiToken = require('../models/apiToken.model'); 
const DomainSetting = require('../models/domainSetting.model');
const cloudflareService = require('../services/cloudflare.service'); 
const telegramService = require('../services/telegram.service');

exports.provisionSubdomain = async (req, res) => {
    const { orderId, itemId, subdomainName, targetIp } = req.body; 

    try {
        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
        if (order.status !== 'provisioning_subdomain' && order.status !== 'payment_confirmed') {
            return res.status(400).json({ success: false, message: `Status pesanan tidak valid untuk provisi subdomain (${order.status}).` });
        }

        const orderItem = order.items.find(item => item._id.toString() === itemId);
        if (!orderItem) return res.status(404).json({ success: false, message: 'Item pesanan tidak ditemukan.' });
        
        const product = await Product.findById(orderItem.product);
        if (!product || product.type !== 'subdomain') {
            return res.status(400).json({ success: false, message: 'Produk bukan tipe subdomain.' });
        }

        const cfToken = await ApiToken.findOne({ provider: 'cloudflare' });
        if (!cfToken || !cfToken.token) {
            return res.status(500).json({ success: false, message: 'API Token Cloudflare tidak dikonfigurasi.' });
        }
        
        const domainConfig = await DomainSetting.findOne({ tld: product.specs.tld || process.env.DEFAULT_SUBDOMAIN_TLD });
        if (!domainConfig || !domainConfig.zoneId) {
            return res.status(500).json({ success: false, message: `Konfigurasi Zone ID untuk TLD ${product.specs.tld || process.env.DEFAULT_SUBDOMAIN_TLD} tidak ditemukan.` });
        }

        const fullSubdomain = `${subdomainName}.${domainConfig.tld}`;
        const recordType = product.specs.recordType || 'A';
        const recordContent = targetIp || product.specs.defaultIp || process.env.DEFAULT_SUBDOMAIN_IP; 
        const proxied = product.specs.proxied !== undefined ? product.specs.proxied : true;

        if(!recordContent) {
            return res.status(400).json({ success: false, message: 'Target IP atau konten record tidak tersedia.' });
        }

        const result = await cloudflareService.createDnsRecord(cfToken.token, domainConfig.zoneId, recordType, fullSubdomain, recordContent, proxied);

        if (result.success) {
            orderItem.provisioningDetails = { 
                service: 'cloudflare', 
                recordId: result.data.id, 
                fullSubdomain: fullSubdomain,
                content: recordContent,
                provisionedAt: new Date()
            };
            order.status = 'completed';
            order.statusHistory.push({ status: 'completed', changedAt: Date.now(), changedBy: req.user.id });
            await order.save();
            
            const message = `Subdomain ${fullSubdomain} untuk pesanan ID ${orderId} berhasil diprovisi.`;
            await telegramService.sendMessage(message).catch(err => console.error("Gagal kirim notif:", err));
            res.status(200).json({ success: true, message, data: result.data });
        } else {
            const errorMessage = `Gagal memprovisi subdomain ${fullSubdomain}: ${result.error || 'Unknown Cloudflare Error'}`;
            order.status = 'failed';
            order.statusHistory.push({ status: 'failed', notes: errorMessage, changedAt: Date.now(), changedBy: req.user.id });
            await order.save();
            await telegramService.sendMessage(errorMessage).catch(err => console.error("Gagal kirim notif:", err));
            res.status(500).json({ success: false, message: errorMessage });
        }

    } catch (error) {
        const errorMessage = `Server error saat provisi subdomain: ${error.message}`;
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