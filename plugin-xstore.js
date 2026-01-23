const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Telegraf, Markup } = require('telegraf');

const STORE_BOT_TOKEN = '8177397301:AAH4eNkzks_DuvuMB0leavzpcKMowwFz4Uw'; 
const MY_ID = 6846149935; 
const storeBot = new Telegraf(STORE_BOT_TOKEN);

// --- ПАПКИ ---
// Используем process.cwd() для надежности путей
const quarantineDir = path.join(process.cwd(), 'uploads-quarantine');
const publicDir = path.join(process.cwd(), 'public', 'apps');
const dbFile = path.join(process.cwd(), 'public', 'apps.json');

// Создаем папки и базу, если их нет
if (!fs.existsSync(quarantineDir)) fs.mkdirSync(quarantineDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, '[]');

const upload = multer({ dest: quarantineDir });

module.exports = function(app, context) {
    
    // 0. ОТДАЕМ СПИСОК МАГАЗИНУ (С ЗАПРЕТОМ КЭША!)
    app.get('/x-api/apps', (req, res) => {
        // ЭТИ ЗАГОЛОВКИ ЗАСТАВЛЯЮТ ТЕЛЕФОН ОБНОВЛЯТЬ СПИСОК
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Expires', '-1');
        res.set('Pragma', 'no-cache');

        if (fs.existsSync(dbFile)) {
            const data = fs.readFileSync(dbFile);
            res.json(JSON.parse(data));
        } else {
            res.json([]);
        }
    });

    // 0.1 Пинг
    app.get('/x-api/ping', (req, res) => res.json({ status: "online" }));

    // 1. БОТ: СТАРТ
    storeBot.start((ctx) => {
        if (ctx.from.id === MY_ID) {
            ctx.reply('👋 Админка готова! Жми кнопку ниже:', 
                Markup.inlineKeyboard([[Markup.button.webApp('📂 УПРАВЛЕНИЕ МАГАЗИНОМ', 'https://logist-x.store/x-admin')]])
            );
        }
    });

    // 2. АДМИНКА (WEBAPP ИНТЕРФЕЙС)
    app.get('/x-admin', (req, res) => {
        // А. Читаем АКТИВНЫЕ (Опубликованные)
        let activeApps = [];
        try { activeApps = JSON.parse(fs.readFileSync(dbFile)); } catch(e) {}

        // Б. Читаем НОВЫЕ (На проверке)
        const pendingFiles = fs.readdirSync(quarantineDir)
            .filter(name => name.endsWith('.json'))
            .map(jsonName => {
                const id = jsonName.replace('.json', '');
                let info = {};
                try { info = JSON.parse(fs.readFileSync(path.join(quarantineDir, jsonName))); } catch(e){}
                const hasZip = fs.existsSync(path.join(quarantineDir, id));
                return { id, name: info.name, cat: info.cat, type: hasZip ? 'ZIP' : 'LINK', url: info.url };
            }).reverse();

        res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { background: #0b0b0b; color: #fff; font-family: sans-serif; padding: 15px; margin: 0; }
        h2 { border-bottom: 2px solid #333; padding-bottom: 10px; font-size: 14px; margin-top: 20px; color: #888; text-transform: uppercase; }
        .card { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 15px; margin-bottom: 15px; position: relative; }
        .title { color: #ff6600; font-weight: bold; font-size: 16px; margin-bottom: 5px; }
        .meta { color: #888; font-size: 12px; margin-bottom: 10px; }
        .btn { width: 100%; padding: 10px; border: none; border-radius: 8px; font-weight: bold; margin-top: 5px; cursor: pointer; color: white; font-size: 12px; }
        .btn-pub { background: #28a745; }
        .btn-del { background: #dc3545; }
        .btn-check { background: #1f6feb; }
    </style>
</head>
<body>
    
    <h2 style="color: #28a745; border-color: #28a745;">🟢 В МАГАЗИНЕ (${activeApps.length})</h2>
    ${activeApps.length ? activeApps.map(app => `
        <div class="card" id="app-${app.id}">
            <div class="title">${app.title}</div>
            <div class="meta">${app.cat}</div>
            <a href="${app.url}" target="_blank"><button class="btn btn-check">🔗 ПРОВЕРИТЬ</button></a>
            <button class="btn btn-del" onclick="unpublish('${app.id}')">❌ УДАЛИТЬ ИЗ МАГАЗИНА</button>
        </div>
    `).join('') : '<div style="text-align:center; opacity:0.5;">Магазин пуст</div>'}

    <h2 style="color: #ffc107; border-color: #ffc107;">🟡 ЖДУТ ПРОВЕРКИ (${pendingFiles.length})</h2>
    ${pendingFiles.length ? pendingFiles.map(f => `
        <div class="card" id="req-${f.id}">
            <div class="title">${f.name}</div>
            <div class="meta">Тип: ${f.type} • ${f.cat}</div>
            <button class="btn btn-pub" onclick="publish('${f.id}')">✅ ОПУБЛИКОВАТЬ</button>
            ${f.type === 'ZIP' ? `<a href="/x-api/download/${f.id}" target="_blank"><button class="btn btn-check">⬇️ СКАЧАТЬ ZIP</button></a>` : ''}
            <button class="btn btn-del" onclick="reject('${f.id}')">🗑 ОТКЛОНИТЬ</button>
        </div>
    `).join('') : '<div style="text-align:center; opacity:0.5;">Заявок нет</div>'}

    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <script>
        const tg = window.Telegram.WebApp; tg.expand();

        // ФУНКЦИЯ УДАЛЕНИЯ ИЗ МАГАЗИНА
        async function unpublish(id) {
            if(confirm("Удалить это приложение из магазина?")) {
                await fetch('/x-api/unpublish/' + id, { method: 'POST' });
                document.getElementById('app-' + id).remove();
            }
        }

        // ФУНКЦИЯ ПУБЛИКАЦИИ
        async function publish(id) {
            if(confirm("Опубликовать?")) {
                await fetch('/x-api/publish/' + id, { method: 'POST' });
                location.reload(); 
            }
        }

        // ФУНКЦИЯ ОТКЛОНЕНИЯ
        async function reject(id) {
            if(confirm("Удалить заявку?")) {
                await fetch('/x-api/delete/' + id, { method: 'DELETE' });
                document.getElementById('req-' + id).remove();
            }
        }
    </script>
</body>
</html>`);
    });

    // 3. ПУБЛИКАЦИЯ (Перенос в базу)
    app.post('/x-api/publish/:id', (req, res) => {
        const id = req.params.id;
        const infoPath = path.join(quarantineDir, id + '.json');
        
        if (!fs.existsSync(infoPath)) return res.status(404).json({error: "Заявка не найдена"});

        const info = JSON.parse(fs.readFileSync(infoPath));
        let finalUrl = info.url;
        let newFileName = '';

        // Если это файл, перемещаем его
        if (!info.url) { 
            const oldPath = path.join(quarantineDir, id);
            newFileName = `app_${Date.now()}.zip`;
            if (fs.existsSync(oldPath)) {
                fs.renameSync(oldPath, path.join(publicDir, newFileName));
                finalUrl = `https://logist-x.store/public/apps/${newFileName}`;
            }
        }

        // Генерируем ID как строку для надежности
        const newId = String(Date.now());

        const db = JSON.parse(fs.readFileSync(dbFile));
        db.push({
            id: newId, 
            title: info.name,
            cat: info.cat,
            desc: info.desc || '',
            icon: 'https://cdn-icons-png.flaticon.com/512/3208/3208728.png',
            url: finalUrl,
            fileParams: newFileName
        });
        fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));

        // Чистим карантин
        fs.unlinkSync(infoPath);
        if (fs.existsSync(path.join(quarantineDir, id))) fs.unlinkSync(path.join(quarantineDir, id));

        storeBot.telegram.sendMessage(MY_ID, `🚀 Опубликовано: ${info.name}`);
        res.json({ success: true });
    });

    // 4. УДАЛЕНИЕ ИЗ МАГАЗИНА (ИСПРАВЛЕНО!)
    app.post('/x-api/unpublish/:id', (req, res) => {
        const id = req.params.id;
        let db = [];
        try { db = JSON.parse(fs.readFileSync(dbFile)); } catch(e) {}
        
        // ВАЖНО: Превращаем оба ID в строку перед сравнением!
        const appToDelete = db.find(a => String(a.id) === String(id));
        
        if (appToDelete) {
            // Удаляем файл
            if (appToDelete.fileParams) {
                const filePath = path.join(publicDir, appToDelete.fileParams);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
            // Удаляем запись из базы (сравниваем как строки)
            db = db.filter(a => String(a.id) !== String(id));
            fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));

            storeBot.telegram.sendMessage(MY_ID, `🗑 Удалено из магазина: ${appToDelete.title}`);
        }
        res.json({ success: true });
    });

    // 5. ЗАГРУЗКА ЗАЯВКИ
    app.post('/x-api/upload', upload.single('appZip'), async (req, res) => {
        const { name, email, cat, desc, type, url } = req.body;
        const file = req.file;
        const id = file ? file.filename : `req_${Date.now()}`;
        
        fs.writeFileSync(path.join(quarantineDir, id + '.json'), JSON.stringify({ name, email, cat, desc, url }));
        
        await storeBot.telegram.sendMessage(MY_ID, `🆕 Новая заявка: ${name}`, Markup.inlineKeyboard([[Markup.button.webApp('АДМИНКА', 'https://logist-x.store/x-admin')]]));
        res.json({ success: true });
    });

    // 6. УДАЛЕНИЕ ЗАЯВКИ
    app.delete('/x-api/delete/:id', (req, res) => {
        const id = req.params.id;
        if(fs.existsSync(path.join(quarantineDir, id))) fs.unlinkSync(path.join(quarantineDir, id));
        if(fs.existsSync(path.join(quarantineDir, id + '.json'))) fs.unlinkSync(path.join(quarantineDir, id + '.json'));
        res.json({success:true});
    });

    // 7. СКАЧИВАНИЕ
    app.get('/x-api/download/:id', (req, res) => {
        const file = path.join(quarantineDir, req.params.id);
        if (fs.existsSync(file)) res.download(file, 'check.zip');
        else res.sendStatus(404);
    });

    storeBot.launch().catch(err => console.log("Bot Error:", err));
};
