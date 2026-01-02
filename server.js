const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(__dirname));
app.use(bodyParser.json({ limit: '150mb' }));
app.use(bodyParser.urlencoded({ limit: '150mb', extended: true }));

// --- НАСТРОЙКИ ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const MERCH_ROOT_ID = '1CuCMuvL3-tUDoE8UtlJyWRyqSjS3Za9p'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const ADMIN_PASS = 'Logist_X_ADMIN'; 
const MY_TELEGRAM_ID = 6846149935; 
const SERVER_URL = 'https://logist-x-server-production.up.railway.app';

// Авторизация Google
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

// === API ДЛЯ АДМИНКИ ===
app.get('/api/keys', async (req, res) => { res.json(await readDatabase()); });

app.get('/api/client-keys', async (req, res) => {
    const cid = req.query.chatId;
    const keys = await readDatabase();
    res.json(keys.filter(k => String(k.ownerChatId) === String(cid)));
});

app.post('/api/keys/add', async (req, res) => {
    const { name, limit, days } = req.body; 
    let keys = await readDatabase();
    const newK = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const exp = new Date(); 
    exp.setDate(exp.getDate() + parseInt(days || 30));
    keys.push({ key: newK, name, limit: parseInt(limit), expiry: exp.toISOString(), workers: [], ownerChatId: null });
    await saveDatabase(keys); 
    res.json({ success: true });
});

app.post('/api/keys/extend', async (req, res) => {
    const { key, days } = req.body;
    let keys = await readDatabase(); 
    const idx = keys.findIndex(k => k.key === key);
    if (idx !== -1) { 
        let currentExp = new Date(keys[idx].expiry);
        let startPoint = currentExp > new Date() ? currentExp : new Date();
        startPoint.setDate(startPoint.getDate() + parseInt(days));
        keys[idx].expiry = startPoint.toISOString(); 
        await saveDatabase(keys); 
        res.json({ success: true }); 
    } else res.json({ success: false });
});

app.post('/api/keys/delete', async (req, res) => {
    const { key } = req.body;
    let keys = await readDatabase();
    keys = keys.filter(k => k.key !== key);
    await saveDatabase(keys);
    res.json({ success: true });
});

// --- ВЕБ-ИНТЕРФЕЙСЫ ---

app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>LOGIST_X ADMIN</title>
    <style>
        body{background:#0a0c10;color:#fff;font-family:sans-serif;padding:15px}
        .card{background:#161b22;padding:15px;margin-bottom:15px;border-radius:12px;border:1px solid #30363d}
        input, select, button{width:100%;padding:12px;margin-bottom:10px;background:#0d1117;color:#fff;border:1px solid #30363d;border-radius:8px;box-sizing:border-box}
        .btn-main{background:#f0ad4e;color:#000;font-weight:bold;cursor:pointer;border:none}
        .btn-del{background:#d63031;color:#fff;font-weight:bold;cursor:pointer;border:none;margin-top:5px;padding:8px; font-size:12px}
        .status-ok{color:#4cd137} .status-expired{color:#e84118}
        .count-badge{background:#30363d; padding:2px 8px; border-radius:10px; font-size:13px; color:#f0ad4e}
        code{background:#000;padding:2px 5px;border-radius:4px;color:#f0ad4e; font-family:monospace}
    </style></head><body>
    <h2>👑 УПРАВЛЕНИЕ LOGIST_X</h2>
    <div class="card">
        <h4 style="margin:0 0 10px 0">Новый объект</h4>
        <input id="n" placeholder="Название (напр. Магнит)">
        <input id="l" type="number" value="5" placeholder="Лимит сотрудников">
        <select id="d">
            <option value="30">На 30 дней</option>
            <option value="180">На 180 дней</option>
            <option value="365">На 1 год</option>
        </select>
        <button class="btn-main" onclick="add()">+ СОЗДАТЬ КЛЮЧ</button>
    </div>
    <div id="list">Загрузка данных...</div>
    <script>
        const PASS="${ADMIN_PASS}";
        function auth(){if(localStorage.getItem('p')!==PASS){let p=prompt('Укажите пароль:');if(p===PASS)localStorage.setItem('p',PASS);else auth();}}
        async function load(){
            const r=await fetch('/api/keys');const d=await r.json();
            document.getElementById('list').innerHTML=d.map(k=> {
                const isExp = new Date(k.expiry) < new Date();
                const used = k.workers ? k.workers.length : 0;
                return '<div class="card">' +
                    '<div style="display:flex; justify-content:space-between"><b>' + k.name + '</b> <span class="count-badge">👥 ' + used + ' / ' + k.limit + '</span></div>' +
                    '<div style="margin:8px 0"><code>' + k.key + '</code></div>' +
                    '<small>До: <span class="' + (isExp?'status-expired':'status-ok') + '">' + new Date(k.expiry).toLocaleDateString() + '</span></small><br>' +
                    '<small style="opacity:0.6">Клиент: ' + (k.ownerChatId || 'Не привязан') + '</small>' +
                    '<select id="s_'+k.key+'" style="margin-top:10px"><option value="30">на 30 дней</option><option value="180">на 180 дней</option><option value="365">на год</option></select>' +
                    '<button class="btn-main" onclick="ext(\\''+k.key+'\\')">ПРОДЛИТЬ</button>' +
                    '<button class="btn-del" onclick="del(\\''+k.key+'\\')">УДАЛИТЬ ПОЛНОСТЬЮ</button>' +
                '</div>'
            }).join('');
        }
        async function add(){
            const name = document.getElementById('n').value;
            if(!name) return alert('Введите имя!');
            await fetch('/api/keys/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name, limit:document.getElementById('l').value,days:document.getElementById('d').value})});
            load();
        }
        async function ext(key){
            const days = document.getElementById('s_'+key).value;
            await fetch('/api/keys/extend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key, days})});
            load();
        }
        async function del(key){
            if(confirm('Удалить этот объект и ключ?')){
                await fetch('/api/keys/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});
                load();
            }
        }
        auth();load();
    </script></body></html>`);
});

app.get('/client-panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'client_panel.html'));
});

// --- ТЕЛЕГРАМ БОТ ---
bot.start(async (ctx) => {
    const cid = ctx.chat.id;
    const keys = await readDatabase(); 
    const hasKey = keys.find(k => String(k.ownerChatId) === String(cid));

    if (cid === MY_TELEGRAM_ID) {
        let kb = [[{ text: "⚙️ АДМИН-ПАНЕЛЬ", web_app: { url: SERVER_URL + "/dashboard" } }]];
        if(hasKey) kb.push([{ text: "📊 МОЙ КАБИНЕТ", web_app: { url: SERVER_URL + "/client-panel?chatId=" + cid } }]);
        return ctx.reply('👑 ПРИВЕТ, ЕВГЕНИЙ!', { reply_markup: { inline_keyboard: kb } });
    }
    
    if (hasKey) {
        return ctx.reply('🏢 ВАШ КАБИНЕТ ОБЪЕКТОВ', { reply_markup: { inline_keyboard: [[{ text: "📊 ОТКРЫТЬ ПАНЕЛЬ", web_app: { url: SERVER_URL + "/client-panel?chatId=" + cid } }]] } });
    }
    ctx.reply('Введите ваш ключ доступа:');
});

bot.on('text', async (ctx) => {
    const key = ctx.message.text.trim().toUpperCase();
    let keys = await readDatabase(); 
    const idx = keys.findIndex(k => k.key === key);
    if (idx !== -1) { 
        if(keys[idx].ownerChatId) return ctx.reply('Ключ уже используется.'); 
        keys[idx].ownerChatId = ctx.chat.id; 
        await saveDatabase(keys); 
        ctx.reply('✅ Доступ разрешен!', { reply_markup: { inline_keyboard: [[{ text: "📊 ПАНЕЛЬ УПРАВЛЕНИЯ", web_app: { url: SERVER_URL + "/client-panel?chatId=" + ctx.chat.id } }]] } });
    } else if (ctx.chat.id !== MY_TELEGRAM_ID) { ctx.reply('Ключ не найден в базе.'); }
});

bot.launch();
app.listen(process.env.PORT || 3000, () => console.log("Server Started"));
