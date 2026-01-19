module.exports = function(app, context) {
    const API_KEY = "AIzaSyC_paJdUz25HtozDaB-TrN7iZsHjh9EwT0";

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запрос через WARP (HTTPS Module)...");
        
        try {
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });

            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
            
            // Используем стандартную модель
            const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + API_KEY;
            
            // Подключаем агент
            const { SocksProxyAgent } = require('socks-proxy-agent');
            const https = require('https');
            const agent = new SocksProxyAgent('socks5://127.0.0.1:40000');

            // Функция-обертка для жесткого проксирования
            const postToGoogle = (urlStr, payload) => {
                return new Promise((resolve, reject) => {
                    const url = new URL(urlStr);
                    const options = {
                        hostname: url.hostname,
                        port: 443,
                        path: url.pathname + url.search,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        agent: agent // САМОЕ ГЛАВНОЕ: Жесткая привязка агента
                    };

                    const req = https.request(options, (res) => {
                        let data = '';
                        res.on('data', (chunk) => data += chunk);
                        res.on('end', () => {
                            try {
                                resolve(JSON.parse(data));
                            } catch (e) {
                                reject(new Error("Некорректный JSON от Google"));
                            }
                        });
                    });

                    req.on('error', (e) => reject(e));
                    req.write(JSON.stringify(payload));
                    req.end();
                });
            };

            // Отправляем запрос через нашу надежную функцию
            const data = await postToGoogle(apiUrl, {
                contents: [{
                    parts: [
                        { text: "Сделай фон идеально белым. Одень человека на фото в темно-синий мужской деловой костюм, белую рубашку и галстук. Верни ТОЛЬКО base64 код." },
                        { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                    ]
                }]
            });

            if (data.error) {
                console.error("❌ Ответ Google:", JSON.stringify(data.error));
                return res.status(500).json({ success: false, error: data.error.message });
            }

            if (data.candidates && data.candidates[0].content) {
                let resultText = data.candidates[0].content.parts[0].text;
                let finalBase64 = resultText.trim().replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();
                console.log("✅ [AI] ПОБЕДА! IP Скрыт, фото обработано.");
                res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
            } else {
                throw new Error("Пустой ответ");
            }

        } catch (err) {
            console.error("❌ Ошибка плагина:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    console.log("✅ МОДУЛЬ PHOTO-AI (FORCE-PROXY) ПОДКЛЮЧЕН");
};
