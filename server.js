const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// --- ТВОИ ДАННЫЕ (НЕ МЕНЯТЬ) ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';

const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// --- ЛОГИКА ПАПОК ---
async function getOrCreateFolder(name, parentId) {
    const q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
    const res = await drive.files.list({ q, fields: 'files(id)' });
    if (res.data.files.length > 0) return res.data.files[0].id;
    const file = await drive.files.create({ resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id' });
    return file.data.id;
}

// --- ОТПРАВКА ФОТО (ДЛЯ ПРИЛОЖЕНИЯ) ---
app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, entrance, client, image } = req.body;
        console.log(`📸 Получено фото: ${address}, ${entrance}`);

        const rootDir = await getOrCreateFolder("Logist-X_Objects", MY_ROOT_ID);
        const workerDir = await getOrCreateFolder(worker || "Unknown", rootDir);
        const cityDir = await getOrCreateFolder(city || "NoCity", workerDir);
        const dateDir = await getOrCreateFolder(new Date().toISOString().split('T')[0], cityDir);
        const clientDir = await getOrCreateFolder(client || "General", dateDir);

        const fileName = `${address || 'NoAddr'} ${entrance || ''}`.trim() + ".jpg";
        const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const bs = new Readable(); bs.push(buffer); bs.push(null);

        await drive.files.create({
            resource: { name: fileName, parents: [clientDir] },
            media: { mimeType: 'image/jpeg', body: bs }
        });

        res.json({ success: true });
    } catch (e) {
        console.error("Ошибка загрузки:", e.message);
        res.status(500).json({ success: false });
    }
});

// --- ПРОВЕРКА ЛИЦЕНЗИИ ---
app.get('/api/keys', async (req, res) => {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const list = await drive.files.list({ q });
        if (list.data.files.length === 0) return res.json([]);
        const content = await drive.files.get({ fileId: list.data.files[0].id, alt: 'media' });
        res.json(content.data.keys || []);
    } catch (e) { res.status(500).send(e.message); }
});

// --- СТАРТ ---
const PORT = process.env.PORT || 3000; // Railway сам подставит нужный порт
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ СЕРВЕР LOGIST-X ЗАПУЩЕН НА ПОРТУ ${PORT}`);
    bot.telegram.deleteWebhook({ drop_pending_updates: true }).then(() => {
        bot.launch().catch(err => console.log("Бот спит, но сервер работает"));
    });
});
