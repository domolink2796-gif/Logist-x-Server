module.exports = function(app, context) {
    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запуск редактирования (Авто-повтор включен)...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        const keyPath = '/root/my-system/ai-key.txt';
        const HF_TOKEN = fs.readFileSync(keyPath, 'utf8').trim();

        const { image } = req.body;
        if (!image) return res.status(400).json({ error: "Нет фото" });
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

        const MODEL = "timbrooks/instruct-pix2pix"; 
        
        // Функция для одной попытки запроса
        const makeRequest = (attempt) => {
            const tempFile = path.join(__dirname, `hf_req_${Date.now()}.json`);
            const outputImage = path.join(__dirname, `result_${Date.now()}.jpg`);
            
            const payload = {
                inputs: base64Data,
                parameters: {
                    instruction: "Keep the person's face exactly the same. Dress him in a dark blue business suit, white shirt and tie. Solid white background.",
                    num_inference_steps: 20
                }
            };
            
            fs.writeFileSync(tempFile, JSON.stringify(payload));

            const cmd = `curl -s -X POST https://api-inference.huggingface.co/models/${MODEL} \
              -H "Authorization: Bearer ${HF_TOKEN}" \
              -H "Content-Type: application/json" \
              -d @${tempFile} \
              --output ${outputImage}`;

            exec(cmd, (error, stdout) => {
                try { fs.unlinkSync(tempFile); } catch(e) {}
                
                let isImage = false;
                if (fs.existsSync(outputImage)) {
                    const stats = fs.statSync(outputImage);
                    // Если файл больше 5кб — это точно картинка, а не текст ошибки
                    if (stats.size > 5000) isImage = true;
                }

                if (isImage) {
                    const bitmap = fs.readFileSync(outputImage);
                    const base64Image = Buffer.from(bitmap).toString('base64');
                    console.log(`✅ [AI] УСПЕХ на попытке №${attempt}!`);
                    try { fs.unlinkSync(outputImage); } catch(e) {}
                    return res.json({ success: true, processedImage: "data:image/jpeg;base64," + base64Image });
                } else {
                    let rawError = "";
                    try { rawError = fs.readFileSync(outputImage, 'utf8'); } catch(e) {}
                    try { fs.unlinkSync(outputImage); } catch(e) {}
                    
                    console.log(`⚠️ Попытка №${attempt}: Модель еще грузится...`);

                    if (attempt < 5) { // Пробуем до 5 раз
                        setTimeout(() => makeRequest(attempt + 1), 15000); // Ждем 15 сек перед повтором
                    } else {
                        console.error("❌ Все попытки исчерпаны");
                        res.status(500).json({ error: "Модель не проснулась. Попробуйте еще раз через минуту." });
                    }
                }
            });
        };

        makeRequest(1); // Запускаем первую попытку
    });
};
