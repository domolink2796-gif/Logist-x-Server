const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const AdmZip = require('adm-zip'); // Библиотека для распаковки
const { Telegraf, Markup } = require('telegraf');

const STORE_BOT_TOKEN = '8177397301:AAH4eNkzks_DuvuMB0leavzpcKMowwFz4Uw'; 
const MY_ID = 6846149935; 
const storeBot = new Telegraf(STORE_BOT_TOKEN);

// --- ПАПКИ ---
const quarantineDir = path.join(process.cwd(), 'uploads-quarantine');
const publicDir = path.join(process.cwd(), 'public', 'apps');
const dbFile = path.join(process.cwd(), 'public', 'apps.json');

if (!fs.existsSync(quarantineDir)) fs.mkdirSync(quarantineDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, '[]');

const upload = multer({ dest: quarantineDir });

// --- ФУНКЦИЯ: ГЕНЕРАЦИЯ ССЫЛКИ НА VIRUSTOTAL ---
function getVirusTotalLink(type, data) {
    if (type === 'file_hash') {
        return `https://www.virustotal.com/gui/file/${data}`;
    } else {
        const encodedUrl = Buffer.from(data).toString('base64').replace(/=/g, '');
        return `https://www.virustotal.com/gui/url/${encodedUrl}`;
    }
}

module.exports = function(app, context) {
    
    // ОТДАЕМ СПИСОК (NO-CACHE)
    app.get('/x-api/apps', (req, res) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        if (fs.existsSync(dbFile)) res.json(JSON.parse(fs.readFileSync(dbFile)));
        else res.json([]);
    });

    app.get('/x-api/ping', (req, res) => res.json({ status: "online" }));

    storeBot.start((ctx) => {
        if (ctx.from.id === MY_ID) {
            ctx.reply('🛡 Админка защиты готова!', Markup.inlineKeyboard([[Markup.button.webApp('📂 УПРАВЛЕНИЕ + АНТИВИРУС', 'https://logist-x.store/x-admin')]]));
        }
    });

    // 2. АДМИНКА
    app.get('/x-admin', (req, res) => {
        let activeApps = [];
        try { activeApps = JSON.parse(fs.readFileSync(dbFile)); } catch(e) {}

        const pendingFiles = fs.readdirSync(quarantineDir)
            .filter(name => name.endsWith('.json'))
            .map(jsonName => {
                const id = jsonName.replace('.json', '');
                let info = {};
                try { info = JSON.parse(fs.readFileSync(path.join(quarantineDir, jsonName))); } catch(e){}
                
                const hasZip = fs.existsSync(path.join(quarantineDir, id));
                let scanLink = '#';

                if (hasZip) {
                    const fileBuffer = fs.readFileSync(path.join(quarantineDir, id));
                    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
                    scanLink = getVirusTotalLink('file_hash', hash);
                } else if (info.url) {
                    scanLink = `https://www.virustotal.com/gui/search/${encodeURIComponent(info.url)}`;
                }

                return { id, name: info.name, cat: info.cat, type: hasZip ? 'ZIP' : 'LINK', url: info.url, scanLink };
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
        .card { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 15px; margin-bottom: 15px; }
        .title { color: #ff6600; font-weight: bold; font-size: 16px; margin-bottom: 5px; }
        .meta { color: #888; font-size: 12px; margin-bottom: 10px; }
        .btn { width: 100%; padding: 10px; border: none; border-radius: 8px; font-weight: bold; margin-top: 5px; cursor: pointer; color: white; font-size: 12px; }
        .btn-pub { background: #28a745; }
        .btn-del { background: #dc3545; }
        .btn-check { background: #1f6feb; }
        .btn-scan { background: #6f42c1; display: flex; align-items: center; justify-content: center; gap: 5px; }
    </style>
</head>
<body>
    <h2 style="color: #28a745; border-color: #28a745;">🟢 В МАГАЗИНЕ (${activeApps.length})</h2>
    ${activeApps.map(app => `
        <div class="card" id="app-${app.id}">
            <div class="title">${app.title}</div>
            <div class="meta">${app.cat}</div>
            <a href="${app.url}" target="_blank" style="text-decoration:none;"><button class="btn btn-check">🔗 ОТКРЫТЬ</button></a>
            <button class="btn btn-del" onclick="unpublish('${app.id}')">❌ УДАЛИТЬ</button>
        </div>
    `).join('')}

    <h2 style="color: #ffc107; border-color: #ffc107;">🟡 НА ПРОВЕРКЕ (${pendingFiles.length})</h2>
    ${pendingFiles.map(f => `
        <div class="card" id="req-${f.id}">
            <div class="title">${f.name}</div>
            <div class="meta">Тип: ${f.type} • ${f.cat}</div>
            <a href="${f.scanLink}" target="_blank" style="text-decoration:none;"><button class="btn btn-scan">🛡 VIRUS TOTAL</button></a>
            <div style="display:flex; gap:5px; margin-top:5px;">
                <button class="btn btn-pub" onclick="publish('${f.id}')">✅ ПРИНЯТЬ</button>
                <button class="btn btn-del" onclick="reject('${f.id}')">🗑 ОТКЛОНИТЬ</button>
            </div>
        </div>
    `).join('')}

    <script>
        async function unpublish(id) {
            if(confirm("Удалить из магазина?")) {
                await fetch('/x-api/unpublish/' + id, { method: 'POST' });
                location.reload();
            }
        }
        async function publish(id) {
            if(confirm("Опубликовать приложение?")) {
                await fetch('/x-api/publish/' + id, { method: 'POST' });
                location.reload();
            }
        }
        async function reject(id) {
            if(confirm("Удалить заявку?")) {
                await fetch('/x-api/delete/' + id, { method: 'DELETE' });
                location.reload();
            }
        }
    </script>
</body>
</html>`);
    });

    // 3. ПУБЛИКАЦИЯ (С РАСПАКОВКОЙ)
    app.post('/x-api/publish/:id', (req, res) => {
        const id = req.params.id;
        const infoPath = path.join(quarantineDir, id + '.json');
        if (!fs.existsSync(infoPath)) return res.status(404).json({error: "Нет заявки"});

        const info = JSON.parse(fs.readFileSync(infoPath));
        const appFolderName = `app_${Date.now()}`;
        let finalUrl = info.url;

        // Если это ZIP — распаковываем
        const zipPath = path.join(quarantineDir, id);
        if (fs.existsSync(zipPath) && !info.url) {
            try {
                const zip = new AdmZip(zipPath);
                const extractPath = path.join(publicDir, appFolderName);
                zip.extractAllTo(extractPath, true);
                // Ссылка теперь ведет на файл внутри папки
                finalUrl = `https://logist-x.store/public/apps/${appFolderName}/index.html`;
            } catch (e) {
                return res.status(500).json({error: "Ошибка распаковки"});
            }
        }

        const db = JSON.parse(fs.readFileSync(dbFile));
        db.push({
            id: appFolderName, 
            title: info.name,
            cat: info.cat,
            desc: info.desc || '',
            icon: 'https://cdn-icons-png.flaticon.com/512/3208/3208728.png',
            url: finalUrl,
            folder: appFolderName // Запоминаем папку для удаления
        });
        fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));

        if(fs.existsSync(infoPath)) fs.unlinkSync(infoPath);
        if(fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

        storeBot.telegram.sendMessage(MY_ID, `🛡 Приложение "${info.name}" теперь в магазине.`);
        res.json({ success: true });
    });

    // 4. УДАЛЕНИЕ (С ЧИСТКОЙ ФАЙЛОВ)
    app.post('/x-api/unpublish/:id', (req, res) => {
        const id = req.params.id;
        let db = JSON.parse(fs.readFileSync(dbFile));
        const appData = db.find(a => String(a.id) === String(id));
        
        if (appData && appData.folder) {
            const folderPath = path.join(publicDir, appData.folder);
            if (fs.existsSync(folderPath)) fs.rmSync(folderPath, { recursive: true, force: true });
        }
        
        db = db.filter(a => String(a.id) !== String(id));
        fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
        res.json({ success: true });
    });

    // 5. ЗАГРУЗКА
    app.post('/x-api/upload', upload.single('appZip'), async (req, res) => {
        const { name, email, cat, desc, url } = req.body;
        const id = req.file ? req.file.filename : `req_${Date.now()}`;
        fs.writeFileSync(path.join(quarantineDir, id + '.json'), JSON.stringify({ name, email, cat, desc, url }));
        storeBot.telegram.sendMessage(MY_ID, `🆕 Новая заявка: ${name}`);
        res.json({ success: true });
    });

    // 6. ОТКЛОНЕНИЕ
    app.delete('/x-api/delete/:id', (req, res) => {
        const id = req.params.id;
        const p1 = path.join(quarantineDir, id);
        const p2 = path.join(quarantineDir, id + '.json');
        if(fs.existsSync(p1)) fs.unlinkSync(p1);
        if(fs.existsSync(p2)) fs.unlinkSync(p2);
        res.json({success:true});
    });

    storeBot.launch();
};
