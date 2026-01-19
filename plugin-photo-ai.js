module.exports = function(app, context) {
    const API_KEY = "AIzaSyDCp29_4e334f1F4YVuzXhsjY9ihDAOrcA";

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запрос получен. Пробиваем туннель...");
        try {
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });

            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            // Используем v1beta версию
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
            
            // Динамический импорт fetch
            const { default: fetch } = await import('node-fetch');

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: "Сделай фон чисто белым. Одень человека в темно-синий мужской костюм и галстук. Верни ТОЛЬКО base64 код изображения." },
                            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                        ]
                    }]
                })
            });

            const data = await response.json();

            if (data.error) {
                console.error("❌ Ошибка:", data.error.message);
                return res.status(500).json({ success: false, error: data.error.message });
            }

            if (data.candidates && data.candidates[0].content) {
                let resultText = data.candidates[0].content.parts[0].text;
                let finalBase64 = resultText.trim().replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();

                console.log("✅ [AI] Фото обработано успешно!");
                res.json({ success: true, processedImage: `data:image/jpeg;base64,${finalBase64}` });
            } else {
                throw new Error("Пустой ответ от Google");
            }

        } catch (err) {
            console.error("❌ Ошибка плагина:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    console.log("✅ МОДУЛЬ PHOTO-AI ПОДКЛЮЧЕН");
};
