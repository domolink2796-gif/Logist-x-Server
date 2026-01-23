const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Telegraf, Markup } = require('telegraf');

const STORE_BOT_TOKEN = '8177397301:AAH4eNkzks_DuvuMB0leavzpcKMowwFz4Uw'; 
const MY_ID = 6846149935; 
const storeBot = new Telegraf(STORE_BOT_TOKEN);

const uploadDir = 'uploads-quarantine/';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });

module.exports = function(app, context) {

    // --- 0. ПИНГ (ДЛЯ МАГАЗИНА) ---
    app.get('/x-api/ping', (req, res) => {
        res.json({ status: "online", message: "X-Server Bridge is Working!" });
    });

    // --- 1. ОБРАБОТКА КОМАНД БОТА (START) ---
    storeBot.start((ctx) => {
        if (ctx.from.id === MY_ID) {
            return ctx.reply('👋 Привет, Евгений! Твоя админка X-Store готова к работе.', 
                Markup.inlineKeyboard([
                    [Markup.button.webApp('📂 ОТКРЫТЬ АДМИН-ПАНЕЛЬ', `https://logist-x.store/x-admin`)]
                ])
            );
        } else {
            return ctx.reply('🔒 Доступ запрещен. Это приватный бот управления X-Store.');
        }
    });

    // --- 2. ГЕНЕРАЦИЯ АДМИНКИ (HTML) ---
    app.get('/x-admin', (req, res) => {
        const files = fs.readdirSync(uploadDir).map(name => {
            const stats = fs.statSync(path.join(uploadDir, name));
            return { name, size: (stats.size / 1024 / 1024).toFixed(2), time: stats.mtime };
        }).sort((a, b) => b.time - a.time);

        res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>X-Admin Panel</title>
    <style>
        body { background: #0b0b0b; color: #e6edf3; font-family: -apple-system, sans-serif; margin: 0; padding: 15px; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #30363d; padding-bottom: 10px; }
        .title { color: #ff6600; font-weight: 900; font-size: 20px; }
        .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 15px; margin-bottom: 15px; }
        .file-name { font-weight: bold; font-size: 14px; word-break: break-all; color: #58a6ff; }
        .meta { font-size: 11px; color: #8b949e; margin: 5px 0 12px 0; }
        .btn-group { display: flex; gap: 8px; }
        .btn { flex: 1; padding: 10px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; font-size: 12px; }
        .btn-scan { background: #ff6600; color: white; }
        .btn-del { background: #da3633; color: white; opacity: 0.8; }
        .no-data { text-align: center; opacity: 0.5; margin-top: 50px; }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">X-STORE ADMIN</div>
        <div style="font-size:10px; opacity:0.5;">v1.0</div>
    </div>
    <div id="list">
        ${files.length ? files.map(f => `
            <div class="card" id="card-${f.name}">
                <div class="file-name">📦 ${f.name}</div>
                <div class="meta">Размер: ${f.size} MB • Получен: ${f.time.toLocaleString()}</div>
                <div class="btn-group">
                    <button class="btn btn-scan" onclick="scan('${f.name}')">🧪 СКАН</button>
                    <button class="btn btn-del" onclick="del('${f.name}')">УДАЛИТЬ</button>
                </div>
            </div>
        `).join('') : '<div class="no-data">Заявки отсутствуют</div>'}
    </div>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <script>
        const tg = window.Telegram.WebApp;
        tg.expand();
        tg.MainButton.setText("ОБНОВИТЬ СПИСОК").show().onClick(() => location.reload());

        async function del(id) {
            if(confirm("Удалить этот ZIP навсегда?")) {
                const res = await fetch('/x-api/delete/' + id, { method: 'DELETE' });
                if(res.ok) document.getElementById('card-' + id).remove();
            }
        }
    </script>
</body>
</html>
        `);
    });

    // --- 3. API ДЛЯ УДАЛЕНИЯ ---
    app.delete('/x-api/delete/:id', (req, res) => {
        const filePath = path.join(uploadDir, req.params.id);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.sendStatus(200);
        } else res.sendStatus(404);
    });

    // --- 4. ПРИЕМ ФАЙЛА ---
    app.post('/x-api/upload', upload.single('appZip'), async (req, res) => {
        try {
            const { name, email } = req.body;
            const msg = `🛡 **НОВАЯ ЗАЯВКА X-STORE**\n\n📦 Проект: ${name}\n👤 От: ${email}`;

            await storeBot.telegram.sendMessage(MY_ID, msg, Markup.inlineKeyboard([
                [Markup.button.webApp('📂 ОТКРЫТЬ АДМИН-ПАНЕЛЬ', `https://logist-x.store/x-admin`)]
            ]));
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Запуск бота с обработкой ошибок
    storeBot.launch()
        .then(() => console.log("✅ БОТ X-STORE: Запущен и ждет команд."))
        .catch(err => console.error("❌ Ошибка запуска бота:", err.message));
};
