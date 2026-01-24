require('dotenv').config();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const nodemailer = require('nodemailer');

const STORE_BOT_TOKEN = '8177397301:AAH4eNkzks_DuvuMB0leavzpcKMowwFz4Uw';
const MY_ID = 6846149935;
const storeBot = new Telegraf(STORE_BOT_TOKEN);

// --- НАСТРОЙКИ ПОЧТЫ (BEGET) ---
const transporter = nodemailer.createTransport({
    host: 'smtp.beget.com',
    port: 465,
    secure: true,
    auth: { user: 'service@x-platform.ru', pass: process.env.SMTP_PASSWORD }
});

const quarantineDir = path.join(process.cwd(), 'uploads-quarantine');
const publicDir = path.join(process.cwd(), 'public', 'apps');
const dbFile = path.join(process.cwd(), 'public', 'apps.json');

if (!fs.existsSync(quarantineDir)) fs.mkdirSync(quarantineDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, '[]');

const upload = multer({ dest: quarantineDir });

async function sendStoreMail(to, subject, text) {
    try {
        if (!process.env.SMTP_PASSWORD) return;
        await transporter.sendMail({ from: '"X-PLATFORM CORE" <service@x-platform.ru>', to, subject, text });
        console.log(`✅ Письмо отправлено на: ${to}`);
    } catch (e) { console.error("❌ Ошибка почты:", e.message); }
}

function getVirusTotalLink(type, data) {
    if (type === 'file_hash') return `https://www.virustotal.com/gui/file/${data}`;
    const encodedUrl = Buffer.from(data).toString('base64').replace(/=/g, '');
    return `https://www.virustotal.com/gui/url/${encodedUrl}`;
}

module.exports = function(app, context) {
    // Используем функции из основного server.js через context
    const { readDatabase } = context;

    app.use('/public', express.static(path.join(process.cwd(), 'public')));

    // API для получения списка приложений
    app.get('/x-api/apps', (req, res) => {
        const db = JSON.parse(fs.readFileSync(dbFile));
        const now = new Date();
        // Отдаем только те, у которых не истёк срок (синхронно с ключами)
        const activeApps = db.filter(a => !a.expiryDate || new Date(a.expiryDate) > now);
        res.json(activeApps);
    });

    app.get('/x-api/download/:id', (req, res) => {
        const filePath = path.join(quarantineDir, req.params.id);
        if (fs.existsSync(filePath)) res.download(filePath, `check_${req.params.id}.zip`);
        else res.status(404).send('Файл не найден');
    });

    app.get('/x-api/ping', (req, res) => res.json({ status: "online" }));

    // --- АДМИН ПАНЕЛЬ ---
    app.get('/x-admin', (req, res) => {
        let activeApps = JSON.parse(fs.readFileSync(dbFile));
        const pendingFiles = fs.readdirSync(quarantineDir)
            .filter(name => name.endsWith('.json'))
            .map(jsonName => {
                const id = jsonName.replace('.json', '');
                let info = JSON.parse(fs.readFileSync(path.join(quarantineDir, jsonName)));
                const zipPath = path.join(quarantineDir, id);
                const hasZip = fs.existsSync(zipPath);
                
                let scanLink = '#';
                let fileReport = 'Нет файла';
                let borderColor = '#777';

                if (hasZip) {
                    const fileBuffer = fs.readFileSync(zipPath);
                    scanLink = getVirusTotalLink('file_hash', crypto.createHash('sha256').update(fileBuffer).digest('hex'));
                    try {
                        const zip = new AdmZip(zipPath);
                        const entries = zip.getEntries();
                        let hasIndex = entries.some(e => e.entryName.toLowerCase().endsWith('index.html'));
                        fileReport = hasIndex ? "✅ INDEX.HTML НАЙДЕН" : "❌ НЕТ INDEX.HTML";
                        borderColor = hasIndex ? "#28a745" : "#dc3545";
                    } catch (e) { fileReport = "Ошибка ZIP"; }
                }
                return { id, ...info, scanLink, fileReport, borderColor, hasZip };
            }).reverse();

        res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { background: #0b0b0b; color: #fff; font-family: sans-serif; padding: 15px; }
        .card { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 15px; margin-bottom: 15px; }
        .title { color: #ff6600; font-weight: bold; }
        .btn { width: 100%; padding: 10px; border: none; border-radius: 8px; font-weight: bold; margin-top: 5px; cursor: pointer; color: white; display:block; text-decoration:none; text-align:center; }
        .btn-pub { background: #28a745; } .btn-del { background: #dc3545; } .btn-scan { background: #6f42c1; } .btn-down { background: #3399ff; }
    </style>
</head>
<body>
    <h2 style="color: #28a745;">🟢 В МАГАЗИНЕ</h2>
    ${activeApps.map(app => `<div class="card">
        <div class="title">${app.title}</div>
        <div style="font-size:10px; color:#666;">Ключ: ${app.accessKey || '---'}</div>
        <button class="btn btn-del" onclick="unpublish('${app.id}')">❌ УДАЛИТЬ</button>
    </div>`).join('')}
    
    <h2 style="color: #ffc107;">🟡 НОВЫЕ ЗАЯВКИ</h2>
    ${pendingFiles.map(f => `
        <div class="card" style="border-left: 5px solid ${f.borderColor};">
            <div class="title">${f.name}</div>
            <div style="font-size:12px; color:#aaa;">От: ${f.ownerName || 'Неизвестно'} (${f.accessKey})</div>
            <div style="margin:10px 0; font-size:12px;">${f.fileReport}</div>
            ${f.hasZip ? `<a href="/x-api/download/${f.id}" class="btn btn-down">📥 СКАЧАТЬ ZIP</a>` : ''}
            <a href="${f.scanLink}" target="_blank" class="btn btn-scan">🛡 VIRUS TOTAL</a>
            <div style="display:flex; gap:5px;">
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

    // --- ПЕРЕХВАТ ЗАГРУЗКИ С ПРОВЕРКОЙ КЛЮЧА ---
    app.post('/x-api/upload', upload.single('appZip'), async (req, res) => {
        try {
            const { accessKey, name, email, cat, url } = req.body;
            
            // Проверка ключа через основную базу
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === (accessKey || "").toUpperCase());

            if (!kData || new Date(kData.expiry) < new Date()) {
                if (req.file) fs.unlinkSync(req.file.path); // Удаляем файл если ключ плохой
                return res.status(403).json({ success: false, error: "Ключ не активен или просрочен" });
            }

            const id = req.file ? req.file.filename : "req_" + Date.now();
            // Сохраняем заявку вместе с данными ключа
            fs.writeFileSync(path.join(quarantineDir, id + '.json'), JSON.stringify({ 
                name, email, cat, url, accessKey, 
                ownerName: kData.name,
                expiryDate: kData.expiry 
            }));
            
            storeBot.telegram.sendMessage(MY_ID, `🆕 ЗАЯВКА X-STORE\nПриложение: ${name}\nВладелец ключа: ${kData.name}\nКлюч: ${accessKey}`);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ success: false }); }
    });

    app.post('/x-api/publish/:id', async (req, res) => {
        const id = req.params.id;
        const infoPath = path.join(quarantineDir, id + '.json');
        if (!fs.existsSync(infoPath)) return res.status(404).json({error: "Нет заявки"});

        const info = JSON.parse(fs.readFileSync(infoPath));
        const appFolderName = "app_" + Date.now();
        const extractPath = path.join(publicDir, appFolderName);
        let finalUrl = info.url;
        let finalIcon = 'https://cdn-icons-png.flaticon.com/512/3208/3208728.png';

        const zipPath = path.join(quarantineDir, id);
        if (fs.existsSync(zipPath)) {
            try {
                const zip = new AdmZip(zipPath);
                zip.extractAllTo(extractPath, true);
                finalUrl = "https://logist-x.store/public/apps/" + appFolderName + "/index.html";
                const files = fs.readdirSync(extractPath);
                const iconFile = files.find(f => f.toLowerCase().startsWith('icon.'));
                if (iconFile) finalIcon = "https://logist-x.store/public/apps/" + appFolderName + "/" + iconFile;

                // Генерация PWA файлов...
                fs.writeFileSync(path.join(extractPath, 'manifest.json'), JSON.stringify({ "name": info.name, "short_name": info.name, "start_url": "index.html", "display": "standalone", "icons": [{ "src": iconFile || "", "sizes": "512x512", "type": "image/png" }] }));
                fs.writeFileSync(path.join(extractPath, 'sw.js'), "self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));");
            } catch (e) { return res.status(500).send("Ошибка ZIP"); }
        }

        const db = JSON.parse(fs.readFileSync(dbFile));
        db.push({ 
            id: appFolderName, 
            title: info.name, 
            cat: info.cat, 
            icon: finalIcon, 
            url: finalUrl, 
            accessKey: info.accessKey, 
            expiryDate: info.expiryDate 
        });
        fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));

        if(fs.existsSync(infoPath)) fs.unlinkSync(infoPath);
        if(fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

        await sendStoreMail(info.email, '🚀 Опубликовано!', `Приложение "${info.name}" доступно в X-Store.`);
        res.json({ success: true });
    });

    app.post('/x-api/unpublish/:id', (req, res) => {
        let db = JSON.parse(fs.readFileSync(dbFile));
        db = db.filter(a => String(a.id) !== String(req.params.id));
        fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
        res.json({ success: true });
    });

    app.delete('/x-api/delete/:id', (req, res) => {
        const id = req.params.id;
        const infoPath = path.join(quarantineDir, id + '.json');
        if (fs.existsSync(infoPath)) fs.unlinkSync(infoPath);
        if (fs.existsSync(path.join(quarantineDir, id))) fs.unlinkSync(path.join(quarantineDir, id));
        res.json({success:true});
    });

    storeBot.launch();
};
