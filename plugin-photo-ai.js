module.exports = function(app, context) {
    // Твой рабочий ключ
    const OPENROUTER_KEY = "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";

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запрос OpenRouter (Direct connection)...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        try {
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });
            
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            // 1. Готовим запрос
            const requestData = {
                model: "google/gemini-flash-1.5",
                messages: [
                    {
                        role: "user",
                        content: [
                            { 
                                type: "text", 
                                text: "Ты профессиональный ретушер. Сделай фон на фото идеально белым. Одень человека на фото в строгий темно-синий мужской деловой костюм, белую рубашку и галстук. Верни ТОЛЬКО чистый base64 код изображения." 
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

            // 2. Отправляем НАПРЯМУЮ (без VPN)
            // Мы убрали -x socks5h://..., так как тест показал, что напрямую работает лучше
            const cmd = `curl -s -X POST https://openrouter.ai/api/v1/chat/completions \
              -H "Authorization: Bearer ${OPENROUTER_KEY}" \
              -H "Content-Type: application/json" \
              -H "HTTP-Referer: https://logist-x.store" \
              -d @${tempFileName}`;

            // 3. Выполняем
            exec(cmd, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
                try { fs.unlinkSync(tempFileName); } catch(e) {}

                if (error) {
                    console.error("❌ Ошибка сети:", stderr);
                    return res.status(500).json({ error: "Ошибка соединения" });
                }

                try {
                    const data = JSON.parse(stdout);
                    
                    if (data.error) {
                        console.error("❌ Ошибка API:", JSON.stringify(data.error));
                        return res.status(500).json({ error: data.error.message });
                    }

                    if (data.choices && data.choices[0]) {
                        let content = data.choices[0].message.content;
                        let finalBase64 = content.replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();
                        
                        console.log("✅ [AI] ФОТО ГОТОВО! (Direct)");
                        res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
                    } else {
                        console.error("❌ Пустой ответ:", stdout);
                        res.status(500).json({ error: "Пустой ответ" });
                    }
                } catch (e) {
                    console.error("❌ Ошибка JSON:", stdout);
                    res.status(500).json({ error: "Ошибка обработки" });
                }
            });

        } catch (err) {
            console.error("❌ Глобальная ошибка:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });
};
