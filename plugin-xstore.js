// 1. ПОДТЯГИВАЕМ ГЕН-ФАЙЛ (Обязательно ПЕРВАЯ строчка)
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

// --- НАСТРОЙКИ ПОЧТЫ (Берем из системы, как в Тест-драйве) ---
const transporter = nodemailer.createTransport({
    host: 'smtp.mail.ru',
    port: 465,
    secure: true,
    auth: {
        user: 'service@x-platform.ru',
        // ВАЖНО: Если в .env пароль называется иначе, замени MAIL_PASS здесь
        pass: process.env.MAIL_PASS 
    }
});

const quarantineDir = path.join(process.cwd(), 'uploads-quarantine');
const publicDir = path.join(process.cwd(), 'public', 'apps');
const dbFile = path.join(process.cwd(), 'public', 'apps.json');

if (!fs.existsSync(quarantineDir)) fs.mkdirSync(quarantineDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, '[]');

const upload = multer({ dest: quarantineDir });

// Функция доставки уведомлений
async function sendStoreMail(to, subject, text) {
    try {
        if (!process.env.MAIL_PASS) {
            console.error("❌ ОШИБКА: Пароль почты не найден в .env! Проверьте переменную MAIL_PASS");
            return;
        }
        await transporter.sendMail({
            from: '"X-PLATFORM CORE" <service@x-platform.ru>',
            to: to, subject: subject, text: text
        });
        console.log(`✅ Письмо успешно отправлено: ${to}`);
    } catch (e) { console.error("❌ Ошибка Nodemailer:", e.message); }
}

function getVirusTotalLink(type, data) {
    if (type === 'file_hash') return `https://www.virustotal.com/gui/file/${data}`;
    const encodedUrl = Buffer.from(data).toString('base64').replace(/=/g, '');
    return `https://www.virustotal.com/gui/url/${encodedUrl}`;
}

module.exports = function(app, context) {
    app.use('/public', express.static(path.join(process.cwd(), 'public')));

    // --- API СПИСКА ---
    app.get('/x-api/apps', (req, res) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        if (fs.existsSync(dbFile)) res.json(JSON.parse(fs.readFileSync(dbFile)));
        else res.json([]);
    });

    // --- АДМИН ПАНЕЛЬ ---
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

        res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{background:#0b0b0b;color:#fff;font-family:sans-serif;padding:15px;}.card{background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:15px;margin-bottom:15px;}.title{color:#ff6600;font-weight:bold;}.btn{width:100%;padding:10px;border:none;border-radius:8px;font-weight:bold;margin-top:5px;cursor:pointer;color:white;}.btn-pub{background:#28a745;}.btn-del{background:#dc3545;}.btn-scan{background:#6f42c1;}</style></head><body><h2 style="color:#28a745">🟢 В МАГАЗИНЕ</h2>${activeApps.map(app=>`<div class="card"><div class="title">${app.title}</div><button class="btn btn-del" onclick="unpublish('${app.id}')">❌ УДАЛИТЬ</button></div>`).join('')}<h2 style="color:#ffc107">🟡 НА ПРОВЕРКЕ</h2>${pendingFiles.map(f=>`<div class="card"><div class="title">${f.name}</div><a href="${f.scanLink}" target="_blank"><button class="btn btn-scan">🛡 VIRUS TOTAL</button></a><div style="display:flex;gap:5px"><button class="btn btn-pub" onclick="publish('${f.id}')">✅ ПРИНЯТЬ</button><button class="btn btn-del" onclick="reject('${f.id}')">🗑 ОТКЛОНИТЬ</button></div></div>`).join('')}<script>async function unpublish(id){if(confirm('Удалить?')){await fetch('/x-api/unpublish/'+id,{method:'POST'});location.reload();}}async function publish(id){if(confirm('Опубликовать?')){await fetch('/x-api/publish/'+id,{method:'POST'});location.reload();}}async function reject(id){if(confirm('Удалить?')){await fetch('/x-api/delete/'+id,{method:'DELETE'});location.reload();}}</script></body></html>`);
    });

    // --- ПУБЛИКАЦИЯ (ПОЛНАЯ ЛОГИКА) ---
    app.post('/x-api/publish/:id', async (req, res) => {
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
                if (iconFile) { iconFileName = iconFile; finalIcon = "https://logist-x.store/public/apps/" + appFolderName + "/" + iconFile; }

                // Создание Manifest
                fs.writeFileSync(path.join(extractPath, 'manifest.json'), JSON.stringify({ "name": info.name, "short_name": info.name, "start_url": "index.html", "display": "standalone", "background_color": "#0b0b0b", "theme_color": "#ff6600", "icons": [{ "src": iconFileName, "sizes": "512x512", "type": "image/png" }] }, null, 2));
                // Создание SW
                fs.writeFileSync(path.join(extractPath, 'sw.js'), "self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('fetch',e=>e.respondWith(fetch(e.request)));");
                // Инъекция в HTML
                const htmlPath = path.join(extractPath, 'index.html');
                if (fs.existsSync(htmlPath)) {
                    let html = fs.readFileSync(htmlPath, 'utf8');
                    html = html.replace('<head>', `<head><link rel='manifest' href='manifest.json'><script>if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js');} window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();window.defP=e;});</script>`);
                    fs.writeFileSync(htmlPath, html);
                }
            } catch (e) { return res.status(500).json({error: "Ошибка PWA"}); }
        }

        // ПИСЬМО
        await sendStoreMail(info.email, '🚀 Приложение опубликовано!', `Поздравляем! Приложение "${info.name}" теперь в X-Store.`);

        const db = JSON.parse(fs.readFileSync(dbFile));
        db.push({ id: appFolderName, title: info.name, cat: info.cat, icon: finalIcon, url: finalUrl, folder: appFolderName });
        fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
        if(fs.existsSync(infoPath)) fs.unlinkSync(infoPath);
        if(fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        res.json({ success: true });
    });

    // --- ЗАГРУЗКА С АНТИВИРУСОМ ---
    app.post('/x-api/upload', upload.single('appZip'), async (req, res) => {
        const { name, email, cat, desc, url } = req.body;
        if (req.file) {
            try {
                const zip = new AdmZip(req.file.path);
                const entries = zip.getEntries();
                let hasIndex = false, badFiles = [];
                const forbidden = ['.php', '.exe', '.bat', '.sh'];
                entries.forEach(e => {
                    const fName = e.entryName.toLowerCase();
                    if (fName === 'index.html') hasIndex = true;
                    if (forbidden.some(ext => fName.endsWith(ext))) badFiles.push(e.entryName);
                });
                if (!hasIndex || badFiles.length > 0) {
                    fs.unlinkSync(req.file.path);
                    return res.status(400).json({ success: false, error: !hasIndex ? "Нет index.html" : "Вирусы: " + badFiles.join(',') });
                }
            } catch (e) { fs.unlinkSync(req.file.path); return res.status(400).json({ success: false, error: "ZIP поврежден" }); }
        }
        const id = req.file ? req.file.filename : "req_" + Date.now();
        fs.writeFileSync(path.join(quarantineDir, id + '.json'), JSON.stringify({ name, email, cat, desc, url }));
        storeBot.telegram.sendMessage(MY_ID, `🆕 ЗАЯВКА: ${name}\n📧: ${email}\n📂: ${cat}`);
        res.json({ success: true });
    });

    app.delete('/x-api/delete/:id', async (req, res) => {
        const id = req.params.id;
        const infoPath = path.join(quarantineDir, id + '.json');
        if (fs.existsSync(infoPath)) {
            const info = JSON.parse(fs.readFileSync(infoPath));
            await sendStoreMail(info.email, '⚠️ Статус заявки', `Заявка "${info.name}" отклонена.`);
            fs.unlinkSync(infoPath);
        }
        const p1 = path.join(quarantineDir, id);
        if(fs.existsSync(p1)) fs.unlinkSync(p1);
        res.json({success:true});
    });

    storeBot.launch();
};
