const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const nodemailer = require('nodemailer');

// Подтягиваем переменные окружения
require('dotenv').config();

const STORE_BOT_TOKEN = '8177397301:AAH4eNkzks_DuvuMB0leavzpcKMowwFz4Uw';
const MY_ID = 6846149935;
const ADMIN_URL = 'https://logist-x.store/x-admin';

// Инициализируем бота
let storeBot;
try {
    storeBot = new Telegraf(STORE_BOT_TOKEN);
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

const quarantineDir = path.join(process.cwd(), 'uploads-quarantine');
const publicDir = path.join(process.cwd(), 'public', 'apps');
const dbFile = path.join(process.cwd(), 'public', 'apps.json');

// Создаем необходимые директории
if (!fs.existsSync(quarantineDir)) fs.mkdirSync(quarantineDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, '[]');

const upload = multer({ dest: quarantineDir });

// Функция отправки почты
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
    } catch (e) { console.error("❌ Ошибка почты:", e.message); }
}

module.exports = function(app, context) {
    const { readDatabase } = context;

    app.use('/public', express.static(path.join(process.cwd(), 'public')));

    // API: Список приложений
    app.get('/x-api/apps', (req, res) => {
        try {
            const db = JSON.parse(fs.readFileSync(dbFile));
            const now = new Date();
            const activeApps = db.filter(a => !a.expiryDate || new Date(a.expiryDate) > now);
            res.json(activeApps);
        } catch (e) { res.json([]); }
    });

    // --- API ДЛЯ СЧЕТЧИКА КЛИКОВ ---
    app.post('/x-api/click/:id', (req, res) => {
        try {
            const db = JSON.parse(fs.readFileSync(dbFile));
            const appData = db.find(a => a.id === req.params.id);
            if (appData) {
                appData.clicks = (appData.clicks || 0) + 1;
                fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
                res.json({ success: true, clicks: appData.clicks });
            } else {
                res.status(404).json({ error: "App not found" });
            }
        } catch (e) { res.status(500).json({ success: false }); }
    });

    // API: Скачивание для проверки
    app.get('/x-api/download/:id', (req, res) => {
        const filePath = path.join(quarantineDir, req.params.id);
        if (fs.existsSync(filePath)) {
            res.download(filePath, `check_${req.params.id}.zip`);
        } else {
            res.status(404).send('Файл не найден');
        }
    });

    // API: Пинг
    app.get('/x-api/ping', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json({ status: "online" });
    });

    // --- ПОЛНОРАЗМЕРНАЯ АДМИНКА ---
    app.get('/x-admin', (req, res) => {
        let activeApps = [];
        try { activeApps = JSON.parse(fs.readFileSync(dbFile)); } catch(e) {}
        
        const pendingFiles = fs.readdirSync(quarantineDir)
            .filter(name => name.endsWith('.json'))
            .map(jsonName => {
                const id = jsonName.replace('.json', '');
                let info = {};
                try { info = JSON.parse(fs.readFileSync(path.join(quarantineDir, jsonName))); } catch(e) {}
                
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
                                if (content.match(/https?:\/\/(?!logist-x\.store|google|yandex|vk\.com|cdn|unpkg|jsdelivr)/)) {
                                    safetyAlerts.push(`<span style="color:#3399ff;">📡 ВНЕШНЯЯ СВЯЗЬ: ${name}</span>`);
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
                    } catch (err) { fileReport = "Ошибка чтения архива"; borderColor = "#dc3545"; }
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
        .card { background: #1a1a1a; border-radius: 12px; padding: 20px; margin-bottom: 20px; position: relative; overflow: hidden; border: 1px solid #333; }
        .title { color: #ff6600; font-size: 20px; font-weight: bold; margin-bottom: 10px; }
        .meta { font-size: 13px; color: #888; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 10px; }
        .log-box { background: #000; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 12px; border: 1px solid #444; margin-bottom: 15px; line-height: 1.6; }
        .btn { padding: 12px 20px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; text-decoration: none; display: inline-block; text-align: center; font-size: 14px; }
        .btn-pub { background: #28a745; color: #fff; flex: 2; }
        .btn-del { background: #dc3545; color: #fff; flex: 1; }
        .btn-down { background: #3399ff; color: #fff; width: 100%; margin-bottom: 10px; }
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

        <h2 style="color: #28a745;">🟢 ОПУБЛИКОВАНО</h2>
        ${activeApps.map(app => `
            <div class="card" style="padding: 12px; display: flex; align-items: center; justify-content: space-between;">
                <div>
                    <b style="color:#ff6600;">${app.title || app.name}</b>
                    <span class="stat-badge">📥 Установок: ${app.clicks || 0}</span>
                    <div style="font-size:11px; color:#666;">ID: ${app.id}</div>
                </div>
                <button class="btn btn-del" style="padding: 6px 12px; font-size: 11px;" onclick="unpublish('${app.id}')">УБРАТЬ</button>
            </div>
        `).join('')}
    </div>

    <script>
        async function publish(id) {
            if(!confirm('Подтвердить публикацию?')) return;
            const res = await fetch('/x-api/publish/'+id, {method:'POST'});
            if(res.ok) location.reload(); else alert('Ошибка сервера');
        }
        async function reject(id) {
            if(!confirm('Удалить заявку безвозвратно?')) return;
            const res = await fetch('/x-api/delete/'+id, {method:'DELETE'});
            if(res.ok) location.reload();
        }
        async function unpublish(id) {
            if(!confirm('Снять приложение с публикации?')) return;
            const res = await fetch('/x-api/unpublish/'+id, {method:'POST'});
            if(res.ok) location.reload();
        }
    </script>
</body>
</html>`);
    });

    // Прием файла от пользователя
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
            }));
            
            if (storeBot) {
                const msg = `🆕 *НОВАЯ ЗАЯВКА В X-STORE*\n\n📦 Проект: *${name}*\n👤 От: ${kData.name}\n🔑 Ключ: \`${accessKey}\`\n📂 Категория: ${cat}`;
                storeBot.telegram.sendMessage(MY_ID, msg, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([[Markup.button.url('🛡 ПЕРЕЙТИ В АДМИНКУ', ADMIN_URL)]])
                });
            }
            res.json({ success: true });
        } catch (e) { res.status(500).json({ success: false }); }
    });

    // --- ПУБЛИКАЦИЯ С ИСПРАВЛЕННОЙ ЛОГИКОЙ PWA (УМНАЯ СКЛЕЙКА) ---
    app.post('/x-api/publish/:id', async (req, res) => {
        try {
            const id = req.params.id;
            const infoPath = path.join(quarantineDir, id + '.json');
            if (!fs.existsSync(infoPath)) return res.status(404).json({error: "Нет данных заявки"});

            const info = JSON.parse(fs.readFileSync(infoPath));
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
                if (iconFile) finalIcon = `https://logist-x.store/public/apps/${appFolderName}/${iconFile}`;

                // 1. Генерируем манифест (если его нет)
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
                }
                
                // 2. УМНАЯ ПРОВЕРКА SERVICE WORKER
                const swPath = path.join(extractPath, 'sw.js');
                if (!fs.existsSync(swPath)) {
                    // Если пользователь НЕ положил свой воркер — создаем базовый
                    fs.writeFileSync(swPath, `
                        // X-STORE AUTO-PWA
                        self.addEventListener('install', e => self.skipWaiting());
                        self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));
                    `);
                }

                // 3. УМНАЯ СКЛЕЙКА INDEX.HTML
                const indexPath = path.join(extractPath, 'index.html');
                if (fs.existsSync(indexPath)) {
                    let html = fs.readFileSync(indexPath, 'utf8');
                    
                    // Проверяем, не внедрен ли уже воркер самим автором
                    if (!html.includes('serviceWorker.register')) {
                        const pwaInject = `
    <link rel="manifest" href="manifest.json">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="theme-color" content="#ff6600">
    <script>
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js?v=${Date.now()}').then(() => console.log('X-PWA Active'));
      }
    </script>
                        `;
                        if (html.includes('<head>')) {
                            html = html.replace('<head>', '<head>' + pwaInject);
                        } else {
                            html = pwaInject + html;
                        }
                        fs.writeFileSync(indexPath, html);
                    }
                }
                finalUrl = `https://logist-x.store/public/apps/${appFolderName}/index.html`;
            }

            const db = JSON.parse(fs.readFileSync(dbFile));
            db.push({ ...info, id: appFolderName, title: info.name, name: info.name, icon: finalIcon, url: finalUrl, folder: appFolderName, clicks: 0 });
            fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));

            // Чистим карантин
            if(fs.existsSync(infoPath)) fs.unlinkSync(infoPath);
            if(fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

            // Отправляем уведомление
            await sendStoreMail(info.email, '🚀 Твое приложение опубликовано!', `Привет! Приложение "${info.name}" успешно прошло проверку и теперь доступно в X-STORE.`);
            
            res.json({ success: true });
        } catch (e) { 
            console.error(e);
            res.status(500).json({ success: false, error: e.message }); 
        }
    });

    // Снятие с публикации
    app.post('/x-api/unpublish/:id', (req, res) => {
        try {
            let db = JSON.parse(fs.readFileSync(dbFile));
            const appData = db.find(a => String(a.id) === String(req.params.id));
            if (appData && appData.folder) {
                const folderPath = path.join(publicDir, appData.folder);
                if (fs.existsSync(folderPath)) fs.rmSync(folderPath, { recursive: true, force: true });
            }
            db = db.filter(a => String(a.id) !== String(req.params.id));
            fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
            res.json({ success: true });
        } catch (e) { res.status(500).json({ success: false }); }
    });

    // Удаление заявки
    app.delete('/x-api/delete/:id', (req, res) => {
        try {
            const id = req.params.id;
            const i = path.join(quarantineDir, id + '.json');
            const z = path.join(quarantineDir, id);
            if (fs.existsSync(i)) fs.unlinkSync(i);
            if (fs.existsSync(z)) fs.unlinkSync(z);
            res.json({success:true});
        } catch (e) { res.status(500).json({ success: false }); }
    });

    // Запуск бота
    if (storeBot) {
        storeBot.launch().catch(err => {
            if (!err.message.includes('409: Conflict')) console.error('❌ Ошибка бота:', err.message);
        });
    }
};
