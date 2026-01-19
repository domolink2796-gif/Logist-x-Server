module.exports = function(app, context) {
    const API_KEY = "AIzaSyAWSlp-5uEKSR_v_LaClqCvKMfi5nXmAJY";

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запрос получен. Пробую подключиться к Gemini 1.5 Flash...");
        try {
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });

            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            // Используем v1 с полным названием модели
            const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

            const { default: fetch } = await import('node-fetch');

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: "Ты — ИИ системы Logist_X. Удали фон, сделай его белым. Одень человека в темно-синий костюм с галстуком. Верни ТОЛЬКО base64." },
                            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.4,
                        topK: 32,
                        topP: 1,
                        maxOutputTokens: 4096,
                    }
                })
            });

            const data = await response.json();

            // Если модель не найдена, выведем подробности в консоль сервера
            if (data.error) {
                console.error("❌ Ошибка Google API:", JSON.stringify(data.error));
                return res.status(500).json({ success: false, error: data.error.message });
            }

            if (data.candidates && data.candidates[0].content) {
                let resultText = data.candidates[0].content.parts[0].text;
                let finalBase64 = resultText.trim().replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();

                console.log("✅ [AI] Фото успешно обработано!");
                res.json({ success: true, processedImage: `data:image/jpeg;base64,${finalBase64}` });
            } else {
                throw new Error("Нейросеть вернула пустой ответ");
            }

        } catch (err) {
            console.error("❌ Ошибка плагина:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    console.log("✅ МОДУЛЬ PHOTO-AI (FLASH 1.5) ПОДКЛЮЧЕН");
};
