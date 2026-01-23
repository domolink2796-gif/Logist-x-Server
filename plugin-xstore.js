const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Telegraf, Markup } = require('telegraf');

const STORE_BOT_TOKEN = '8177397301:AAH4eNkzks_DuvuMB0leavzpcKMowwFz4Uw'; 
const MY_ID = 6846149935; 
const storeBot = new Telegraf(STORE_BOT_TOKEN);

// ГАРАНТИРУЕМ ПРАВИЛЬНЫЙ ПУТЬ К ПАПКЕ (в корне проекта)
const uploadDir = path.join(process.cwd(), 'uploads-quarantine');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log("📁 Папка карантина создана:", uploadDir);
}

const upload = multer({ dest: uploadDir });

module.exports = function(app, context) {

    app.get('/x-api/ping', (req, res) => {
        res.json({ status: "online" });
    });

    // --- 1. ПОЛНОЦЕННАЯ АДМИНКА ---
    app.get('/x-admin', (req, res) => {
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
        body { background: #0b0b0b; color: #e6edf3; font-family: sans-serif; padding: 15px; margin: 0; }
        .header { border-bottom: 2px solid #ff6600; padding-bottom: 10px; margin-bottom: 20px; }
        .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 15px; margin-bottom: 15px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
        .file-id { font-family: monospace; font-size: 11px; color: #58a6ff; margin-bottom: 8px; display: block; overflow: hidden; text-overflow: ellipsis; }
        .btn-del { background: #da3633; color: white; border: none; padding: 10px; border-radius: 8px; width: 100%; font-weight: bold; cursor: pointer; }
        .no-data { text-align: center; opacity: 0.5; padding-top: 50px; }
    </style>
</head>
<body>
    <div class="header">
        <h3 style="margin:0; color:#ff6600;">📦 КАРАНТИН (${files.length})</h3>
    </div>
    <div id="list">
        ${files.length ? files.map(f => `
            <div class="card" id="card-${f.name}">
                <span class="file-id">ID: ${f.name}</span>
                <div style="font-size: 13px; margin-bottom: 10px;">⚖️ Вес: ${f.size} MB<br>📅 ${f.time.toLocaleString()}</div>
                <button class="btn-del" onclick="del('${f.name}')">УДАЛИТЬ ИЗ КАРМАНИЩА</button>
            </div>
        `).join('') : '<div class="no-data">Пусто. Файлы не найдены в директории.</div>'}
    </div>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <script>
        const tg = window.Telegram.WebApp;
        tg.expand();
        tg.MainButton.setText("🔄 ОБНОВИТЬ СПИСОК").show().onClick(() => location.reload());

        async function del(id) {
            if(confirm("Удалить файл навсегда?")) {
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

    // --- 3. ПРИЕМ ЗАЯВКИ (С ПОЛНЫМ УВЕДОМЛЕНИЕМ) ---
    app.post('/x-api/upload', upload.single('appZip'), async (req, res) => {
        try {
            const { name, email, cat, url, type } = req.body;
            const file = req.file;

            let fullMessage = `🛡 **НОВАЯ ЗАЯВКА X-STORE**\n\n` +
                              `📦 Проект: **${name}**\n` +
                              `👤 Автор: ${email}\n` +
                              `🗂 Категория: ${cat}\n`;
            
            if (file) {
                fullMessage += `⚖️ Размер ZIP: ${(file.size / (1024 * 1024)).toFixed(2)} MB\n` +
                               `📁 Статус: Сохранен в карантин`;
            } else if (url) {
                fullMessage += `🔗 Ссылка: ${url}\n` +
                               `📁 Статус: Внешний хостинг`;
            }

            // Отправляем полное уведомление с кнопкой WebApp
            await storeBot.telegram.sendMessage(MY_ID, fullMessage, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.webApp('📂 ОТКРЫТЬ АДМИН-ПАНЕЛЬ', 'https://logist-x.store/x-admin')]
                ])
            });

            res.json({ success: true });
        } catch (e) {
            console.error("Ошибка при загрузке:", e);
            res.status(500).json({ error: e.message });
        }
    });

    storeBot.launch().catch(err => console.error("Бот магазина ошибка:", err));
};
