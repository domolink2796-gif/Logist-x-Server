const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// ТВОИ ЛИЧНЫЕ КЛЮЧИ GOOGLE (LogistX-System)
const CLIENT_ID = '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, 'https://developers.google.com/oauthplayground');
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth: oauth2Client });

// Функция для поиска или создания папки
async function getOrCreateFolder(folderName, parentId = null) {
    let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) query += ` and '${parentId}' in parents`;

    const res = await drive.files.list({ q: query, fields: 'files(id)' });
    if (res.data.files.length > 0) return res.data.files[0].id;

    const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : []
    };
    const folder = await drive.files.create({ resource: folderMetadata, fields: 'id' });
    return folder.data.id;
}

app.post('/upload', async (req, res) => {
    try {
        const { worker, city, address, pod, client, image, fileName } = req.body;
        const dateStr = new Date().toLocaleDateString('ru-RU');

        console.log(`Получен отчет от ${worker} для ${client} (${city})`);

        // 1. Создаем/Находим цепочку папок: КЛИЕНТ -> ИСПОЛНИТЕЛЬ -> ГОРОД -> ДАТА
        const clientFolderId = await getOrCreateFolder(client || "ОБЩИЙ");
        const workerFolderId = await getOrCreateFolder(worker || "Без_имени", clientFolderId);
        const cityFolderId = await getOrCreateFolder(city || "Неизвестный_город", workerFolderId);
        const dateFolderId = await getOrCreateFolder(dateStr, cityFolderId);

        // 2. Подготовка файла
        const buffer = Buffer.from(image, 'base64');
        const fileMetadata = {
            name: `${fileName}.jpg`, // Формат: Улица_Дом_п.Подъезд
            parents: [dateFolderId]
        };
        const media = { mimeType: 'image/jpeg', body: require('stream').Readable.from(buffer) };

        // 3. Загрузка на Диск
        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id'
        });

        res.json({ success: true, fileId: file.data.id });
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер LOGIST_X запущен на порту ${PORT}`));
