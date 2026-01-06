const express = require('express');
const { google } = require('googleapis');
const { Telegraf } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');
const crypto = require('crypto');
const axios = require('axios');

const app = express();

// --- ГЛОБАЛЬНЫЕ НАСТРОЙКИ СЕРВЕРА ---
app.use(cors());
app.use(bodyParser.json({ limit: '150mb' }));
app.use(bodyParser.urlencoded({ limit: '150mb', extended: true }));

// ==========================================================
// --- ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ И КОНСТАНТЫ (ИЗ ВАШЕГО ФАЙЛА) ---
// ==========================================================
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const MERCH_ROOT_ID = '1CuCMuvL3-tUDoE8UtlJyWRyqSjS3Za9p'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const PLANOGRAM_DB_NAME = 'planograms_db.json'; 
const BARCODE_DB_NAME = 'barcodes_db.json';
const MY_TELEGRAM_ID = 6846149935; 
const SERVER_URL = 'https://logist-x-server-production.up.railway.app';

// ==========================================================
// --- АВТОРИЗАЦИЯ В GOOGLE SERVICES ---
// ==========================================================
const auth = new google.auth.GoogleAuth({
    keyFile: 'service-account.json',
    scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets'
    ],
});

const drive = google.drive({ version: 'v3', auth });
const sheets = google.sheets({ version: 'v4', auth });
const bot = new Telegraf(BOT_TOKEN);

// ==========================================================
// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (ДРАЙВ И БД) ---
// ==========================================================

// Поиск ID файла по имени в конкретной папке
async function getFileId(name, parentId = MY_ROOT_ID) {
    try {
        const response = await drive.files.list({
            q: `name='${name}' and '${parentId}' in parents and trashed=false`,
            fields: 'files(id)'
        });
        if (response.data.files.length > 0) {
            return response.data.files[0].id;
        } else {
            return null;
        }
    } catch (error) {
        console.error("Ошибка при поиске файла:", name, error.message);
        return null;
    }
}

// Создание папки или получение существующей
async function getOrCreateFolder(name, parentId = MY_ROOT_ID) {
    try {
        let folderId = await getFileId(name, parentId);
        if (!folderId) {
            const fileMetadata = {
                name: name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId]
            };
            const folder = await drive.files.create({
                resource: fileMetadata,
                fields: 'id'
            });
            folderId = folder.data.id;
            console.log(`Создана новая папка: ${name} (ID: ${folderId})`);
        }
        return folderId;
    } catch (error) {
        console.error("Ошибка при создании папки:", name, error.message);
        throw error;
    }
}

// Чтение основной базы ключей
async function readDatabase() {
    const fileId = await getFileId(DB_FILE_NAME);
    if (!fileId) return [];
    try {
        const response = await drive.files.get({ fileId: fileId, alt: 'media' });
        if (Array.isArray(response.data)) {
            return response.data;
        } else {
            return [];
        }
    } catch (error) {
        console.error("Критическая ошибка чтения базы данных ключей:", error.message);
        return [];
    }
}

// Сохранение основной базы ключей
async function saveDatabase(data) {
    try {
        const fileId = await getFileId(DB_FILE_NAME);
        const media = {
            mimeType: 'application/json',
            body: JSON.stringify(data, null, 2)
        };
        if (fileId) {
            await drive.files.update({
                fileId: fileId,
                media: media
            });
        } else {
            const resource = {
                name: DB_FILE_NAME,
                parents: [MY_ROOT_ID]
            };
            await drive.files.create({
                resource: resource,
                media: media
            });
        }
    } catch (error) {
        console.error("Ошибка сохранения базы данных ключей:", error.message);
    }
}

// Чтение базы штрих-кодов (остатков) компании
async function readBarcodeDb(parentId) {
    try {
        const fileId = await getFileId(BARCODE_DB_NAME, parentId);
        if (!fileId) return {};
        const response = await drive.files.get({ fileId: fileId, alt: 'media' });
        return typeof response.data === 'object' ? response.data : {};
    } catch (error) {
        console.error("Ошибка чтения базы штрихкодов:", error.message);
        return {};
    }
}

// Сохранение базы штрих-кодов (остатков) компании
async function saveBarcodeDb(parentId, data) {
    try {
        const fileId = await getFileId(BARCODE_DB_NAME, parentId);
        const media = {
            mimeType: 'application/json',
            body: JSON.stringify(data, null, 2)
        };
        if (fileId) {
            await drive.files.update({
                fileId: fileId,
                media: media
            });
        } else {
            const resource = {
                name: BARCODE_DB_NAME,
                parents: [parentId]
            };
            await drive.files.create({
                resource: resource,
                media: media
            });
        }
    } catch (error) {
        console.error("Ошибка сохранения базы штрихкодов:", error.message);
    }
}

// ==========================================================
// --- LOGIST_X: ЛОГИКА ОБРАБОТКИ ОТЧЕТОВ ---
// ==========================================================

app.post('/upload', async (req, res) => {
    try {
        const { workerName, address, date, photo, location, comment } = req.body;
        
        console.log(`Получен отчет Logist_X от: ${workerName}, Адрес: ${address}`);
        
        const keys = await readDatabase();
        const keyData = keys.find(k => k.workers && k.workers.includes(workerName));
        
        // Если ключ не найден, сохраняем в корень, иначе в папку компании
        const targetRootId = keyData ? keyData.folderId : MY_ROOT_ID;

        // Создаем иерархию папок: Сотрудник -> Дата -> Адрес
        const workerFolderId = await getOrCreateFolder(workerName, targetRootId);
        const dateFolderId = await getOrCreateFolder(date, workerFolderId);
        
        // Очищаем адрес от запрещенных символов для имени папки
        const folderFriendlyAddress = address.replace(/[/\\?%*:|"<>]/g, '-');
        const addressFolderId = await getOrCreateFolder(folderFriendlyAddress, dateFolderId);

        // Обработка изображения
        const base64Content = photo.includes(',') ? photo.split(',')[1] : photo;
        const imageBuffer = Buffer.from(base64Content, 'base64');
        const imageName = `report_${Date.now()}.jpg`;

        const uploadInfo = await drive.files.create({
            resource: { 
                name: imageName, 
                parents: [addressFolderId] 
            },
            media: { 
                mimeType: 'image/jpeg', 
                body: Readable.from(imageBuffer) 
            },
            fields: 'id, webViewLink'
        });

        // Делаем файл доступным по ссылке
        await drive.permissions.create({
            fileId: uploadInfo.data.id,
            resource: { role: 'writer', type: 'anyone' }
        });

        // Если есть владелец ключа, отправляем ему уведомление в Telegram
        if (keyData && keyData.ownerChatId) {
            const notification = `📍 LOGIST_X: Поступил отчет\n👤 Имя: ${workerName}\n🏠 Адрес: ${address}\n🗺️ GPS: ${location || 'Не указан'}\n💬 Коммент: ${comment || 'Пусто'}`;
            bot.telegram.sendMessage(keyData.ownerChatId, notification);
        }

        res.json({ success: true, url: uploadInfo.data.webViewLink });
        
    } catch (error) {
        console.error("Ошибка в /upload:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================================
// --- MERCH_X: ЛОГИКА СИНХРОНИЗАЦИИ И ОТЧЕТОВ ---
// ==========================================================

// Роут для получения остатков, оставленных коллегами (память магазина)
app.get('/get-shop-stock', async (req, res) => {
    try {
        const { addr, key } = req.query;
        let keys = await readDatabase();
        const keyInfo = keys.find(k => k.key === key);
        
        if (!keyInfo || !keyInfo.folderId) {
            return res.json({});
        }
        
        const bDb = await readBarcodeDb(keyInfo.folderId);
        const currentBalances = {};
        
        for (const barcode in bDb) {
            if (bDb[barcode].lastAddress === addr) {
                currentBalances[barcode] = bDb[barcode].lastStock || 0;
            }
        }
        
        res.json(currentBalances);
        
    } catch (error) {
        console.error("Ошибка в /get-shop-stock:", error.message);
        res.json({});
    }
});

// Основной роут загрузки отчета Мерчандайзера
app.post('/merch-upload', async (req, res) => {
    try {
        const { 
            worker, net, address, stock, faces, share, 
            ourPrice, compPrice, expDate, pdf, startTime, 
            endTime, duration, lat, lon, city, items 
        } = req.body;

        const keys = await readDatabase();
        const kData = keys.find(k => k.workers && k.workers.includes(worker)) || keys.find(k => k.key === 'DEV-MASTER-999');
        
        // Определяем папку компании
        const companyFolder = kData.folderId || await getOrCreateFolder(kData ? kData.name : "Merch_System", MERCH_ROOT_ID);
        const fWorker = await getOrCreateFolder(worker, companyFolder);
        const fCity = await getOrCreateFolder(city || "Не определен", fWorker);
        const today = new Date().toISOString().split('T')[0];
        const fDay = await getOrCreateFolder(today, fCity);

        let finalUrl = "Отсутствует";
        
        if (pdf) {
            const pdfBase64 = pdf.includes(',') ? pdf.split(',')[1] : pdf;
            const pdfBuf = Buffer.from(pdfBase64, 'base64');
            
            // Имя файла: Сеть_Адрес (согласно вашему требованию)
            const cleanFileName = address.replace(/[^а-яёa-z0-9]/gi, '_');
            const fileNameForDrive = `${net}_${cleanFileName}.jpg`;
            
            const driveRes = await drive.files.create({ 
                resource: { name: fileNameForDrive, parents: [fDay] }, 
                media: { mimeType: 'image/jpeg', body: Readable.from(pdfBuf) }, 
                fields: 'id, webViewLink' 
            });
            
            await drive.permissions.create({ 
                fileId: driveRes.data.id, 
                resource: { role: 'writer', type: 'anyone' } 
            });
            finalUrl = driveRes.data.webViewLink;
        }

        // Синхронизация остатков (чтобы коллеги видели изменения)
        if (items && Array.isArray(items) && items.length > 0) {
            const bDb = await readBarcodeDb(kData.folderId);
            items.forEach(item => {
                bDb[item.bc] = {
                    name: item.name,
                    lastStock: (Number(item.shelf) || 0) + (Number(item.stock) || 0),
                    lastAddress: address,
                    lastUpdate: new Date().toISOString()
                };
            });
            await saveBarcodeDb(kData.folderId, bDb);
        }

        // Создание или обновление таблицы аналитики
        await appendMerchToReport(
            companyFolder, worker, net, address, stock, faces, 
            share, ourPrice, compPrice, expDate, finalUrl, 
            startTime, endTime, duration, lat, lon
        );
        
        // Уведомление менеджеру
        if (kData && kData.ownerChatId) {
            const merchMsg = `🛍️ MERCH_X: Отчет загружен\n👤 Сотрудник: ${worker}\n📍 Магазин: ${net} - ${address}\n⌛ Время в ТТ: ${duration} мин.\n📅 Срок годности: ${expDate || 'Не указан'}`;
            bot.telegram.sendMessage(kData.ownerChatId, merchMsg);
        }

        res.json({ success: true, url: finalUrl });
        
    } catch (err) {
        console.error("Критическая ошибка /merch-upload:", err.message);
        res.status(500).json({ success: false });
    }
});

// Функция записи данных мерча в Google Таблицу
async function appendMerchToReport(fId, worker, net, addr, stock, faces, share, price, cPrice, exp, url, start, end, dur, lat, lon) {
    try {
        const sheetName = `Мерч_Аналитика_${fId}`;
        let ssId = await getFileId(sheetName, fId);
        
        if (!ssId) {
            const spreadsheetMetadata = { resource: { properties: { title: sheetName } }, fields: 'spreadsheetId' };
            const ssCreated = await sheets.spreadsheets.create(spreadsheetMetadata);
            ssId = ssCreated.data.spreadsheetId;
            
            await drive.files.update({ fileId: ssId, addParents: fId, removeParents: MY_ROOT_ID });
            
            const headerRow = [['Дата', 'Сотрудник', 'Сеть', 'Адрес', 'Общий Остаток', 'Фейсинг', 'Доля %', 'Цена Наша', 'Цена Конкур.', 'Срок годности', 'Приход', 'Уход', 'Минуты', 'Координаты', 'Ссылка на отчет']];
            await sheets.spreadsheets.values.append({ 
                spreadsheetId: ssId, 
                range: 'Sheet1!A1', 
                valueInputOption: 'RAW', 
                resource: { values: headerRow } 
            });
        }

        const coords = lat ? `${lat}, ${lon}` : 'Нет GPS';
        const dataRow = [[new Date().toLocaleDateString(), worker, net, addr, stock, faces, share, price, cPrice, exp, start, end, dur, coords, url]];
        
        await sheets.spreadsheets.values.append({ 
            spreadsheetId: ssId, 
            range: 'Sheet1!A2', 
            valueInputOption: 'RAW', 
            resource: { values: dataRow } 
        });
    } catch (error) {
        console.error("Ошибка при работе с Google Таблицей:", error.message);
    }
}

// ==========================================================
// --- СУБ-СИСТЕМА: ЛИЦЕНЗИИ И ПЛАНОГРАММЫ ---
// ==========================================================

// Проверка ключа при входе в приложение
app.post('/check-license', async (req, res) => {
    try {
        const { licenseKey, workerName } = req.body;
        let keys = await readDatabase();
        const kIdx = keys.findIndex(k => k.key === licenseKey);
        
        if (kIdx === -1) {
            return res.json({ status: 'invalid' });
        }
        
        const currentKey = keys[kIdx];
        
        if (!currentKey.workers) currentKey.workers = [];
        if (!currentKey.workers.includes(workerName)) {
            if (currentKey.workers.length >= (currentKey.limit || 1)) {
                return res.json({ status: 'limit_reached' });
            }
            currentKey.workers.push(workerName);
            await saveDatabase(keys);
        }
        
        res.json({ status: 'active' });
    } catch (error) {
        res.status(500).json({ status: 'error' });
    }
});

// Получение каталога товаров компании (по ключу)
app.get('/get-catalog', async (req, res) => {
    try {
        const { key } = req.query;
        const keys = await readDatabase();
        const kInfo = keys.find(k => k.key === key);
        if (!kInfo) return res.json({});
        const catalogData = await readBarcodeDb(kInfo.folderId);
        res.json(catalogData);
    } catch (error) {
        res.json({});
    }
});

// Сохранение нового товара в каталог
app.post('/save-product', async (req, res) => {
    try {
        const { key, barcode, name } = req.body;
        const keys = await readDatabase();
        const kInfo = keys.find(k => k.key === key);
        if (kInfo) {
            const catalog = await readBarcodeDb(kInfo.folderId);
            catalog[barcode] = { 
                name: name, 
                lastStock: 0, 
                dateAdded: new Date().toISOString() 
            };
            await saveBarcodeDb(kInfo.folderId, catalog);
        }
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false });
    }
});

// Получение планограммы магазина
app.get('/get-planogram', async (req, res) => {
    try {
        const { city, addr, key } = req.query;
        const pDbId = await getFileId(PLANOGRAM_DB_NAME);
        if (!pDbId) return res.json({ exists: false });
        
        const response = await drive.files.get({ fileId: pDbId, alt: 'media' });
        const list = Array.isArray(response.data) ? response.data : [];
        const found = list.find(p => p.city === city && p.addr === addr && p.key === key);
        
        res.json(found ? { exists: true, url: found.url } : { exists: false });
    } catch (error) {
        res.json({ exists: false });
    }
});

// Загрузка и привязка планограммы
app.post('/upload-planogram', async (req, res) => {
    try {
        const { city, addr, key, image } = req.body;
        const keys = await readDatabase();
        const kInfo = keys.find(k => k.key === key);
        if (!kInfo) return res.json({ success: false });

        const pFolderId = await getOrCreateFolder("Planograms", kInfo.folderId);
        const imgBuffer = Buffer.from(image.split(',')[1], 'base64');
        const imgFile = await drive.files.create({ 
            resource: { name: `plan_${city}_${addr}.jpg`, parents: [pFolderId] }, 
            media: { mimeType: 'image/jpeg', body: Readable.from(imgBuffer) }, 
            fields: 'id, webViewLink' 
        });
        
        await drive.permissions.create({ fileId: imgFile.data.id, resource: { role: 'writer', type: 'anyone' } });
        
        const dbId = await getFileId(PLANOGRAM_DB_NAME);
        let currentDb = [];
        if (dbId) { 
            const resp = await drive.files.get({ fileId: dbId, alt: 'media' }); 
            currentDb = Array.isArray(resp.data) ? resp.data : []; 
        }
        
        currentDb.push({ city, addr, key, url: imgFile.data.webViewLink });
        const media = { mimeType: 'application/json', body: JSON.stringify(currentDb) };
        
        if (dbId) await drive.files.update({ fileId: dbId, media: media });
        else await drive.files.create({ resource: { name: PLANOGRAM_DB_NAME, parents: [MY_ROOT_ID] }, media: media });
        
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false });
    }
});

// ==========================================================
// --- ТЕЛЕГРАМ БОТ: ПАНЕЛЬ УПРАВЛЕНИЯ И ОПЛАТА ---
// ==========================================================

const activeUserSteps = {};

bot.start((ctx) => {
    const welcomeText = "🤖 ДОБРО ПОЖАЛОВАТЬ В LOGIST_X & MERCH_X\n\nЕдиная система управления на одном сервере.\nВыберите направление для покупки или введите ваш ключ:";
    ctx.reply(welcomeText, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📦 КУПИТЬ LOGIST_X", callback_data: "buy_LOGIST" }],
                [{ text: "🛍️ КУПИТЬ MERCH_X", callback_data: "buy_MERCH" }]
            ]
        }
    });
});

bot.on('callback_query', async (ctx) => {
    const action = ctx.callbackQuery.data;
    const cid = ctx.chat.id;
    if (action.startsWith('buy_')) {
        const projectType = action.split('_')[1];
        activeUserSteps[cid] = { step: 'company_name', type: projectType };
        ctx.reply(`Вы выбрали ${projectType}. Как называется ваша компания?`);
    }
});

bot.on('text', async (ctx) => {
    const cid = ctx.chat.id;
    const textMsg = ctx.message.text.trim();
    const currentState = activeUserSteps[cid];

    // Шаг 1: Получение имени компании
    if (currentState && currentState.step === 'company_name') {
        currentState.name = textMsg;
        currentState.step = 'staff_count';
        return ctx.reply("Сколько сотрудников планируется в системе? (Введите число)");
    }
    
    // Шаг 2: Получение лимита и формирование ссылки на оплату
    if (currentState && currentState.step === 'staff_count') {
        const num = parseInt(textMsg);
        if (isNaN(num)) return ctx.reply("Пожалуйста, укажите число сотрудников.");
        
        // Расчет стоимости (например 1500 за чел)
        const totalSum = num * 1500;
        const paymentLink = `https://yoomoney.ru/transfer?receiver=41001...&sum=${totalSum}`;
        
        ctx.reply(`💎 Заявка на ${currentState.type} создана.\n\nСтоимость за ${num} чел.: ${totalSum} руб.\n\nПосле оплаты администратор свяжется с вами и выдаст ключ.`, {
            reply_markup: {
                inline_keyboard: [[{ text: "ОПЛАТИТЬ ЧЕРЕЗ ЮMONEY", url: paymentLink }]]
            }
        });
        
        // Уведомление владельцу системы (вам)
        const adminAlert = `🔥 НОВАЯ ЗАЯВКА\nКомпания: ${currentState.name}\nЛимит: ${num}\nПроект: ${currentState.type}\nChatID: ${cid}`;
        bot.telegram.sendMessage(MY_TELEGRAM_ID, adminAlert);
        
        delete activeUserSteps[cid];
        return;
    }

    // Проверка ключа активации
    const potentialKey = textMsg.toUpperCase();
    let keysInDb = await readDatabase();
    const keyPosition = keysInDb.findIndex(k => k.key === potentialKey);

    if (keyPosition !== -1) {
        if (keysInDb[keyPosition].ownerChatId && keysInDb[keyPosition].ownerChatId !== cid) {
            return ctx.reply("⚠️ Внимание: Этот ключ уже привязан к другому пользователю.");
        }
        keysInDb[keyPosition].ownerChatId = cid;
        await saveDatabase(keysInDb);
        return ctx.reply(`✅ КЛЮЧ УСПЕШНО ПРИНЯТ!\n\nОрганизация: ${keysInDb[keyPosition].name}\nДоступный лимит сотрудников: ${keysInDb[keyPosition].limit}`);
    }

    // Админ-команда для генерации ключей (только для вас)
    if (cid === MY_TELEGRAM_ID && textMsg.startsWith('/addkey')) {
        const args = textMsg.split(' ');
        if (args.length < 4) return ctx.reply("Используйте: /addkey Название Лимит Дни");
        
        const comp = args[1];
        const lim = parseInt(args[2]);
        const d = parseInt(args[3]);
        
        const genKey = crypto.randomBytes(4).toString('hex').toUpperCase();
        const folderGuid = await getOrCreateFolder(comp, MY_ROOT_ID);
        
        keysInDb.push({
            key: genKey,
            name: comp,
            limit: lim,
            expiry: new Date(Date.now() + d * 86400000).toLocaleDateString(),
            folderId: folderGuid,
            workers: [],
            ownerChatId: null
        });
        
        await saveDatabase(keysInDb);
        return ctx.reply(`🔑 СГЕНЕРИРОВАН НОВЫЙ КЛЮЧ:\n\nКод: ${genKey}\nКомпания: ${comp}\nЛимит: ${lim} чел.`);
    }

    ctx.reply("Система LOGIST_X / MERCH_X\n\nЕсли у вас есть лицензия, отправьте ключ. Если нет, воспользуйтесь меню /start.");
});

// Запуск бота
bot.launch().then(() => {
    console.log("Telegram Bot активирован и готов к работе.");
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 СЕРВЕР ЗАПУЩЕН НА ПОРТУ: ${PORT}`);
    console.log(`📦 ДВА ПРОЕКТА: LOGIST_X & MERCH_X`);
    console.log(`=========================================`);
});
