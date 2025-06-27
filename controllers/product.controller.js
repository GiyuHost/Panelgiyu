const Product = require('../models/product.model');
const cloudinaryService = require('../services/cloudinary.service');

exports.createProduct = async (req, res) => {
    const { name, description, price, type, stock, category, features, specs } = req.body;
    try {
        let imageUrl = '';
        let imagePublicId = '';

        if (req.file) {
            const uploadResult = await cloudinaryService.uploadImage(req.file.path, 'products');
            imageUrl = uploadResult.secure_url;
            imagePublicId = uploadResult.public_id;
        }

        const parsedFeatures = typeof features === 'string' ? JSON.parse(features) : features;
        const parsedSpecs = typeof specs === 'string' ? JSON.parse(specs) : specs;

        const newProduct = new Product({
            name,
            description,
            price: parseFloat(price),
            type,
            stock: parseInt(stock, 10) || 0,
            category,
            features: parsedFeatures || [],
            specs: parsedSpecs || {},
            imageUrl,
            imagePublicId
        });

        await newProduct.save();
        res.status(201).json({ success: true, message: 'Produk berhasil ditambahkan.', data: newProduct });
    } catch (error) {
        if (req.file && imagePublicId) {
            await cloudinaryService.deleteImage(imagePublicId).catch(err => console.error("Gagal menghapus gambar dari Cloudinary setelah error:", err));
        }
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.getAllProducts = async (req, res) => {
    try {
        const { type, category, page = 1, limit = 10, search } = req.query;
        const query = {};
        if (type) query.type = type;
        if (category) query.category = category;
        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }
        
        const products = await Product.find(query)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ createdAt: -1 });

        const count = await Product.countDocuments(query);
        
        res.status(200).json({ 
            success: true, 
            data: products,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalProducts: count
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
        }
        res.status(200).json({ success: true, data: product });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.updateProduct = async (req, res) => {
    const { id } = req.params;
    const { name, description, price, type, stock, category, features, specs } = req.body;
    try {
        let product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
        }

        const updateData = { name, description, type, category };
        if (price) updateData.price = parseFloat(price);
        if (stock) updateData.stock = parseInt(stock, 10);
        if (features) updateData.features = typeof features === 'string' ? JSON.parse(features) : features;
        if (specs) updateData.specs = typeof specs === 'string' ? JSON.parse(specs) : specs;


        if (req.file) {
            if (product.imagePublicId) {
                await cloudinaryService.deleteImage(product.imagePublicId).catch(err => console.warn("Gagal menghapus gambar lama:", err));
            }
            const uploadResult = await cloudinaryService.uploadImage(req.file.path, 'products');
            updateData.imageUrl = uploadResult.secure_url;
            updateData.imagePublicId = uploadResult.public_id;
        }

        const updatedProduct = await Product.findByIdAndUpdate(id, { $set: updateData }, { new: true });
        res.status(200).json({ success: true, message: 'Produk berhasil diperbarui.', data: updatedProduct });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

exports.deleteProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
        }

        if (product.imagePublicId) {
            await cloudinaryService.deleteImage(product.imagePublicId).catch(err => console.warn("Gagal menghapus gambar produk dari Cloudinary:", err));
        }

        await product.deleteOne();
        res.status(200).json({ success: true, message: 'Produk berhasil dihapus.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};