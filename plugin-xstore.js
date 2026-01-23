const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const AdmZip = require('adm-zip'); 
const express = require('express'); 
const { Telegraf, Markup } = require('telegraf');

const STORE_BOT_TOKEN = '8177397301:AAH4eNkzks_DuvuMB0leavzpcKMowwFz4Uw'; 
const MY_ID = 6846149935; 
const storeBot = new Telegraf(STORE_BOT_TOKEN);

const quarantineDir = path.join(process.cwd(), 'uploads-quarantine');
const publicDir = path.join(process.cwd(), 'public', 'apps');
const dbFile = path.join(process.cwd(), 'public', 'apps.json');

if (!fs.existsSync(quarantineDir)) fs.mkdirSync(quarantineDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, '[]');

const upload = multer({ dest: quarantineDir });

function getVirusTotalLink(type, data) {
    if (type === 'file_hash') {
        return `https://www.virustotal.com/gui/file/${data}`;
    } else {
        const encodedUrl = Buffer.from(data).toString('base64').replace(/=/g, '');
        return `https://www.virustotal.com/gui/url/${encodedUrl}`;
    }
}

module.exports = function(app, context) {
    
    app.use('/public', express.static(path.join(process.cwd(), 'public')));

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
                let scanLink = hasZip ? getVirusTotalLink('file_hash', crypto.createHash('sha256').update(fs.readFileSync(path.join(quarantineDir, id))).digest('hex')) : `https://www.virustotal.com/gui/search/${encodeURIComponent(info.url)}`;
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
        .btn { width: 100%; padding: 10px; border: none; border-radius: 8px; font-weight: bold; margin-top: 5px; cursor: pointer; color: white; font-size: 12px; }
        .btn-pub { background: #28a745; } .btn-del { background: #dc3545; } .btn-scan { background: #6f42c1; }
    </style>
</head>
<body>
    <h2 style="color: #28a745; border-color: #28a745;">🟢 В МАГАЗИНЕ</h2>
    ${activeApps.map(app => `<div class="card"><div class="title">${app.title}</div><button class="btn btn-del" onclick="unpublish('${app.id}')">❌ УДАЛИТЬ</button></div>`).join('')}
    <h2 style="color: #ffc107; border-color: #ffc107;">🟡 НА ПРОВЕРКЕ</h2>
    ${pendingFiles.map(f => `
        <div class="card">
            <div class="title">${f.name}</div>
            <a href="${f.scanLink}" target="_blank" style="text-decoration:none;"><button class="btn btn-scan">🛡 VIRUS TOTAL</button></a>
            <div style="display:flex; gap:5px; margin-top:5px;">
                <button class="btn btn-pub" onclick="publish('${f.id}')">✅ ПРИНЯТЬ</button>
                <button class="btn btn-del" onclick="reject('${f.id}')">🗑 ОТКЛОНИТЬ</button>
            </div>
        </div>
    `).join('')}
    <script>
        async function unpublish(id) { if(confirm('Удалить?')) { await fetch('/x-api/unpublish/'+id, {method:'POST'}); location.reload(); } }
        async function publish(id) { if(confirm('Опубликовать?')) { await fetch('/x-api/publish/'+id, {method:'POST'}); location.reload(); } }
        async function reject(id) { if(confirm('Удалить?')) { await fetch('/x-api/delete/'+id, {method:'DELETE'}); location.reload(); } }
    </script>
</body>
</html>`);
    });

    app.post('/x-api/publish/:id', (req, res) => {
        const id = req.params.id;
        const infoPath = path.join(quarantineDir, id + '.json');
        if (!fs.existsSync(infoPath)) return res.status(404).json({error: "Нет заявки"});

        const info = JSON.parse(fs.readFileSync(infoPath));
        const appFolderName = "app_" + Date.now();
        const extractPath = path.join(publicDir, appFolderName);
        let finalUrl = info.url;
        let finalIcon = 'https://cdn-icons-png.flaticon.com/512/3208/3208728.png';
        let iconFileName = 'icon.png';

        const zipPath = path.join(quarantineDir, id);
        if (fs.existsSync(zipPath) && !info.url) {
            try {
                const zip = new AdmZip(zipPath);
                zip.extractAllTo(extractPath, true);
                finalUrl = "https://logist-x.store/public/apps/" + appFolderName + "/index.html";

                const files = fs.readdirSync(extractPath);
                const iconFile = files.find(f => f.toLowerCase().startsWith('icon.'));
                if (iconFile) {
                    iconFileName = iconFile;
                    finalIcon = "https://logist-x.store/public/apps/" + appFolderName + "/" + iconFile;
                }

                // Генерируем корректный Манифест
                const manifest = {
                    "name": info.name,
                    "short_name": info.name,
                    "start_url": "index.html",
                    "display": "standalone",
                    "background_color": "#0b0b0b",
                    "theme_color": "#ff6600",
                    "icons": [
                        { "src": iconFileName, "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
                        { "src": iconFileName, "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
                    ]
                };
                fs.writeFileSync(path.join(extractPath, 'manifest.json'), JSON.stringify(manifest, null, 2));

                // Улучшенный Service Worker
                const swCode = `const CACHE_NAME = 'x-app-${appFolderName}'; self.addEventListener('install', (e) => { self.skipWaiting(); }); self.addEventListener('fetch', (e) => { e.respondWith(fetch(e.request).catch(() => caches.match(e.request))); });`;
                fs.writeFileSync(path.join(extractPath, 'sw.js'), swCode);

                // 🔥 УМНАЯ ИНЪЕКЦИЯ КОДА УСТАНОВКИ
                const htmlPath = path.join(extractPath, 'index.html');
                if (fs.existsSync(htmlPath)) {
                    let html = fs.readFileSync(htmlPath, 'utf8');
                    const injectCode = `
<link rel="manifest" href="manifest.json">
<script>
    let deferredPrompt;
    if('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js'); }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Если открыто из магазина с параметром установки
        if (window.location.search.includes('mode=install')) {
            setTimeout(() => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    deferredPrompt.userChoice.then((choice) => {
                        if (choice.outcome === 'accepted' && window.opener) {
                            window.opener.postMessage('installed-success', '*');
                        }
                    });
                }
            }, 800);
        }
    });
</script>`;
                    // Вставляем код сразу после открывающего <head>
                    html = html.replace('<head>', '<head>' + injectCode);
                    fs.writeFileSync(htmlPath, html);
                }
            } catch (e) {
                return res.status(500).json({error: "Ошибка сборки PWA"});
            }
        }

        const db = JSON.parse(fs.readFileSync(dbFile));
        db.push({ id: appFolderName, title: info.name, cat: info.cat, icon: finalIcon, url: finalUrl, folder: appFolderName, desc: info.desc });
        fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));

        if(fs.existsSync(infoPath)) fs.unlinkSync(infoPath);
        if(fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

        storeBot.telegram.sendMessage(MY_ID, "✅ ПУБЛИКАЦИЯ: " + info.name, Markup.inlineKeyboard([[Markup.button.url('⚙️ УПРАВЛЕНИЕ', 'https://logist-x.store/x-admin')]]));
        res.json({ success: true });
    });

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

    app.post('/x-api/upload', upload.single('appZip'), async (req, res) => {
        const { name, email, cat, desc, url } = req.body;
        const id = req.file ? req.file.filename : "req_" + Date.now();
        fs.writeFileSync(path.join(quarantineDir, id + '.json'), JSON.stringify({ name, email, cat, desc, url }));
        const msg = "🆕 ЗАЯВКА: " + name + "\n📧: " + email + "\n📂: " + cat;
        storeBot.telegram.sendMessage(MY_ID, msg, Markup.inlineKeyboard([[Markup.button.url('🛡 ПАНЕЛЬ', 'https://logist-x.store/x-admin')]]));
        res.json({ success: true });
    });

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
