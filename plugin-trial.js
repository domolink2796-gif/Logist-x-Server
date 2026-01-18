const nodemailer = require('nodemailer');

module.exports = function(app, ctx) {
    const { readDatabase, saveDatabase, getOrCreateFolder, MERCH_ROOT_ID, MY_ROOT_ID, bot } = ctx;

    const MY_TELEGRAM_ID = 6846149935; 
    const verificationCodes = new Map();

    // --- НАСТРОЙКА ПОЧТЫ BEGET ---
    const transporter = nodemailer.createTransport({
        host: 'smtp.beget.com',
        port: 465,
        secure: true, 
        auth: {
            user: 'service@x-platform.ru', 
            pass: 'NIKITIN_57_X' // Вставьте пароль от ящика
        },
        tls: { rejectUnauthorized: false }
    });

    // 1. Отправка кода подтверждения
    app.post('/api/keys/send-verification', async (req, res) => {
        try {
            const { email, name, type } = req.body;
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            
            verificationCodes.set(email, { code, name, type, expires: Date.now() + 600000 });

            await transporter.sendMail({
                from: '"service x-platform" <Service@x-platform.ru>', // Название с маленькой буквы
                to: email,
                subject: "код подтверждения доступа | x-platform",
                html: `
                    <div style="font-family: sans-serif; padding: 30px; background-color: #0d1117; color: #e6edf3; border-radius: 15px; text-align: center; border: 1px solid #30363d;">
                        <h1 style="color: #f59e0b; margin-bottom: 20px; font-size: 24px; text-transform: lowercase;">service x-platform core</h1>
                        <p style="font-size: 16px; opacity: 0.9;">Код подтверждения для объекта:<br><b style="color: #fff;">${name}</b></p>
                        
                        <div style="background: rgba(245, 158, 11, 0.05); border: 1px solid rgba(245, 158, 11, 0.3); padding: 25px; border-radius: 12px; margin: 25px 0;">
                            <span style="font-size: 42px; font-weight: bold; letter-spacing: 10px; color: #f59e0b;">${code}</span>
                        </div>
                        
                        <p style="font-size: 13px; opacity: 0.6;">Введите этот код в окне активации на сайте.<br>Срок действия кода: 10 минут.</p>
                        <hr style="border: 0; border-top: 1px solid #30363d; margin: 25px 0;">
                        <p style="font-size: 11px; opacity: 0.4;">service x-platform — автоматическая система уведомлений</p>
                    </div>
                `
            });
            res.json({ success: true });
        } catch (e) {
            console.error("SMTP Error:", e.message);
            res.status(500).json({ success: false, error: "Ошибка почтового сервера" });
        }
    });

    // 2. Проверка кода и создание ключа
    app.post('/api/keys/verify-and-generate', async (req, res) => {
        try {
            const { email, userCode } = req.body;
            const stored = verificationCodes.get(email);

            if (!stored || stored.code !== userCode || Date.now() > stored.expires) {
                return res.json({ success: false, error: "Неверный или просроченный код" });
            }

            const { name, type } = stored;
            let keys = await readDatabase();
            const trialKey = "TRIAL-" + Math.random().toString(36).substring(2, 7).toUpperCase();
            
            const exp = new Date();
            exp.setHours(exp.getHours() + 72);

            const projectRoot = (type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
            const fId = await getOrCreateFolder(name + " (TRIAL)", projectRoot);

            keys.push({
                key: trialKey,
                name: name + " [ТЕСТ]",
                limit: 2, 
                expiry: exp.toISOString(),
                workers: [],
                ownerChatId: null,
                folderId: fId,
                type: type,
                isTrial: true,
                clientEmail: email
            });

            await saveDatabase(keys);
            verificationCodes.delete(email);

            // Уведомление владельцу
            const msg = `📧 **service x-platform: подтверждение**\n\n🏢 Объект: **${name}**\n👤 Email: \`${email}\` \n🔑 Ключ: \`${trialKey}\``;
            await bot.telegram.sendMessage(MY_TELEGRAM_ID, msg, { parse_mode: 'Markdown' });

            res.json({ success: true, key: trialKey });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });
};
