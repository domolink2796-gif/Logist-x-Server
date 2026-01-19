module.exports = function(app, context) {
    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запуск редактирования (timbrooks/instruct-pix2pix)...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        try {
            const keyPath = '/root/my-system/ai-key.txt';
            const HF_TOKEN = fs.readFileSync(keyPath, 'utf8').trim();

            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            // Эта модель создана именно для изменения существующих фото (Pix2Pix)
            const MODEL = "timbrooks/instruct-pix2pix"; 

            const payload = {
                inputs: base64Data,
                parameters: {
                    // Команда: что именно изменить на фото
                    instruction: "Dress the person in a dark blue business suit, white shirt and tie. Make the background solid white. Keep the face exactly the same.",
                    num_inference_steps: 20
                }
            };

            const tempFile = path.join(__dirname, `hf_req_${Date.now()}.json`);
            const outputImage = path.join(__dirname, `result_${Date.now()}.jpg`);
            fs.writeFileSync(tempFile, JSON.stringify(payload));

            // Используем прямой адрес модели, он самый надежный
            const cmd = `curl -s -X POST https://api-inference.huggingface.co/models/${MODEL} \
              -H "Authorization: Bearer ${HF_TOKEN}" \
              -H "Content-Type: application/json" \
              -d @${tempFile} \
              --output ${outputImage}`;

            exec(cmd, (error) => {
                try { fs.unlinkSync(tempFile); } catch(e) {}
                
                if (fs.existsSync(outputImage) && fs.statSync(outputImage).size > 1000) {
                    const bitmap = fs.readFileSync(outputImage);
                    const base64Image = Buffer.from(bitmap).toString('base64');
                    
                    console.log("✅ [AI] ФОТО ИЗМЕНЕНО УСПЕШНО!");
                    try { fs.unlinkSync(outputImage); } catch(e) {}
                    
                    res.json({ success: true, processedImage: "data:image/jpeg;base64," + base64Image });
                } else {
                    console.error("❌ Ошибка или модель еще грузится");
                    res.status(500).json({ error: "Модель подготавливается, попробуй еще раз через 30 секунд" });
                    try { fs.unlinkSync(outputImage); } catch(e) {}
                }
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
};
