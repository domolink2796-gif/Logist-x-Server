const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Telegraf, Markup } = require('telegraf');

const STORE_BOT_TOKEN = '8177397301:AAH4eNkzks_DuvuMB0leavzpcKMowwFz4Uw'; 
const MY_ID = 6846149935; 
const storeBot = new Telegraf(STORE_BOT_TOKEN);

// --- ПАПКИ ---
const quarantineDir = path.join(process.cwd(), 'uploads-quarantine');
const publicDir = path.join(process.cwd(), 'public', 'apps');
const dbFile = path.join(process.cwd(), 'public', 'apps.json'); // База данных магазина

// Создаем папки и базу, если нет
if (!fs.existsSync(quarantineDir)) fs.mkdirSync(quarantineDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, '[]'); // Пустая база

const upload = multer({ dest: quarantineDir });

module.exports = function(app, context) {
    
    // 0. ОТДАЕМ СПИСОК ПРИЛОЖЕНИЙ МАГАЗИНУ
    app.get('/x-api/apps', (req, res) => {
        // Читаем базу и отдаем сайту
        if (fs.existsSync(dbFile)) {
            const data = fs.readFileSync(dbFile);
            res.json(JSON.parse(data));
        } else {
            res.json([]);
        }
    });

    // 0.1 ПИНГ
    app.get('/x-api/ping', (req, res) => res.json({ status: "online" }));

    // 1. СТАРТ БОТА
    storeBot.start((ctx) => {
        if (ctx.from.id === MY_ID) {
            ctx.reply('🚀 Админка X-Store активна!', Markup.inlineKeyboard([[Markup.button.webApp('📂 УПРАВЛЕНИЕ', 'https://logist-x.store/x-admin')]]));
        }
    });

    // 2. АДМИНКА (WEBAPP)
    app.get('/x-admin', (req, res) => {
        // Читаем файлы и ищем к ним .json с инфой
        const files = fs.readdirSync(quarantineDir)
            .filter(name => !name.startsWith('.') && !name.endsWith('.json')) // Только файлы, не json
            .map(filename => {
                const stats = fs.statSync(path.join(quarantineDir, filename));
                
                // Пытаемся найти инфо-файл
                let info = { name: 'Неизвестно', cat: 'Разное' };
                try {
                    const infoData = fs.readFileSync(path.join(quarantineDir, filename + '.json'));
                    info = JSON.parse(infoData);
                } catch(e) {}

                return { 
                    id: filename, 
                    name: info.name,
                    cat: info.cat,
                    size: (stats.size / 1024 / 1024).toFixed(2), 
                    time: stats.mtime 
                };
            })
            .sort((a, b) => b.time - a.time);

        res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { background: #0b0b0b; color: #fff; font-family: sans-serif; padding: 15px; }
        .card { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 15px; margin-bottom: 15px; }
        .title { color: #ff6600; font-weight: bold; font-size: 16px; margin-bottom: 5px; }
        .meta { color: #888; font-size: 12px; margin-bottom: 10px; }
        .btn { width: 100%; padding: 12px; border: none; border-radius: 8px; font-weight: bold; margin-top: 5px; cursor: pointer; color: white; }
        .btn-pub { background: #28a745; }
        .btn-del { background: #dc3545; }
    </style>
</head>
<body>
    <h3>📦 Заявки (${files.length})</h3>
    ${files.map(f => `
        <div class="card" id="card-${f.id}">
            <div class="title">${f.name}</div>
            <div class="meta">${f.cat} • ${f.size} MB</div>
            <button class="btn btn-pub" onclick="publish('${f.id}')">✅ ОПУБЛИКОВАТЬ В МАГАЗИН</button>
            <button class="btn btn-del" onclick="del('${f.id}')">❌ УДАЛИТЬ</button>
        </div>
    `).join('')}
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <script>
        const tg = window.Telegram.WebApp; tg.expand();
        async function publish(id) {
            if(confirm("Добавить это приложение в магазин?")) {
                await fetch('/x-api/publish/' + id, { method: 'POST' });
                alert("Готово! Приложение появилось на сайте.");
                document.getElementById('card-' + id).remove();
            }
        }
        async function del(id) {
            if(confirm("Удалить?")) {
                await fetch('/x-api/delete/' + id, { method: 'DELETE' });
                document.getElementById('card-' + id).remove();
            }
        }
    </script>
</body>
</html>`);
    });

    // 3. ПУБЛИКАЦИЯ (ГЛАВНАЯ МАГИЯ)
    app.post('/x-api/publish/:id', (req, res) => {
        const id = req.params.id;
        const oldPath = path.join(quarantineDir, id);
        const infoPath = path.join(quarantineDir, id + '.json');

        if (fs.existsSync(oldPath) && fs.existsSync(infoPath)) {
            // 1. Перемещаем файл в публичную папку
            const newName = `app_${Date.now()}.zip`;
            fs.renameSync(oldPath, path.join(publicDir, newName));

            // 2. Читаем инфо о приложении
            const info = JSON.parse(fs.readFileSync(infoPath));
            
            // 3. Добавляем в базу данных магазина
            const db = JSON.parse(fs.readFileSync(dbFile));
            db.push({
                id: newName,
                title: info.name,
                cat: info.cat,
                desc: info.desc || 'Без описания',
                icon: 'https://cdn-icons-png.flaticon.com/512/3208/3208728.png', // Стандартная иконка (пока так)
                url: `https://logist-x.store/public/apps/${newName}`
            });
            fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));

            // 4. Удаляем инфо-файл из карантина
            fs.unlinkSync(infoPath);

            storeBot.telegram.sendMessage(MY_ID, `🚀 **${info.name}** теперь доступен всем в магазине!`);
            res.json({ success: true });
        } else {
            res.status(404).send("Ошибка файлов");
        }
    });

    // 4. ЗАГРУЗКА (С СОХРАНЕНИЕМ ИНФЫ)
    app.post('/x-api/upload', upload.single('appZip'), async (req, res) => {
        const { name, email, cat, desc } = req.body;
        const file = req.file;

        if (file) {
            // Сохраняем инфо-файл рядом с ZIP
            const info = { name, email, cat, desc };
            fs.writeFileSync(path.join(quarantineDir, file.filename + '.json'), JSON.stringify(info));
            
            await storeBot.telegram.sendMessage(MY_ID, `🆕 **Заявка:** ${name}\nКатегория: ${cat}`, Markup.inlineKeyboard([[Markup.button.webApp('АДМИНКА', 'https://logist-x.store/x-admin')]]));
        }
        res.json({ success: true });
    });

    // 5. УДАЛЕНИЕ
    app.delete('/x-api/delete/:id', (req, res) => {
        const id = req.params.id;
        if(fs.existsSync(path.join(quarantineDir, id))) fs.unlinkSync(path.join(quarantineDir, id));
        if(fs.existsSync(path.join(quarantineDir, id + '.json'))) fs.unlinkSync(path.join(quarantineDir, id + '.json'));
        res.json({success:true});
    });

    storeBot.launch();
};
