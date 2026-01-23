const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Telegraf, Markup } = require('telegraf');

const STORE_BOT_TOKEN = '8177397301:AAH4eNkzks_DuvuMB0leavzpcKMowwFz4Uw'; 
const MY_ID = 6846149935; 
const storeBot = new Telegraf(STORE_BOT_TOKEN);

// Устанавливаем путь к папке карантина в корне проекта
const uploadDir = path.join(process.cwd(), 'uploads-quarantine');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });

module.exports = function(app, context) {

    // 0. ПИНГ ДЛЯ МАГАЗИНА
    app.get('/x-api/ping', (req, res) => {
        res.json({ status: "online", message: "X-Server is ready" });
    });

    // 1. КОМАНДА START ДЛЯ БОТА
    storeBot.start((ctx) => {
        if (ctx.from.id === MY_ID) {
            return ctx.reply('🚀 Евгений, добро пожаловать в X-Store Admin!', 
                Markup.inlineKeyboard([
                    [Markup.button.webApp('📂 УПРАВЛЕНИЕ ФАЙЛАМИ', 'https://logist-x.store/x-admin')]
                ])
            );
        }
    });

    // 2. ГЕНЕРАЦИЯ АДМИН-ПАНЕЛИ (WEBAPP)
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
        body { background: #0b0b0b; color: #e6edf3; font-family: -apple-system, sans-serif; padding: 15px; margin: 0; }
        .header { border-bottom: 2px solid #ff6600; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
        .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 15px; margin-bottom: 15px; position: relative; }
        .file-id { font-family: monospace; font-size: 10px; color: #58a6ff; display: block; margin-bottom: 5px; opacity: 0.7; }
        .file-info { font-size: 13px; line-height: 1.4; }
        .btn-del { background: #da3633; color: white; border: none; padding: 10px; border-radius: 8px; width: 100%; font-weight: bold; margin-top: 12px; cursor: pointer; }
        .btn-del:active { background: #f85149; }
        .empty { text-align: center; opacity: 0.4; margin-top: 50px; font-size: 14px; }
    </style>
</head>
<body>
    <div class="header">
        <h3 style="margin:0; color:#ff6600;">📦 КАРАНТИН (${files.length})</h3>
        <span style="font-size:10px; opacity:0.5;">v1.2</span>
    </div>
    <div id="list">
        ${files.length ? files.map(f => `
            <div class="card" id="card-${f.name}">
                <span class="file-id">${f.name}</span>
                <div class="file-info">
                    ⚖️ <b>Вес:</b> ${f.size} MB<br>
                    📅 <b>Дата:</b> ${f.time.toLocaleString('ru-RU')}
                </div>
                <button class="btn-del" onclick="delFile('${f.name}')">УДАЛИТЬ НАВСЕГДА</button>
            </div>
        `).join('') : '<div class="empty">В карантине пока пусто</div>'}
    </div>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <script>
        const tg = window.Telegram.WebApp;
        tg.expand();
        tg.MainButton.setText("🔄 ОБНОВИТЬ СПИСОК").show().onClick(() => location.reload());

        async function delFile(id) {
            if (confirm("Вы уверены, что хотите удалить этот файл?")) {
                try {
                    const res = await fetch('/x-api/delete/' + id, { method: 'DELETE' });
                    if (res.ok) {
                        document.getElementById('card-' + id).style.opacity = '0.3';
                        setTimeout(() => document.getElementById('card-' + id).remove(), 300);
                    }
                } catch (e) { alert("Ошибка при удалении"); }
            }
        }
    </script>
</body>
</html>
        `);
    });

    // 3. API ДЛЯ УДАЛЕНИЯ ФАЙЛОВ
    app.delete('/x-api/delete/:id', (req, res) => {
        const filePath = path.join(uploadDir, req.params.id);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.sendStatus(200);
        } else {
            res.status(404).send("Файл не найден");
        }
    });

    // 4. ПРИЕМ ЗАЯВОК ИЗ МАГАЗИНА
    app.post('/x-api/upload', upload.single('appZip'), async (req, res) => {
        try {
            const { name, email, cat, url } = req.body;
            const file = req.file;

            // Формируем сообщение в HTML (безопасно для спецсимволов)
            let htmlMsg = `<b>🛡 НОВАЯ ЗАЯВКА X-STORE</b>\n\n`;
            htmlMsg += `📦 Проект: <b>${name || 'Без названия'}</b>\n`;
            htmlMsg += `👤 Автор: <code>${email || 'Не указан'}</code>\n`;
            htmlMsg += `🗂 Категория: ${cat || 'Общее'}\n\n`;
            
            if (file) {
                htmlMsg += `📊 Тип: <b>ZIP-Архив</b>\n`;
                htmlMsg += `⚖️ Вес: <b>${(file.size / (1024 * 1024)).toFixed(2)} MB</b>\n`;
            } else if (url) {
                htmlMsg += `📊 Тип: <b>Ссылка</b>\n`;
                htmlMsg += `🔗 URL: ${url}\n`;
            }

            await storeBot.telegram.sendMessage(MY_ID, htmlMsg, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.webApp('📂 ОТКРЫТЬ АДМИН-ПАНЕЛЬ', 'https://logist-x.store/x-admin')]
                ])
            });

            res.json({ success: true });
        } catch (e) {
            console.error("X-Store Error:", e.message);
            res.status(500).json({ error: "Ошибка сервера" });
        }
    });

    storeBot.launch().catch(err => console.error("Ошибка запуска Бота:", err));
};
