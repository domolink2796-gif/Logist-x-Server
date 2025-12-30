const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// --- ТВОИ НАСТРОЙКИ ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A';
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_NAME = 'DATABASE_KEYS_LOGIST_X';

// Auth
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

async function getOrCreateFolder(rawName, parentId) {
    try {
        const name = String(rawName).trim(); 
        const q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        if (res.data.files.length > 0) return res.data.files[0].id;
        const fileMetadata = { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] };
        const file = await drive.files.create({ resource: fileMetadata, fields: 'id' });
        return file.data.id;
    } catch (e) { return parentId; }
}

// --- ВШИТАЯ АДМИНКА (Чтобы не было текста!) ---
const ADMIN_HTML = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LOGIST-X HQ</title>
    <style>
        body { background-color: #000; color: #0f0; font-family: 'Courier New', monospace; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        h1 { text-shadow: 0 0 10px #0f0; margin-bottom: 20px; }
        .container { border: 1px solid #0f0; padding: 20px; box-shadow: 0 0 20px #0f0; text-align: center; max-width: 90%; }
        input { background: #111; border: 1px solid #0f0; color: #0f0; padding: 10px; margin-bottom: 10px; width: 80%; font-family: inherit; }
        button { background: #0f0; color: #000; border: none; padding: 10px 20px; font-weight: bold; cursor: pointer; font-family: inherit; }
        button:hover { background: #fff; }
        #status { margin-top: 10px; color: #fff; }
        .hidden { display: none; }
    </style>
</head>
<body>
    <div class="container" id="loginBlock">
        <h1>LOGIST-X HQ</h1>
        <input type="password" id="pass" placeholder="ВВЕДИТЕ КОД ДОСТУПА">
        <br>
        <button onclick="checkPass()">ВОЙТИ</button>
    </div>

    <div class="container hidden" id="mainBlock">
        <h1>ПАНЕЛЬ УПРАВЛЕНИЯ</h1>
        <div id="status">Загрузка ключей...</div>
        <br>
        <button onclick="location.reload()">ОБНОВИТЬ</button>
    </div>

    <script>
        function checkPass() {
            const p = document.getElementById('pass').value;
            if(p === '777') { // Простой пароль для теста
                document.getElementById('loginBlock').classList.add('hidden');
                document.getElementById('mainBlock').classList.remove('hidden');
                document.getElementById('status').innerText = "СИСТЕМА АКТИВНА. ОЖИДАНИЕ ДАННЫХ...";
                // Тут можно добавить загрузку ключей
            } else {
                alert('ОШИБКА ДОСТУПА');
            }
        }
    </script>
</body>
</html>
`;

// --- АДРЕСА ---
app.get('/dashboard', (req, res) => res.send(ADMIN_HTML)); // Отдаем код напрямую!
app.get('/tv', (req, res) => res.redirect('/dashboard'));
app.get('/admin-panel', (req, res) => res.redirect('/dashboard'));

// --- ЗАГРУЗКА ФОТО ---
app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, client, image } = req.body;
        
        const workerId = await getOrCreateFolder(worker || "Неизвестный", MY_ROOT_ID);
        const cityId = await getOrCreateFolder(city || "Город", workerId);
        
        let finalFolderName = "Общий";
        if (client && client.trim().length > 0) finalFolderName = client.trim();
        const finalFolderId = await getOrCreateFolder(finalFolderName, cityId);

        const safeAddress = address && address.trim().length > 0 ? address.trim() : "Без адреса";
        const timeStr = new Date().toLocaleString("ru-RU").replace(/, /g, '_').replace(/:/g, '-');
        const fileName = `${safeAddress} ${timeStr}.jpg`;

        const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const bufferStream = new Readable();
        bufferStream.push(buffer);
        bufferStream.push(null);

        await drive.files.create({
            resource: { name: fileName, parents: [finalFolderId] },
            media: { mimeType: 'image/jpeg', body: bufferStream }
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/api/list_keys', async (req, res) => {
    try {
        const resFile = await drive.files.list({ q: `name = '${DB_NAME}' and trashed = false` });
        if (resFile.data.files.length === 0) return res.json({ keys: [] });
        const data = await sheets.spreadsheets.values.get({ spreadsheetId: resFile.data.files[0].id, range: 'Sheet1!A2:E200' });
        const keys = (data.data.values || []).map(r => ({ key: r[0], name: r[1], expiry: r[2], limit: r[3] }));
        res.json({ keys });
    } catch (e) { res.json({ keys: [] }); }
});

// --- БОТ ---
bot.start((ctx) => {
    const domain = process.env.RAILWAY_STATIC_URL || "logist-x-server-production.up.railway.app";
    const appUrl = `https://${domain}/dashboard`;
    ctx.reply('LOGIST HQ: ДОСТУП РАЗРЕШЕН 🟢', {
        reply_markup: {
            inline_keyboard: [[ { text: "ОТКРЫТЬ ПУЛЬТ", web_app: { url: appUrl } } ]]
        }
    });
});

app.get('/', (req, res) => res.send("SERVER ONLINE"));

bot.launch().catch(e => console.log("Бот:", e));
app.listen(process.env.PORT || 3000, () => console.log("СЕРВЕР ЗАПУЩЕН"));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
