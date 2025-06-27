const Order = require('../models/order.model');
const Product = require('../models/product.model');
const ApiToken = require('../models/apiToken.model');
const pterodactylService = require('../services/pterodactyl.service');
const telegramService = require('../services/telegram.service');

exports.provisionPterodactylServer = async (req, res) => {
    const { orderId, itemId, serverName, ownerEmail, cpu, memory, disk, eggId, locationId, environmentVars, startOnCompletion } = req.body;

    try {
        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
         if (order.status !== 'provisioning_pterodactyl' && order.status !== 'payment_confirmed') {
            return res.status(400).json({ success: false, message: `Status pesanan tidak valid untuk provisi Pterodactyl (${order.status}).` });
        }

        const orderItem = order.items.find(item => item._id.toString() === itemId);
        if (!orderItem) return res.status(404).json({ success: false, message: 'Item pesanan tidak ditemukan.' });

        const product = await Product.findById(orderItem.product);
        if (!product || product.type !== 'pterodactyl') {
            return res.status(400).json({ success: false, message: 'Produk bukan tipe Pterodactyl.' });
        }

        const pteroConfig = await ApiToken.findOne({ provider: 'pterodactyl' });
        if (!pteroConfig || !pteroConfig.token || !pteroConfig.apiUrl) {
            return res.status(500).json({ success: false, message: 'Konfigurasi API Pterodactyl tidak lengkap.' });
        }
        
        const serverDetails = {
            name: serverName || `giyuhost-ptero-${order._id.toString().slice(-6)}`,
            user: ownerEmail || order.customerEmail, 
            egg: eggId || product.specs.defaultEggId,
            docker_image: product.specs.defaultDockerImage, 
            startup: product.specs.defaultStartupCommand,
            limits: {
                memory: memory || product.specs.defaultMemory || 1024,
                swap: product.specs.defaultSwap || 0,
                disk: disk || product.specs.defaultDisk || 5120,
                io: product.specs.defaultIo || 500,
                cpu: cpu || product.specs.defaultCpu || 100
            },
            feature_limits: product.specs.defaultFeatureLimits || { databases: 1, allocations: 1, backups: 1 },
            environment: environmentVars || product.specs.defaultEnvironmentVars || {},
            deploy: {
                locations: [locationId || product.specs.defaultLocationId],
                dedicated_ip: product.specs.dedicatedIp || false,
                port_range: []
            },
            start_on_completion: startOnCompletion !== undefined ? startOnCompletion : (product.specs.startOnCompletion !== undefined ? product.specs.startOnCompletion : true)
        };
        
        if (!serverDetails.user) {
             const pteroUser = await pterodactylService.findOrCreateUser(pteroConfig.apiUrl, pteroConfig.token, order.customerEmail, order.customerName.split(' ')[0] || 'Giyu', order.customerName.split(' ').slice(1).join(' ') || 'User');
             if(!pteroUser.success || !pteroUser.data.id) return res.status(500).json({ success: false, message: 'Gagal membuat/mencari user Pterodactyl.' });
             serverDetails.user_id = pteroUser.data.id; // Gunakan user_id jika Ptero API Anda pakai itu
             delete serverDetails.user; // hapus field user jika pakai user_id
        }


        const provisionResult = await pterodactylService.createServer(pteroConfig.apiUrl, pteroConfig.token, serverDetails);

        if (provisionResult.success && provisionResult.data && provisionResult.data.attributes) {
            orderItem.provisioningDetails = {
                service: 'pterodactyl',
                serverId: provisionResult.data.attributes.id,
                serverUuid: provisionResult.data.attributes.uuid,
                serverIdentifier: provisionResult.data.attributes.identifier,
                node: provisionResult.data.attributes.node,
                allocation: provisionResult.data.attributes.allocation,
                provisionedAt: new Date(),
                fullData: provisionResult.data.attributes
            };
            order.status = 'completed';
            order.statusHistory.push({ status: 'completed', changedAt: Date.now(), changedBy: req.user.id });
            await order.save();

            const message = `Server Pterodactyl ${serverDetails.name} (ID: ${provisionResult.data.attributes.identifier}) untuk pesanan ID ${orderId} berhasil diprovisi.`;
            await telegramService.sendMessage(message).catch(err => console.error("Gagal kirim notif:", err));
            res.status(200).json({ success: true, message, data: provisionResult.data.attributes });
        } else {
            const errorMessage = `Gagal memprovisi server Pterodactyl: ${provisionResult.error || 'Unknown Pterodactyl Error'}`;
            order.status = 'failed';
            order.statusHistory.push({ status: 'failed', notes: errorMessage, changedAt: Date.now(), changedBy: req.user.id });
            await order.save();
            await telegramService.sendMessage(errorMessage).catch(err => console.error("Gagal kirim notif:", err));
            res.status(500).json({ success: false, message: errorMessage, error: provisionResult });
        }

    } catch (error) {
        const errorMessage = `Server error saat provisi Pterodactyl: ${error.message}`;
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