const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Теперь сервер берет токен из настроек Render, а не из текста
const DROPBOX_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;

app.get('/status', (req, res) => res.json({ status: "Dropbox Online" }));

app.post('/upload', async (req, res) => {
    try {
        const { image, address, pod, workType, city } = req.body;
        if (!image || !DROPBOX_TOKEN) return res.status(400).json({ success: false, error: "Missing data or token" });

        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const date = new Date().toLocaleDateString('ru-RU').replace(/\./g, '-');
        
        const fullPath = `/LogistX/${workType || 'Работа'}/${city || 'Город'}/${date}/${address || 'Фото'}_п${pod || 0}.jpg`;
        
        const safeArg = JSON.stringify({
            path: fullPath,
            mode: 'add',
            autorename: true
        }).replace(/[^\x00-\x7F]/g, (c) => '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4));

        await axios({
            method: 'post',
            url: 'https://content.dropboxapi.com/2/files/upload',
            headers: {
                'Authorization': `Bearer ${DROPBOX_TOKEN.trim()}`,
                'Content-Type': 'application/octet-stream',
                'Dropbox-API-Arg': safeArg
            },
            data: buffer
        });

        console.log("✅ УСПЕХ!");
        res.json({ success: true });
    } catch (e) {
        console.log("❌ ОШИБКА:", e.response ? JSON.stringify(e.response.data) : e.message);
        res.status(500).json({ success: false });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ready`));
