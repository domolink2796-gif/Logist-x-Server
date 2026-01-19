module.exports = function(app, context) {
    const API_KEY = "AIzaSyC_paJdUz25HtozDaB-TrN7iZsHjh9EwT0";

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запрос через CURL (Scanner Mode)...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        // Функция запуска CURL
        const runCurl = (command) => {
            return new Promise((resolve, reject) => {
                exec(command, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
                    if (error) resolve({ error: error.message, stderr });
                    else resolve({ success: true, data: stdout });
                });
            });
        };

        try {
            // ШАГ 1: Узнаем список моделей (чтобы точно знать имя)
            // -x socks5://127.0.0.1:40000 — обязательный туннель
            const listCmd = `curl -s -x socks5://127.0.0.1:40000 "https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}"`;
            const listResult = await runCurl(listCmd);

            if (listResult.success) {
                try {
                    const listJson = JSON.parse(listResult.data);
                    if (listJson.models) {
                        console.log("📋 === СПИСОК РАЗРЕШЕННЫХ МОДЕЛЕЙ ===");
                        // Выводим только те, что умеют генерировать контент
                        listJson.models.forEach(m => {
                            if(m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")) {
                                console.log("   👉 " + m.name); 
                            }
                        });
                        console.log("📋 ================================");
                    }
                } catch (e) { console.log("⚠️ Не удалось прочитать список моделей"); }
            }

            // ШАГ 2: Пробуем самую новую версию (часто исправляет 404)
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            const requestData = {
                contents: [{
                    parts: [
                        { text: "Сделай фон белым. Одень в синий костюм. Верни base64." },
                        { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                    ]
                }]
            };

            const tempFileName = path.join(__dirname, 'temp_ai_req.json');
            fs.writeFileSync(tempFileName, JSON.stringify(requestData));

            // Пробуем модель gemini-1.5-flash-latest (Обрати внимание на -latest)
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
            const genCmd = `curl -s -x socks5://127.0.0.1:40000 -X POST -H "Content-Type: application/json" -d @${tempFileName} "${apiUrl}"`;

            const genResult = await runCurl(genCmd);
            try { fs.unlinkSync(tempFileName); } catch(e) {}

            if (genResult.success) {
                const data = JSON.parse(genResult.data);
                
                if (data.error) {
                    console.error("❌ Google Error:", data.error.message);
                    return res.status(500).json({ success: false, error: data.error.message });
                }

                if (data.candidates && data.candidates[0].content) {
                    let resultText = data.candidates[0].content.parts[0].text;
                    let finalBase64 = resultText.trim().replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();
                    console.log("✅ [AI] ПОБЕДА! Фото готово.");
                    res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
                } else {
                    console.log("RAW Ответ:", genResult.data);
                    throw new Error("Пустой ответ");
                }
            } else {
                throw new Error("Ошибка CURL: " + genResult.stderr);
            }

        } catch (err) {
            console.error("❌ Ошибка:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });
};
