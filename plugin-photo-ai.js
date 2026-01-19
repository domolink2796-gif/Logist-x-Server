module.exports = function(app, context) {
    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запуск обработки (Модель: GPT-4o-Mini)...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        try {
            const keyPath = '/root/my-system/ai-key.txt';
            if (!fs.existsSync(keyPath)) return res.status(500).json({ error: "Ключ не найден" });
            const OPENROUTER_KEY = fs.readFileSync(keyPath, 'utf8').trim().replace(/^S/, 's');

            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            const requestData = {
                // ПЕРЕКЛЮЧАЕМ НА GPT - ОНА ВСЕГДА ДОСТУПНА
                model: "openai/gpt-4o-mini", 
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: "Сделай фон идеально белым. Одень человека на фото в темно-синий мужской деловой костюм, белую рубашку и галстук. Верни ТОЛЬКО чистый base64 код изображения." },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
                    ]
                }]
            };

            const tempFile = path.join(__dirname, `temp_ai_${Date.now()}.json`);
            fs.writeFileSync(tempFile, JSON.stringify(requestData));

            const cmd = `curl -s -X POST https://openrouter.ai/api/v1/chat/completions \
              -H "Authorization: Bearer ${OPENROUTER_KEY}" \
              -H "Content-Type: application/json" \
              -d @${tempFile}`;

            exec(cmd, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout) => {
                try { fs.unlinkSync(tempFile); } catch(e) {}
                if (error) return res.status(500).json({ error: "Ошибка CURL" });

                try {
                    const data = JSON.parse(stdout);
                    if (data.error) {
                        console.error("❌ Ошибка API:", JSON.stringify(data.error));
                        return res.status(500).json({ error: data.error.message });
                    }

                    if (data.choices && data.choices[0]) {
                        let content = data.choices[0].message.content;
                        let finalBase64 = content.replace(/```base64|```|data:image\/\w+;base64,/g, '').trim();
                        console.log("✅ [AI] ФОТО ГОТОВО! (GPT-4o-Mini)");
                        res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
                    } else {
                        res.status(500).json({ error: "Пустой ответ от AI" });
                    }
                } catch (e) { res.status(500).json({ error: "Ошибка JSON" }); }
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
};
