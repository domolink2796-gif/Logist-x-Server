const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '150mb' }));
app.use(bodyParser.urlencoded({ limit: '150mb', extended: true }));

// --- НАСТРОЙКИ ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const MERCH_ROOT_ID = '1CuCMuvL3-tUDoE8UtlJyWRyqSjS3Za9p'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const ADMIN_PASS = 'Logist_X_ADMIN'; 
const MY_TELEGRAM_ID = 6846149935; 

// ТВОЙ КОНТАКТ ДЛЯ ПАРТНЕРОВ (Замени @ТВОЙ_ЛОГИН на свой реальный ник в Telegram)
const MY_TG_CONTACT = '@ТВОЙ_ЛОГИН'; 

const SERVER_URL = 'https://logist-x-server-production.up.railway.app';

const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// --- ФУНКЦИИ БАЗЫ ДАННЫХ ---
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
    } catch (e) { console.error("DB Save Error:", e); }
}

// --- ИНТЕРФЕЙСЫ ---
app.get('/', (req, res) => {
    res.send(`<div style="background:#010409;color:white;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;"><h1>LOGIST_X SYSTEM</h1><p style="opacity:0.5">Server is running correctly</p></div>`);
});

app.get('/reg', (req, res) => {
    const ref = req.query.ref || '';
    res.send(`<html><body style="background:#010409;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;">
        <div style="text-align:center;"><h2>Регистрация в системе...</h2>
        <script>localStorage.setItem('partnerRef', '${ref}'); setTimeout(() => { window.location.href = 'https://logist-x.ru'; }, 1000);</script>
        </div></body></html>`);
});

app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>LOGIST_X | ADMIN</title><script src="https://unpkg.com/lucide@latest"></script><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');body{background:#010409;color:#e6edf3;font-family:'Inter',sans-serif;margin:0;padding:20px;display:flex;flex-direction:column;align-items:center}.card{background:#0d1117;border:1px solid #30363d;border-radius:16px;padding:20px;margin-bottom:15px;width:100%;max-width:400px;box-sizing:border-box}.btn{width:100%;padding:14px;border-radius:10px;border:none;font-weight:900;cursor:pointer;text-transform:uppercase;font-size:12px;display:flex;align-items:center;justify-content:center;gap:8px;transition:0.2s}.btn-gold{background:#f59e0b;color:#000}.gold{color:#f59e0b}input,select{width:100%;padding:12px;background:#000;border:1px solid #30363d;color:#fff;margin-bottom:10px;border-radius:8px;box-sizing:border-box;font-family:inherit}</style></head><body><h2 style="font-style:italic">LOGIST<span class="gold">_X</span> ADMIN</h2><div class="card"><input id="n" placeholder="ОБЪЕКТ (НАЗВАНИЕ)"><input id="l" type="number" value="5" placeholder="ЛИМИТ"><select id="d"><option value="30">30 ДНЕЙ</option><option value="365">1 ГОД</option></select><button class="btn btn-gold" onclick="add()"><i data-lucide="plus-circle"></i> СОЗДАТЬ КЛЮЧ</button></div><div id="list" style="width:100%;max-width:400px"></div><script>const PASS="${ADMIN_PASS}";function auth(){if(localStorage.getItem('p')!==PASS){let p=prompt('ACCESS PASS');if(p===PASS)localStorage.setItem('p',PASS);else auth();}}async function load(){const r=await fetch('/api/keys');const d=await r.json();document.getElementById('list').innerHTML=d.map(k=>'<div class="card"><b class="gold" style="font-size:18px">'+k.key+'</b><div style="font-size:13px;margin:10px 0;opacity:0.7">ОБЪЕКТ: '+k.name+'<br>ПАРТНЕР: '+(k.partnerId||'НЕТ')+'</div></div>').join('');lucide.createIcons();}async function add(){await fetch('/api/keys/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('n').value,limit:document.getElementById('l').value,days:document.getElementById('d').value})});load()}auth();load();</script></body></html>`);
});

app.get('/client-dashboard', (req, res) => {
    res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>MY OBJECTS</title><script src="https://unpkg.com/lucide@latest"></script><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');body{background:#010409;color:#e6edf3;font-family:'Inter',sans-serif;margin:0;padding:15px}.card{background:#0d1117;border:1px solid #30363d;border-radius:20px;padding:25px;margin-bottom:15px}.btn-action{background:#f59e0b;color:#000;border:none;padding:15px;border-radius:12px;width:100%;font-weight:900;text-transform:uppercase;font-size:12px;display:flex;align-items:center;justify-content:center;gap:10px;margin-top:20px}.gold{color:#f59e0b}</style></head><body><h2 style="text-align:center;font-style:italic">МОИ <span class="gold">ОБЪЕКТЫ</span></h2><div id="c"></div><script>async function l(){const id=new URLSearchParams(window.location.search).get('chatId');const r=await fetch('/api/client-keys?chatId='+id);const k=await r.json();document.getElementById('c').innerHTML=k.map(i=>'<div class="card"><h3 style="margin:5px 0;font-size:22px">'+i.name+'</h3><code style="background:#000;padding:6px 12px;border-radius:8px;display:inline-block;margin:15px 0;border:1px solid #30363d;font-size:16px;color:#fff">'+i.key+'</code><button class="btn-action" onclick="ask(\\''+i.key+'\\',\\''+i.name+'\\')"><i data-lucide="zap"></i> ЗАПРОСИТЬ ПРОДЛЕНИЕ</button></div>').join('');lucide.createIcons();}async function ask(k,n){await fetch('/api/notify-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:k,name:n})});alert('Запрос отправлен!');}l();</script></body></html>`);
});

// --- API ---
app.get('/api/keys', async (req, res) => { res.json(await readDatabase()); });
app.get('/api/client-keys', async (req, res) => {
    try { const keys = await readDatabase(); res.json(keys.filter(k => String(k.ownerChatId) === String(req.query.chatId))); } catch (e) { res.json([]); }
});
app.post('/api/keys/add', async (req, res) => {
    const { name, limit, days } = req.body; let keys = await readDatabase();
    const newK = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const exp = new Date(); exp.setDate(exp.getDate() + parseInt(days));
    keys.push({ key: newK, name, limit, expiry: exp.toISOString(), workers: [], ownerChatId: null });
    await saveDatabase(keys); res.json({ success: true });
});
app.post('/api/notify-admin', async (req, res) => {
    await bot.telegram.sendMessage(MY_TELEGRAM_ID, `🔔 **ЗАПРОС ПРОДЛЕНИЯ**\nОбъект: ${req.body.name}\nКлюч: \`${req.body.key}\``);
    res.json({ success: true });
});

// --- ЛОГИКА ЛИЦЕНЗИЙ ---
app.post('/upload', async (req, res) => {
    try {
        const { action, licenseKey, workerName, referrerId } = req.body;
        if (action === 'check_license') {
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === (licenseKey || '').trim().toUpperCase());
            if (!kData) return res.json({ status: 'error', message: 'Ключ не найден' });
            if (workerName && !kData.workers.includes(workerName)) {
                if (kData.workers.length >= parseInt(kData.limit)) return res.json({ status: 'error', message: 'Лимит мест' });
                kData.workers.push(workerName);
                if (referrerId && !kData.partnerId) {
                    kData.partnerId = referrerId;
                    await bot.telegram.sendMessage(MY_TELEGRAM_ID, `🔥 **ПАРТНЕРСКАЯ ПРОДАЖА!**\nПартнер ID: \`${referrerId}\`\nОбъект: ${kData.name}`);
                }
                await saveDatabase(keys);
            }
            return res.json({ status: 'active', expiry: kData.expiry });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- BOT ---
bot.start(async (ctx) => {
    const cid = ctx.chat.id;
    if (cid === MY_TELEGRAM_ID) return ctx.reply('👑 АДМИН-ПАНЕЛЬ LOGIST_X', { reply_markup: { inline_keyboard: [[{ text: "📦 УПРАВЛЕНИЕ КЛЮЧАМИ", web_app: { url: SERVER_URL + "/dashboard" } }]] } });
    ctx.reply('ДОБРО ПОЖАЛОВАТЬ В LOGIST_X!\nВыберите роль:', { reply_markup: { inline_keyboard: [[{ text: "💼 Я КЛИЕНТ", callback_data: "role_user" }], [{ text: "💰 ПАРТНЕР (15%)", callback_data: "role_partner" }]] } });
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data === 'role_user') {
        const keys = await readDatabase();
        if (keys.find(k => String(k.ownerChatId) === String(ctx.chat.id))) {
            return ctx.reply('🏢 ВАШ КАБИНЕТ:', { reply_markup: { inline_keyboard: [[{ text: "📊 МОИ ОБЪЕКТЫ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + ctx.chat.id } }]] } });
        }
        ctx.reply('Введите ваш ключ доступа:');
    }
    if (data === 'role_partner') {
        const refLink = `${SERVER_URL}/reg?ref=${ctx.chat.id}`;
        ctx.reply(`🤝 **ПАРТНЕРСКАЯ ПРОГРАММА LOGIST_X**\n\n` +
                  `💰 **Твоя выплата:** 15% с каждой продажи.\n\n` +
                  `🔗 **Твоя ссылка для привлечения:**\n\`${refLink}\`\n\n` +
                  `📋 **Как это работает:**\n` +
                  `1. Отправь эту ссылку потенциальному клиенту.\n` +
                  `2. Когда он перейдет по ней и активирует ключ, система закрепит его за тобой.\n` +
                  `3. Ты получишь уведомление о продаже.\n\n` +
                  `👨‍💻 **По вопросам выплат и сотрудничества писать сюда:** ${MY_TG_CONTACT}`, { parse_mode: 'Markdown' });
    }
});

bot.on('text', async (ctx) => {
    if (ctx.chat.id === MY_TELEGRAM_ID) return;
    const key = ctx.message.text.trim().toUpperCase();
    let keys = await readDatabase();
    const idx = keys.findIndex(k => k.key === key);
    if (idx !== -1) {
        if (keys[idx].ownerChatId) return ctx.reply('Ключ уже занят.');
        keys[idx].ownerChatId = ctx.chat.id;
        await saveDatabase(keys);
        ctx.reply('✅ Ключ привязан!', { reply_markup: { inline_keyboard: [[{ text: "📊 ОТКРЫТЬ КАБИНЕТ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + ctx.chat.id } }]] } });
    } else ctx.reply('Ключ не найден.');
});

bot.launch();
app.listen(process.env.PORT || 3000, () => console.log("Server Started"));
