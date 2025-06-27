const ApiToken = require('../models/apiToken.model');
const DomainSetting = require('../models/domainSetting.model');
const PaymentGateway = require('../models/paymentGateway.model');
const cloudinaryService = require('../services/cloudinary.service');

exports.getAllApiTokens = async (req, res) => {
    try {
        const tokens = await ApiToken.find({});
        res.status(200).json({ success: true, data: tokens });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.updateApiToken = async (req, res) => {
    const { provider } = req.params;
    const { token, apiUrl, accountEmail, additionalConfig } = req.body;
    try {
        if (!provider || !token) {
            return res.status(400).json({ success: false, message: 'Provider dan token diperlukan.' });
        }
        
        const updateData = { token };
        if (apiUrl) updateData.apiUrl = apiUrl;
        if (accountEmail) updateData.accountEmail = accountEmail;
        if (additionalConfig) updateData.additionalConfig = typeof additionalConfig === 'string' ? JSON.parse(additionalConfig) : additionalConfig;


        const updatedToken = await ApiToken.findOneAndUpdate(
            { provider }, 
            { $set: updateData }, 
            { new: true, upsert: true }
        );
        res.status(200).json({ success: true, message: `API Token untuk ${provider} berhasil diperbarui.`, data: updatedToken });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.deleteApiToken = async (req, res) => {
    const { provider } = req.params;
    try {
        const result = await ApiToken.findOneAndDelete({ provider });
        if (!result) {
            return res.status(404).json({ success: false, message: `API Token untuk ${provider} tidak ditemukan.` });
        }
        res.status(200).json({ success: true, message: `API Token untuk ${provider} berhasil dihapus.` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};


exports.getAllDomainSettings = async (req, res) => {
    try {
        const settings = await DomainSetting.find({});
        res.status(200).json({ success: true, data: settings });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.updateDomainSetting = async (req, res) => {
    const { tld } = req.params; 
    const { zoneId, nameservers, defaultIp, apiProvider } = req.body;
    try {
        if (!tld || !zoneId) {
            return res.status(400).json({ success: false, message: 'TLD dan Zone ID diperlukan.' });
        }
        
        const updateData = { zoneId, apiProvider: apiProvider || 'cloudflare' };
        if (nameservers) updateData.nameservers = typeof nameservers === 'string' ? nameservers.split(',').map(ns => ns.trim()) : nameservers;
        if (defaultIp) updateData.defaultIp = defaultIp;

        const updatedSetting = await DomainSetting.findOneAndUpdate(
            { tld }, 
            { $set: updateData }, 
            { new: true, upsert: true }
        );
        res.status(200).json({ success: true, message: `Pengaturan domain untuk ${tld} berhasil diperbarui.`, data: updatedSetting });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.deleteDomainSetting = async (req, res) => {
    const { tld } = req.params;
    try {
        const result = await DomainSetting.findOneAndDelete({ tld });
        if (!result) {
            return res.status(404).json({ success: false, message: `Pengaturan domain untuk ${tld} tidak ditemukan.` });
        }
        res.status(200).json({ success: true, message: `Pengaturan domain untuk ${tld} berhasil dihapus.` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};


exports.getAllPaymentGateways = async (req, res) => {
    try {
        const gateways = await PaymentGateway.find({});
        res.status(200).json({ success: true, data: gateways });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.updatePaymentGateway = async (req, res) => {
    const { methodCode } = req.params; 
    const { name, accountNumber, accountName, instructions, isActive } = req.body;
    let imageUrl, imagePublicId;

    try {
        if (!methodCode || !name) {
            return res.status(400).json({ success: false, message: 'Kode Metode dan Nama diperlukan.' });
        }

        let gateway = await PaymentGateway.findOne({ methodCode });
        
        const updateData = { name, instructions };
        if (accountNumber) updateData.accountNumber = accountNumber;
        if (accountName) updateData.accountName = accountName;
        if (isActive !== undefined) updateData.isActive = isActive === 'true' || isActive === true;


        if (req.file) {
            if (gateway && gateway.imagePublicId) {
                await cloudinaryService.deleteImage(gateway.imagePublicId).catch(err => console.warn("Gagal menghapus gambar QRIS lama:", err));
            }
            const uploadResult = await cloudinaryService.uploadImage(req.file.path, 'payment_gateways');
            updateData.imageUrl = uploadResult.secure_url;
            updateData.imagePublicId = uploadResult.public_id;
            imageUrl = updateData.imageUrl; 
            imagePublicId = updateData.imagePublicId; 
        }

        const updatedGateway = await PaymentGateway.findOneAndUpdate(
            { methodCode }, 
            { $set: updateData }, 
            { new: true, upsert: true }
        );
        res.status(200).json({ success: true, message: `Metode pembayaran ${methodCode} berhasil diperbarui.`, data: updatedGateway });
    } catch (error) {
        if (req.file && imagePublicId) {
             await cloudinaryService.deleteImage(imagePublicId).catch(err => console.error("Gagal menghapus gambar QRIS setelah error:", err));
        }
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.deletePaymentGateway = async (req, res) => {
    const { methodCode } = req.params;
    try {
        const gateway = await PaymentGateway.findOne({ methodCode });
        if (!gateway) {
            return res.status(404).json({ success: false, message: `Metode pembayaran ${methodCode} tidak ditemukan.` });
        }

        if (gateway.imagePublicId) {
            await cloudinaryService.deleteImage(gateway.imagePublicId).catch(err => console.warn("Gagal menghapus gambar dari Cloudinary:", err));
        }
        
        await gateway.deleteOne();
        res.status(200).json({ success: true, message: `Metode pembayaran ${methodCode} berhasil dihapus.` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};