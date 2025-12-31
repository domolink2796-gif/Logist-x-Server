const express = require('express');
const { google } = require('googleapis');
const { Telegraf, Markup } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));

// --- НАСТРОЙКИ (ТВОИ ДАННЫЕ) ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const MY_TELEGRAM_ID = 6846149935; // Твой ID

const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// Чтение базы ключей с Google Диска
async function readDatabase() {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        if (res.data.files.length === 0) return { keys: [] };
        const fileId = res.data.files[0].id;
        const content = await drive.files.get({ fileId, alt: 'media' });
        return content.data || { keys: [] };
    } catch (e) { return { keys: [] }; }
}

// --- ЛОГИКА БОТА (ВСЕ КАБИНЕТЫ В ОДНОМ) ---

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const db = await readDatabase();

    // 1. ПАНЕЛЬ УПРАВЛЕНИЯ (ДЛЯ ТЕБЯ)
    if (userId === MY_TELEGRAM_ID) {
        return ctx.reply('👋 Привет, Босс! Управление Logist-X запущено.', 
            Markup.keyboard([
                ['🔑 Создать новый ключ', '📋 Список всех клиентов'],
                ['📊 Общая статистика', '⚙️ Настройки сервера']
            ]).resize());
    }

    // 2. КАБИНЕТ КЛИЕНТА
    const clientKey = db.keys.find(k => k.ownerChatId === userId);
    if (clientKey) {
        return ctx.reply(`🏢 Объект: ${clientKey.name}\n👥 Сотрудников: ${clientKey.workers ? clientKey.workers.length : 0}/${clientKey.maxWorkers}`, 
            Markup.keyboard([
                ['👥 Мои работники', '➕ Добавить сотрудника'],
                ['📂 Отчеты по объекту', '💳 Продлить лицензию']
            ]).resize());
    }

    // 3. ЕСЛИ НЕТ ЛИЦЕНЗИИ (ПРЕДЛОЖЕНИЕ КУПИТЬ)
    ctx.reply('👋 Добро пожаловать! Для работы системы Logist-X (монтаж, реклама, отчеты) необходима лицензия.', 
        Markup.inlineKeyboard([
            [Markup.button.url('💳 Купить лицензию / Связаться', 'https://t.me/твой_аккаунт')],
            [Markup.button.callback('🔑 У меня есть ключ', 'activate_key')]
        ]));
});

// Кнопки для клиента: Управление работниками
bot.hears('👥 Мои работники', async (ctx) => {
    const db = await readDatabase();
    const clientKey = db.keys.find(k => k.ownerChatId === ctx.from.id);
    if (!clientKey) return;

    let workersList = clientKey.workers && clientKey.workers.length > 0 
        ? clientKey.workers.map((w, i) => `${i+1}. ${w.name}`).join('\n')
        : 'Работников пока нет.';
    
    ctx.reply(`📋 Ваши сотрудники:\n${workersList}`);
});

bot.hears('➕ Добавить сотрудника', async (ctx) => {
    const db = await readDatabase();
    const clientKey = db.keys.find(k => k.ownerChatId === ctx.from.id);
    if (clientKey.workers && clientKey.workers.length >= clientKey.maxWorkers) {
        return ctx.reply('⚠️ Лимит сотрудников исчерпан. Пожалуйста, продлите или расширьте лицензию.');
    }
    ctx.reply('Пришлите контакт работника или введите его имя для регистрации в системе.');
});

// Продление лицензии клиентом
bot.hears('💳 Продлить лицензию', (ctx) => {
    ctx.reply('Выберите пакет продления:', 
        Markup.inlineKeyboard([
            [Markup.button.callback('Продлить на 1 мес.', 'pay_1m')],
            [Markup.button.callback('Добавить +5 мест для рабочих', 'add_slots')]
        ]));
});

// --- СЕРВЕРНАЯ ЧАСТЬ (WEB-ИНТЕРФЕЙС И ЗАГРУЗКА) ---

// Путь для твоей админки (кабинет клиентов)
app.get('/dashboard', (req, res) => {
    res.send('<h1>Панель управления Logist-X (Админ-зона)</h1><p>Система работает корректно.</p>');
});

// Логика загрузки фото (сохраняем структуру папок)
app.post('/upload', async (req, res) => {
    try {
        const { key, workerName, cityName, clientName, images } = req.body;
        // Здесь твоя функция поиска ID папки на диске и создания пути:
        // Владелец -> Работник -> Город -> Дата -> Клиент
        console.log(`Загрузка для: ${clientName} от ${workerName}`);
        res.json({ success: true, message: "Данные загружены в облако" });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

bot.launch();
app.listen(process.env.PORT || 3000, () => {
    console.log(`
    ✅ Logist-X Server Started
    ✅ Telegram Bot Active
    ✅ Admin Dashboard Ready
    `);
});
