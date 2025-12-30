const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Настройки
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A';
const CLIENT_ID = '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REFRESH_TOKEN = '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// API для админки
app.get('/api/list_keys', async (req, res) => {
    try {
        const resFile = await drive.files.list({ q: "name = 'DATABASE_KEYS_LOGIST_X' and trashed = false" });
        if (resFile.data.files.length === 0) return res.json({ keys: [] });
        const resData = await sheets.spreadsheets.values.get({ spreadsheetId: resFile.data.files[0].id, range: 'Sheet1!A2:E100' });
        const keys = (resData.data.values || []).map(r => ({ key: r[0], name: r[1], expiry: r[2], limit: r[3] }));
        res.json({ keys });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ГЛАВНОЕ: Открываем админку ПРАВИЛЬНО
app.get('/admin-panel', (req, res) => {
    res.setHeader('Content-Type', 'text/html'); // Эта строчка уберет цифры!
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/', (req, res) => res.send("СЕРВЕР LOGIST-X В СТРОЮ"));

app.listen(process.env.PORT || 3000, () => console.log("СЕРВЕР ЗАПУЩЕН"));
