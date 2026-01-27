const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const nodemailer = require('nodemailer');

require('dotenv').config();

const STORE_BOT_TOKEN = '8177397301:AAH4eNkzks_DuvuMB0leavzpcKMowwFz4Uw';
const MY_ID = 6846149935;
const ADMIN_URL = 'https://logist-x.store/x-admin';

let storeBot;
try {
    storeBot = new Telegraf(STORE_BOT_TOKEN);
} catch (e) {
    console.error("❌ Ошибка инициализации бота:", e.message);
}

const transporter = nodemailer.createTransport({
    host: 'smtp.beget.com',
    port: 465,
    secure: true,
    auth: {
        user: 'service@x-platform.ru',
        pass: process.env.SMTP_PASSWORD
    }
});

const quarantineDir = path.join(process.cwd(), 'uploads-quarantine');
const publicDir = path.join(process.cwd(), 'public', 'apps');
const dbFile = path.join(process.cwd(), 'public', 'apps.json');

// Автосоздание apps.json, если файла нет
if (!fs.existsSync(dbFile)) {
    console.log('⚠️ apps.json не найден — создаём пустой');
    fs.writeFileSync(dbFile, '[]', 'utf8');
}

if (!fs.existsSync(quarantineDir)) fs.mkdirSync(quarantineDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

const upload = multer({ dest: quarantineDir });

async function sendStoreMail(to, subject, text) {
    try {
        if (!process.env.SMTP_PASSWORD) return;
        await transporter.sendMail({
            from: '"X-PLATFORM CORE" <service@x-platform.ru>',
            to,
            subject,
            text
        });
        console.log(`✅ Письмо отправлено: ${to}`);
    } catch (e) {
        console.error("❌ Ошибка почты:", e.message);
    }
}

module.exports = function (app, context) {
    const { readDatabase } = context;

    app.use('/public', express.static(path.join(process.cwd(), 'public')));

    // Защищённая функция чтения JSON
    function safeReadJson(file) {
        try {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (e) {
            console.error(`Ошибка чтения JSON ${path.basename(file)}:`, e.message);
            return [];
        }
    }

    app.get('/x-api/apps', (req, res) => {
        const db = safeReadJson(dbFile);
        const now = new Date();
        const activeApps = db
            .filter(a => (!a.expiryDate || new Date(a.expiryDate) > now) && a.hidden !== true)
            .map(a => ({ ...a, hidden: !!a.hidden }));
        res.json(activeApps);
    });

    app.post('/x-api/click/:id', (req, res) => {
        let db = safeReadJson(dbFile);
        const appData = db.find(a => a.id === req.params.id);
        if (appData) {
            appData.clicks = (appData.clicks || 0) + 1;
            fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf8');
            res.json({ success: true, clicks: appData.clicks });
        } else {
            res.status(404).json({ error: "App not found" });
        }
    });

    app.get('/x-api/download/:id', (req, res) => {
        const filePath = path.join(quarantineDir, req.params.id);
        if (fs.existsSync(filePath)) {
            res.download(filePath, `check_${req.params.id}.zip`);
        } else {
            res.status(404).send('Файл не найден');
        }
    });

    app.get('/x-api/ping', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json({ status: "online" });
    });

    app.post('/x-api/toggle-hidden/:id', (req, res) => {
        let db = safeReadJson(dbFile);
        const appIndex = db.findIndex(a => String(a.id) === String(req.params.id));
        if (appIndex === -1) {
            return res.status(404).json({ success: false, error: "App not found" });
        }
        db[appIndex].hidden = !db[appIndex].hidden;
        fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf8');
        res.json({ success: true, hidden: db[appIndex].hidden });
    });

    app.get('/x-admin', (req, res) => {
        let activeApps = safeReadJson(dbFile);

        const pendingFiles = fs.readdirSync(quarantineDir)
            .filter(name => name.endsWith('.json'))
            .map(jsonName => {
                const id = jsonName.replace('.json', '');
                let info = {};
                try {
                    info = JSON.parse(fs.readFileSync(path.join(quarantineDir, jsonName), 'utf8'));
                } catch (e) {}

                const zipPath = path.join(quarantineDir, id);
                const hasZip = fs.existsSync(zipPath);

                let fileReport = 'Ожидание анализа...';
                let borderColor = '#444';
                let safetyAlerts = [];

                if (hasZip) {
                    try {
                        const zip = new AdmZip(zipPath);
                        const entries = zip.getEntries();
                        const forbidden = ['.php', '.exe', '.bat', '.py', '.sh', '.sql', '.env'];
                        const suspiciousFuncs = ['eval(', 'exec(', 'spawn(', 'base64_decode', 'child_process'];

                        let hasIndex = false;
                        entries.forEach(e => {
                            const name = e.entryName;
                            const lowerName = name.toLowerCase();
                            if (lowerName.endsWith('index.html')) hasIndex = true;

                            if (forbidden.some(ext => lowerName.endsWith(ext))) {
                                safetyAlerts.push(`<span style="color:#ff4444;">⛔️ ЗАПРЕЩЕННЫЙ ФАЙЛ: ${name}</span>`);
                            }

                            if (!e.isDirectory && (lowerName.endsWith('.js') || lowerName.endsWith('.html'))) {
                                const content = e.getData().toString('utf8');
                                suspiciousFuncs.forEach(f => {
                                    if (content.includes(f)) safetyAlerts.push(`<span style="color:#ffbb33;">⚠️ ОПАСНЫЙ КОД (${f}): ${name}</span>`);
                                });

                                const links = content.match(/https?:\/\/[^\s"'`<>]+/g);
                                if (links) {
                                    const uniqueDomains = new Set();
                                    links.forEach(link => {
                                        if (!link.match(/logist-x\.store|google|yandex|vk\.com|cdn|unpkg|jsdelivr/)) {
                                            try {
                                                const domain = new URL(link).hostname;
                                                uniqueDomains.add(domain);
                                            } catch (err) {
                                                uniqueDomains.add(link.substring(0, 25) + '...');
                                            }
                                        }
                                    });
                                    uniqueDomains.forEach(domain => {
                                        safetyAlerts.push(`<span style="color:#3399ff;">📡 СВЯЗЬ: ${domain}</span>`);
                                    });
                                }
                            }
                        });

                        if (!hasIndex) safetyAlerts.push("<span style='color:#ff4444;'>❌ НЕТ INDEX.HTML В КОРНЕ</span>");

                        if (safetyAlerts.length === 0) {
                            fileReport = "<b style='color:#4caf50;'>✅ ПРОВЕРКА ПРОЙДЕНА: ВИРУСОВ НЕ ОБНАРУЖЕНО</b>";
                            borderColor = "#28a745";
                        } else {
                            borderColor = safetyAlerts.some(a => a.includes('⛔️')) ? "#dc3545" : "#ffc107";
                            fileReport = safetyAlerts.join('<br>');
                        }
                    } catch (err) {
                        fileReport = "Ошибка чтения архива";
                        borderColor = "#dc3545";
                    }
                }

                return { id, ...info, fileReport, borderColor, hasZip };
            }).reverse();

        res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>X-STORE ADMIN</title>
    <style>
        body { background: #0b0b0b; color: #fff; font-family: 'Segoe UI', sans-serif; padding: 20px; }
        .container { max-width: 900px; margin: 0 auto; }
        .card { background: #1a1a1a; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #333; }
        .hidden-app { opacity: 0.6; border-left: 4px solid #888; }
        .title { color: #ff6600; font-size: 20px; font-weight: bold; margin-bottom: 10px; }
        .meta { font-size: 13px; color: #888; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 10px; }
        .log-box { background: #000; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 12px; border: 1px solid #444; margin-bottom: 15px; line-height: 1.6; }
        .btn { padding: 12px 20px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; display: inline-block; text-align: center; font-size: 14px; color: #fff; }
        .btn-pub { background: #28a745; flex: 2; }
        .btn-del { background: #dc3545; flex: 1; }
        .btn-down { background: #3399ff; width: 100%; margin-bottom: 10px; }
        .btn-hide { background: #6c757d; padding: 6px 12px; font-size: 11px; }
        .btn-show { background: #17a2b8; padding: 6px 12px; font-size: 11px; }
        .flex-btns { display: flex; gap: 10px; }
        h1, h2 { border-left: 5px solid #ff6600; padding-left: 15px; }
        .stat-badge { background: #28a745; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px; margin-left: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🛡 ПАНЕЛЬ УПРАВЛЕНИЯ X-STORE</h1>

        <h2 style="color: #ffc107;">🟡 ОЖИДАЮТ ПРОВЕРКИ (${pendingFiles.length})</h2>
        ${pendingFiles.length === 0 ? '<p style="color:#666;">Новых заявок пока нет...</p>' : ''}
        ${pendingFiles.map(f => `
            <div class="card" style="border-top: 4px solid ${f.borderColor};">
                <div class="title">${f.name}</div>
                <div class="meta">
                    <b>Владелец:</b> ${f.ownerName} | <b>Ключ:</b> ${f.accessKey}<br>
                    <b>Email:</b> ${f.email} | <b>Категория:</b> ${f.cat}
                </div>
                <div style="font-size:14px; margin-bottom:15px; color:#ddd;">${f.desc || 'Описание отсутствует'}</div>
                
                <div class="log-box">
                    <div style="color:#888; margin-bottom:5px;">[X-SCANNER REPORT]</div>
                    ${f.fileReport}
                </div>

                <a href="/x-api/download/${f.id}" class="btn btn-down">📥 СКАЧАТЬ АРХИВ ДЛЯ ОСМОТРА</a>
                
                <div class="flex-btns">
                    <button class="btn btn-pub" onclick="publish('${f.id}')">✅ ОПУБЛИКОВАТЬ В МАГАЗИН</button>
                    <button class="btn btn-del" onclick="reject('${f.id}')">🗑 УДАЛИТЬ</button>
                </div>
            </div>
        `).join('')}

        <h2 style="color: #28a745;">🟢 ОПУБЛИКОВАНО (${activeApps.length})</h2>
        ${activeApps.map(app => `
            <div class="card ${app.hidden ? 'hidden-app' : ''}" style="padding: 12px; display: flex; align-items: center; justify-content: space-between;">
                <div>
                    <b style="color:#ff6600;">${app.title || app.name}</b>
                    <span class="stat-badge">📥 Установок: ${app.clicks || 0}</span>
                    ${app.hidden ? '<span style="color:#dc3545; font-size:11px; margin-left:10px;">(скрыто)</span>' : ''}
                    <div style="font-size:11px; color:#666;">ID: ${app.id}</div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn ${app.hidden ? 'btn-show' : 'btn-hide'}" 
                            onclick="toggleHidden('${app.id}', ${!app.hidden})">
                        ${app.hidden ? 'Показать' : 'Скрыть'}
                    </button>
                    <button class="btn btn-del" onclick="unpublish('${app.id}')">УБРАТЬ</button>
                </div>
            </div>
        `).join('')}
    </div>

    <script>
        async function publish(id) {
            if (!confirm('Подтвердить публикацию?')) return;
            const res = await fetch('/x-api/publish/' + id, {method: 'POST'});
            if (res.ok) location.reload(); else alert('Ошибка сервера');
        }
        async function reject(id) {
            if (!confirm('Удалить заявку безвозвратно?')) return;
            const res = await fetch('/x-api/delete/' + id, {method: 'DELETE'});
            if (res.ok) location.reload();
        }
        async function unpublish(id) {
            if (!confirm('Снять приложение с публикации?')) return;
            const res = await fetch('/x-api/unpublish/' + id, {method: 'POST'});
            if (res.ok) location.reload();
        }
        async function toggleHidden(id, shouldHide) {
            if (!confirm(shouldHide ? 'Скрыть?' : 'Показать?')) return;
            const res = await fetch('/x-api/toggle-hidden/' + id, {method: 'POST'});
            if (res.ok) location.reload(); else alert('Ошибка');
        }
    </script>
</body>
</html>`);
    });

    app.post('/x-api/upload', upload.single('appZip'), async (req, res) => {
        try {
            const { accessKey, name, email, cat, desc } = req.body;
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === (accessKey || "").toUpperCase());

            if (!kData || new Date(kData.expiry) < new Date()) {
                if (req.file) fs.unlinkSync(req.file.path);
                return res.status(403).json({ success: false, error: "Ключ не активен" });
            }

            const id = req.file ? req.file.filename : "req_" + Date.now();
            fs.writeFileSync(path.join(quarantineDir, id + '.json'), JSON.stringify({
                name, email, cat, desc, accessKey,
                ownerName: kData.name,
                expiryDate: kData.expiry
            }, null, 2));

            if (storeBot) {
                const msg = `🆕 *НОВАЯ ЗАЯВКА В X-STORE*\\n\\n📦 Проект: *${name}*\\n👤 От: \( {kData.name}\\n🔑 Ключ: \` \){accessKey}\`\\n📂 Категория: ${cat}`;
                storeBot.telegram.sendMessage(MY_ID, msg, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([[Markup.button.url('🛡 ПЕРЕЙТИ В АДМИНКУ', ADMIN_URL)]])
                });
            }
            res.json({ success: true });
        } catch (e) {
            console.error('Ошибка /x-api/upload:', e.message);
            res.status(500).json({ success: false });
        }
    });

    app.post('/x-api/publish/:id', async (req, res) => {
        try {
            const id = req.params.id;
            const infoPath = path.join(quarantineDir, id + '.json');
            if (!fs.existsSync(infoPath)) return res.status(404).json({ error: "Нет данных заявки" });

            const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
            const appFolderName = "app_" + Date.now();
            const extractPath = path.join(publicDir, appFolderName);

            let finalIcon = 'https://cdn-icons-png.flaticon.com/512/3208/3208728.png';
            let finalUrl = "";

            const zipPath = path.join(quarantineDir, id);
            if (fs.existsSync(zipPath)) {
                const zip = new AdmZip(zipPath);
                zip.extractAllTo(extractPath, true);

                const files = fs.readdirSync(extractPath);
                const iconFile = files.find(f => f.toLowerCase().startsWith('icon.'));
                if (iconFile) finalIcon = `https://logist-x.store/public/apps/\( {appFolderName}/ \){iconFile}`;

                const urlsToCache = [];
                function collectFiles(dir) {
                    const items = fs.readdirSync(dir, { withFileTypes: true });
                    items.forEach(item => {
                        const fullPath = path.join(dir, item.name);
                        if (item.isDirectory()) {
                            collectFiles(fullPath);
                        } else {
                            const ext = path.extname(item.name).toLowerCase();
                            if (['.html', '.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.json', '.ico', '.webmanifest'].includes(ext)) {
                                const relativePath = fullPath.replace(extractPath, '').replace(/\\/g, '/').replace(/^\//, '');
                                urlsToCache.push(relativePath || item.name);
                            }
                        }
                    });
                }
                collectFiles(extractPath);

                if (!fs.existsSync(path.join(extractPath, 'manifest.json'))) {
                    const manifest = {
                        "name": info.name,
                        "short_name": info.name,
                        "start_url": "index.html",
                        "display": "standalone",
                        "background_color": "#0b0b0b",
                        "theme_color": "#ff6600",
                        "icons": [{ "src": iconFile || "icon.png", "sizes": "512x512", "type": "image/png" }]
                    };
                    fs.writeFileSync(path.join(extractPath, 'manifest.json'), JSON.stringify(manifest, null, 2));
                    urlsToCache.push('manifest.json');
                }

                const swPath = path.join(extractPath, 'sw.js');
                if (!fs.existsSync(swPath)) {
                    const swContent = `
const CACHE_NAME = 'x-pwa-${appFolderName}-v1';
const urlsToCache = [
  './index.html',
  \( {urlsToCache.map(url => `' \){url}',`).join('\n  ')}
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request).then(fetchResponse => {
      if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type !== 'basic') return fetchResponse;
      const responseToCache = fetchResponse.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
      return fetchResponse;
    }).catch(() => caches.match('./index.html')))
  );
});
                    `;
                    fs.writeFileSync(swPath, swContent.trim(), 'utf8');
                }

                const indexPath = path.join(extractPath, 'index.html');
                if (fs.existsSync(indexPath)) {
                    let html = fs.readFileSync(indexPath, 'utf8');
                    if (!html.includes('serviceWorker.register')) {
                        const pwaInject = `
    <link rel="manifest" href="manifest.json">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="theme-color" content="#ff6600">
    <script>if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js?v=${Date.now()}');}</script>`;
                        html = html.includes('<head>') ? html.replace('<head>', '<head>' + pwaInject) : pwaInject + html;
                        fs.writeFileSync(indexPath, html, 'utf8');
                    }
                }

                finalUrl = `https://logist-x.store/public/apps/${appFolderName}/index.html`;
            }

            let db = safeReadJson(dbFile);
            db.push({
                ...info,
                id: appFolderName,
                title: info.name,
                name: info.name,
                icon: finalIcon,
                url: finalUrl,
                folder: appFolderName,
                clicks: 0,
                hidden: false
            });
            fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf8');

            if (fs.existsSync(infoPath)) fs.unlinkSync(infoPath);
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

            await sendStoreMail(info.email, '🚀 Твое приложение опубликовано!', `Приложение "${info.name}" доступно.`);

            res.json({ success: true });
        } catch (e) {
            console.error("❌ Ошибка публикации:", e.message, e.stack);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/x-api/unpublish/:id', (req, res) => {
        let db = safeReadJson(dbFile);
        const appData = db.find(a => String(a.id) === String(req.params.id));
        if (appData && appData.folder) {
            const folderPath = path.join(publicDir, appData.folder);
            if (fs.existsSync(folderPath)) fs.rmSync(folderPath, { recursive: true, force: true });
        }
        db = db.filter(a => String(a.id) !== String(req.params.id));
        fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf8');
        res.json({ success: true });
    });

    app.delete('/x-api/delete/:id', (req, res) => {
        const id = req.params.id;
        const jsonPath = path.join(quarantineDir, id + '.json');
        const zipPath = path.join(quarantineDir, id);
        if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        res.json({ success: true });
    });

    if (storeBot) {
        storeBot.launch().catch(err => {
            if (!err.message.includes('409: Conflict')) console.error('❌ Ошибка бота:', err.message);
        });
    }
};