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
const dbFile = path.join(process.cwd(), 'public', 'apps.json');

// Создаем папки и базу
if (!fs.existsSync(quarantineDir)) fs.mkdirSync(quarantineDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, '[]');

const upload = multer({ dest: quarantineDir });

module.exports = function(app, context) {
    
    // 0. ОТДАЕМ СПИСОК (API)
    app.get('/x-api/apps', (req, res) => {
        if (fs.existsSync(dbFile)) {
            res.json(JSON.parse(fs.readFileSync(dbFile)));
        } else {
            res.json([]);
        }
    });

    app.get('/x-api/ping', (req, res) => res.json({ status: "online" }));

    // 1. БОТ
    storeBot.start((ctx) => {
        if (ctx.from.id === MY_ID) {
            ctx.reply('🚀 Админка готова!', Markup.inlineKeyboard([[Markup.button.webApp('📂 УПРАВЛЕНИЕ', 'https://logist-x.store/x-admin')]]));
        }
    });

    // 2. АДМИНКА (ВИДИТ И ФАЙЛЫ, И ССЫЛКИ)
    app.get('/x-admin', (req, res) => {
        // Читаем JSON-файлы описаний (они есть у всех заявок)
        const items = fs.readdirSync(quarantineDir)
            .filter(name => name.endsWith('.json'))
            .map(jsonName => {
                const id = jsonName.replace('.json', '');
                let info = {};
                try { info = JSON.parse(fs.readFileSync(path.join(quarantineDir, jsonName))); } catch(e){}

                // Проверяем, есть ли физический ZIP файл
                const hasZip = fs.existsSync(path.join(quarantineDir, id)); // multer сохраняет без расширения
                
                return { 
                    id: id, 
                    name: info.name,
                    cat: info.cat,
                    type: info.type, // 'host' или 'link'
                    val: hasZip ? 'ZIP-Архив' : 'Внешняя ссылка',
                    url: info.url
                };
            })
            .reverse(); // Новые сверху

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
        .btn-check { background: #1f6feb; }
        .btn-del { background: #dc3545; }
    </style>
</head>
<body>
    <h3>📦 Заявки (${items.length})</h3>
    ${items.map(f => `
        <div class="card" id="card-${f.id}">
            <div class="title">${f.name}</div>
            <div class="meta">Тип: ${f.val} • ${f.cat}</div>
            
            <button class="btn btn-pub" onclick="publish('${f.id}')">✅ ОПУБЛИКОВАТЬ</button>
            
            ${f.type === 'link' 
                ? `<a href="${f.url}" target="_blank"><button class="btn btn-check">🔗 ПРОВЕРИТЬ ССЫЛКУ</button></a>` 
                : `<a href="/x-api/download/${f.id}" target="_blank"><button class="btn btn-check">⬇️ СКАЧАТЬ ZIP</button></a>`
            }
            
            <button class="btn btn-del" onclick="del('${f.id}')">❌ УДАЛИТЬ</button>
        </div>
    `).join('')}
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <script>
        const tg = window.Telegram.WebApp; tg.expand();
        
        async function publish(id) {
            if(confirm("Опубликовать в магазине?")) {
                const res = await fetch('/x-api/publish/' + id, { method: 'POST' });
                const data = await res.json();
                if(data.success) {
                    alert("Готово! Карточка создана.");
                    document.getElementById('card-' + id).remove();
                }
            }
        }
        
        async function del(id) {
            if(confirm("Удалить заявку?")) {
                await fetch('/x-api/delete/' + id, { method: 'DELETE' });
                document.getElementById('card-' + id).remove();
            }
        }
    </script>
</body>
</html>`);
    });

    // 3. ПУБЛИКАЦИЯ (УМНАЯ ЛОГИКА)
    app.post('/x-api/publish/:id', (req, res) => {
        const id = req.params.id;
        const infoPath = path.join(quarantineDir, id + '.json');
        
        if (!fs.existsSync(infoPath)) return res.status(404).send("Заявка не найдена");

        const info = JSON.parse(fs.readFileSync(infoPath));
        let finalUrl = '';

        // ЛОГИКА: ССЫЛКА ИЛИ ФАЙЛ?
        if (info.type === 'link') {
            finalUrl = info.url; // Берем ссылку автора
        } else {
            // Это файл, нужно переместить
            const oldPath = path.join(quarantineDir, id); // файл multer
            if (fs.existsSync(oldPath)) {
                const newName = `app_${Date.now()}.zip`;
                fs.renameSync(oldPath, path.join(publicDir, newName));
                finalUrl = `https://logist-x.store/public/apps/${newName}`;
            }
        }

        // Добавляем в БАЗУ
        const db = JSON.parse(fs.readFileSync(dbFile));
        db.push({
            id: Date.now(), // Уникальный ID для магазина
            title: info.name,
            cat: info.cat,
            desc: info.desc || 'Нет описания',
            icon: 'https://cdn-icons-png.flaticon.com/512/3208/3208728.png',
            url: finalUrl // Тут теперь правильная ссылка
        });
        fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));

        // Чистим карантин (удаляем .json и сам файл, если был)
        fs.unlinkSync(infoPath);
        if (fs.existsSync(path.join(quarantineDir, id))) fs.unlinkSync(path.join(quarantineDir, id));

        storeBot.telegram.sendMessage(MY_ID, `🚀 **${info.name}** опубликован!`);
        res.json({ success: true });
    });

    // 4. ЗАГРУЗКА (Обработка типа)
    app.post('/x-api/upload', upload.single('appZip'), async (req, res) => {
        const { name, email, cat, desc, type, url } = req.body;
        const file = req.file;
        
        // Генерируем ID заявки (если файла нет, используем timestamp)
        const id = file ? file.filename : `req_${Date.now()}`;

        // Сохраняем инфо
        const info = { name, email, cat, desc, type, url };
        fs.writeFileSync(path.join(quarantineDir, id + '.json'), JSON.stringify(info));

        let msg = `🆕 **Заявка:** ${name}\n🗂 ${cat}\n`;
        msg += (type === 'link') ? `🔗 Тип: Ссылка` : `📦 Тип: ZIP Файл`;

        await storeBot.telegram.sendMessage(MY_ID, msg, Markup.inlineKeyboard([[Markup.button.webApp('АДМИНКА', 'https://logist-x.store/x-admin')]]));
        res.json({ success: true });
    });

    // 5. УДАЛЕНИЕ
    app.delete('/x-api/delete/:id', (req, res) => {
        const id = req.params.id;
        const f1 = path.join(quarantineDir, id);
        const f2 = path.join(quarantineDir, id + '.json');
        if(fs.existsSync(f1)) fs.unlinkSync(f1);
        if(fs.existsSync(f2)) fs.unlinkSync(f2);
        res.json({success:true});
    });
    
    // 6. СКАЧИВАНИЕ (Для ZIP)
    app.get('/x-api/download/:id', (req, res) => {
        const file = path.join(quarantineDir, req.params.id);
        if (fs.existsSync(file)) res.download(file, 'check.zip');
        else res.status(404).send('Файл не найден (возможно это ссылка)');
    });

    storeBot.launch();
};
