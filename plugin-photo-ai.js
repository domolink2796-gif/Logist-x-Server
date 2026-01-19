module.exports = function(app, context) {
    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запрос OpenRouter (Gemini 2.0 Flash - Улучшенный промпт)...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        try {
            const keyPath = '/root/my-system/ai-key.txt';
            if (!fs.existsSync(keyPath)) return res.status(500).json({ error: "Ключ не найден на сервере" });
            const API_KEY = fs.readFileSync(keyPath, 'utf8').trim().replace(/^S/, 's');

            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            const MODEL = "google/gemini-2.0-flash-exp:free"; 

            const payload = {
                model: MODEL,
                messages: [{
                    role: "user",
                    content: [
                        { 
                            type: "text", 
                            text: "This is a photo of a man. Your absolute priority is to keep the person's face and head exactly as they are. Change the clothes to a high-quality dark blue business suit, white shirt, and a tie. Change the background to solid, flat, studio white. Output must be ONLY the base64 string of the modified image. Do not add any text or explanation." 
                        },
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
                        
                        // Улучшенная очистка от любого лишнего мусора
                        let finalBase64 = content.replace(/[\s\S]*?base64,|```base64|```|data:image\/\w+;base64,/g, '').trim();
                        finalBase64 = finalBase64.split(' ')[0].split('\n')[0]; // Убираем возможные приписки в конце

                        if (finalBase64.length < 1000) {
                            console.error("❌ Слишком короткий ответ (возможно, белый лист)");
                            return res.status(500).json({ error: "Нейросеть выдала пустой результат, попробуйте другое фото" });
                        }

                        console.log("✅ [AI] ФОТО ГОТОВО! (Длина строки: " + finalBase64.length + ")");
                        res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
                    } else {
                        console.error("❌ Ошибка OpenRouter:", stdout);
                        res.status(500).json({ error: "Ошибка API" });
                    }
                } catch (e) {
                    console.error("❌ Ошибка разбора JSON:", e.message);
                    res.status(500).json({ error: "Ошибка обработки ответа" });
                }
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
};
