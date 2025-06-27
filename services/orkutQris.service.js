const axios = require('axios');
const FormData = require('form-data');
const QRCode = require('qrcode');
const { Readable } = require('stream');

function convertCRC16(str) {
    let crc = 0xFFFF;
    const strlen = str.length;
    for (let c = 0; c < strlen; c++) {
        crc ^= str.charCodeAt(c) << 8;
        for (let i = 0; i < 8; i++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }
    let hex = crc & 0xFFFF;
    hex = ("000" + hex.toString(16).toUpperCase()).slice(-4);
    return hex;
}

function generateOrkutTransactionId(prefix = "QRIS") {
    const timestamp = Date.now().toString().slice(-5);
    const randomString = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `${prefix}${timestamp}${randomString}`;
}

function generateOrkutExpirationTime(minutes = parseInt(process.env.ORKUT_QRIS_EXPIRY_MINUTES) || 15) {
    const expirationTime = new Date();
    expirationTime.setMinutes(expirationTime.getMinutes() + minutes);
    return expirationTime;
}

async function bufferToStream(buffer) {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    return stream;
}

async function uploadQrToCatbox(buffer) {
    try {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        const stream = await bufferToStream(buffer);
        form.append('fileToUpload', stream, {
            filename: `qr_orkut_${Date.now()}.png`,
            contentType: 'image/png'
        });
        const response = await axios.post('https://catbox.moe/user/api.php', form, {
            headers: { ...form.getHeaders() },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 20000 
        });
        if (!response.data || typeof response.data !== 'string' || !response.data.startsWith('http')) {
            throw new Error('Gagal mengunggah QR ke Catbox atau respons tidak valid.');
        }
        return response.data;
    } catch (error) {
        throw error;
    }
}

async function createDynamicOrkutQris(originalAmount, transactionName = "Pembayaran") {
    try {
        const staticQrisBase = process.env.ORKUT_QRIS_STATIC_CODE;
        const feePercentage = parseFloat(process.env.ORKUT_QRIS_FEE_PERCENTAGE || 0.7);
        const feeIsByCustomer = process.env.ORKUT_QRIS_FEE_BY_CUSTOMER === 'true';

        if (!staticQrisBase) throw new Error('Kode QRIS statis dasar (ORKUT_QRIS_STATIC_CODE) diperlukan.');
        const parsedAmount = parseInt(originalAmount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) throw new Error('Jumlah tidak valid.');
        
        let amountToChargeUser = parsedAmount;
        let calculatedFeeAmount = 0;
        
        if (feeIsByCustomer && feePercentage > 0) {
            calculatedFeeAmount = Math.ceil(parsedAmount * (feePercentage / 100));
            amountToChargeUser = parsedAmount + calculatedFeeAmount; 
        } else if (!feeIsByCustomer && feePercentage > 0) {
            calculatedFeeAmount = Math.ceil(parsedAmount * (feePercentage / 100));
        }

        let baseQrString = staticQrisBase;
        if (baseQrString.includes("010211")) {
             baseQrString = baseQrString.replace("010211", "010212");
        } else if (!baseQrString.includes("010212")){
            const payloadFormatIndicator = baseQrString.substring(0,4); 
            const pointOfInitiation = "010212";
            const merchantAccountInfoStart = baseQrString.indexOf("26"); 
            if(payloadFormatIndicator !== "000201" || merchantAccountInfoStart === -1) {
                 throw new Error("Format QRIS dasar tidak bisa dimodifikasi ke dinamis secara aman.");
            }
             baseQrString = payloadFormatIndicator + pointOfInitiation + baseQrString.substring(merchantAccountInfoStart);
        }
        
        const countryCodeTag = "5802ID";
        const indexOfCountryCode = baseQrString.indexOf(countryCodeTag);
        if (indexOfCountryCode === -1) throw new Error("Format kode QRIS dasar tidak valid (tag 5802ID tidak ditemukan).");
        
        const part1 = baseQrString.substring(0, indexOfCountryCode);
        const part2 = baseQrString.substring(indexOfCountryCode);
        
        const amountStr = amountToChargeUser.toString();
        const amountLength = ("0" + amountStr.length).slice(-2);
        const transactionAmountField = "54" + amountLength + amountStr;
        
        let qrisStringToGenerateCRC = part1 + transactionAmountField + part2;
        
        const crcTagIndex = qrisStringToGenerateCRC.indexOf("6304");
        if (crcTagIndex !== -1 && qrisStringToGenerateCRC.length > crcTagIndex + 4) {
            qrisStringToGenerateCRC = qrisStringToGenerateCRC.substring(0, crcTagIndex);
        }
        
        const newCRC = convertCRC16(qrisStringToGenerateCRC + "6304");
        const finalQrisString = qrisStringToGenerateCRC + "6304" + newCRC;
        
        const buffer = await QRCode.toBuffer(finalQrisString, {
            errorCorrectionLevel: 'M', type: 'png', margin: 2, width: 350,
            color: { dark: "#000000", light: "#FFFFFF" }
        });
        
        const imageUrl = await uploadQrToCatbox(buffer);
        
        const orkutReffId = generateOrkutTransactionId("ORD");
        const expirationTime = generateOrkutExpirationTime();

        return {
            success: true,
            orkutReffId: orkutReffId,
            amountToPay: amountToChargeUser, 
            originalAmount: parsedAmount,
            feeAmount: calculatedFeeAmount, 
            qrImageUrl: imageUrl,
            qrString: finalQrisString,
            expiredAt: expirationTime,
            paymentMethod: 'ORKUT_QRIS_DYNAMIC',
            message: 'QRIS dinamis berhasil dibuat.'
        };
    } catch (error) {
        return { success: false, message: error.message || 'Gagal membuat QRIS Orkut Dinamis.' };
    }
}

async function checkOrkutQrisPaymentStatus(orderReffId, amountExpected, lastCheckedTimestamp) {
    try {
        const merchantId = process.env.OKECONNECT_MERCHANT_ID; 
        const apiKey = process.env.OKECONNECT_API_KEY; 

        if (!merchantId || !apiKey) {
            return { success: false, isPaid: false, message: 'Konfigurasi OkeConnect (Merchant ID/API Key) tidak lengkap.' };
        }
        
        const lookbackMinutes = parseInt(process.env.ORKUT_PAYMENT_CHECK_LOOKBACK_MINUTES || 30); 
        const now = Date.now();
        const lookbackTime = new Date(now - lookbackMinutes * 60 * 1000);
        
        const checkFromDate = lastCheckedTimestamp ? new Date(Math.max(lastCheckedTimestamp - (5*60*1000), lookbackTime.getTime())) : lookbackTime;
        const dateFromParam = checkFromDate.toISOString().split('T')[0];
        const dateToParam = new Date(now).toISOString().split('T')[0];


        const apiUrl = `https://gateway.okeconnect.com/api/mutasi/qris/${merchantId}/${apiKey}?date_from=${dateFromParam}&date_to=${dateToParam}`;
        
        const response = await axios.get(apiUrl, { timeout: 20000 });

        if (response.data && response.data.status === 'success' && Array.isArray(response.data.data)) {
            const transactions = response.data.data;
            const searchReffIdPart = orderReffId.toUpperCase(); 

            const matchedTx = transactions.find(tx => {
                const txAmount = parseInt(tx.amount);
                const noteIncludesReff = tx.note && tx.note.toUpperCase().includes(searchReffIdPart);
                const isRecentEnough = new Date(tx.datetime + " GMT+0700").getTime() >= checkFromDate.getTime(); // Asumsi datetime dari API adalah WIB
                
                return txAmount === amountExpected && noteIncludesReff && isRecentEnough;
            });

            if (matchedTx) {
                return { success: true, isPaid: true, transaction: matchedTx, message: 'Pembayaran ditemukan.' };
            } else {
                return { success: true, isPaid: false, message: 'Pembayaran belum ditemukan dalam mutasi terbaru yang relevan.' };
            }
        } else if (response.data && response.data.status !== 'success') {
             return { success: false, isPaid: false, message: response.data.message || 'OkeConnect mengembalikan status error.' };
        } else {
             return { success: false, isPaid: false, message: 'Format respons dari OkeConnect tidak dikenali atau data kosong.' };
        }
    } catch (error) {
        let errorMessage = 'Gagal menghubungi OkeConnect atau terjadi kesalahan internal.';
        if (error.response && error.response.data && error.response.data.message) {
            errorMessage = `Error dari OkeConnect: ${error.response.data.message}`;
        } else if (error.message) {
            errorMessage = error.message;
        }
        return { success: false, isPaid: false, message: errorMessage };
    }
}


module.exports = {
    createDynamicOrkutQris,
    checkOrkutQrisPaymentStatus
};