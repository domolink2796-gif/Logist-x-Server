const express = require('express');
const { google } = require('googleapis');
const { Telegraf, Markup } = require('telegraf');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '100mb' }));

// --- НАСТРОЙКИ ---
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A'; 
const BOT_TOKEN = '8295294099:AAGw16RvHpQyClz-f_LGGdJvQtu4ePG6-lg';
const DB_FILE_NAME = 'keys_database.json';
const ADMIN_ID = 6846149935;

const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const bot = new Telegraf(BOT_TOKEN);

// --- ЛОГИКА БОТА ДЛЯ НОВЫХ ПОЛЬЗОВАТЕЛЕЙ ---
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    if (userId === ADMIN_ID) {
        return ctx.reply('👋 Привет, Админ! Твоя панель управления доступна по кнопке ниже.', 
            Markup.inlineKeyboard([[Markup.button.webApp('🖥 АДМИН-ПАНЕЛЬ', 'https://logist-x-server-production.up.railway.app/dashboard')]]));
    }

    // Здесь будет логика проверки chatId в keys_database.json
    // Если пользователя нет в базе - предлагаем купить:
    ctx.reply(`Добро пожаловать в Logist-X! 📦\n\nУ вас пока нет активной лицензии. Выберите действие:`, 
        Markup.inlineKeyboard([
            [Markup.button.callback('💳 Купить лицензию', 'buy_license')],
            [Markup.button.callback('🔑 У меня есть ключ', 'have_key')]
        ])
    );
});

bot.action('buy_license', (ctx) => {
    ctx.reply('Отлично! Наш менеджер свяжется с вами для оформления.');
    bot.telegram.sendMessage(ADMIN_ID, `🔔 Заявка на покупку! Пользователь: @${ctx.from.username || 'скрыто'} (ID: ${ctx.from.id})`);
});

bot.action('have_key', (ctx) => {
    ctx.reply('Пожалуйста, введите ваш 8-значный лицензионный ключ:');
});

// --- РАБОТА С ФАЙЛАМИ (ПАПКИ И ФОТО) ---
async function getOrCreateFolder(name, parentId) {
    const q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
    const res = await drive.files.list({ q, fields: 'files(id)' });
    if (res.data.files.length > 0) return res.data.files[0].id;
    const file = await drive.files.create({ resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id' });
    return file.data.id;
}

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, entrance, client, image } = req.body;
        const rootDir = await getOrCreateFolder("Logist-X_Objects", MY_ROOT_ID);
        const workerDir = await getOrCreateFolder(worker, rootDir);
        const cityDir = await getOrCreateFolder(city, workerDir);
        const dateDir = await getOrCreateFolder(new Date().toLocaleDateString('ru-RU'), cityDir);
        const clientDir = await getOrCreateFolder(client || "Общий", dateDir);

        const fileName = `${address} ${entrance}`.trim() + ".jpg";
        const buffer = Buffer.from(image.split(',')[1], 'base64');
        const bs = new Readable(); bs.push(buffer); bs.push(null);

        await drive.files.create({
            resource: { name: fileName, parents: [clientDir] },
            media: { mimeType: 'image/jpeg', body: bs }
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// --- СТАРТ ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ СЕРВЕР И БОТ LOGIST-X ЗАПУЩЕНЫ`);
    bot.telegram.deleteWebhook({ drop_pending_updates: true }).then(() => bot.launch());
});
