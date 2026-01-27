const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const nodemailer = require('nodemailer');

// Подключаем переменные окружения
require('dotenv').config();

// --- КОНФИГУРАЦИЯ ---
const STORE_BOT_TOKEN = '8177397301:AAH4eNkzks_DuvuMB0leavzpcKMowwFz4Uw';
const MY_ID = 6846149935;
const ADMIN_URL = 'https://logist-x.store/x-admin';

// --- ИНИЦИАЛИЗАЦИЯ БОТА ---
let storeBot;
try {
    storeBot = new Telegraf(STORE_BOT_TOKEN);
    console.log("✅ Бот магазина инициализирован");
} catch (e) {
    console.error("❌ Ошибка инициализации бота:", e.message);
}

// --- НАСТРОЙКИ ПОЧТЫ (BEGET) ---
const transporter = nodemailer.createTransport({
    host: 'smtp.beget.com',
    port: 465,
    secure: true,
    auth: {
        user: 'service@x-platform.ru',
        pass: process.env.SMTP_PASSWORD
    }
});

// --- ПУТИ И ДИРЕКТОРИИ ---
const quarantineDir = path.join(process.cwd(), 'uploads-quarantine');
const publicDir = path.join(process.cwd(), 'public', 'apps');
const dbFile = path.join(process.cwd(), 'public', 'apps.json');

// Автосоздание папок и базы
if (!fs.existsSync(quarantineDir)) fs.mkdirSync(quarantineDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

if (!fs.existsSync(dbFile)) {
    fs.writeFileSync(dbFile, '[]', 'utf8');
} else {
    // Проверка целостности базы при старте
    try {
        JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    } catch (e) {
        console.error("⚠️ База apps.json повреждена, сброс.");
        fs.writeFileSync(dbFile, '[]', 'utf8');
    }
}

// Настройка Multer (загрузчик файлов)
const upload = multer({
    dest: quarantineDir,
    limits: { fileSize: 100 * 1024 * 1024 } // Лимит 100 МБ
});

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

// Безопасное чтение JSON
function safeReadJson(file) {
    try {
        if (!fs.existsSync(file)) return [];
        const content = fs.readFileSync(file, 'utf8');
        return JSON.parse(content);
    } catch (e) {
        return [];
    }
}

// Отправка почты
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

// --- ЭКСПОРТ МОДУЛЯ ---
module.exports = function (app, context) {
    const { readDatabase } = context;

    // 🔥🔥🔥 ДОБАВЛЕНО: CORS (ЛЕКАРСТВО OT БЛОКИРОВКИ) 🔥🔥🔥
    app.use((req, res, next) => {
        res.header("Access-Control-Allow-Origin", "*"); 
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
        next();
    });

    // Раздача статики для приложений
    app.use('/public', express.static(path.join(process.cwd(), 'public')));

    // 1. API: Получить список активных приложений
    app.get('/x-api/apps', (req, res) => {
        const db = safeReadJson(dbFile);
        const now = new Date();
        const activeApps = db
            .filter(a => (!a.expiryDate || new Date(a.expiryDate) > now) && a.hidden !== true);
        res.json(activeApps);
    });

    // 2. ПИНГ (Для проверки связи)
    app.get('/x-api/ping', (req, res) => {
        res.json({ status: "online" });
    });

    // 3. API: Счетчик кликов (установок)
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

    // 4. API: Скачивание архива (для админа)
    app.get('/x-api/download/:id', (req, res) => {
        const filePath = path.join(quarantineDir, req.params.id);
        if (fs.existsSync(filePath)) {
            res.download(filePath, `check_${req.params.id}.zip`);
        } else {
            res.status(404).send('Файл не найден');
        }
    });

    // 5. API: Скрыть/Показать приложение
    app.post('/x-api/toggle-hidden/:id', (req, res) => {
        let db = safeReadJson(dbFile);
        const appIndex = db.findIndex(a => String(a.id) === String(req.params.id));
        if (appIndex === -1) return res.status(404).json({ success: false });
        
        db[appIndex].hidden = !db[appIndex].hidden;
        fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf8');
        res.json({ success: true, hidden: db[appIndex].hidden });
    });

    // 6. ГЛАВНАЯ АДМИН-ПАНЕЛЬ (Рендеринг HTML + СКАНЕР)
    app.get('/x-admin', (req, res) => {
        let activeApps = safeReadJson(dbFile);

        const pendingFiles = fs.readdirSync(quarantineDir)
            .filter(name => name.endsWith('.json'))
            .map(jsonName => {
                const id = jsonName.replace('.json', '');
                let info = safeReadJson(path.join(quarantineDir, jsonName));
                
                const zipPath = path.join(quarantineDir, id);
                const hasZip = fs.existsSync(zipPath);

                let fileReport = 'Ожидание анализа...';
                let borderColor = '#444';
                let safetyAlerts = [];
                let uniqueDomains = new Set(); // 🔥 ШПИОН ССЫЛОК

                if (hasZip) {
                    try {
                        const zip = new AdmZip(zipPath);
                        const entries = zip.getEntries();
                        const forbidden = ['.php', '.exe', '.bat', '.py', '.sh', '.sql', '.env'];
                        const suspiciousFuncs = ['eval(', 'exec(', 'spawn(', 'base64_decode'];

                        let hasIndex = false;

                        entries.forEach(e => {
                            const name = e.entryName;
                            const lowerName = name.toLowerCase();

                            if (lowerName.endsWith('index.html')) hasIndex = true;

                            if (forbidden.some(ext => lowerName.endsWith(ext))) {
                                safetyAlerts.push(`<span style="color:#ff4444;">⛔️ ЗАПРЕЩЕННЫЙ: ${name}</span>`);
                            }

                            if (!e.isDirectory && (lowerName.endsWith('.js') || lowerName.endsWith('.html'))) {
                                const content = e.getData().toString('utf8');
                                suspiciousFuncs.forEach(func => {
                                    if (content.includes(func)) {
                                        safetyAlerts.push(`<span style="color:#ffbb33;">⚠️ Code Warning: ${func} in ${name}</span>`);
                                    }
                                });

                                // 🔥🔥🔥 ШПИОН ВНЕШНИХ ССЫЛОК 🔥🔥🔥
                                const links = content.match(/https?:\/\/[^\s"'`<>]+/g);
                                if (links) {
                                    links.forEach(link => {
                                        try {
                                            const u = new URL(link);
                                            if (!u.hostname.includes('logist-x.store') && !u.hostname.includes('w3.org')) {
                                                uniqueDomains.add(u.hostname);
                                            }
                                        } catch(err) {}
                                    });
                                }
                            }
                        });

                        // Вывод доменов в отчет
                        uniqueDomains.forEach(d => safetyAlerts.push(`<span style="color:#3399ff;">📡 СВЯЗЬ: ${d}</span>`));

                        if (!hasIndex) safetyAlerts.push("<span style='color:#ff4444;'>❌ НЕТ INDEX.HTML В КОРНЕ!</span>");

                        if (safetyAlerts.length === 0) {
                            fileReport = "<b style='color:#4caf50;'>✅ ЧИСТО: Вирусов нет, структура верная.</b>";
                            borderColor = "#28a745";
                        } else {
                            borderColor = safetyAlerts.some(a => a.includes('⛔️')) ? "#dc3545" : "#ffc107";
                            fileReport = safetyAlerts.join('<br>');
                        }
                    } catch (err) {
                        fileReport = "Ошибка чтения архива (битый файл?)";
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
    <title>X-STORE BOSS</title>
    <style>
        body { background: #0b0b0b; color: #fff; font-family: 'Segoe UI', sans-serif; padding: 20px; }
        .container { max-width: 900px; margin: 0 auto; }
        .card { background: #1a1a1a; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #333; position: relative; }
        .hidden-app { opacity: 0.6; border-left: 5px solid #666; }
        .log-box { background: #000; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 12px; border: 1px solid #444; margin: 15px 0; }
        .btn { padding: 10px 15px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; color: #fff; margin-right: 5px; font-size: 13px; }
        .btn-pub { background: #28a745; }
        .btn-del { background: #dc3545; }
        .btn-down { background: #3399ff; }
        .btn-hide { background: #6c757d; }
        h1, h2 { border-left: 4px solid #ff6600; padding-left: 15px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🛡 X-STORE CONTROL PANEL</h1>

        <h2 style="color: #ffc107;">🟡 НОВЫЕ ЗАЯВКИ (${pendingFiles.length})</h2>
        ${pendingFiles.length === 0 ? '<p style="color:#666;">Пока пусто, Шеф.</p>' : ''}
        
        ${pendingFiles.map(f => `
            <div class="card" style="border-top: 4px solid ${f.borderColor};">
                <h3 style="margin:0 0 10px 0; color:#ff6600;">${f.name}</h3>
                <div style="font-size:13px; color:#aaa; margin-bottom:10px;">
                    Владелец: <b>${f.ownerName}</b> | Email: ${f.email}<br>
                    Ключ: ${f.accessKey} | Категория: ${f.cat}
                </div>
                
                <div class="log-box">
                    ${f.fileReport}
                </div>

                <div style="display:flex; gap:10px; margin-top:10px;">
                    <button class="btn btn-down" onclick="window.location.href='/x-api/download/${f.id}'">📥 Скачать</button>
                    <button class="btn btn-pub" onclick="publish('${f.id}')">✅ ОПУБЛИКОВАТЬ</button>
                    <button class="btn btn-del" onclick="reject('${f.id}')">🗑 УДАЛИТЬ</button>
                </div>
            </div>
        `).join('')}

        <h2 style="color: #28a745;">🟢 АКТИВНЫЕ ПРИЛОЖЕНИЯ (${activeApps.length})</h2>
        ${activeApps.map(app => `
            <div class="card ${app.hidden ? 'hidden-app' : ''}" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <b style="font-size:16px;">${app.title}</b>
                    <div style="font-size:12px; color:#888;">ID: ${app.id} | Кликов: ${app.clicks || 0}</div>
                    ${app.hidden ? '<span style="color:red; font-size:10px;">(СКРЫТО)</span>' : ''}
                </div>
                <div>
                    <button class="btn btn-hide" onclick="toggleHidden('${app.id}')">${app.hidden ? 'Показать' : 'Скрыть'}</button>
                    <button class="btn btn-del" onclick="unpublish('${app.id}')">Снять</button>
                </div>
            </div>
        `).join('')}
    </div>

    <script>
        async function publish(id) {
            if(!confirm('Опубликовать приложение?')) return;
            const res = await fetch('/x-api/publish/'+id, {method:'POST'});
            if(res.ok) location.reload(); else alert('Ошибка сервера');
        }
        async function reject(id) {
            if(!confirm('Удалить заявку?')) return;
            const res = await fetch('/x-api/delete/'+id, {method:'DELETE'});
            if(res.ok) location.reload();
        }
        async function unpublish(id) {
            if(!confirm('Удалить из магазина?')) return;
            const res = await fetch('/x-api/unpublish/'+id, {method:'POST'});
            if(res.ok) location.reload();
        }
        async function toggleHidden(id) {
            const res = await fetch('/x-api/toggle-hidden/'+id, {method:'POST'});
            if(res.ok) location.reload();
        }
    </script>
</body>
</html>`);
    });

    // 7. ЗАГРУЗКА ЗАЯВКИ (От клиента)
    app.post('/x-api/upload', upload.single('appZip'), async (req, res) => {
        try {
            const { accessKey, name, email, cat, desc } = req.body;
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === (accessKey || "").toUpperCase());

            if (!kData || new Date(kData.expiry) < new Date()) {
                if (req.file) fs.unlinkSync(req.file.path);
                return res.status(403).json({ success: false, error: "Ключ недействителен" });
            }

            const id = req.file ? req.file.filename : "req_" + Date.now();
            
            fs.writeFileSync(path.join(quarantineDir, id + '.json'), JSON.stringify({
                name, email, cat, desc, accessKey,
                ownerName: kData.name,
                expiryDate: kData.expiry
            }, null, 2));

            if (storeBot) {
                const msg = `🆕 *НОВАЯ ЗАЯВКА*\n\n📦 Проект: *${name}*\n👤 От: ${kData.name}\n🔑 Ключ: \`${accessKey}\``;
                storeBot.telegram.sendMessage(MY_ID, msg, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([[Markup.button.url('🛡 В АДМИНКУ', ADMIN_URL)]])
                }).catch(e => console.log('TG Error:', e.message));
            }

            res.json({ success: true });
        } catch (e) {
            console.error(e);
            res.status(500).json({ success: false });
        }
    });

    // 8. ПУБЛИКАЦИЯ (МАГИЯ PWA С УМНОЙ ЗАЩИТОЙ)
    app.post('/x-api/publish/:id', async (req, res) => {
        try {
            const id = req.params.id;
            const jsonPath = path.join(quarantineDir, id + '.json');
            const zipPath = path.join(quarantineDir, id);

            if (!fs.existsSync(jsonPath)) return res.status(404).json({error: "Нет данных"});

            const info = safeReadJson(jsonPath);
            const appFolderName = "app_" + Date.now();
            const extractPath = path.join(publicDir, appFolderName);
            
            // 1. Распаковка
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(extractPath, true);

            // 2. Поиск иконки
            const files = fs.readdirSync(extractPath);
            const iconFile = files.find(f => f.toLowerCase().startsWith('icon.'));
            let finalIcon = 'https://cdn-icons-png.flaticon.com/512/3208/3208728.png';
            if (iconFile) {
                finalIcon = `https://logist-x.store/public/apps/${appFolderName}/${iconFile}`;
            }

            // --- ТОЧЕЧНО: MANIFEST (ТОЛЬКО ЕСЛИ НЕТ) ---
            const manifestPath = path.join(extractPath, 'manifest.json');
            if (!fs.existsSync(manifestPath)) {
                const manifest = {
                    "name": info.name,
                    "short_name": info.name,
                    "start_url": "index.html",
                    "display": "standalone",
                    "background_color": "#0b0b0b",
                    "theme_color": "#ff6600",
                    "icons": [{ "src": iconFile || "icon.png", "sizes": "512x512", "type": "image/png" }]
                };
                fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
            }

            // --- ТОЧЕЧНО: SERVICE WORKER ULTRA (ТОЛЬКО ЕСЛИ НЕТ) ---
            const swPath = path.join(extractPath, 'sw.js');
            if (!fs.existsSync(swPath)) {
                const swCode = `
const CACHE_NAME = 'x-pwa-${appFolderName}-v2';
const OFFLINE_URL = './index.html';

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([OFFLINE_URL, './manifest.json'])));
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(
        keys.map(key => { if (key !== CACHE_NAME) return caches.delete(key); })
    )));
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    if (event.request.mode === 'navigate') {
        event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
    } else {
        event.respondWith(caches.match(event.request).then(res => res || fetch(event.request)));
    }
});

self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : { title: 'X-PLATFORM', body: 'Новое уведомление!' };
    event.waitUntil(self.registration.showNotification(data.title, {
        body: data.body, icon: './icon.png', data: { url: data.url || '/' }
    }));
});`;
                fs.writeFileSync(swPath, swCode.trim());
            }

            // --- ТОЧЕЧНО: ИНЪЕКЦИЯ (ТОЛЬКО ЕСЛИ НЕТ) ---
            const indexPath = path.join(extractPath, 'index.html');
            if (fs.existsSync(indexPath)) {
                let html = fs.readFileSync(indexPath, 'utf8');
                if (!html.includes('serviceWorker')) {
                    const pwaInject = `
    <link rel="manifest" href="manifest.json">
    <meta name="mobile-web-app-capable" content="yes">
    <script>if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js');}</script>
                    `;
                    if(html.includes('</head>')) {
                        html = html.replace('</head>', pwaInject + '</head>');
                    } else {
                        html = pwaInject + html;
                    }
                    fs.writeFileSync(indexPath, html);
                }
            }

            let db = safeReadJson(dbFile);
            db.push({
                ...info,
                id: appFolderName,
                title: info.name,
                icon: finalIcon,
                url: `https://logist-x.store/public/apps/${appFolderName}/index.html`,
                folder: appFolderName,
                clicks: 0,
                hidden: false
            });
            fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf8');

            if(fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
            if(fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

            await sendStoreMail(info.email, '🚀 Публикация успешна!', `Твое приложение "${info.name}" доступно в X-STORE.`);

            res.json({ success: true });

        } catch (e) {
            console.error("Publish Error:", e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post('/x-api/unpublish/:id', (req, res) => {
        try {
            let db = safeReadJson(dbFile);
            const appData = db.find(a => String(a.id) === String(req.params.id));
            if (appData && appData.folder) {
                const folderPath = path.join(publicDir, appData.folder);
                if (fs.existsSync(folderPath)) fs.rmSync(folderPath, { recursive: true, force: true });
            }
            db = db.filter(a => String(a.id) !== String(req.params.id));
            fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), 'utf8');
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false });
        }
    });

    app.delete('/x-api/delete/:id', (req, res) => {
        try {
            const id = req.params.id;
            const i = path.join(quarantineDir, id + '.json');
            const z = path.join(quarantineDir, id);
            if (fs.existsSync(i)) fs.unlinkSync(i);
            if (fs.existsSync(z)) fs.unlinkSync(z);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false });
        }
    });

    if (storeBot) {
        storeBot.launch().catch(e => {
            if(!e.message.includes('409')) console.error("Bot Error:", e.message);
        });
    }

    // 🔥🔥🔥 АВТО-БЭКАП БАЗЫ (КАЖДЫЙ ЧАС) 🔥🔥🔥
    setInterval(() => {
        try {
            if(fs.existsSync(dbFile)) {
                fs.copyFileSync(dbFile, dbFile + '.bak');
            }
        } catch (e) { console.error("Backup Error:", e.message); }
    }, 60 * 60 * 1000);

    console.log("🔥 МОДУЛЬ X-STORE ПОЛНОСТЬЮ ЗАГРУЖЕН (ОРИГИНАЛ + УЛУЧШЕНИЯ)");
};
