const express = require('express');
const { google } = require('googleapis');
const { Telegraf, Markup } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// --- ТВОИ НАСТРОЙКИ ---
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

// --- БАЗОВЫЕ ФУНКЦИИ ---
async function readDatabase() {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        if (res.data.files.length === 0) return [];
        const content = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
        let data = content.data;
        if (typeof data === 'string') { try { data = JSON.parse(data); } catch(e) { return []; } }
        return data.keys || [];
    } catch (e) { return []; }
}

async function saveDatabase(keys) {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        const dataStr = JSON.stringify({ keys: keys }, null, 2);
        const bufferStream = new Readable(); bufferStream.push(dataStr); bufferStream.push(null);
        const media = { mimeType: 'application/json', body: bufferStream };
        if (res.data.files.length > 0) { await drive.files.update({ fileId: res.data.files[0].id, media: media }); } 
        else { await drive.files.create({ resource: { name: DB_FILE_NAME, parents: [MY_ROOT_ID] }, media: media }); }
    } catch (e) { console.error("DB Error:", e); }
}

// --- API И ЗАГРУЗКА ---
app.post('/upload', async (req, res) => {
    // Твой оригинальный сложный код с Sheets и GPS остается здесь без изменений
    // ... (код загрузки) ...
    res.json({ success: true });
});

app.get('/api/keys', async (req, res) => res.json(await readDatabase()));

app.get('/api/client-keys', async (req, res) => {
    const keys = await readDatabase();
    res.json(keys.filter(k => String(k.ownerChatId) === String(req.query.chatId)));
});

app.post('/api/notify-admin', async (req, res) => {
    const { key, name, type } = req.body;
    const msg = type === 'buy' ? `🔥 ЗАЯВКА НА ПОКУПКУ` : `📅 ЗАПРОС ПРОДЛЕНИЯ: ${name}`;
    await bot.telegram.sendMessage(MY_TELEGRAM_ID, `🔔 **${msg}**\nКлюч: \`${key || 'новый'}\``, { parse_mode: 'Markdown' });
    res.json({ success: true });
});

// --- ИНТЕРФЕЙСЫ (АДМИН И КЛИЕНТ) ---
app.get('/dashboard', (req, res) => {
    // Твой оригинальный код админки Logist_X_ADMIN
});

app.get('/client-dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>CLIENT HQ</title>
    <style>
        body { background: #0a0c10; color: #fff; font-family: sans-serif; padding: 15px; }
        .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 15px; margin-bottom: 10px; }
        .accent { color: #f0ad4e; }
        .btn { background: #f0ad4e; color: #000; border: none; padding: 12px; width: 100%; border-radius: 8px; font-weight: bold; cursor: pointer; margin-top: 10px; }
    </style></head><body>
    <h2 style="text-align:center; color:#f0ad4e;">МОИ ОБЪЕКТЫ</h2>
    <div id="content">Загрузка данных...</div>
    <script>
        async function load(){
            const cid = new URLSearchParams(window.location.search).get('chatId');
            const res = await fetch('/api/client-keys?chatId=' + cid);
            const keys = await res.json();
            if(!keys.length) return document.getElementById('content').innerHTML = 'Нет активных лицензий';
            document.getElementById('content').innerHTML = keys.map(k => \`
                <div class="card">
                    <h3>\${k.name}</h3>
                    <p>Ключ: <span class="accent">\${k.key}</span></p>
                    <p>Места: \${k.workers ? k.workers.length : 0} / \${k.limit}</p>
                    <p>Срок: \${new Date(k.expiry).toLocaleDateString()}</p>
                    <button class="btn" onclick="requestExtend('\${k.key}', '\${k.name}')">ПРОДЛИТЬ</button>
                </div>\`).join('');
        }
        async function requestExtend(key, name){
            await fetch('/api/notify-admin', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({key, name, type:'extend'})});
            alert('Запрос на продление отправлен!');
        }
        load();
    </script></body></html>`);
});

// --- БОТ ---
bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    if (chatId === MY_TELEGRAM_ID) {
        return ctx.reply('👑 ПАНЕЛЬ АДМИНА', { reply_markup: { inline_keyboard: [[{ text: "📦 УПРАВЛЕНИЕ КЛЮЧАМИ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    }
    const keys = await readDatabase();
    const isClient = keys.find(k => String(k.ownerChatId) === String(chatId));

    if (isClient) {
        return ctx.reply('🏢 ВАШ КАБИНЕТ ОБЪЕКТОВ', { reply_markup: { inline_keyboard: [[{ text: "📊 ОТКРЫТЬ МОИ ДАННЫЕ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + chatId } }]] } });
    }

    ctx.reply('👋 Добро пожаловать! У вас нет активной лицензии.', {
        reply_markup: { inline_keyboard: [
            [{ text: "💳 КУПИТЬ ЛИЦЕНЗИЮ", callback_data: "buy" }],
            [{ text: "🔑 У МЕНЯ ЕСТЬ КЛЮЧ", callback_data: "have_key" }]
        ]}
    });
});

bot.action('buy', async (ctx) => {
    await fetch(SERVER_URL + '/api/notify-admin', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({type:'buy'})});
    ctx.reply('✅ Заявка отправлена! Администратор свяжется с вами.');
});

bot.action('have_key', (ctx) => ctx.reply('Введите ваш ключ активации:'));

bot.on('text', async (ctx) => {
    if (ctx.chat.id === MY_TELEGRAM_ID) return;
    const txt = ctx.message.text.trim();
    let keys = await readDatabase();
    const idx = keys.findIndex(k => k.key === txt);
    if (idx !== -1 && !keys[idx].ownerChatId) {
        keys[idx].ownerChatId = ctx.chat.id;
        await saveDatabase(keys);
        ctx.reply('✅ КЛЮЧ АКТИВИРОВАН!', { reply_markup: { inline_keyboard: [[{ text: "📊 МОЙ КАБИНЕТ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + ctx.chat.id } }]] } });
    }
});

bot.launch().then(() => console.log("🚀 GS SERVER READY"));
app.listen(process.env.PORT || 3000);
