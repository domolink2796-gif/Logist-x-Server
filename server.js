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
const bot = new Telegraf(BOT_TOKEN);

// --- БАЗОВЫЕ ФУНКЦИИ ---
async function readDatabase() {
    try {
        const q = `name = '${DB_FILE_NAME}' and '${MY_ROOT_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ q });
        if (res.data.files.length === 0) return [];
        const content = await drive.files.get({ fileId: res.data.files[0].id, alt: 'media' });
        return content.data.keys || [];
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

// --- БОТ: ПЕРВЫЙ ВХОД И КНОПКИ ---
bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    
    // 1. Если это ты (Админ)
    if (chatId === MY_TELEGRAM_ID) {
        return ctx.reply('👑 ПАНЕЛЬ УПРАВЛЕНИЯ LOGIST-X', {
            reply_markup: { inline_keyboard: [[{ text: "📦 УПРАВЛЕНИЕ КЛЮЧАМИ", web_app: { url: SERVER_URL + "/dashboard" } }]] }
        });
    }

    // 2. Проверяем, есть ли у пользователя уже активный кабинет
    const keys = await readDatabase();
    const isClient = keys.find(k => String(k.ownerChatId) === String(chatId));

    if (isClient) {
        return ctx.reply('🏢 ДОБРО ПОЖАЛОВАТЬ В КАБИНЕТ!', {
            reply_markup: { inline_keyboard: [[{ text: "📊 МОИ ОБЪЕКТЫ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + chatId } }]] }
        });
    }

    // 3. Если пользователь СОВЕРШЕННО НОВЫЙ
    ctx.reply('👋 Привет! Добро пожаловать в систему Logist-X.\n\nУ вас пока нет активной лицензии. Выберите нужное действие:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: "💳 КУПИТЬ ЛИЦЕНЗИЮ", callback_data: "buy_new" }],
                [{ text: "🔑 У МЕНЯ ЕСТЬ КЛЮЧ", callback_data: "have_key" }]
            ]
        }
    });
});

// Обработка кнопки "Купить"
bot.action('buy_new', async (ctx) => {
    const from = ctx.from;
    const userLabel = from.username ? `@${from.username}` : `${from.first_name} (ID: ${from.id})`;
    const profileLink = from.username ? `https://t.me/${from.username}` : `tg://user?id=${from.id}`;

    // Тебе в личку
    await bot.telegram.sendMessage(MY_TELEGRAM_ID, `🔥 **НОВАЯ ЗАЯВКА НА ЛИЦЕНЗИЮ!**\n\nКлиент: ${userLabel}\nЛичка: [ОТКРЫТЬ ЧАТ](${profileLink})`, { parse_mode: 'Markdown' });
    
    await ctx.answerCbQuery();
    await ctx.reply('✅ Запрос отправлен! Администратор свяжется с вами в ближайшее время для оформления лицензии.', {
        reply_markup: { inline_keyboard: [[{ text: "💬 НАПИСАТЬ АДМИНУ НАПРЯМУЮ", url: "https://t.me/G_E_S_S_E_N" }]] }
    });
});

// Обработка кнопки "Есть ключ"
bot.action('have_key', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Введите ваш 8-значный лицензионный КЛЮЧ (например, ABCD-1234) для активации кабинета:');
});

// Прием ключа текстом
bot.on('text', async (ctx) => {
    if (ctx.chat.id === MY_TELEGRAM_ID) return;
    const input = ctx.message.text.trim();
    
    let keys = await readDatabase();
    const idx = keys.findIndex(k => k.key === input);

    if (idx !== -1) {
        if (keys[idx].ownerChatId) return ctx.reply('❌ Этот ключ уже кем-то используется.');
        
        keys[idx].ownerChatId = ctx.chat.id;
        await saveDatabase(keys);
        
        ctx.reply('✅ ДОСТУП АКТИВИРОВАН! Теперь вы можете управлять своим объектом через кабинет.', {
            reply_markup: { inline_keyboard: [[{ text: "📊 ОТКРЫТЬ КАБИНЕТ", web_app: { url: SERVER_URL + "/client-dashboard?chatId=" + ctx.chat.id } }]] }
        });
    } else {
        if (input.length > 5) ctx.reply('❌ Ключ не найден. Проверьте правильность ввода или обратитесь к @G_E_S_S_E_N');
    }
});

bot.launch().then(() => console.log("🚀 БОТ И СЕРВЕР ГОТОВЫ"));
app.listen(process.env.PORT || 3000);
