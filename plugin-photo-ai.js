module.exports = function(app, context) {
    const API_KEY = "AIzaSyDCp29_4e334f1F4YVuzXhsjY9ihDAOrcA";

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запрос через туннель WARP (gemini-1.5-flash-latest)...");
        try {
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });

            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
            
            // Используем v1beta и ПОЛНОЕ имя модели - это решит проблему 404
            const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=" + API_KEY;
            
            const { SocksProxyAgent } = require('socks-proxy-agent');
            const agent = new SocksProxyAgent('socks5://127.0.0.1:40000');

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                agent: agent,
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: "Ты профессиональный ретушер. Инструкция: Сделай фон идеально белым. Одень человека на фото в темно-синий мужской деловой костюм, белую рубашку и галстук. Верни ТОЛЬКО base64 код изображения." },
                            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                        ]
                    }]
                })
            });

            const data = await response.json();

            if (data.error) {
                console.error("❌ Ответ Google:", JSON.stringify(data.error));
                return res.status(500).json({ success: false, error: data.error.message });
            }

            if (data.candidates && data.candidates[0].content) {
                let resultText = data.candidates[0].content.parts[0].text;
                let finalBase64 = resultText.trim().replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();

                console.log("✅ [AI] ПОБЕДА! Фото успешно получено из Google.");
                res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
            } else {
                throw new Error("Пустой ответ от нейросети");
            }
        } catch (err) {
            console.error("❌ Ошибка в плагине:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    console.log("✅ МОДУЛЬ PHOTO-AI ПОДКЛЮЧЕН");
};
