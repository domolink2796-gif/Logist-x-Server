module.exports = function(app, context) {
    // Твой проверенный рабочий ключ (sk-or-v1-e61...)
    const OPENROUTER_KEY = "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";

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запуск обработки через OpenRouter...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        try {
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });
            
            // Убираем заголовок base64, если он есть
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            // 1. Готовим запрос (JSON)
            const requestData = {
                model: "google/gemini-flash-1.5", // Быстрая модель Gemini
                messages: [
                    {
                        role: "user",
                        content: [
                            { 
                                type: "text", 
                                text: "Ты профессиональный ретушер. Сделай фон на фото идеально белым. Одень человека на фото в строгий темно-синий мужской деловой костюм, белую рубашку и галстук. Верни ТОЛЬКО чистый base64 код изображения. Не пиши никаких слов, не используй markdown." 
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

            // 2. Отправляем через системный CURL + VPN (socks5h)
            // socks5h важен, чтобы скрыть твой IP от OpenRouter/Google
            const cmd = `curl -s -x socks5h://127.0.0.1:40000 -X POST https://openrouter.ai/api/v1/chat/completions \
              -H "Authorization: Bearer ${OPENROUTER_KEY}" \
              -H "Content-Type: application/json" \
              -H "HTTP-Referer: https://logist-x.store" \
              -d @${tempFileName}`;

            // 3. Выполняем
            exec(cmd, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
                // Удаляем времянку
                try { fs.unlinkSync(tempFileName); } catch(e) {}

                if (error) {
                    console.error("❌ Ошибка сети:", stderr);
                    return res.status(500).json({ error: "Ошибка соединения с AI" });
                }

                try {
                    const data = JSON.parse(stdout);
                    
                    // Проверяем ошибки API
                    if (data.error) {
                        console.error("❌ Ошибка API:", JSON.stringify(data.error));
                        return res.status(500).json({ error: data.error.message });
                    }

                    // Достаем результат
                    if (data.choices && data.choices[0] && data.choices[0].message) {
                        let content = data.choices[0].message.content;
                        // Чистим от лишних символов (```base64 и т.д.)
                        let finalBase64 = content.replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();
                        
                        console.log("✅ [AI] ФОТО ГОТОВО! (OpenRouter)");
                        res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
                    } else {
                        console.error("❌ Пустой ответ:", stdout);
                        res.status(500).json({ error: "Нейросеть вернула пустой ответ" });
                    }
                } catch (e) {
                    console.error("❌ Ошибка чтения JSON:", stdout);
                    res.status(500).json({ error: "Ошибка обработки данных" });
                }
            });

        } catch (err) {
            console.error("❌ Глобальная ошибка:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });
};
