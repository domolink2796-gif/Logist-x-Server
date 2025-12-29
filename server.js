const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const app = express();

// Разрешаем все подключения, чтобы не было "Ошибки связи"
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// --- КОНФИГУРАЦИЯ ---
const MASTER_KEY = "LX-BOSS-777";
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A';

const CLIENT_ID = '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0';

// Инициализация Google API
const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// Работа с файлом базы (если он есть)
const DB_FILE = path.join(__dirname, 'db.json');
let DB = { keys: [] };
if (fs.existsSync(DB_FILE)) {
    try {
        DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) { console.log("База пуста или не создана"); }
}

// Вспомогательная функция для папок
async function getOrCreateFolder(name, parentId) {
    try {
        let q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${parentId}' in parents`;
        const res = await drive.files.list({ q, fields: 'files(id)' });
        if (res.data.files.length > 0) return res.data.files[0].id;
        const folder = await drive.files.create({
            resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
            fields: 'id'
        });
        return folder.data.id;
    } catch (e) { return null; }
}

// --- МАРШРУТЫ ---

// ЭТОТ КУСОК ОТВЕЧАЕТ ЗА ВХОД В ПРИЛОЖЕНИЕ
app.post('/check-license', (req, res) => {
    // ВАЖНО: Мы ловим именно licenseKey из тела запроса
    const { licenseKey } = req.body;
    
    console.log(`>>> [ПРОВЕРКА] Пришёл ключ: "${licenseKey}"`);

    // Сначала проверяем твой МАСТЕР-КЛЮЧ
    if (licenseKey === MASTER_KEY) {
        console.log(">>> [УСПЕХ] Мастер-ключ принят!");
        return res.json({ status: "active", expiry: Date.now() + 315360000000 });
    }

    // Если не мастер, ищем в базе db.json
    const k = DB.keys.find(x => x.key === licenseKey);
    if (k && new Date(k.expiry) > new Date()) {
        console.log(`>>> [УСПЕХ] Ключ из базы принят для: ${k.name}`);
        return res.json({ status: "active", expiry: new Date(k.expiry).getTime() });
    }
    
    console.log(">>> [ОТКАЗ] Ключ не подошёл");
    res.json({ status: "error", message: "Отказ доступа" });
});

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, client, image, licenseKey } = req.body;
        console.log(`>>> [UPLOAD] Отчёт от: ${worker}`);

        let kData = DB.keys.find(k => k.key === licenseKey);
        let compName = kData ? kData.name : (licenseKey === MASTER_KEY ? "Евгений_БОСС" : "ОБЩИЕ");

        const fComp = await getOrCreateFolder(compName, MY_ROOT_ID);
        const fWork = await getOrCreateFolder(worker || "Воркер", fComp);
        const fCity = await getOrCreateFolder(city || "Город", fWork);
        const fObj = await getOrCreateFolder(client || "Объект", fCity);
        const fDate = await getOrCreateFolder(new Date().toLocaleDateString('ru-RU'), fObj);

        if (image) {
            const buffer = Buffer.from(image, 'base64');
            await drive.files.create({
                resource: { name: `${address || 'фото'}.jpg`, parents: [fDate] },
                media: { mimeType: 'image/jpeg', body: Readable.from(buffer) }
            });
        }
        res.json({ success: true });
    } catch (e) {
        console.error("Ошибка загрузки:", e.message);
        res.status(500).json({ success: false });
    }
});

app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.send("LOGIST_X SERVER IS LIVE"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[OK] СЕРВЕР ЗАПУЩЕН НА ПОРТУ ${PORT}`));
