const TelegramBot = require('node-telegram-bot-api');
const User = require('../models/user.model'); 

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

let bot;

if (token && adminChatId) {
    bot = new TelegramBot(token, { polling: true });

    console.log('Telegram Bot GIYU HOST (dengan fitur admin) aktif...');

    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId, "Selamat datang di GIYU HOST Bot!\nKetik /myid untuk mendaftarkan ID Telegram Anda agar dapat menerima notifikasi pesanan.");
    });

    bot.onText(/\/myid/, async (msg) => {
        const chatId = msg.chat.id.toString();
        const userId = msg.from.id.toString();
        const username = msg.from.username || `${msg.from.first_name} ${msg.from.last_name || ''}`.trim();

        try {
            let userRecord = await User.findOne({ 'telegram.chatId': chatId });
            let adminNotificationMessage = '';

            if (userRecord) {
                const oldUsername = userRecord.telegram.username;
                const oldIsVerified = userRecord.telegram.isVerified;

                userRecord.telegram.userId = userId;
                userRecord.telegram.username = username;
                userRecord.telegram.lastSeen = new Date();
                await userRecord.save();
                
                bot.sendMessage(chatId, `ID Telegram Anda (${chatId}) sudah tercatat sebagai ${username}.\nStatus verifikasi: ${userRecord.telegram.isVerified ? 'Terverifikasi ✅' : 'Menunggu persetujuan admin ⏳'}`);
                adminNotificationMessage = `Update User Telegram:\nID: ${chatId}\nUser ID TG: ${userId}\nUsername: @${username || 'N/A'}\nEmail Akun: ${userRecord.email}\nStatus Verifikasi: ${userRecord.telegram.isVerified ? 'Terverifikasi' : 'PENDING'}`;

            } else {
                // Cari user berdasarkan email jika username Telegram ada dan cocok dengan bagian email
                let potentialUserByEmail;
                if (username) {
                    potentialUserByEmail = await User.findOne({ email: { $regex: new RegExp(`^${username.split('_')[0]}@`, 'i') } });
                }

                if (potentialUserByEmail && !potentialUserByEmail.telegram.chatId) {
                    potentialUserByEmail.telegram = {
                        chatId: chatId,
                        userId: userId,
                        username: username,
                        isVerified: false,
                        lastSeen: new Date()
                    };
                    await potentialUserByEmail.save();
                    bot.sendMessage(chatId, `ID Telegram Anda (${chatId}) sebagai ${username} berhasil dikaitkan dengan akun email ${potentialUserByEmail.email}. Status: Menunggu persetujuan admin ⏳`);
                    adminNotificationMessage = `User Telegram Baru (Otomatis Terkait):\nID: ${chatId}\nUser ID TG: ${userId}\nUsername: @${username || 'N/A'}\nEmail Akun: ${potentialUserByEmail.email}\nStatus Verifikasi: PENDING\nMohon ACC jika sesuai. Ketik:\n/acc_user ${chatId}`;
                } else {
                    bot.sendMessage(chatId, `ID Telegram Anda (${chatId}) sebagai ${username} akan disimpan. Harap hubungi admin untuk mengaitkan ID ini dengan akun Anda di sistem jika belum otomatis, atau tunggu persetujuan.`);
                    adminNotificationMessage = `User Telegram Baru (Butuh Kaitan Manual/ACC):\nID: ${chatId}\nUser ID TG: ${userId}\nUsername: @${username || 'N/A'}\nStatus Verifikasi: PENDING\nMohon periksa dan kaitkan dengan user di sistem, lalu ACC. Ketik:\n/acc_user ${chatId}`;
                }
            }
            if (adminNotificationMessage) {
                 await bot.sendMessage(adminChatId, adminNotificationMessage, { parse_mode: 'Markdown' }).catch(console.error);
            }

        } catch (error) {
            console.error("Error saving/updating Telegram ID:", error.message);
            bot.sendMessage(chatId, 'Terjadi kesalahan saat menyimpan ID Anda. Silakan coba lagi nanti atau hubungi admin.');
        }
    });

    bot.onText(/\/pending_users/, async (msg) => {
        const chatId = msg.chat.id.toString();
        if (chatId !== adminChatId) {
            return bot.sendMessage(chatId, "Maaf, command ini hanya untuk admin.");
        }

        try {
            const pendingUsers = await User.find({ 'telegram.chatId': { $ne: null }, 'telegram.isVerified': false })
                                       .select('email username telegram.chatId telegram.username');
            if (pendingUsers.length === 0) {
                return bot.sendMessage(adminChatId, "Tidak ada pengguna Telegram yang menunggu persetujuan saat ini.");
            }

            let message = "Pengguna Telegram Menunggu Persetujuan:\n\n";
            pendingUsers.forEach(user => {
                message += `Email: ${user.email || 'N/A'}\nUsername Sistem: ${user.username || 'N/A'}\nTG Username: @${user.telegram.username || 'N/A'}\nChat ID: \`${user.telegram.chatId}\`\nUntuk ACC: /acc_user ${user.telegram.chatId}\n\n`;
            });
            bot.sendMessage(adminChatId, message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error("Error fetching pending users:", error.message);
            bot.sendMessage(adminChatId, "Gagal mengambil daftar pengguna pending.");
        }
    });

    bot.onText(/\/acc_user (.+)/, async (msg, match) => {
        const adminSourceChatId = msg.chat.id.toString();
        if (adminSourceChatId !== adminChatId) {
            return bot.sendMessage(adminSourceChatId, "Maaf, command ini hanya untuk admin.");
        }

        const targetChatId = match[1].trim();
        if (!targetChatId) {
            return bot.sendMessage(adminChatId, "Penggunaan: /acc_user [ChatIDPengguna]");
        }

        try {
            const userToVerify = await User.findOne({ 'telegram.chatId': targetChatId });
            if (!userToVerify) {
                return bot.sendMessage(adminChatId, `Pengguna dengan Chat ID ${targetChatId} tidak ditemukan di database.`);
            }
            if (userToVerify.telegram.isVerified) {
                return bot.sendMessage(adminChatId, `Pengguna @${userToVerify.telegram.username || targetChatId} (${userToVerify.email}) sudah terverifikasi.`);
            }

            userToVerify.telegram.isVerified = true;
            await userToVerify.save();

            bot.sendMessage(adminChatId, `Pengguna @${userToVerify.telegram.username || targetChatId} (${userToVerify.email}) dengan Chat ID ${targetChatId} berhasil DIVERIFIKASI.`);
            if (userToVerify.telegram.chatId) {
                 await bot.sendMessage(userToVerify.telegram.chatId, "Selamat! Akun Telegram Anda telah diverifikasi oleh admin. Anda sekarang dapat menerima notifikasi pesanan.").catch(console.error);
            }
        } catch (error) {
            console.error("Error verifying user:", error.message);
            bot.sendMessage(adminChatId, `Gagal memverifikasi pengguna dengan Chat ID ${targetChatId}. Error: ${error.message}`);
        }
    });
    
    bot.onText(/\/list_users/, async (msg) => {
        const chatId = msg.chat.id.toString();
        if (chatId !== adminChatId) {
            return bot.sendMessage(chatId, "Maaf, command ini hanya untuk admin.");
        }
        try {
            const allTelegramUsers = await User.find({ 'telegram.chatId': { $ne: null }})
                                           .select('email username telegram.chatId telegram.username telegram.isVerified');
            if(allTelegramUsers.length === 0) {
                return bot.sendMessage(adminChatId, "Belum ada pengguna dengan ID Telegram terdaftar.");
            }
            let message = "Daftar Pengguna Telegram Terdaftar:\n\n";
            allTelegramUsers.forEach(user => {
                message += `Email: ${user.email || 'N/A'}\nUsername Sistem: ${user.username || 'N/A'}\nTG Username: @${user.telegram.username || 'N/A'}\nChat ID: \`${user.telegram.chatId}\`\nVerified: ${user.telegram.isVerified ? 'YA ✅' : 'TIDAK ⏳'}\n\n`;
            });
            if (message.length > 4096) { // Batas pesan Telegram
                const messages = [];
                let currentMessage = "Daftar Pengguna Telegram Terdaftar:\n\n";
                allTelegramUsers.forEach(user => {
                    const userEntry = `Email: ${user.email || 'N/A'}\nUsername Sistem: ${user.username || 'N/A'}\nTG Username: @${user.telegram.username || 'N/A'}\nChat ID: \`${user.telegram.chatId}\`\nVerified: ${user.telegram.isVerified ? 'YA ✅' : 'TIDAK ⏳'}\n\n`;
                    if (currentMessage.length + userEntry.length > 4096) {
                        messages.push(currentMessage);
                        currentMessage = "";
                    }
                    currentMessage += userEntry;
                });
                messages.push(currentMessage);
                for (const m of messages) {
                    await bot.sendMessage(adminChatId, m, { parse_mode: 'Markdown' }).catch(console.error);
                }
            } else {
                 await bot.sendMessage(adminChatId, message, { parse_mode: 'Markdown' }).catch(console.error);
            }
        } catch (error) {
            console.error("Error listing users:", error.message);
            bot.sendMessage(adminChatId, "Gagal mengambil daftar pengguna.");
        }
    });


} else {
    console.warn('TELEGRAM_BOT_TOKEN dan/atau TELEGRAM_ADMIN_CHAT_ID tidak ditemukan. Bot Telegram tidak akan berfungsi penuh (terutama fitur admin).');
}


exports.sendMessage = async (chatId, message, options = {}) => {
    if (!bot) {
        return Promise.resolve({ success: false, error: 'Bot Telegram tidak diinisialisasi.' });
    }
    try {
        const sentMessage = await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...options });
        return { success: true, data: sentMessage };
    } catch (error) {
        console.error(`Error sending Telegram message to ${chatId}:`, error.response ? error.response.body : error.message);
        return { success: false, error: error.message };
    }
};

exports.sendAdminNotification = async (message, options = {}) => {
    if (!adminChatId || !bot) {
        console.warn('Notifikasi admin tidak dapat dikirim (bot/adminChatId tidak diset). Pesan:', message);
        return Promise.resolve({ success: false, error: 'Admin chat ID atau bot tidak diset.' });
    }
    return this.sendMessage(adminChatId, `🔔 *Notifikasi Admin GIYU HOST* 🔔\n\n${message}`, options);
};

exports.sendUserNotification = async (userEmailOrTelegramId, message, options = {}) => {
    if (!bot) {
        return Promise.resolve({ success: false, error: 'Bot Telegram tidak diinisialisasi.' });
    }
    try {
        const userRecord = await User.findOne({
            $or: [
                { email: userEmailOrTelegramId },
                { 'telegram.chatId': userEmailOrTelegramId.toString() },
                { 'telegram.userId': userEmailOrTelegramId.toString() }
            ]
        }).select('email username telegram');

        if (userRecord && userRecord.telegram && userRecord.telegram.chatId) {
            if (userRecord.telegram.isVerified) {
                return this.sendMessage(userRecord.telegram.chatId, message, options);
            } else {
                await this.sendAdminNotification(`Upaya kirim notifikasi ke user ${userRecord.email || userRecord.username} (TG: @${userRecord.telegram.username || 'N/A'}), tapi ID Telegram (${userRecord.telegram.chatId}) belum diverifikasi.`);
                return Promise.resolve({ success: false, error: 'ID Telegram pengguna belum diverifikasi.' });
            }
        } else {
            return Promise.resolve({ success: false, error: 'Pengguna atau ID Telegram terverifikasi tidak ditemukan.' });
        }
    } catch (error) {
        console.error(`Error finding user or sending notification to ${userEmailOrTelegramId}:`, error.message);
        return Promise.resolve({ success: false, error: 'Gagal mengirim notifikasi pengguna.' });
    }
};

module.exports.botInstance = bot;