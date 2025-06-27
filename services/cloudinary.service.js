const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});

exports.uploadImage = async (filePath, folderName = 'giyu_host') => {
    try {
        const result = await cloudinary.uploader.upload(filePath, {
            folder: folderName,
            resource_type: 'image',
        });
        fs.unlinkSync(filePath);
        return { success: true, secure_url: result.secure_url, public_id: result.public_id };
    } catch (error) {
        try {
            fs.unlinkSync(filePath);
        } catch (unlinkError) {
            console.error('Failed to delete temp file after Cloudinary upload error:', unlinkError);
        }
        console.error('Cloudinary Upload Error:', error);
        return { success: false, error: error.message || 'Upload to Cloudinary failed' };
    }
};

exports.deleteImage = async (publicId) => {
    try {
        const result = await cloudinary.uploader.destroy(publicId);
        return { success: true, result };
    } catch (error) {
        console.error('Cloudinary Delete Error:', error);
        return { success: false, error: error.message || 'Delete from Cloudinary failed' };
    }
};