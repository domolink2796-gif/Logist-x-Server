const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const nodemailer = require('nodemailer');

require('dotenv').config();

const STORE_BOT_TOKEN = '8177397301:AAH4eNkzks_DuvuMB0leavzpcKMowwFz4Uw';
const MY_ID = 6846149935;
const ADMIN_URL = 'https://logist-x.store/x-admin'; // Ссылка на твою админку

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
    } catch (e) { console.error("❌ Ошибка почты:", e.message); }
}

module.exports = function(app, context) {
    const { readDatabase } = context;

    app.use('/public', express.static(path.join(process.cwd(), 'public')));

    app.get('/x-api/apps', (req, res) => {
        try {
            const db = JSON.parse(fs.readFileSync(dbFile));
            const now = new Date();
            const activeApps = db.filter(a => !a.expiryDate || new Date(a.expiryDate) > now);
            res.json(activeApps);
        } catch (e) { res.json([]); }
    });

    app.get('/x-api/download/:id', (req, res) => {
        const filePath = path.join(quarantineDir, req.params.id);
        if (fs.existsSync(filePath)) res.download(filePath, `security_check_${req.params.id}.zip`);
        else res.status(404).send('Файл не найден');
    });

    app.get('/x-api/ping', (req, res) => res.json({ status: "online" }));

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
                let fileReport = 'Анализ...';
                let borderColor = '#777';
                let safetyAlerts = [];

                if (hasZip) {
                    try {
                        const zip = new AdmZip(zipPath);
                        const entries = zip.getEntries();
                        const forbidden = ['.php', '.exe', '.bat', '.py', '.sh'];
                        let hasIndex = false;
                        entries.forEach(e => {
                            const name = e.entryName;
                            if (name.toLowerCase().endsWith('index.html')) hasIndex = true;
                            if (forbidden.some(ext => name.toLowerCase().endsWith(ext))) {
                                safetyAlerts.push(`<span style="color:#ff4444;">⛔️ ВИРУС: ${name}</span>`);
                            }
                        });
                        if (!hasIndex) safetyAlerts.push("<span style='color:#ff4444;'>❌ НЕТ INDEX.HTML</span>");
                        borderColor = safetyAlerts.length === 0 ? "#28a745" : "#dc3545";
                        fileReport = safetyAlerts.length === 0 ? "✅ ЧИСТО" : safetyAlerts.join('<br>');
                    } catch (err) { fileReport = "Ошибка ZIP"; borderColor = "#dc3545"; }
                }
                return { id, ...info, fileReport, borderColor, hasZip };
            }).reverse();

        res.send(`<html><body style="background:#0b0b0b;color:#fff;font-family:sans-serif;padding:20px;">
            <h2 style="color:#ff6600;">📦 АДМИН-ПАНЕЛЬ X-STORE</h2>
            ${pendingFiles.map(f => `<div style="background:#1a1a1a;border-left:6px solid ${f.borderColor};padding:15px;margin-bottom:15px;border-radius:10px;">
                <b style="font-size:18px;">${f.name}</b><br>
                <small>Владелец: ${f.ownerName} | Ключ: ${f.accessKey}</small>
                <div style="background:#000;padding:10px;margin:10px 0;font-size:12px;">${f.fileReport}</div>
                <a href="/x-api/download/${f.id}" style="color:#3399ff;text-decoration:none;">📥 Скачать ZIP</a>
                <div style="margin-top:10px;">
                    <button onclick="publish('${f.id}')" style="background:#28a745;color:#fff;border:none;padding:10px;border-radius:5px;cursor:pointer;">✅ ПРИНЯТЬ</button>
                    <button onclick="reject('${f.id}')" style="background:#dc3545;color:#fff;border:none;padding:10px;border-radius:5px;cursor:pointer;margin-left:10px;">🗑 ОТКЛОНИТЬ</button>
                </div>
            </div>`).join('')}
            <script>
                async function publish(id){ if(confirm('Опубликовать?')){ await fetch('/x-api/publish/'+id,{method:'POST'}); location.reload(); }}
                async function reject(id){ if(confirm('Удалить?')){ await fetch('/x-api/delete/'+id,{method:'DELETE'}); location.reload(); }}
            </script></body></html>`);
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
                name, email, cat, desc, accessKey, ownerName: kData.name, expiryDate: kData.expiry 
            }));
            
            if (storeBot) {
                const msg = `🆕 *НОВАЯ ЗАЯВКА X-STORE*\n\n📦 Проект: *${name}*\n👤 Владелец: ${kData.name}\n🔑 Ключ: \`${accessKey}\`\n📧 Email: ${email}`;
                storeBot.telegram.sendMessage(MY_ID, msg, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([[Markup.button.url('🛡 ОТКРЫТЬ АДМИНКУ', ADMIN_URL)]])
                });
            }
            res.json({ success: true });
        } catch (e) { res.status(500).json({ success: false }); }
    });

    app.post('/x-api/publish/:id', async (req, res) => {
        try {
            const id = req.params.id;
            const infoPath = path.join(quarantineDir, id + '.json');
            if (!fs.existsSync(infoPath)) return res.status(404).json({error: "Нет заявки"});
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
                if (iconFile) finalIcon = "https://logist-x.store/public/apps/" + appFolderName + "/" + iconFile;

                // --- СКЛЕЙКА И ГЕНЕРАЦИЯ PWA ---
                const manifest = {
                    "name": info.name, "short_name": info.name, "start_url": "index.html",
                    "display": "standalone", "background_color": "#0b0b0b", "theme_color": "#ff6600",
                    "icons": [{ "src": iconFile || "icon.png", "sizes": "512x512", "type": "image/png" }]
                };
                fs.writeFileSync(path.join(extractPath, 'manifest.json'), JSON.stringify(manifest));
                fs.writeFileSync(path.join(extractPath, 'sw.js'), "self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));");

                const indexPath = path.join(extractPath, 'index.html');
                if (fs.existsSync(indexPath)) {
                    let html = fs.readFileSync(indexPath, 'utf8');
                    const pwaInject = `\n<link rel="manifest" href="manifest.json">\n<meta name="mobile-web-app-capable" content="yes">\n<script>if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js');}</script>\n`;
                    html = html.includes('<head>') ? html.replace('<head>', '<head>' + pwaInject) : pwaInject + html;
                    fs.writeFileSync(indexPath, html);
                }
                finalUrl = "https://logist-x.store/public/apps/" + appFolderName + "/index.html";
            }

            const db = JSON.parse(fs.readFileSync(dbFile));
            db.push({ ...info, id: appFolderName, icon: finalIcon, url: finalUrl, folder: appFolderName });
            fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
            if(fs.existsSync(infoPath)) fs.unlinkSync(infoPath);
            if(fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            await sendStoreMail(info.email, '🚀 Опубликовано!', `Приложение "${info.name}" доступно.`);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ success: false, error: e.message }); }
    });

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

    if (storeBot) {
        storeBot.launch().catch(err => {
            if (!err.message.includes('409: Conflict')) console.error('❌ Ошибка бота:', err.message);
        });
    }
};
