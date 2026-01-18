const nodemailer = require('nodemailer');

module.exports = function(app, ctx) {
    const { readDatabase, saveDatabase, getOrCreateFolder, MERCH_ROOT_ID, MY_ROOT_ID, bot } = ctx;

    // Твой ID (Оставляем как было)
    const MY_TELEGRAM_ID = 6846149935; 
    const verificationCodes = new Map();

    // --- НАСТРОЙКА ПОЧТЫ (Добавлено) ---
    const transporter = nodemailer.createTransport({
        host: 'smtp.beget.com',
        port: 465,
        secure: true, 
        auth: {
            user: 'service@x-platform.ru', 
            pass: process.env.SMTP_PASSWORD
        }
    });

    // 1. ОТПРАВКА КОДА (Новый шаг)
    app.post('/api/keys/send-code', async (req, res) => {
        try {
            const { email, name } = req.body;
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            
            // Запоминаем код на 10 минут
            verificationCodes.set(email, { code, name, expires: Date.now() + 600000 });

            await transporter.sendMail({
                from: '"service x-platform" <service@x-platform.ru>',
                to: email,
                subject: "Код подтверждения | x-platform",
                html: `
                    <div style="background:#0d1117; color:#fff; padding:20px; border-radius:10px; text-align:center;">
                        <h2>Ваш код: <span style="color:#f59e0b;">${code}</span></h2>
                        <p>Объект: ${name}</p>
                    </div>`
            });
            res.json({ success: true });
        } catch (e) {
            console.error("Mail Error:", e.message);
            res.status(500).json({ success: false, error: "Ошибка отправки почты" });
        }
    });

    // 2. ПРОВЕРКА И СОЗДАНИЕ (Твоя старая логика, но с проверкой кода)
    app.post('/api/keys/verify-trial', async (req, res) => {
        try {
            const { email, code, type } = req.body;
            const stored = verificationCodes.get(email);

            // Проверяем код
            if (!stored || stored.code !== code) {
                return res.json({ success: false, error: "Неверный код!" });
            }

            const name = stored.name;
            let keys = await readDatabase();
            
            // Создаем ключ
            const trialKey = "TRIAL-" + Math.random().toString(36).substring(2, 7).toUpperCase();
            const exp = new Date();
            exp.setHours(exp.getHours() + 72); // 3 дня

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
                type: type || 'logist',
                isTrial: true,
                clientEmail: email
            });

            await saveDatabase(keys);
            verificationCodes.delete(email); // Удаляем использованный код

            // УВЕДОМЛЕНИЕ В TELEGRAM (Перевел на HTML, чтобы не ломалось от символов _)
            const projectLabel = type === 'merch' ? '📊 MERCH_X' : '🚚 LOGIST_X';
            const msg = `🎁 <b>НОВЫЙ ТЕСТ-ДРАЙВ!</b>\n\n` +
                        `🏢 Объект: <b>${name}</b>\n` +
                        `📧 Email: ${email}\n` +
                        `🔑 Ключ: <code>${trialKey}</code>\n` +
                        `📦 Тип: ${projectLabel}\n` +
                        `⏳ Срок: до ${exp.toLocaleDateString()}`;
            
            try {
                if (MY_TELEGRAM_ID) {
                    await bot.telegram.sendMessage(MY_TELEGRAM_ID, msg, { 
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: "📂 Открыть папку", url: `https://drive.google.com/drive/folders/${fId}` }
                            ]]
                        }
                    });
                }
            } catch (tgErr) { console.log("TG Error:", tgErr.message); }

            res.json({ success: true, key: trialKey });
        } catch (e) {
            console.error("Trial Error:", e.message);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 3. ВНЕДРЕНИЕ КНОПКИ (Обновил скрипт внутри)
    const express = require('express');
    const originalSend = express.response.send;

    express.response.send = function (body) {
        if (typeof body === 'string' && body.includes('ПАНЕЛЬ УПРАВЛЕНИЯ')) {
            const inject = `
            <div id="trial-float" style="position:fixed; top:80px; right:10px; z-index:99999;">
                <button onclick="startTrialFlow()" style="background:#4ade80; color:#000; border:2px solid #fff; padding:12px; border-radius:12px; font-weight:900; box-shadow:0 5px 15px rgba(0,0,0,0.5); cursor:pointer;">🎁 ТЕСТ-ДРАЙВ</button>
            </div>
            <script>
                async function startTrialFlow(){
                    // Шаг 1: Данные
                    const name = prompt('Введите название объекта (например: Магнит Орел):');
                    if(!name) return;
                    
                    const email = prompt('Введите Email клиента для подтверждения:');
                    if(!email) return;

                    const t = confirm('Это проект MERCH_X? (ОК - Мерч, Отмена - Логист)') ? 'merch' : 'logist';
                    
                    // Шаг 2: Отправка кода
                    alert('Отправляем код на ' + email + '...');
                    const r1 = await fetch('/api/keys/send-code', {
                        method:'POST',
                        headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({email, name})
                    });
                    const ans1 = await r1.json();
                    if(!ans1.success) return alert('Ошибка отправки: ' + ans1.error);

                    // Шаг 3: Проверка кода
                    const code = prompt('Введите код из письма:');
                    if(!code) return;

                    const r2 = await fetch('/api/keys/verify-trial', {
                        method:'POST',
                        headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({email, code, type: t})
                    });
                    const ans2 = await r2.json();
                    
                    if(ans2.success) {
                        alert('✅ УСПЕХ! Ключ: ' + ans2.key);
                        if(typeof load === 'function') load();
                    } else {
                        alert('❌ Ошибка: ' + ans2.error);
                    }
                }
            </script>`;
            body = body.replace('</body>', inject + '</body>');
        }
        return originalSend.call(this, body);
    };

    console.log("🚀 ПЛАГИН ТЕСТ-ДРАЙВ ЗАПУЩЕН");
};
