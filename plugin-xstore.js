const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Telegraf, Markup } = require('telegraf');

const STORE_BOT_TOKEN = '8177397301:AAH4eNkzks_DuvuMB0leavzpcKMowwFz4Uw'; 
const MY_ID = 6846149935; 
const storeBot = new Telegraf(STORE_BOT_TOKEN);

// Важно: используем абсолютный путь, чтобы не потерять файлы
const uploadDir = path.join(__dirname, 'uploads-quarantine');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });

module.exports = function(app, context) {

    app.get('/x-api/ping', (req, res) => {
        res.json({ status: "online" });
    });

    // --- 1. АДМИНКА (ИСПРАВЛЕННЫЙ СПИСОК) ---
    app.get('/x-admin', (req, res) => {
        // Читаем все файлы, исключая скрытые
        const files = fs.readdirSync(uploadDir)
            .filter(name => !name.startsWith('.')) 
            .map(name => {
                const stats = fs.statSync(path.join(uploadDir, name));
                return { name, size: (stats.size / 1024 / 1024).toFixed(2), time: stats.mtime };
            })
            .sort((a, b) => b.time - a.time);

        res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { background: #0b0b0b; color: #e6edf3; font-family: sans-serif; padding: 15px; }
        .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 15px; margin-bottom: 15px; }
        .title { color: #ff6600; font-weight: bold; margin-bottom: 10px; font-size: 14px; word-break: break-all; }
        .btn { background: #ff6600; color: white; border: none; padding: 10px; border-radius: 8px; width: 100%; font-weight: bold; margin-top: 10px; }
        .no-data { text-align: center; opacity: 0.5; padding-top: 50px; }
    </style>
</head>
<body>
    <h3 style="color: #ff6600;">📦 Файлы в карантине (${files.length})</h3>
    <div id="list">
        ${files.length ? files.map(f => `
            <div class="card" id="card-${f.name}">
                <div class="title">📄 ID: ${f.name}</div>
                <div style="font-size: 11px; opacity: 0.6;">Вес: ${f.size} MB | ${f.time.toLocaleString()}</div>
                <button class="btn" onclick="del('${f.name}')" style="background: #da3633;">УДАЛИТЬ ФАЙЛ</button>
            </div>
        `).join('') : '<div class="no-data">Пусто. Заявки еще не дошли до папки.</div>'}
    </div>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <script>
        const tg = window.Telegram.WebApp;
        tg.expand();
        tg.MainButton.setText("ОБНОВИТЬ СПИСОК").show().onClick(() => location.reload());

        async function del(id) {
            if(confirm("Удалить файл?")) {
                const res = await fetch('/x-api/delete/' + id, { method: 'DELETE' });
                if(res.ok) document.getElementById('card-' + id).remove();
            }
        }
    </script>
</body>
</html>
        `);
    });

    // --- 2. API УДАЛЕНИЯ ---
    app.delete('/x-api/delete/:id', (req, res) => {
        const filePath = path.join(uploadDir, req.params.id);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.sendStatus(200);
        } else {
            res.status(404).send("File not found");
        }
    });

    // --- 3. ЗАГРУЗКА ---
    app.post('/x-api/upload', upload.single('appZip'), async (req, res) => {
        try {
            const { name, email } = req.body;
            // Уведомление в бот
            await storeBot.telegram.sendMessage(MY_ID, `🛡 **НОВАЯ ЗАЯВКА**\n\n📦 ${name}\n👤 ${email}`, Markup.inlineKeyboard([
                [Markup.button.webApp('📂 ОТКРЫТЬ АДМИНКУ', 'https://logist-x.store/x-admin')]
            ]));
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    storeBot.launch().catch(err => console.error("Бот X-Store:", err));
};
