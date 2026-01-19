module.exports = function(app, context) {
    const API_KEY = "AIzaSyC_paJdUz25HtozDaB-TrN7iZsHjh9EwT0";

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] СКАНИРОВАНИЕ МОДЕЛЕЙ ЧЕРЕЗ WARP...");
        
        const { SocksProxyAgent } = require('socks-proxy-agent');
        const https = require('https');
        const agent = new SocksProxyAgent('socks5://127.0.0.1:40000');

        // Функция для запросов через туннель
        const requestGoogle = (path, method, payload = null) => {
            return new Promise((resolve, reject) => {
                const options = {
                    hostname: 'generativelanguage.googleapis.com',
                    port: 443,
                    path: path,
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    agent: agent // ЖЕСТКИЙ VPN
                };

                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => {
                        try { resolve(JSON.parse(data)); } 
                        catch (e) { resolve({}); }
                    });
                });
                req.on('error', (e) => reject(e));
                if (payload) req.write(JSON.stringify(payload));
                req.end();
            });
        };

        try {
            // 1. ПОЛУЧАЕМ СПИСОК МОДЕЛЕЙ
            const listData = await requestGoogle('/v1beta/models?key=' + API_KEY, 'GET');
            
            if (listData.models) {
                console.log("📋 === СПИСОК ДОСТУПНЫХ МОДЕЛЕЙ ===");
                listData.models.forEach(m => console.log("   👉 " + m.name));
                console.log("📋 ================================");
            } else {
                console.error("❌ Список моделей пуст:", JSON.stringify(listData));
            }

            // 2. ПРОБУЕМ ОБРАБОТАТЬ ФОТО (сразу берем Gemini Pro Vision, она есть почти у всех)
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            // Пробуем универсальную модель gemini-1.5-flash-latest
            const result = await requestGoogle(
                '/v1beta/models/gemini-1.5-flash-latest:generateContent?key=' + API_KEY,
                'POST',
                {
                    contents: [{
                        parts: [
                            { text: "Сделай фон белым. Одень в костюм." },
                            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                        ]
                    }]
                }
            );

            if (result.error) {
                console.error("❌ Попытка генерации не удалась:", result.error.message);
                return res.status(500).json({ error: result.error.message });
            }

            console.log("✅ [AI] ГЕНЕРАЦИЯ УСПЕШНА!");
            res.json({ success: true, message: "OK" });

        } catch (err) {
            console.error("❌ Ошибка:", err.message);
            res.status(500).json({ error: err.message });
        }
    });
};
