const errorHandler = (err, req, res, next) => {
    let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    let message = err.message || 'Terjadi kesalahan pada server';
    let errors = err.errors || null;

    if (err.name === 'CastError' && err.kind === 'ObjectId') {
        statusCode = 404;
        message = 'Resource tidak ditemukan (ID tidak valid)';
    }

    if (err.name === 'ValidationError') {
        statusCode = 400;
        const validationErrors = Object.values(err.errors).map(val => val.message);
        message = 'Data input tidak valid';
        errors = validationErrors;
    }

    if (err.code === 11000) {
        statusCode = 400;
        const field = Object.keys(err.keyPattern)[0];
        message = `Nilai duplikat untuk field '${field}'. Harap gunakan nilai lain.`;
        errors = { [field]: `Nilai untuk ${field} sudah ada.` };
    }

    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Token tidak valid atau format salah.';
    }

    if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Token sudah kedaluwarsa.';
    }
    
    const responseBody = {
        success: false,
        message: message,
    };

    if (errors) {
        responseBody.errors = errors;
    }

    if (process.env.NODE_ENV === 'development' && err.stack) {
        responseBody.stack = err.stack;
    }
    
    res.status(statusCode).json(responseBody);
};

module.exports = errorHandler;