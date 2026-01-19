module.exports = function(app, context) {
    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запрос OpenRouter (Переключаемся на PIXTRAL-12B)...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        try {
            const keyPath = '/root/my-system/ai-key.txt';
            const API_KEY = fs.readFileSync(keyPath, 'utf8').trim().replace(/^S/, 's');

            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            // Используем модель Pixtral — она мощная в визуальных задачах
            const MODEL = "mistralai/pixtral-12b:free"; 

            const payload = {
                model: MODEL,
                messages: [{
                    role: "user",
                    content: [
                        { 
                            type: "text", 
                            text: "Transform this person. Keep the face and head EXACTLY as they are in the original photo. Change the clothing to a professional dark blue business suit, white shirt, and a tie. Change the background to a solid studio white color. Return ONLY the base64 code of the result, no talk." 
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
                        
                        // Очистка: убираем всё лишнее, оставляем только чистый base64
                        let finalBase64 = content.replace(/[\s\S]*?base64,|```base64|```|data:image\/\w+;base64,|"/g, '').trim();
                        finalBase64 = finalBase64.split(' ')[0].split('\n')[0];

                        console.log("✅ [AI] PIXTRAL ОТВЕТИЛ! Длина данных: " + finalBase64.length);
                        res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
                    } else {
                        console.error("❌ Ошибка OpenRouter:", stdout);
                        res.status(500).json({ error: "Нейросеть не смогла обработать фото" });
                    }
                } catch (e) {
                    console.error("❌ Ошибка разбора JSON:", e.message);
                    res.status(500).json({ error: "Ошибка сервера при чтении ответа" });
                }
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
};
