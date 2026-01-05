const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');
const crypto = require('crypto');

/**
 * ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
 * Логистика X и Проект Мерч
 */
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '150mb' }));
app.use(bodyParser.urlencoded({ limit: '150mb', extended: true }));

// --- КОНСТАНТЫ И НАСТРОЙКИ ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const MERCH_ROOT_ID = '1CuCMuvL3-tUDoE8UtlJyWRyqSjS3Za9p'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const PLANOGRAM_DB_NAME = 'planograms_db.json'; 
const BARCODE_DB_NAME = 'barcodes_db.json'; 
const MY_TELEGRAM_ID = 6846149935; 
const SERVER_URL = 'https://logist-x-server-production.up.railway.app';

// --- НАСТРОЙКИ РОБОКАССЫ ---
const ROBO_LOGIN = 'Logist_X'; 
const ROBO_PASS1 = 'P_password1'; 
const ROBO_PASS2 = 'P_password2'; 
const IS_TEST = 1; 

// --- GOOGLE API CONFIG ---
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);

oauth2Client.setCredentials({ 
    refresh_token: '1//04Xx4TeSGvK3OCgIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' 
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

const userSteps = {};

// ---------------------------------------------------------
// ФУНКЦИИ РАБОТЫ С Google Drive (БАЗЫ ДАННЫХ)
// ---------------------------------------------------------

/**
 * Чтение базы данных ключей
 * Исправлено: теперь всегда возвращает массив ключей
 */
async function readDatabase() {
    try {
        console.log("Чтение основной базы ключей...");
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        
        if (res.data.files.length === 0) {
            console.log("Файл базы данных не найден, создаю пустой массив.");
            return [];
        }

        const fileId = res.data.files[0].id;
        const content = await drive.files.get({ fileId: fileId, alt: 'media' });
        
        let keys = [];
        if (Array.isArray(content.data)) {
            keys = content.data;
        } else if (content.data && content.data.keys) {
            keys = content.data.keys;
        } else {
            keys = [];
        }

        // Проверка на наличие мастер-ключа
        let changed = false;
        const hasMaster = keys.find(k => k.key === 'DEV-MASTER-999');
        if (!hasMaster) {
            keys.push({
                key: 'DEV-MASTER-999',
                name: 'SYSTEM_ADMIN',
                limit: 999,
                expiry: '2099-12-31T23:59:59.000Z',
                workers: [],
                type: 'logist'
            });
            changed = true;
        }

        // Проверка папок для каждого ключа
        for (let k of keys) {
            if (!k.folderId && k.key !== 'DEV-MASTER-999') {
                console.log(`Создание папки для проекта: ${k.name}`);
                const projectRoot = (k.type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
                k.folderId = await getOrCreateFolder(k.name, projectRoot);
                changed = true;
            }
        }

        if (changed) {
            await saveDatabase(keys);
        }

        return keys;
    } catch (error) {
        console.error("Ошибка при чтении базы данных:", error.message);
        return [];
    }
}

/**
 * Сохранение базы данных ключей
 */
async function saveDatabase(keys) {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        
        const fileMetadata = { name: DB_FILE_NAME, parents: [MY_ROOT_ID] };
        const media = {
            mimeType: 'application/json',
            body: JSON.stringify({ keys: keys }, null, 2)
        };

        if (res.data.files.length > 0) {
            const fileId = res.data.files[0].id;
            await drive.files.update({ fileId: fileId, media: media });
            console.log("База данных обновлена.");
        } else {
            await drive.files.create({ resource: fileMetadata, media: media, fields: 'id' });
            console.log("База данных создана.");
        }
    } catch (error) {
        console.error("Ошибка при сохранении базы данных:", error.message);
    }
}

/**
 * Работа с папками
 */
async function getOrCreateFolder(folderName, parentId) {
    try {
        const cleanName = String(folderName).trim().replace(/'/g, "\\'");
        const q = `name = '${cleanName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
        const res = await drive.files.list({ q, fields: 'files(id)' });
        
        if (res.data.files.length > 0) {
            return res.data.files[0].id;
        } else {
            const fileMetadata = {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId]
            };
            const folder = await drive.files.create({
                resource: fileMetadata,
                fields: 'id'
            });
            
            // Даем права доступа
            await drive.permissions.create({
                fileId: folder.data.id,
                resource: { role: 'writer', type: 'anyone' }
            });
            
            return folder.data.id;
        }
    } catch (error) {
        console.error("Ошибка при создании папки:", error.message);
        return parentId;
    }
}

// ---------------------------------------------------------
// БАЗЫ ДАННЫХ ШТРИХ-КОДОВ И ПЛАНОГРАММ
// ---------------------------------------------------------

async function readBarcodeDb(clientFolderId) {
    try {
        const targetId = clientFolderId || MY_ROOT_ID;
        const q = `name = '${BARCODE_DB_NAME}' and '${targetId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        
        if (res.data.files.length === 0) return {};
        
        const content = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
        if (typeof content.data === 'string') {
            return JSON.parse(content.data);
        }
        return content.data;
    } catch (e) {
        return {};
    }
}

async function saveBarcodeDb(clientFolderId, data) {
    try {
        const targetId = clientFolderId || MY_ROOT_ID;
        const q = `name = '${BARCODE_DB_NAME}' and '${targetId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        
        const media = {
            mimeType: 'application/json',
            body: JSON.stringify(data, null, 2)
        };

        if (res.data.files.length > 0) {
            await drive.files.update({ fileId: res.data.files[0].id, media: media });
        } else {
            await drive.files.create({
                resource: { name: BARCODE_DB_NAME, parents: [targetId] },
                media: media
            });
        }
    } catch (e) {
        console.error("Ошибка сохранения Штрих-кодов:", e);
    }
}

// ---------------------------------------------------------
// ОТЧЕТНОСТЬ (GOOGLE SHEETS)
// ---------------------------------------------------------

async function appendToReport(workerId, workerName, city, dateStr, address, entrance, client, workType, price, lat, lon) {
    try {
        const reportName = `Отчет ${workerName}`;
        const q = `name = '${reportName}' and '${workerId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        
        let spreadsheetId = null;
        if (res.data.files.length > 0) {
            spreadsheetId = res.data.files[0].id;
        } else {
            const resource = { properties: { title: reportName } };
            const createRes = await sheets.spreadsheets.create({ resource });
            spreadsheetId = createRes.data.spreadsheetId;
            await drive.files.update({ fileId: spreadsheetId, addParents: workerId, removeParents: 'root' });
        }

        const sheetTitle = `${city}_${dateStr}`;
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetExists = spreadsheet.data.sheets.find(s => s.properties.title === sheetTitle);

        if (!sheetExists) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] }
            });
            const header = [['ВРЕМЯ', 'АДРЕС', 'ПОДЪЕЗД', 'КЛИЕНТ', 'ВИД РАБОТЫ', 'СУММА', 'GPS', 'ФОТО']];
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${sheetTitle}!A1`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: header }
            });
        }

        const gpsLink = (lat && lon) ? `=HYPERLINK("http://maps.google.com/maps?q=${lat},${lon}"; "СМОТРЕТЬ")` : "Нет GPS";
        const row = [
            new Date().toLocaleTimeString("ru-RU"),
            address,
            entrance,
            client,
            workType,
            price,
            gpsLink,
            "ЗАГРУЖЕНО"
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${sheetTitle}!A1`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [row] }
        });
    } catch (error) {
        console.error("Ошибка записи в таблицу:", error.message);
    }
}

/**
 * Отчет для проекта Мерч
 */
async function appendMerchToReport(workerId, workerName, net, address, stock, faces, share, ourPrice, compPrice, expDate, pdfUrl, startTime, endTime, duration, lat, lon, category) {
    try {
        const reportName = `Мерч_Аналитика_${workerName}`;
        const q = `name = '${reportName}' and '${workerId}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        
        let spreadsheetId = null;
        if (res.data.files.length > 0) {
            spreadsheetId = res.data.files[0].id;
        } else {
            const resource = { properties: { title: reportName } };
            const cr = await sheets.spreadsheets.create({ resource });
            spreadsheetId = cr.data.spreadsheetId;
            await drive.files.update({ fileId: spreadsheetId, addParents: workerId, removeParents: 'root' });
        }

        const sheetTitle = "ОТЧЕТЫ_МЕРЧ";
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        const sheet = meta.data.sheets.find(s => s.properties.title === sheetTitle);

        if (!sheet) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] }
            });
            const header = [['ДАТА', 'КАТЕГОРИЯ', 'НАЧАЛО', 'КОНЕЦ', 'ВРЕМЯ ПРОВЕДЕННОЕ В МАГАЗИНЕ', 'СЕТЬ', 'АДРЕС', 'ОСТАТОК', 'ФЕЙСИНГ', 'ДОЛЯ %', 'ЦЕНА МЫ', 'ЦЕНА КОНК', 'СРОК', 'PDF ОТЧЕТ', 'GPS']];
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${sheetTitle}!A1`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: header }
            });
        }

        const gps = (lat && lon) ? `=HYPERLINK("http://maps.google.com/maps?q=${lat},${lon}"; "ПОСМОТРЕТЬ")` : "Нет";
        const pdfLink = `=HYPERLINK("${pdfUrl}"; "ОТЧЕТ ФОТО")`;
        
        const row = [
            new Date().toLocaleDateString("ru-RU"),
            category || "Общее",
            startTime,
            endTime,
            duration,
            net,
            address,
            stock,
            faces,
            share,
            ourPrice,
            compPrice,
            expDate,
            pdfLink,
            gps
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${sheetTitle}!A1`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [row] }
        });
    } catch (e) {
        console.error("Ошибка отчета Мерч:", e);
    }
}

// ---------------------------------------------------------
// API ROUTES - ШТРИХ-КОДЫ
// ---------------------------------------------------------

app.get('/check-barcode', async (req, res) => {
    try {
        const { code, licenseKey } = req.query;
        const keys = await readDatabase();
        const kData = keys.find(k => k.key === licenseKey);
        
        if (!kData || !kData.folderId) {
            return res.json({ exists: false });
        }

        const barcodeDB = await readBarcodeDb(kData.folderId);
        const item = barcodeDB[code];
        
        if (item) {
            return res.json({ 
                exists: true, 
                name: (typeof item === 'object' ? item.name : item) 
            });
        }
        res.json({ exists: false });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/save-barcode', async (req, res) => {
    try {
        const { code, name, licenseKey } = req.body;
        const keys = await readDatabase();
        const kData = keys.find(k => k.key === licenseKey);
        
        if (!kData || !kData.folderId) {
            return res.status(403).json({ error: "Ключ не найден" });
        }

        const barcodeDB = await readBarcodeDb(kData.folderId);
        barcodeDB[code] = { name: name };
        
        await saveBarcodeDb(kData.folderId, barcodeDB);
        res.json({ status: 'ok' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ---------------------------------------------------------
// API ROUTES - ПЛАНОГРАММЫ
// ---------------------------------------------------------

app.get('/get-planogram', async (req, res) => {
    try {
        const { addr, key } = req.query;
        const keys = await readDatabase();
        const kData = keys.find(k => k.key === key);
        
        if (!kData || !kData.folderId || kData.type !== 'merch') {
            return res.json({ exists: false });
        }

        const planFolderId = await getOrCreateFolder("PLANOGRAMS", kData.folderId);
        const fileName = `${addr.replace(/[^а-яёa-z0-9]/gi, '_')}.jpg`;
        
        const q = `name = '${fileName}' and '${planFolderId}' in parents and trashed = false`;
        const search = await drive.files.list({ q, fields: 'files(id, webViewLink, webContentLink)' });
        
        if (search.data.files.length > 0) {
            res.json({ 
                exists: true, 
                url: search.data.files[0].webContentLink || search.data.files[0].webViewLink 
            });
        } else {
            res.json({ exists: false });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/upload-planogram', async (req, res) => {
    try {
        const { addr, image, key } = req.body;
        const keys = await readDatabase();
        const kData = keys.find(k => k.key === key);
        
        if (!kData || !kData.folderId || kData.type !== 'merch') {
            return res.status(403).json({ error: "Доступ запрещен" });
        }

        const planFolderId = await getOrCreateFolder("PLANOGRAMS", kData.folderId);
        const fileName = `${addr.replace(/[^а-яёa-z0-9]/gi, '_')}.jpg`;
        const buf = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        
        const q = `name = '${fileName}' and '${planFolderId}' in parents and trashed = false`;
        const existing = await drive.files.list({ q });
        
        const media = { mimeType: 'image/jpeg', body: Readable.from(buf) };

        if (existing.data.files.length > 0) {
            await drive.files.update({ fileId: existing.data.files[0].id, media: media });
        } else {
            const f = await drive.files.create({
                resource: { name: fileName, parents: [planFolderId] },
                media: media,
                fields: 'id'
            });
            await drive.permissions.create({ fileId: f.data.id, resource: { role: 'reader', type: 'anyone' } });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ---------------------------------------------------------
// API ROUTES - ЛИЦЕНЗИИ И ЗАГРУЗКА ДАННЫХ
// ---------------------------------------------------------

app.post('/check-license', async (req, res) => {
    const { licenseKey, workerName } = req.body;
    const keys = await readDatabase();
    
    const kData = keys.find(k => k.key === licenseKey);
    
    if (!kData) return res.json({ status: 'error', message: 'Ключ не найден' });
    
    const now = new Date();
    const expiry = new Date(kData.expiry);
    
    if (expiry < now) return res.json({ status: 'error', message: 'Срок действия ключа истёк' });
    
    if (!kData.workers) kData.workers = [];
    
    if (!kData.workers.includes(workerName)) {
        if (kData.workers.length >= parseInt(kData.limit)) {
            return res.json({ status: 'error', message: 'Лимит сотрудников исчерпан' });
        }
        kData.workers.push(workerName);
        await saveDatabase(keys);
    }
    
    res.json({ 
        status: 'active', 
        expiry: kData.expiry, 
        type: kData.type || 'logist',
        category: kData.name || 'Общее'
    });
});

app.post('/upload', async (req, res) => {
    try {
        const { licenseKey, workerName, worker, city, address, entrance, client, images, lat, lon, workType, price } = req.body;
        const keys = await readDatabase();
        
        const curW = worker || workerName;
        const kData = keys.find(k => k.workers && k.workers.includes(curW)) || keys.find(k => k.key === licenseKey);
        
        const projRoot = (kData && kData.type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
        const ownerFolderId = kData ? kData.folderId : await getOrCreateFolder("Logist_Users", projRoot);
        
        const workerFolderId = await getOrCreateFolder(curW, ownerFolderId);
        const clientFolderId = await getOrCreateFolder((client || "Общее"), workerFolderId);
        
        const today = new Date().toISOString().split('T')[0];
        const dateFolderId = await getOrCreateFolder(today, clientFolderId);
        
        const photoList = images || [];
        for (let i = 0; i < photoList.length; i++) {
            const base64Data = photoList[i].replace(/^data:image\/\w+;base64,/, "");
            const buf = Buffer.from(base64Data, 'base64');
            const fileName = `${address}_п${entrance}_${i+1}.jpg`;
            
            await drive.files.create({
                resource: { name: fileName, parents: [dateFolderId] },
                media: { mimeType: 'image/jpeg', body: Readable.from(buf) }
            });
        }

        await appendToReport(workerFolderId, curW, city, today, address, entrance, client, workType, price, lat, lon);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

/**
 * Загрузка отчета Мерч
 */
app.post('/merch-upload', async (req, res) => {
    try {
        const { worker, net, address, stock, faces, share, ourPrice, compPrice, expDate, pdf, images, startTime, endTime, duration, lat, lon, city } = req.body;
        
        const keys = await readDatabase();
        const kData = keys.find(k => k.workers && k.workers.includes(worker));
        
        const projRoot = (kData && kData.type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
        const ownerFolderId = kData ? kData.folderId : await getOrCreateFolder("Merch_Users", MERCH_ROOT_ID);
        
        const workerFolderId = await getOrCreateFolder(worker, ownerFolderId);
        const cityFolderId = await getOrCreateFolder(city || "Без города", workerFolderId);
        
        const today = new Date().toISOString().split('T')[0];
        const dateFolderId = await getOrCreateFolder(today, cityFolderId);

        if (images && images.length > 0) {
            for (let i = 0; i < images.length; i++) {
                const base64 = images[i].replace(/^data:image\/\w+;base64,/, "");
                const buf = Buffer.from(base64, 'base64');
                await drive.files.create({
                    resource: { name: `${address}_фото_${i+1}.jpg`, parents: [dateFolderId] },
                    media: { mimeType: 'image/jpeg', body: Readable.from(buf) }
                });
            }
        }

        let pUrl = "Нет файла";
        if (pdf) {
            const pdfBase64 = pdf.split(',')[1] || pdf;
            const buf = Buffer.from(pdfBase64, 'base64');
            const f = await drive.files.create({
                resource: { name: `ВРЕМЯ ПРОВЕДЕННОЕ В МАГАЗИНЕ.jpg`, parents: [dateFolderId] },
                media: { mimeType: 'image/jpeg', body: Readable.from(buf) },
                fields: 'id, webViewLink'
            });
            await drive.permissions.create({ fileId: f.data.id, resource: { role: 'writer', type: 'anyone' } });
            pUrl = f.data.webViewLink;
        }

        await appendMerchToReport(workerFolderId, worker, net, address, stock, faces, share, ourPrice, compPrice, expDate, pUrl, startTime, endTime, duration, lat, lon, (kData ? kData.name : "Общее"));
        
        res.json({ success: true, url: pUrl });
    } catch (e) {
        console.error("Ошибка merch-upload:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ---------------------------------------------------------
// АДМИН ПАНЕЛЬ И УПРАВЛЕНИЕ КЛЮЧАМИ
// ---------------------------------------------------------

app.get('/api/keys', async (req, res) => {
    const keys = await readDatabase();
    res.json(keys);
});

app.get('/api/client-keys', async (req, res) => {
    const keys = await readDatabase();
    const chatId = req.query.chatId;
    const clientKeys = keys.filter(k => String(k.ownerChatId) === String(chatId));
    res.json(clientKeys);
});

app.post('/api/keys/add', async (req, res) => {
    try {
        const { name, limit, days, type } = req.body;
        let keys = await readDatabase();
        
        const newK = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
        const exp = new Date();
        exp.setDate(exp.getDate() + parseInt(days));
        
        const projectRoot = (type === 'merch' ? MERCH_ROOT_ID : MY_ROOT_ID);
        const folderId = await getOrCreateFolder(name, projectRoot);
        
        const newKeyObj = {
            key: newK,
            name: name,
            limit: parseInt(limit),
            expiry: exp.toISOString(),
            workers: [],
            ownerChatId: null,
            folderId: folderId,
            type: type || 'logist'
        };
        
        keys.push(newKeyObj);
        await saveDatabase(keys);
        res.json({ success: true, key: newK });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/api/keys/delete', async (req, res) => {
    let keys = await readDatabase();
    const filtered = keys.filter(k => k.key !== req.body.key);
    await saveDatabase(filtered);
    res.json({ success: true });
});

/**
 * Роут для оплаты Робокассой
 */
app.post('/api/notify-admin', async (req, res) => {
    const { key, name, days, chatId, limit, type } = req.body;
    const keys = await readDatabase();
    const kData = keys.find(k => k.key === key) || { limit: limit || 1 };
    
    // Расчет цены
    let price = kData.limit * 1500;
    if (days == 90) price = kData.limit * 4050;
    if (days == 180) price = kData.limit * 7650;
    if (days == 365) price = kData.limit * 15000;
    
    const invId = Math.floor(Date.now() / 1000);
    const signature = crypto.createHash('md5')
        .update(`${ROBO_LOGIN}:${price}:${invId}:${ROBO_PASS1}:Shp_chatId=${chatId}:Shp_days=${days}:Shp_key=${key}:Shp_limit=${kData.limit}:Shp_name=${name}:Shp_type=${type}`)
        .digest('hex');
    
    const url = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${ROBO_LOGIN}&OutSum=${price}&InvId=${invId}&Description=${encodeURIComponent("Лицензия " + name)}&SignatureValue=${signature}&Shp_days=${days}&Shp_key=${key}&Shp_chatId=${chatId}&Shp_limit=${kData.limit}&Shp_name=${encodeURIComponent(name)}&Shp_type=${type}${IS_TEST ? '&IsTest=1' : ''}`;
    
    res.json({ success: true, payUrl: url });
});

/**
 * ResultURL для Робокассы
 */
app.post('/api/payment-result', async (req, res) => {
    const { OutSum, InvId, SignatureValue, Shp_key, Shp_days, Shp_chatId, Shp_limit, Shp_name, Shp_type } = req.body;
    
    const mySign = crypto.createHash('md5')
        .update(`${OutSum}:${InvId}:${ROBO_PASS2}:Shp_chatId=${Shp_chatId}:Shp_days=${Shp_days}:Shp_key=${Shp_key}:Shp_limit=${Shp_limit}:Shp_name=${Shp_name}:Shp_type=${Shp_type}`)
        .digest('hex');
        
    if (SignatureValue.toLowerCase() === mySign.toLowerCase()) {
        let keys = await readDatabase();
        
        if (Shp_key === "NEW_USER") {
            const newK = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
            const exp = new Date();
            exp.setDate(exp.getDate() + parseInt(Shp_days));
            
            const projectRoot = (Shp_type === 'merch' ? MERCH_ROOT_ID : MY_ROOT_ID);
            const fId = await getOrCreateFolder(Shp_name, projectRoot);
            
            keys.push({
                key: newK,
                name: Shp_name,
                limit: parseInt(Shp_limit),
                expiry: exp.toISOString(),
                workers: [],
                ownerChatId: Shp_chatId,
                folderId: fId,
                type: Shp_type
            });
            
            await bot.telegram.sendMessage(Shp_chatId, `🎉 Оплата прошла успешно!\n🔑 Ваш ключ: ${newK}\n\nВведите его в приложении.`);
        } else {
            const idx = keys.findIndex(k => k.key === Shp_key);
            if (idx !== -1) {
                let d = new Date(keys[idx].expiry);
                if (d < new Date()) d = new Date();
                d.setDate(d.getDate() + parseInt(Shp_days));
                keys[idx].expiry = d.toISOString();
            }
        }
        
        await saveDatabase(keys);
        return res.send(`OK${InvId}`);
    }
    res.send("error signature");
});

// ---------------------------------------------------------
// ИНТЕРФЕЙСЫ (HTML)
// ---------------------------------------------------------

app.get('/dashboard', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Логистика X - Админ</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            body { background: #010409; color: #e6edf3; font-family: 'Inter', sans-serif; padding: 15px; }
            .header { font-weight: 900; font-size: 24px; color: #f59e0b; margin-bottom: 20px; text-align: center; }
            .card { background: #0d1117; border: 1px solid #30363d; border-radius: 16px; padding: 20px; margin-bottom: 15px; border-left: 5px solid #238636; transition: 0.3s; }
            .card.type-merch { border-left-color: #f59e0b; }
            .key-code { font-size: 20px; color: #f59e0b; font-weight: 900; letter-spacing: 1px; }
            .btn { padding: 12px; border-radius: 8px; border: none; cursor: pointer; width: 100%; font-weight: 700; transition: 0.2s; }
            .btn-gold { background: #f59e0b; color: #000; margin-bottom: 15px; }
            .btn-red { background: #da3633; color: #fff; margin-top: 10px; }
            input, select { width: 100%; padding: 12px; margin-bottom: 10px; border-radius: 8px; background: #010409; color: #fff; border: 1px solid #30363d; box-sizing: border-box; }
            .info-row { display: flex; justify-content: space-between; margin-top: 10px; font-size: 13px; opacity: 0.8; }
        </style>
    </head>
    <body>
        <div class="header">📦 ПАНЕЛЬ УПРАВЛЕНИЯ</div>
        
        <div class="card" style="border-left:none;">
            <div style="font-weight: 700; margin-bottom: 10px;">СОЗДАТЬ НОВЫЙ ПРОЕКТ</div>
            <input id="n" placeholder="Название организации">
            <input id="l" type="number" value="5" placeholder="Лимит сотрудников">
            <select id="t">
                <option value="logist">Логистика X</option>
                <option value="merch">Мерч Аналитика</option>
            </select>
            <button class="btn btn-gold" onclick="addKey()">СОЗДАТЬ ЛИЦЕНЗИЮ</button>
        </div>

        <div id="list"></div>

        <script>
            async function loadKeys() {
                const r = await fetch('/api/keys');
                const keys = await r.json();
                const container = document.getElementById('list');
                
                if (keys.length === 0) {
                    container.innerHTML = '<div style="text-align:center; opacity:0.5;">Ключей пока нет</div>';
                    return;
                }

                container.innerHTML = keys.map(k => \`
                    <div class="card \${k.type === 'merch' ? 'type-merch' : ''}">
                        <div class="key-code">\${k.key}</div>
                        <div style="font-size: 18px; font-weight: 700; margin: 5px 0;">\${k.name}</div>
                        <div style="font-size: 12px; color: #8b949e;">Тип: \${k.type === 'merch' ? 'МЕРЧ' : 'ЛОГИСТИКА'}</div>
                        <div class="info-row">
                            <span>👥 Сотрудники: \${k.workers ? k.workers.length : 0} / \${k.limit}</span>
                            <span>📅 До: \${new Date(k.expiry).toLocaleDateString()}</span>
                        </div>
                        <button class="btn btn-red" onclick="deleteKey('\${k.key}')">УДАЛИТЬ КЛЮЧ</button>
                    </div>
                \`).join('');
            }

            async function addKey() {
                const name = document.getElementById('n').value;
                const limit = document.getElementById('l').value;
                const type = document.getElementById('t').value;
                if(!name) return alert('Введите название');
                
                await fetch('/api/keys/add', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ name, limit, days: 30, type })
                });
                loadKeys();
            }

            async function deleteKey(key) {
                if (confirm('Вы уверены, что хотите удалить ключ ' + key + '?')) {
                    await fetch('/api/keys/delete', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ key })
                    });
                    loadKeys();
                }
            }

            loadKeys();
        </script>
    </body>
    </html>
    `);
});

// ---------------------------------------------------------
// TELEGRAM BOT LOGIC
// ---------------------------------------------------------

bot.start(async (ctx) => {
    const cid = ctx.chat.id;
    if (cid === MY_TELEGRAM_ID) {
        return ctx.reply('👑 ПРИВЕТ, АДМИН!', {
            reply_markup: {
                inline_keyboard: [[{ text: "📦 УПРАВЛЕНИЕ КЛЮЧАМИ", web_app: { url: SERVER_URL + "/dashboard" } }]]
            }
        });
    }

    const keys = await readDatabase();
    const clientKey = keys.find(k => String(k.ownerChatId) === String(cid));

    if (clientKey) {
        return ctx.reply(`🏢 КАБИНЕТ: ${clientKey.name}`, {
            reply_markup: {
                inline_keyboard: [[{ text: "📊 МОИ ОТЧЕТЫ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + cid } }]]
            }
        });
    }

    ctx.reply('👋 Добро пожаловать!\n\nЕсли у вас есть лицензионный ключ — отправьте его мне.\nЕсли нет — вы можете купить доступ.', {
        reply_markup: {
            inline_keyboard: [[{ text: "💳 КУПИТЬ ЛИЦЕНЗИЮ", callback_data: "buy_new" }]]
        }
    });
});

bot.action('buy_new', (ctx) => {
    userSteps[ctx.chat.id] = { step: 'type' };
    ctx.reply("Выберите продукт:", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📦 ЛОГИСТИКА X", callback_data: "st_logist" }],
                [{ text: "🛒 МЕРЧ АНАЛИТИКА", callback_data: "st_merch" }]
            ]
        }
    });
});

bot.action(/st_(.+)/, (ctx) => {
    const type = ctx.match[1];
    userSteps[ctx.chat.id] = { type: type, step: 'name' };
    ctx.reply("Введите название вашей организации:");
});

bot.on('text', async (ctx) => {
    const cid = ctx.chat.id;
    const txt = ctx.message.text.trim();
    const step = userSteps[cid];

    if (step && step.step === 'name') {
        step.name = txt;
        step.step = 'limit';
        return ctx.reply("На сколько сотрудников нужна лицензия? (Введите число)");
    }

    if (step && step.step === 'limit') {
        const limit = parseInt(txt);
        if (isNaN(limit)) return ctx.reply("Пожалуйста, введите число.");
        
        const r = await fetch(SERVER_URL + '/api/notify-admin', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                key: "NEW_USER", 
                name: step.name, 
                days: 30, 
                limit: limit, 
                chatId: cid, 
                type: step.type 
            })
        });
        const res = await r.json();
        ctx.reply(`💳 К оплате за проект "${step.name}" (${limit} мест):\n\nНажмите кнопку ниже для оплаты через Робокассу.`, {
            reply_markup: {
                inline_keyboard: [[{ text: "💳 ОПЛАТИТЬ", url: res.payUrl }]]
            }
        });
        delete userSteps[cid];
        return;
    }

    // Обработка активации ключа
    let keys = await readDatabase();
    const foundIdx = keys.findIndex(k => k.key === txt.toUpperCase());

    if (foundIdx !== -1) {
        keys[foundIdx].ownerChatId = cid;
        await saveDatabase(keys);
        ctx.reply(`✅ Ключ для "${keys[foundIdx].name}" успешно привязан!`, {
            reply_markup: {
                inline_keyboard: [[{ text: "📊 КЛИЕНТСКИЙ КАБИНЕТ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + cid } }]]
            }
        });
    } else {
        ctx.reply('❌ Ключ не найден или неверный формат.');
    }
});

// --- ЗАПУСК СЕРВЕРА ---
bot.launch();
app.listen(process.env.PORT || 3000, () => {
    console.log("Сервер Логистика X запущен на порту " + (process.env.PORT || 3000));
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
