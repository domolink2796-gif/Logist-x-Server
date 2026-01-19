module.exports = function(app, context) {
    const API_KEY = "AIzaSyC_paJdUz25HtozDaB-TrN7iZsHjh9EwT0";

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запрос через WARP (v1beta/flash-latest)...");
        try {
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });

            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
            
            // Используем v1beta и версию LATEST - она пробивает 404 ошибку в новых проектах
            const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=" + API_KEY;
            
            const { SocksProxyAgent } = require('socks-proxy-agent');
            const agent = new SocksProxyAgent('socks5://127.0.0.1:40000');

            // fetch берется из твоего server.js автоматически
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                agent: agent,
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: "Ты профессиональный ретушер. Одень человека на фото в темно-синий мужской деловой костюм, белую рубашку и галстук. Сделай фон идеально белым. Верни ТОЛЬКО base64 код результата." },
                            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                        ]
                    }]
                })
            });

            const data = await response.json();

            if (data.error) {
                console.error("❌ Google ответил:", JSON.stringify(data.error));
                return res.status(500).json({ success: false, error: data.error.message });
            }

            if (data.candidates && data.candidates[0].content) {
                let resultText = data.candidates[0].content.parts[0].text;
                let finalBase64 = resultText.trim().replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();

                console.log("✅ [AI] ЕСТЬ КОНТАКТ! Фото обработано.");
                res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
            } else {
                throw new Error("Нейросеть вернула пустой ответ");
            }
        } catch (err) {
            console.error("❌ Ошибка плагина:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    console.log("✅ МОДУЛЬ PHOTO-AI ПОДКЛЮЧЕН");
};
