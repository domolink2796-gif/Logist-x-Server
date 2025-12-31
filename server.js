const express = require('express');
const { google } = require('googleapis');
const { Telegraf, Markup } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// --- НАСТРОЙКИ ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
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

// --- СИСТЕМНЫЕ ФУНКЦИИ ---
async function readDatabase() {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        if (res.data.files.length === 0) return [];
        const fileId = res.data.files[0].id;
        const content = await drive.files.get({ fileId, alt: 'media' });
        let data = content.data;
        if (typeof data === 'string') data = JSON.parse(data);
        return data.keys || [];
    } catch (e) { return []; }
}

async function saveDatabase(keys) {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        const dataStr = JSON.stringify({ keys: keys }, null, 2);
        const bufferStream = new Readable(); bufferStream.push(dataStr); bufferStream.push(null);
        if (res.data.files.length > 0) {
            await drive.files.update({ fileId: res.data.files[0].id, media: { mimeType: 'application/json', body: bufferStream } });
        } else {
            await drive.files.create({ resource: { name: DB_FILE_NAME, parents: [MY_ROOT_ID] }, media: { mimeType: 'application/json', body: bufferStream } });
        }
    } catch (e) { console.error("DB Error:", e); }
}

// --- ИНТЕРФЕЙС АДМИНА (HTML) ---
app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ADMIN | LOGIST X</title>
    <style>
        :root { --bg: #0a0c10; --card: #161b22; --accent: #f0ad4e; --text: #f0f6fc; --green: #238636; --border: #30363d; }
        body { background: var(--bg); color: var(--text); font-family: -apple-system, system-ui, sans-serif; padding: 15px; display:none; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
        h3 { margin-top:0; color: var(--accent); letter-spacing: 1px; }
        input, select, button { width: 100%; padding: 12px; margin-bottom: 12px; border-radius: 8px; border: 1px solid var(--border); background: #010409; color: #fff; outline: none; box-sizing: border-box; }
        button { background: var(--accent); color: #000; font-weight: bold; cursor: pointer; border: none; transition: 0.2s; }
        .key-item { background: #0d1117; padding: 15px; border-radius: 10px; margin-bottom: 10px; border-left: 5px solid var(--accent); }
    </style></head>
    <body>
        <div class="card"><h3>НОВАЯ ЛИЦЕНЗИЯ</h3>
            <input type="text" id="newName" placeholder="Название объекта">
            <input type="number" id="newLimit" value="5">
            <select id="newDays"><option value="30">30 Дней</option><option value="365">1 Год</option></select>
            <button onclick="addKey()">СГЕНЕРИРОВАТЬ КЛЮЧ</button>
        </div>
        <div id="keysList"></div>
    <script>
        const PASS = "${ADMIN_PASS}";
        function auth() { if(localStorage.getItem('admin_pass')===PASS){document.body.style.display='block';load();}else{let p=prompt('PASS:');if(p===PASS){localStorage.setItem('admin_pass',PASS);location.reload();}else{alert('STOP');}}}
        async function load(){ 
            const res = await fetch('/api/keys'); const keys = await res.json(); 
            document.getElementById('keysList').innerHTML = keys.map(k => \`
                <div class="key-item">
                    <b>\${k.key}</b><br>
                    <small>🏢 \${k.name} | 👥 \${k.workers?k.workers.length:0}/\${k.limit}</small>
                </div>\`).join(''); 
        }
        async function addKey(){ 
            await fetch('/api/keys/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('newName').value,limit:document.getElementById('newLimit').value,days:document.getElementById('newDays').value})}); 
            load(); 
        }
        auth();
    </script></body></html>`);
});

// --- API И РОУТЫ ---
app.get('/api/keys', async (req, res) => res.json(await readDatabase()));

app.post('/api/keys/add', async (req, res) => {
    const { name, limit, days } = req.body;
    let keys = await readDatabase();
    const newKey = Math.random().toString(36).substring(2, 10).toUpperCase();
    const expiry = new Date(); expiry.setDate(expiry.getDate() + parseInt(days));
    keys.push({ key: newKey, name, limit, expiry: expiry.toISOString(), workers: [], ownerChatId: null });
    await saveDatabase(keys);
    res.json({ success: true });
});

// --- БОТ ---
bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    if (chatId === MY_TELEGRAM_ID) {
        return ctx.reply('👑 ПАНЕЛЬ УПРАВЛЕНИЯ', { reply_markup: { inline_keyboard: [[{ text: "📦 УПРАВЛЕНИЕ КЛЮЧАМИ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    }
    ctx.reply('👋 Добро пожаловать в Logist-X!');
});

bot.launch().catch(err => console.error("Bot Error:", err));
app.listen(process.env.PORT || 3000, () => console.log("GS SERVER READY"));
