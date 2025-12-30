const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Твой ID папки
const MY_ROOT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A';

// Авторизация Google
const oauth2Client = new google.auth.OAuth2(
    '355201275272-14gol1u31gr3qlan5236v241jbe13r0a.apps.googleusercontent.com',
    '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'
);
oauth2Client.setCredentials({ refresh_token: '1//04Xx4TeSGvK3OCgYIARAAGAQSNwF-L9Irgd6A14PB5ziFVjs-PftE7jdGY0KoRJnXeVlDuD1eU2ws6Kc1gdlmSYz99MlOQvSeLZ0' });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

// Отправка админки
app.get('/admin-panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Простая проверка, что сервер жив
app.get('/', (req, res) => res.send("СЕРВЕР РАБОТАЕТ"));

app.listen(process.env.PORT || 3000, () => console.log("СЕРВЕР ЗАПУЩЕН"));
