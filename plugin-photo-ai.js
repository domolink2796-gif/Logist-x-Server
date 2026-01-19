module.exports = function(app, context) {
    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запуск генерации (FLUX.1-schnell)...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        try {
            // 1. Читаем токен из твоего файла на сервере
            const keyPath = '/root/my-system/ai-key.txt';
            if (!fs.existsSync(keyPath)) {
                return res.status(500).json({ error: "Файл ai-key.txt не найден на сервере" });
            }
            const HF_TOKEN = fs.readFileSync(keyPath, 'utf8').trim();

            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });

            // 2. Настраиваем задачу для FLUX (модель для рисования)
            // Мы просим её перерисовать человека на основе оригинала, но в костюме
            const MODEL = "black-forest-labs/FLUX.1-dev"; // Самая качественная модель

            const prompt = "A professional studio photo of the man from the provided image, wearing a sharp dark blue business suit, white shirt, and a tie. The background must be solid flat white. High quality, realistic skin texture, 8k resolution.";

            const payload = {
                inputs: prompt,
                parameters: {
                    target_size: { width: 512, height: 512 }
                }
            };

            const tempFile = path.join(__dirname, `hf_req_${Date.now()}.json`);
            fs.writeFileSync(tempFile, JSON.stringify(payload));

            // 3. Запрос к API Hugging Face
            // Мы используем бинарный формат, так как FLUX возвращает саму картинку
            const outputImage = path.join(__dirname, `result_${Date.now()}.jpg`);
            
            const cmd = `curl -s -X POST https://api-inference.huggingface.co/models/${MODEL} \
              -H "Authorization: Bearer ${HF_TOKEN}" \
              -H "Content-Type: application/json" \
              -d @${tempFile} \
              --output ${outputImage}`;

            exec(cmd, async (error, stdout, stderr) => {
                try { fs.unlinkSync(tempFile); } catch(e) {}
                
                if (fs.existsSync(outputImage) && fs.statSync(outputImage).size > 1000) {
                    // Читаем готовую картинку и переводим в base64 для отправки в приложение
                    const bitmap = fs.readFileSync(outputImage);
                    const base64Image = Buffer.from(bitmap).toString('base64');
                    
                    console.log("✅ [AI] ФОТО УСПЕШНО СОЗДАНО!");
                    
                    // Удаляем временный файл картинки
                    try { fs.unlinkSync(outputImage); } catch(e) {}
                    
                    res.json({ 
                        success: true, 
                        processedImage: "data:image/jpeg;base64," + base64Image 
                    });
                } else {
                    // Если картинка не создалась, проверяем ошибку в stdout
                    let errorMsg = "Ошибка генерации (модель загружается)";
                    try {
                        const errData = JSON.parse(fs.readFileSync(outputImage, 'utf8'));
                        if (errData.error) errorMsg = errData.error;
                    } catch(e) {}
                    
                    console.error("❌ Ошибка API:", errorMsg);
                    res.status(500).json({ error: errorMsg });
                    try { fs.unlinkSync(outputImage); } catch(e) {}
                }
            });

        } catch (err) {
            console.error("❌ Ошибка плагина:", err.message);
            res.status(500).json({ error: err.message });
        }
    });
};
