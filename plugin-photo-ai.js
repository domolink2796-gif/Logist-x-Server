module.exports = function(app, context) {
    // ИСПРАВИЛ ПЕРВУЮ БУКВУ НА МАЛЕНЬКУЮ 's'
    const OPENROUTER_KEY = "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";

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запрос через OpenRouter (Corrected Key)...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        try {
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            const requestData = {
                // Модель Gemini Flash 1.5 (бесплатная)
                model: "google/gemini-flash-1.5", 
                messages: [
                    {
                        role: "user",
                        content: [
                            { 
                                type: "text", 
                                text: "Ты профессиональный ретушер. Твоя задача: сделать фон на фото идеально белым. Одеть человека на фото в строгий темно-синий мужской деловой костюм, белую рубашку и галстук. Верни ТОЛЬКО чистый base64 код изображения. Никаких слов." 
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/jpeg;base64,${base64Data}`
                                }
                            }
                        ]
                    }
                ]
            };

            const tempFileName = path.join(__dirname, 'temp_or_req.json');
            fs.writeFileSync(tempFileName, JSON.stringify(requestData));

            // Отправляем через CURL + VPN
            const cmd = `curl -s -x socks5h://127.0.0.1:40000 -X POST https://openrouter.ai/api/v1/chat/completions \
              -H "Authorization: Bearer ${OPENROUTER_KEY}" \
              -H "Content-Type: application/json" \
              -H "HTTP-Referer: https://logist-x.store" \
              -d @${tempFileName}`;

            exec(cmd, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
                try { fs.unlinkSync(tempFileName); } catch(e) {}

                if (error) {
                    console.error("❌ Ошибка сети:", stderr);
                    return res.status(500).json({ error: "Ошибка сети" });
                }

                try {
                    const data = JSON.parse(stdout);
                    
                    if (data.error) {
                        console.error("❌ Ошибка OpenRouter:", JSON.stringify(data.error));
                        return res.status(500).json({ error: data.error.message });
                    }

                    if (data.choices && data.choices[0]) {
                        let content = data.choices[0].message.content;
                        let finalBase64 = content.replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();
                        
                        console.log("✅ [AI] ФОТО ГОТОВО! OpenRouter принял ключ.");
                        res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
                    } else {
                        console.error("❌ Пустой ответ:", stdout);
                        res.status(500).json({ error: "Пустой ответ" });
                    }
                } catch (e) {
                    console.error("❌ JSON Error:", stdout);
                    res.status(500).json({ error: "Ошибка обработки" });
                }
            });

        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
};
