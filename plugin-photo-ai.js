const { GoogleGenerativeAI } = require("@google/generative-ai");

module.exports = function(app, context) {
    try {
        const GEN_AI_KEY = "AIzaSyAWSlp-5uEKSR_v_LaClqCvKMfi5nXmAJY"; 
        const genAI = new GoogleGenerativeAI(GEN_AI_KEY);

        app.post('/api/photo-ai-process', async (req, res) => {
            console.log("📥 [AI] Получен запрос на фото");
            try {
                const { image } = req.body;
                if (!image) return res.status(400).json({ error: "Нет изображения" });

                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const prompt = "Удали фон, сделай его чисто белым. Одень человека в строгий темно-синий костюм с галстуком. Верни только base64.";

                const result = await model.generateContent([
                    prompt,
                    { inlineData: { data: image.replace(/^data:image\/\w+;base64,/, ""), mimeType: "image/jpeg" } }
                ]);

                const response = await result.response;
                let finalBase64 = response.text().trim().replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '');

                res.json({ success: true, processedImage: `data:image/jpeg;base64,${finalBase64}` });
                console.log("✅ [AI] Фото готово");
            } catch (err) {
                console.error("❌ Ошибка обработки фото:", err.message);
                res.status(500).json({ success: false, error: err.message });
            }
        });

        console.log("✅ МОДУЛЬ PHOTO-AI (JIMI) ПОДКЛЮЧЕН К LOGIST_X");
    } catch (e) {
        console.log("❌ Ошибка инициализации Photo-AI: " + e.message);
    }
};
