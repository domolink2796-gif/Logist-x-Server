module.exports = function(app, context) {
    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запрос OpenRouter (Gemini 2.0 Flash)...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        try {
            const keyPath = '/root/my-system/ai-key.txt';
            const API_KEY = fs.readFileSync(keyPath, 'utf8').trim().replace(/^S/, 's');

            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            // Самая свежая БЕСПЛАТНАЯ модель Gemini
            const MODEL = "google/gemini-2.0-flash-exp:free"; 

            const payload = {
                model: MODEL,
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: "Это фото человека. Оставь лицо точно таким же. Переодень его в темно-синий мужской деловой костюм, белую рубашку и галстук. Сделай фон идеально белым. Верни ТОЛЬКО чистый base64 код изображения." },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
                    ]
                }]
            };

            const tempFile = path.join(__dirname, `or_req_${Date.now()}.json`);
            fs.writeFileSync(tempFile, JSON.stringify(payload));

            const cmd = `curl -s -X POST https://openrouter.ai/api/v1/chat/completions \
              -H "Authorization: Bearer ${API_KEY}" \
              -H "Content-Type: application/json" \
              -H "HTTP-Referer: https://logist-x.store" \
              -d @${tempFile}`;

            exec(cmd, (error, stdout) => {
                try { fs.unlinkSync(tempFile); } catch(e) {}
                
                try {
                    const data = JSON.parse(stdout);
                    if (data.choices && data.choices[0]) {
                        let content = data.choices[0].message.content;
                        let finalBase64 = content.replace(/```base64|```|data:image\/\w+;base64,|data:image\/png;base64,/g, '').trim();
                        console.log("✅ [AI] ФОТО ГОТОВО!");
                        res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
                    } else {
                        console.error("❌ Ошибка OpenRouter:", stdout);
                        res.status(500).json({ error: data.error ? data.error.message : "Ошибка API" });
                    }
                } catch (e) {
                    res.status(500).json({ error: "Ошибка обработки" });
                }
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
};
