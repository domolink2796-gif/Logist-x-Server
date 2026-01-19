module.exports = function(app, context) {
    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запуск обработки (Стабильный режим)...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        try {
            // 1. Читаем ключ из твоего секретного файла на сервере
            const keyPath = '/root/my-system/ai-key.txt';
            if (!fs.existsSync(keyPath)) {
                console.error("❌ Критическая ошибка: Файл ai-key.txt не найден на сервере!");
                return res.status(500).json({ error: "Настройте ai-key.txt в консоли сервера" });
            }
            
            // Чистим ключ от пробелов и исправляем автозамену буквы S
            const OPENROUTER_KEY = fs.readFileSync(keyPath, 'utf8').trim().replace(/^S/, 's');

            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото в запросе" });
            
            // Подготовка картинки (убираем лишние заголовки base64)
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            // 2. Формируем запрос к OpenRouter
            const requestData = {
                // Используем самую стабильную бесплатную модель
                model: "google/gemini-flash-1.5:free", 
                messages: [{
                    role: "user",
                    content: [
                        { 
                            type: "text", 
                            text: "Ты профессиональный ретушер. Твоя задача: сделать фон на фото идеально белым. Одеть человека на фото в строгий темно-синий мужской деловой костюм, белую рубашку и галстук. Верни ТОЛЬКО чистый base64 код изображения без лишних слов." 
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Data}`
                            }
                        }
                    ]
                }]
            };

            const tempFile = path.join(__dirname, `temp_ai_${Date.now()}.json`);
            fs.writeFileSync(tempFile, JSON.stringify(requestData));

            // 3. Отправляем запрос напрямую через CURL
            const cmd = `curl -s -X POST https://openrouter.ai/api/v1/chat/completions \
              -H "Authorization: Bearer ${OPENROUTER_KEY}" \
              -H "Content-Type: application/json" \
              -H "HTTP-Referer: https://logist-x.store" \
              -d @${tempFile}`;

            exec(cmd, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout) => {
                // Удаляем временный файл сразу после запроса
                try { fs.unlinkSync(tempFile); } catch(e) {}

                if (error) {
                    console.error("❌ Ошибка соединения:", error);
                    return res.status(500).json({ error: "Ошибка сети при обращении к AI" });
                }

                try {
                    const data = JSON.parse(stdout);
                    
                    if (data.error) {
                        console.error("❌ Ошибка API OpenRouter:", JSON.stringify(data.error));
                        return res.status(500).json({ error: data.error.message });
                    }

                    if (data.choices && data.choices[0] && data.choices[0].message) {
                        let content = data.choices[0].message.content;
                        // Очистка от лишних символов markdown, если AI их добавит
                        let finalBase64 = content.replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();
                        
                        console.log("✅ [AI] ФОТО УСПЕШНО ОБРАБОТАНО!");
                        res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
                    } else {
                        console.error("❌ Неожиданный ответ сервера:", stdout);
                        res.status(500).json({ error: "Нейросеть прислала пустой ответ" });
                    }
                } catch (e) {
                    console.error("❌ Ошибка обработки JSON:", stdout);
                    res.status(500).json({ error: "Ошибка разбора данных" });
                }
            });

        } catch (err) {
            console.error("❌ Глобальная ошибка плагина:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });
};
