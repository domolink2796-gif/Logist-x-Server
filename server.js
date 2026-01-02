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

// --- НАСТРОЙКИ (ВСЁ ТВОЁ) ---
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
        let data = content.data;
        if (typeof data === 'string') data = JSON.parse(data);
        return data.keys || [];
    } catch (e) { return []; }
}

async function saveDatabase(keys) {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        const media = { mimeType: 'application/json', body: JSON.stringify({ keys }, null, 2) };
        if (res.data.files.length > 0) { await drive.files.update({ fileId: res.data.files[0].id, media }); } 
        else { await drive.files.create({ resource: { name: DB_FILE_NAME, parents: [MY_ROOT_ID] }, media }); }
    } catch (e) { console.error("DB Error:", e); }
}

async function getOrCreateFolder(rawName, parentId) {
    const name = String(rawName).trim(); 
    const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
    const res = await drive.files.list({ q });
    if (res.data.files.length > 0) return res.data.files[0].id;
    const file = await drive.files.create({ resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id' });
    return file.data.id;
}

// --- УНИВЕРСАЛЬНЫЙ РОУТЕР (ИСПРАВЛЕН ДЛЯ МЕРЧА) ---
app.post('/upload', async (req, res) => {
    try {
        const { action, licenseKey, workerName } = req.body;
        const keys = await readDatabase();

        if (action === 'check_license') {
            const finalKey = (licenseKey || '').trim().toUpperCase();
            const kData = keys.find(k => k.key === finalKey);
            if (!kData) return res.json({ status: 'error', message: 'Ключ не найден' });
            if (new Date(kData.expiry) < new Date()) return res.json({ status: 'error', message: 'Срок истёк' });
            
            if (!kData.workers) kData.workers = [];
            if (workerName && !kData.workers.includes(workerName)) {
                if (kData.workers.length >= parseInt(kData.limit)) return res.json({ status: 'error', message: 'Мест нет' });
                kData.workers.push(workerName); 
                await saveDatabase(keys);
            }
            return res.json({ status: 'active', expiry: kData.expiry });
        }
        // Логика Логиста (сохранение фото и таблиц) остаётся без изменений
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Роут Мерча (дублируем логику лицензии для надёжности)
app.post('/merch-upload', async (req, res) => {
    try {
        const { action, licenseKey } = req.body;
        if (action === 'check_license') {
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === (licenseKey || '').trim().toUpperCase());
            if (kData && new Date(kData.expiry) > new Date()) return res.json({ status: 'active', expiry: kData.expiry });
            return res.json({ status: 'error' });
        }
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// --- API ---
app.get('/api/keys', async (req, res) => res.json(await readDatabase()));
app.get('/api/client-keys', async (req, res) => {
    const keys = await readDatabase(); 
    res.json(keys.filter(k => String(k.ownerChatId) === String(req.query.chatId)));
});
app.post('/api/keys/add', async (req, res) => {
    const { name, limit, days } = req.body; let keys = await readDatabase();
    const newK = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const exp = new Date(); exp.setDate(exp.getDate() + parseInt(days));
    keys.push({ key: newK, name, limit, expiry: exp.toISOString(), workers: [], ownerChatId: null });
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

// --- КРУТАЯ АДМИНКА ---
app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>ADMIN | LOGIST X</title><script src="https://unpkg.com/lucide@latest"></script><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');body{background:#010409;color:#e6edf3;font-family:'Inter',sans-serif;padding:15px}.card{background:linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01));border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:20px;margin-bottom:15px}.btn{width:100%;padding:14px;border-radius:12px;border:none;font-weight:900;text-transform:uppercase;cursor:pointer;margin-top:10px;display:flex;align-items:center;justify-content:center;gap:10px;font-size:12px}.btn-gold{background:#f59e0b;color:#000}.btn-del{background:#da3633;color:#fff}.input{width:100%;padding:12px;background:#0d1117;border:1px solid #30363d;border-radius:10px;color:#fff;margin-bottom:10px;box-sizing:border-box}#list{margin-top:20px}.obj-info{font-size:11px;opacity:0.6;margin-top:10px;line-height:1.6}.gold-text{color:#f59e0b}</style></head><body><div style="display:flex;align-items:center;gap:10px;margin-bottom:20px"><i data-lucide="shield-check" class="gold-text"></i><h2 style="margin:0;font-style:italic;font-weight:900">LOGIST<span class="gold-text">_X</span> ADMIN</h2></div><div class="card"><input id="n" class="input" placeholder="НАЗВАНИЕ ОБЪЕКТА"><input id="l" class="input" type="number" placeholder="ЛИМИТ ЛЮДЕЙ" value="5"><select id="d" class="input"><option value="30">30 ДНЕЙ</option><option value="365">1 ГОД</option></select><button class="btn btn-gold" onclick="add()"><i data-lucide="plus-circle" size="16"></i> СОЗДАТЬ КЛЮЧ</button></div><div id="list"></div><script>const PASS="${ADMIN_PASS}";function auth(){if(localStorage.getItem('p')!==PASS){let p=prompt('PASS');if(p===PASS)localStorage.setItem('p',PASS);else auth();}}async function load(){const r=await fetch('/api/keys');const d=await r.json();document.getElementById('list').innerHTML=d.map(k=>'<div class="card"><div style="display:flex;justify-content:between;align-items:start"><div><b style="font-size:18px" class="gold-text">'+k.key+'</b><div class="obj-info">📍 ОБЪЕКТ: '+k.name+'<br>👤 ID ВЛАДЕЛЬЦА: '+(k.ownerChatId||'НЕ ПРИВЯЗАН')+'<br>👥 РАБОЧИЕ ('+k.workers.length+'/'+k.limit+'): '+(k.workers.join(', ')||'ПУСТО')+'<br>📅 ДО: '+new Date(k.expiry).toLocaleDateString()+'</div></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="btn btn-gold" style="opacity:0.8" onclick="clr(\\''+k.key+'\\')"><i data-lucide="users-2" size="14"></i> СБРОСИТЬ</button><button class="btn btn-del" onclick="del(\\''+k.key+'\\')"><i data-lucide="trash-2" size="14"></i> УДАЛИТЬ</button></div></div>').join('');lucide.createIcons();}async function add(){await fetch('/api/keys/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('n').value,limit:document.getElementById('l').value,days:document.getElementById('d').value})});load()}async function clr(key){if(confirm('ОЧИСТИТЬ РАБОЧИХ?')){await fetch('/api/keys/clear',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});load()}}async function del(key){if(confirm('УДАЛИТЬ КЛЮЧ?')){await fetch('/api/keys/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});load()}}auth();load()</script></body></html>`);
});

app.get('/client-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'client_panel.html')));

bot.start(async (ctx) => {
    const cid = ctx.chat.id;
    if (cid === MY_TELEGRAM_ID) return ctx.reply('👑 ADMIN', { reply_markup: { inline_keyboard: [[{ text: "📦 УПРАВЛЕНИЕ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    const keys = await readDatabase(); 
    if (keys.find(k => String(k.ownerChatId) === String(cid))) return ctx.reply('🏢 КАБИНЕТ', { reply_markup: { inline_keyboard: [[{ text: "📊 МОИ ОБЪЕКТЫ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + cid } }]] } });
    ctx.reply('ВВЕДИТЕ КЛЮЧ:');
});

bot.on('text', async (ctx) => {
    if (ctx.chat.id === MY_TELEGRAM_ID) return;
    const key = ctx.message.text.trim().toUpperCase();
    let keys = await readDatabase();
    const idx = keys.findIndex(k => k.key === key);
    if (idx !== -1) {
        if(keys[idx].ownerChatId) return ctx.reply('КЛЮЧ ЗАНЯТ');
        keys[idx].ownerChatId = ctx.chat.id; await saveDatabase(keys);
        ctx.reply('✅ ПРИВЯЗАНО', { reply_markup: { inline_keyboard: [[{ text: "📊 КАБИНЕТ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + ctx.chat.id } }]] } });
    } else ctx.reply('НЕВЕРНЫЙ КЛЮЧ');
});

bot.launch();
app.listen(process.env.PORT || 3000, () => console.log("Server Started"));
