const { GoogleGenerativeAI } = require("@google/generative-ai");

module.exports = function(app, context) {
    try {
        const GEN_AI_KEY = "AIzaSyAWSlp-5uEKSR_v_LaClqCvKMfi5nXmAJY"; 
        const genAI = new GoogleGenerativeAI(GEN_AI_KEY);

        app.post('/api/photo-ai-process', async (req, res) => {
            console.log("📥 [AI] Получен запрос на фото. Начинаю обработку...");
            try {
                const { image } = req.body;
                if (!image) return res.status(400).json({ error: "Нет изображения" });

                // ИСПОЛЬЗУЕМ БОЛЕЕ СТАБИЛЬНУЮ МОДЕЛЬ
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); 

                const prompt = "Ты профессиональный фотограф. Сделай фон чисто белым (#FFFFFF). Одень мужчину на фото в классический темно-синий костюм, белую рубашку и темный галстук. Верни ТОЛЬКО base64 код изображения.";

                const result = await model.generateContent([
                    { text: prompt },
                    {
                        inlineData: {
                            data: image.replace(/^data:image\/\w+;base64,/, ""),
                            mimeType: "image/jpeg"
                        }
                    }
                ]);

                const response = await result.response;
                let finalBase64 = response.text().trim();
                
                // Очистка ответа от лишних знаков
                finalBase64 = finalBase64.replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();

                console.log("✅ [AI] Фото успешно переодето и фон удален!");
                res.json({ success: true, processedImage: `data:image/jpeg;base64,${finalBase64}` });

            } catch (err) {
                console.error("❌ Ошибка внутри Gemini:", err.message);
                res.status(500).json({ success: false, error: err.message });
            }
        });

        console.log("✅ МОДУЛЬ PHOTO-AI (JIMI) ПОДКЛЮЧЕН И ГОТОВ К РАБОТЕ");
    } catch (e) {
        console.log("❌ Ошибка инициализации: " + e.message);
    }
};
