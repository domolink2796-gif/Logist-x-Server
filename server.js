const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '150mb' }));
app.use(bodyParser.urlencoded({ limit: '150mb', extended: true }));

// --- НАСТРОЙКИ (ТВОИ ДАННЫЕ) ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const MERCH_ROOT_ID = '1CuCMuvL3-tUDoE8UtlJyWRyqSjS3Za9p'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const ADMIN_PASS = 'Logist_X_ADMIN'; 
const MY_TELEGRAM_ID = 6846149935; 
const SERVER_URL = 'https://logist-x-server-production.up.railway.app';

const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
async function readDatabase() {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        if (res.data.files.length === 0) return [];
        const content = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
        return content.data.keys || [];
    } catch (e) { return []; }
}

async function saveDatabase(keys) {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        const media = { mimeType: 'application/json', body: JSON.stringify({ keys }, null, 2) };
        if (res.data.files.length > 0) { await drive.files.update({ fileId: res.data.files[0].id, media }); }
        else { await drive.files.create({ resource: { name: DB_FILE_NAME, parents: [MY_ROOT_ID] }, media }); }
    } catch (e) { console.error("DB Save Error"); }
}

async function getOrCreateFolder(name, parentId) {
    const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
    const res = await drive.files.list({ q });
    if (res.data.files.length > 0) return res.data.files[0].id;
    const file = await drive.files.create({ resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id' });
    return file.data.id;
}

// --- ЛОГИКА СОХРАНЕНИЯ ЛОГИСТА (ФОТО + ТАБЛИЦЫ) ---
async function appendToReport(spreadsheetId, data) {
    await sheets.spreadsheets.values.append({
        spreadsheetId, range: 'Sheet1!A1', valueInputOption: 'USER_ENTERED',
        resource: { values: [[data.date, data.address, data.entrance, data.worker, data.status, data.photoUrl]] }
    });
}

// --- РОУТЫ СЕРВЕРА ---

// 1. УНИВЕРСАЛЬНЫЙ UPLOAD ДЛЯ ЛОГИСТА
app.post('/upload', async (req, res) => {
    try {
        const { action, licenseKey, workerName, image, address, entrance, status, date } = req.body;
        const keys = await readDatabase();

        // Активация внутри Логиста
        if (action === 'check_license') {
            const kData = keys.find(k => k.key === (licenseKey || '').trim().toUpperCase());
            if (!kData) return res.json({ status: 'error', message: 'Ключ не найден' });
            if (new Date(kData.expiry) < new Date()) return res.json({ status: 'error', message: 'Срок истёк' });
            if (!kData.workers) kData.workers = [];
            if (workerName && !kData.workers.includes(workerName)) {
                if (kData.workers.length >= kData.limit) return res.json({ status: 'error', message: 'Мест нет' });
                kData.workers.push(workerName); await saveDatabase(keys);
            }
            return res.json({ status: 'active', expiry: kData.expiry });
        }

        // Сохранение фото Логиста
        if (image) {
            const workerFolderId = await getOrCreateFolder(workerName, MY_ROOT_ID);
            const cleanAddr = address.replace(/[\\\/\?\*\:\|\"<>]/g, "");
            const fileName = `${cleanAddr}_${entrance}_${workerName}.jpg`;
            const buffer = Buffer.from(image, 'base64');
            const media = { mimeType: 'image/jpeg', body: Readable.from(buffer) };
            const file = await drive.files.create({ resource: { name: fileName, parents: [workerFolderId] }, media, fields: 'id, webViewLink' });

            const tableId = '1f1S797i037tVIdy40G9o0Y5I7GfR00u6O_y92G5H2E0'; // Твоя таблица
            await appendToReport(tableId, { date, address, entrance, worker: workerName, status, photoUrl: file.data.webViewLink });
            return res.json({ success: true, url: file.data.webViewLink });
        }
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 2. АКТИВАЦИЯ ДЛЯ МЕРЧА (ОТДЕЛЬНО)
app.post('/check-license', async (req, res) => {
    try {
        const { licenseKey, workerName } = req.body;
        const keys = await readDatabase();
        const kData = keys.find(k => k.key === (licenseKey || '').trim().toUpperCase());
        if (kData && new Date(kData.expiry) > new Date()) {
            if (!kData.workers.includes(workerName)) {
                kData.workers.push(workerName); await saveDatabase(keys);
            }
            return res.json({ status: 'active' });
        }
        res.json({ status: 'error', message: 'Ключ не активен' });
    } catch (e) { res.json({ status: 'error' }); }
});

// 3. ЗАГРУЗКА ИЗ МЕРЧА
app.post('/merch-upload', async (req, res) => {
    try {
        const d = req.body;
        const merchFolderId = await getOrCreateFolder(d.worker, MERCH_ROOT_ID);
        const buffer = Buffer.from(d.pdf.split(',')[1], 'base64');
        const media = { mimeType: 'image/jpeg', body: Readable.from(buffer) };
        const file = await drive.files.create({ resource: { name: `${d.pdfName}.jpg`, parents: [merchFolderId] }, media, fields: 'id, webViewLink' });
        
        // Запись в таблицу Мерча (твоя таблица мерча)
        await sheets.spreadsheets.values.append({
            spreadsheetId: '1CuCMuvL3-tUDoE8UtlJyWRyqSjS3Za9p', // Замени на ID таблицы мерча если нужно
            range: 'Sheet1!A1', valueInputOption: 'USER_ENTERED',
            resource: { values: [[new Date().toLocaleString(), d.net, d.address, d.worker, d.stock, d.share, file.data.webViewLink]] }
        });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// --- API ДЛЯ АДМИНКИ ---
app.get('/api/keys', async (req, res) => res.json(await readDatabase()));
app.post('/api/keys/add', async (req, res) => {
    const { name, limit, days } = req.body; let keys = await readDatabase();
    const newK = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const exp = new Date(); exp.setDate(exp.getDate() + parseInt(days));
    keys.push({ key: newK, name, limit: parseInt(limit), expiry: exp.toISOString(), workers: [], ownerChatId: null });
    await saveDatabase(keys); res.json({ success: true });
});
app.post('/api/keys/delete', async (req, res) => {
    let keys = await readDatabase(); keys = keys.filter(k => k.key !== req.body.key);
    await saveDatabase(keys); res.json({ success: true });
});
app.post('/api/keys/clear', async (req, res) => {
    let keys = await readDatabase(); const idx = keys.findIndex(k => k.key === req.body.key);
    if (idx !== -1) { keys[idx].workers = []; await saveDatabase(keys); }
    res.json({ success: true });
});

// --- ДИЗАЙН АДМИНКИ ---
app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>LOGIST_X | ADMIN</title><script src="https://unpkg.com/lucide@latest"></script><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;900&display=swap');body{background:#010409;color:#e6edf3;font-family:'Inter',sans-serif;padding:20px}.card{background:#0d1117;border:1px solid #30363d;border-radius:15px;padding:20px;margin-bottom:10px}.btn{width:100%;padding:12px;border-radius:8px;border:none;font-weight:900;cursor:pointer;text-transform:uppercase;font-size:10px}.btn-gold{background:#f59e0b;color:#000}.gold{color:#f59e0b}input,select{width:100%;padding:12px;background:#000;border:1px solid #30363d;color:#fff;margin-bottom:10px;border-radius:8px;box-sizing:border-box}</style></head><body><h2 style="font-style:italic">LOGIST<span class="gold">_X</span> ADMIN</h2><div class="card"><input id="n" placeholder="ОБЪЕКТ"><input id="l" type="number" value="5" placeholder="ЛИМИТ"><select id="d"><option value="30">30 ДНЕЙ</option><option value="365">ГОД</option></select><button class="btn btn-gold" onclick="add()">СОЗДАТЬ КЛЮЧ</button></div><div id="list"></div><script>async function load(){const r=await fetch('/api/keys');const d=await r.json();document.getElementById('list').innerHTML=d.map(k=>'<div class="card"><b class="gold">'+k.key+'</b><div style="font-size:10px;opacity:0.6;margin:10px 0">ОБЪЕКТ: '+k.name+'<br>МЕСТА: '+k.workers.length+'/'+k.limit+'<br>ДО: '+new Date(k.expiry).toLocaleDateString()+'</div><button class="btn btn-gold" style="opacity:0.5" onclick="clr(\\''+k.key+'\\')">СБРОС</button><button class="btn" style="background:#da3633;color:#fff;margin-top:5px" onclick="del(\\''+k.key+'\\')">УДАЛИТЬ</button></div>').join('');}async function add(){await fetch('/api/keys/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('n').value,limit:document.getElementById('l').value,days:document.getElementById('d').value})});load()}async function clr(key){await fetch('/api/keys/clear',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});load()}async function del(key){await fetch('/api/keys/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});load()}load();</script></body></html>`);
});

bot.start((ctx) => ctx.reply('ВВЕДИТЕ КЛЮЧ ДЛЯ ПРИВЯЗКИ:'));
bot.on('text', async (ctx) => {
    const key = ctx.message.text.trim().toUpperCase();
    let keys = await readDatabase();
    const idx = keys.findIndex(k => k.key === key);
    if (idx !== -1) {
        keys[idx].ownerChatId = ctx.chat.id; await saveDatabase(keys);
        ctx.reply('✅ ПРИВЯЗАНО');
    } else ctx.reply('❌ НЕТ ТАКОГО КЛЮЧА');
});

bot.launch();
app.listen(process.env.PORT || 3000);
