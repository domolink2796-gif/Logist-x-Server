module.exports = function(app, context) {
    const API_KEY = "AIzaSyAWSlp-5uEKSR_v_LaClqCvKMfi5nXmAJY";

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запрос получен. Обработка через Gemini 1.5...");
        try {
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });

            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            // Используем стабильную версию v1 вместо v1beta
            const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

            const { default: fetch } = await import('node-fetch');

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: "Ты — ИИ системы Logist_X. Замени фон на чисто белый. Одень человека в темно-синий мужской костюм, белую рубашку и галстук. Верни ТОЛЬКО base64 код изображения." },
                            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                        ]
                    }]
                })
            });

            const data = await response.json();

            // Если есть ошибка API
            if (data.error) {
                console.error("❌ Ошибка API:", data.error.message);
                return res.status(500).json({ success: false, error: data.error.message });
            }

            // Проверка наличия ответа
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                let resultText = data.candidates[0].content.parts[0].text;
                let finalBase64 = resultText.trim().replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();

                console.log("✅ [AI] Фото успешно обработано.");
                res.json({ success: true, processedImage: `data:image/jpeg;base64,${finalBase64}` });
            } else {
                console.log("❌ [AI] Неожиданный ответ от Google:", JSON.stringify(data));
                throw new Error("Пустой ответ от нейросети");
            }

        } catch (err) {
            console.error("❌ Ошибка плагина:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    console.log("✅ МОДУЛЬ PHOTO-AI (GEMINI 1.5) ПОДКЛЮЧЕН");
};
