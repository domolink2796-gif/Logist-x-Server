module.exports = function(app, context) {
    const API_KEY = "AIzaSyAWSlp-5uEKSR_v_LaClqCvKMfi5nXmAJY";

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запрос на фото. Проверка связи с Gemini...");
        try {
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });

            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            // Используем модель gemini-pro-vision (она иногда стабильнее для фото)
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

            const { default: fetch } = await import('node-fetch');

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: "Сделай фон белым. Одень человека в темно-синий костюм и галстук. Верни ТОЛЬКО base64." },
                            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                        ]
                    }]
                })
            });

            const data = await response.json();

            // ВАЖНО: Если ошибка, выводим всё, что ответил Google
            if (data.error) {
                console.log("❌ ПОЛНЫЙ ОТВЕТ ОШИБКИ:", JSON.stringify(data));
                return res.status(500).json({ success: false, error: data.error.message });
            }

            if (data.candidates && data.candidates[0].content) {
                let resultText = data.candidates[0].content.parts[0].text;
                let finalBase64 = resultText.trim().replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();

                console.log("✅ [AI] Успешно!");
                res.json({ success: true, processedImage: `data:image/jpeg;base64,${finalBase64}` });
            } else {
                console.log("⚠️ Странный ответ:", JSON.stringify(data));
                throw new Error("Нет данных в ответе");
            }

        } catch (err) {
            console.error("❌ Ошибка:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    console.log("✅ МОДУЛЬ PHOTO-AI ЗАПУЩЕН");
};
