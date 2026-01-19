const { GoogleGenerativeAI } = require("@google/generative-ai");

module.exports = function(app, context) {
    // Твой ключ API
    const GEN_AI_KEY = "AIzaSyAWSlp-5uEKSR_v_LaClqCvKMfi5nXmAJY"; 
    const genAI = new GoogleGenerativeAI(GEN_AI_KEY);

    // ВАЖНО: используем именно .post и проверяем путь
    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Получен запрос на обработку фото");

        try {
            const { image } = req.body; 

            if (!image) {
                console.log("❌ [AI] Ошибка: Изображение не получено");
                return res.status(400).json({ error: "Нет изображения в теле запроса" });
            }

            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const prompt = `
                Ты — ИИ-модуль системы Logist_X. 
                ИНСТРУКЦИЯ:
                1. Полностью удали фон и замени его на идеально белый (#FFFFFF).
                2. Одень человека в строгий мужской темно-синий костюм, белую рубашку и темный галстук.
                3. Отцентрируй лицо и плечи строго по стандартам фото на документы.
                4. Верни ТОЛЬКО готовое изображение в формате base64. Никаких пояснений.
            `;

            const result = await model.generateContent([
                prompt,
                {
                    inlineData: {
                        data: image.replace(/^data:image\/\w+;base64,/, ""),
                        mimeType: "image/jpeg"
                    }
                }
            ]);

            const response = await result.response;
            let finalBase64 = response.text().trim();
            
            // Очистка base64
            finalBase64 = finalBase64.replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '');

            console.log("✅ [AI] Фото успешно обработано через Gemini");

            res.json({ 
                success: true, 
                processedImage: `data:image/jpeg;base64,${finalBase64}` 
            });

        } catch (error) {
            console.error("❌ [AI] КРИТИЧЕСКАЯ ОШИБКА:", error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    console.log("✅ МОДУЛЬ PHOTO-AI (JIMI) ПОДКЛЮЧЕН К СИСТЕМЕ LOGIST_X");
};
