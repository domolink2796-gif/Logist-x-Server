module.exports = function(app, context) {
    const API_KEY = "AIzaSyC_paJdUz25HtozDaB-TrN7iZsHjh9EwT0";

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запуск через системный CURL (Proxy 40000)...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        try {
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });

            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
            
            // 1. Создаем JSON для отправки (сохраняем во временный файл)
            const requestData = {
                contents: [{
                    parts: [
                        { text: "Сделай фон идеально белым. Одень человека на фото в темно-синий мужской деловой костюм, белую рубашку и галстук. Верни ТОЛЬКО base64." },
                        { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                    ]
                }]
            };

            const tempFileName = path.join(__dirname, 'temp_ai_request.json');
            fs.writeFileSync(tempFileName, JSON.stringify(requestData));

            // 2. Формируем команду CURL (Точно такую же, как ты проверял в начале)
            // Используем модель gemini-1.5-flash
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
            
            // -x socks5://127.0.0.1:40000 — это жесткая привязка к твоему VPN
            const curlCommand = `curl -s -x socks5://127.0.0.1:40000 -X POST -H "Content-Type: application/json" -d @${tempFileName} "${apiUrl}"`;

            // 3. Выполняем команду
            exec(curlCommand, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
                // Удаляем временный файл сразу
                try { fs.unlinkSync(tempFileName); } catch(e) {}

                if (error) {
                    console.error("❌ Ошибка CURL:", stderr || error.message);
                    return res.status(500).json({ error: "Ошибка выполнения запроса" });
                }

                try {
                    const data = JSON.parse(stdout);

                    if (data.error) {
                        console.error("❌ Ответ Google:", JSON.stringify(data.error));
                        return res.status(500).json({ success: false, error: data.error.message });
                    }

                    if (data.candidates && data.candidates[0].content) {
                        let resultText = data.candidates[0].content.parts[0].text;
                        let finalBase64 = resultText.trim().replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();
                        
                        console.log("✅ [AI] ПОБЕДА! Curl пробил защиту.");
                        res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
                    } else {
                        console.error("❌ Пустой ответ:", stdout);
                        res.status(500).json({ error: "Google вернул пустой ответ" });
                    }
                } catch (parseError) {
                    console.error("❌ Ошибка парсинга JSON:", parseError.message);
                    console.error("RAW Ответ:", stdout); // Покажет, если пришел HTML вместо JSON
                    res.status(500).json({ error: "Ошибка обработки ответа" });
                }
            });

        } catch (err) {
            console.error("❌ Глобальная ошибка:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    console.log("✅ МОДУЛЬ PHOTO-AI (CURL-MODE) ПОДКЛЮЧЕН");
};
