module.exports = function(app, context) {
    const API_KEY = "AIzaSyC_paJdUz25HtozDaB-TrN7iZsHjh9EwT0";

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запуск через CURL (Socks5h - Remote DNS)...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        // Функция запуска CURL
        const runCurl = (modelName, jsonFile) => {
            return new Promise((resolve, reject) => {
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;
                
                // ВНИМАНИЕ: socks5h (с буквой h) скрывает твое местоположение полностью
                const cmd = `curl -s -x socks5h://127.0.0.1:40000 -X POST -H "Content-Type: application/json" -d @${jsonFile} "${apiUrl}"`;

                exec(cmd, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
                    if (error) resolve({ success: false, error: error.message });
                    try {
                        const data = JSON.parse(stdout);
                        if (data.error) resolve({ success: false, error: data.error.message });
                        else resolve({ success: true, data: data });
                    } catch (e) {
                        resolve({ success: false, error: "JSON Error", raw: stdout });
                    }
                });
            });
        };

        try {
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            const requestData = {
                contents: [{
                    parts: [
                        { text: "Сделай фон идеально белым. Одень в темно-синий деловой костюм, белую рубашку. Верни base64." },
                        { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                    ]
                }]
            };

            const tempFileName = path.join(__dirname, 'temp_ai_req.json');
            fs.writeFileSync(tempFileName, JSON.stringify(requestData));

            // Список моделей для перебора (сначала самые вероятные)
            const MODELS = [
                "gemini-1.5-flash",
                "gemini-1.5-flash-latest",
                "gemini-1.5-pro",
                "gemini-pro-vision"
            ];

            let successResult = null;
            let lastError = "";

            for (const model of MODELS) {
                console.log(`👉 Пробую модель (socks5h): ${model}...`);
                const result = await runCurl(model, tempFileName);

                if (result.success) {
                    console.log(`✅ ПОБЕДА! Сработала модель: ${model}`);
                    successResult = result.data;
                    break;
                } else {
                    console.log(`❌ ${model}: ${result.error}`);
                    lastError = result.error;
                }
            }

            try { fs.unlinkSync(tempFileName); } catch(e) {}

            if (successResult && successResult.candidates) {
                let resultText = successResult.candidates[0].content.parts[0].text;
                let finalBase64 = resultText.trim().replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();
                res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
            } else {
                res.status(500).json({ success: false, error: "Все модели недоступны. Ошибка: " + lastError });
            }

        } catch (err) {
            console.error("❌ Ошибка:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });
};
