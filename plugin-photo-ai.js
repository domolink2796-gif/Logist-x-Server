module.exports = function(app, context) {
    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запрос OpenRouter (Llama 3.2 Vision Free)...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        try {
            const keyPath = '/root/my-system/ai-key.txt';
            if (!fs.existsSync(keyPath)) {
                console.error("❌ Файл с ключом не найден!");
                return res.status(500).json({ error: "Ключ не найден на сервере" });
            }
            const API_KEY = fs.readFileSync(keyPath, 'utf8').trim().replace(/^S/, 's');

            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            // Используем Llama 3.2 Vision - она сейчас самая стабильная бесплатная
            const MODEL = "meta-llama/llama-3.2-11b-vision-instruct:free"; 

            const payload = {
                model: MODEL,
                messages: [{
                    role: "user",
                    content: [
                        { 
                            type: "text", 
                            text: "Photorealistic transformation. Keep the person's face and hair EXACTLY as they are. Change the outfit to a formal dark blue business suit, white shirt, and tie. Background: solid office white. Return ONLY the base64 string of the processed image. No preamble, no text, just base64." 
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
                        
                        // Чистим результат от Markdown и лишних символов
                        let finalBase64 = content.replace(/[\s\S]*?base64,|```base64|```|data:image\/\w+;base64,|"/g, '').trim();
                        finalBase64 = finalBase64.split(' ')[0].split('\n')[0];

                        console.log("✅ [AI] ГОТОВО! Длина строки: " + finalBase64.length);
                        res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
                    } else {
                        console.error("❌ Ошибка OpenRouter:", stdout);
                        res.status(500).json({ error: "Нейросеть не ответила" });
                    }
                } catch (e) {
                    console.error("❌ Ошибка обработки ответа:", e.message);
                    res.status(500).json({ error: "Ошибка сервера" });
                }
            });
        } catch (err) { 
            console.error("❌ Глобальная ошибка:", err.message);
            res.status(500).json({ error: err.message }); 
        }
    });
};
