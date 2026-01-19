module.exports = function(app, context) {
    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запуск генерации (FLUX через NEW ROUTER)...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        try {
            const keyPath = '/root/my-system/ai-key.txt';
            if (!fs.existsSync(keyPath)) return res.status(500).json({ error: "Ключ не найден" });
            const HF_TOKEN = fs.readFileSync(keyPath, 'utf8').trim();

            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });

            // Используем модель FLUX через новый роутер
            const MODEL = "black-forest-labs/FLUX.1-dev"; 
            const prompt = "Professional studio portrait of the person from image, wearing a dark blue business suit, white shirt, and tie. Solid white background, high quality, realistic.";

            const payload = {
                inputs: prompt,
                parameters: { width: 512, height: 512 }
            };

            const tempFile = path.join(__dirname, `hf_req_${Date.now()}.json`);
            const outputImage = path.join(__dirname, `result_${Date.now()}.jpg`);
            fs.writeFileSync(tempFile, JSON.stringify(payload));

            // ОБНОВЛЕННЫЙ АДРЕС: router.huggingface.co
            const cmd = `curl -s -X POST https://router.huggingface.co/hf-inference/models/${MODEL} \
              -H "Authorization: Bearer ${HF_TOKEN}" \
              -H "Content-Type: application/json" \
              -d @${tempFile} \
              --output ${outputImage}`;

            exec(cmd, (error) => {
                try { fs.unlinkSync(tempFile); } catch(e) {}
                
                if (fs.existsSync(outputImage) && fs.statSync(outputImage).size > 1000) {
                    const bitmap = fs.readFileSync(outputImage);
                    const base64Image = Buffer.from(bitmap).toString('base64');
                    
                    console.log("✅ [AI] ФОТО ГОТОВО!");
                    try { fs.unlinkSync(outputImage); } catch(e) {}
                    
                    res.json({ success: true, processedImage: "data:image/jpeg;base64," + base64Image });
                } else {
                    let errorMsg = "Модель загружается или ошибка роутера";
                    try {
                        const errData = JSON.parse(fs.readFileSync(outputImage, 'utf8'));
                        if (errData.error) errorMsg = errData.error;
                    } catch(e) {}
                    console.error("❌ Ошибка:", errorMsg);
                    res.status(500).json({ error: errorMsg });
                    try { fs.unlinkSync(outputImage); } catch(e) {}
                }
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
};
