module.exports = function(app, context) {
    // Твой новый ключ из Google Cloud Console
    const API_KEY = "AIzaSyC_paJdUz25HtozDaB-TrN7iZsHjh9EwT0";

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запрос через WARP (Ключ Cloud Console)...");
        try {
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото для обработки" });

            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
            
            // Используем v1beta для работы с изображениями
            const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + API_KEY;
            
            // Подключаем прокси (WARP порт 40000)
            const { SocksProxyAgent } = require('socks-proxy-agent');
            const agent = new SocksProxyAgent('socks5://127.0.0.1:40000');

            // Используем глобальный fetch из твоего server.js
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                agent: agent,
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: "Сделай фон идеально белым. Одень человека на фото в темно-синий мужской деловой костюм, белую рубашку и галстук. Верни ТОЛЬКО base64 готового изображения." },
                            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                        ]
                    }]
                })
            });

            const data = await response.json();

            if (data.error) {
                console.error("❌ Ошибка Google Cloud:", data.error.message);
                return res.status(500).json({ success: false, error: data.error.message });
            }

            if (data.candidates && data.candidates[0].content) {
                let resultText = data.candidates[0].content.parts[0].text;
                // Очищаем base64 от возможных меток нейросети
                let finalBase64 = resultText.trim().replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();

                console.log("✅ [AI] ФОТО УСПЕШНО ОБРАБОТАНО!");
                res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
            } else {
                throw new Error("Пустой ответ от Google");
            }
        } catch (err) {
            console.error("❌ Ошибка плагина:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    console.log("✅ МОДУЛЬ PHOTO-AI (VPN-READY) ПОДКЛЮЧЕН");
};
