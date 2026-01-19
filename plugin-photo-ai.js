module.exports = function(app, context) {
    // Вставь сюда свой последний ключ (тот самый sk-or-v1-3872...)
    const OPENROUTER_KEY = "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";

    app.post('/api/photo-ai-process', async (req, res) => {
        // Очищаем ключ от возможных пробелов по краям
        const CLEAN_KEY = OPENROUTER_KEY.trim().replace(/^S/, 's');
        
        console.log("📥 [AI] Запрос OpenRouter (Ключ очищен, режим DIRECT)...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        try {
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            const requestData = {
                model: "google/gemini-flash-1.5",
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: "Сделай фон идеально белым. Одень человека в темно-синий мужской костюм, белую рубашку и галстук. Верни ТОЛЬКО base64." },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
                    ]
                }]
            };

            const tempFile = path.join(__dirname, `temp_ai_${Date.now()}.json`);
            fs.writeFileSync(tempFile, JSON.stringify(requestData));

            // Используем чистый ключ и прямой запрос
            const cmd = `curl -s -X POST https://openrouter.ai/api/v1/chat/completions \
              -H "Authorization: Bearer ${CLEAN_KEY}" \
              -H "Content-Type: application/json" \
              -d @${tempFile}`;

            exec(cmd, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout) => {
                try { fs.unlinkSync(tempFile); } catch(e) {}

                if (error) {
                    console.error("❌ Ошибка CURL:", error);
                    return res.status(500).json({ error: "Ошибка сети" });
                }

                try {
                    const data = JSON.parse(stdout);
                    if (data.choices && data.choices[0]) {
                        let content = data.choices[0].message.content;
                        let finalBase64 = content.replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();
                        console.log("✅ [AI] ФОТО ГОТОВО!");
                        res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
                    } else {
                        console.error("❌ Ответ API:", stdout);
                        res.status(500).json({ error: data.error ? data.error.message : "Ошибка API" });
                    }
                } catch (e) {
                    console.error("❌ Ошибка JSON:", stdout);
                    res.status(500).json({ error: "Ошибка обработки" });
                }
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
};
