module.exports = function(app, context) {
    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запуск (Автовыбор модели + ai-key.txt)...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        try {
            const keyPath = '/root/my-system/ai-key.txt';
            if (!fs.existsSync(keyPath)) return res.status(500).json({ error: "Файл ai-key.txt не найден" });
            const OPENROUTER_KEY = fs.readFileSync(keyPath, 'utf8').trim().replace(/^S/, 's');

            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            // Список моделей для автовыбора (от самых быстрых к мощным)
            const models = [
                "google/gemini-flash-1.5-8b", 
                "google/gemini-flash-1.5", 
                "openai/gpt-4o-mini",
                "anthropic/claude-3-haiku"
            ];

            const requestData = {
                model: models[0], // Начинаем с первой
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: "Сделай фон белым. Одень в темно-синий мужской костюм, белую рубашку и галстук. Верни ТОЛЬКО base64." },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
                    ]
                }],
                // Добавляем параметр, чтобы OpenRouter сам нашел замену, если модель упала
                route: "fallback" 
            };

            const tempFile = path.join(__dirname, `temp_ai_${Date.now()}.json`);
            fs.writeFileSync(tempFile, JSON.stringify(requestData));

            const cmd = `curl -s -X POST https://openrouter.ai/api/v1/chat/completions \
              -H "Authorization: Bearer ${OPENROUTER_KEY}" \
              -H "Content-Type: application/json" \
              -d @${tempFile}`;

            exec(cmd, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout) => {
                try { fs.unlinkSync(tempFile); } catch(e) {}
                
                try {
                    const data = JSON.parse(stdout);
                    if (data.choices && data.choices[0]) {
                        let content = data.choices[0].message.content;
                        let finalBase64 = content.replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();
                        console.log("✅ [AI] ФОТО ГОТОВО! Используемая модель: " + (data.model || "auto"));
                        res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
                    } else {
                        console.error("❌ Ошибка API:", stdout);
                        res.status(500).json({ error: data.error ? data.error.message : "Ошибка API" });
                    }
                } catch (e) {
                    console.error("❌ Ошибка JSON:", stdout);
                    res.status(500).json({ error: "Ошибка обработки данных" });
                }
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
};
