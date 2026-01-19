module.exports = function(app, context) {
    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Попытка редактирования (Смена модели на более быструю)...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        const keyPath = '/root/my-system/ai-key.txt';
        const HF_TOKEN = fs.readFileSync(keyPath, 'utf8').trim();

        const { image } = req.body;
        if (!image) return res.status(400).json({ error: "Нет фото" });
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

        // Меняем модель на проверенную временем
        const MODEL = "kandinsky-community/kandinsky-2-2-controlnet-depth"; 
        
        const makeRequest = (attempt) => {
            const tempFile = path.join(__dirname, `hf_req_${Date.now()}.json`);
            const outputImage = path.join(__dirname, `result_${Date.now()}.jpg`);
            
            const payload = {
                inputs: "A professional photo of a man in a dark blue business suit, white shirt and tie, solid white background, high quality",
                image: base64Data, // Твое фото как карта глубины/основа
            };
            
            fs.writeFileSync(tempFile, JSON.stringify(payload));

            const cmd = `curl -s -X POST https://api-inference.huggingface.co/models/${MODEL} \
              -H "Authorization: Bearer ${HF_TOKEN}" \
              -H "Content-Type: application/json" \
              -d @${tempFile} \
              --output ${outputImage}`;

            exec(cmd, (error) => {
                try { fs.unlinkSync(tempFile); } catch(e) {}
                
                let isImage = false;
                if (fs.existsSync(outputImage)) {
                    const stats = fs.statSync(outputImage);
                    if (stats.size > 5000) isImage = true;
                }

                if (isImage) {
                    const bitmap = fs.readFileSync(outputImage);
                    const base64Image = Buffer.from(bitmap).toString('base64');
                    console.log(`✅ [AI] УСПЕХ! Попытка №${attempt}`);
                    try { fs.unlinkSync(outputImage); } catch(e) {}
                    return res.json({ success: true, processedImage: "data:image/jpeg;base64," + base64Image });
                } else {
                    try { fs.unlinkSync(outputImage); } catch(e) {}
                    console.log(`⚠️ Попытка №${attempt}: Сервер занят, ждем...`);

                    if (attempt < 4) { 
                        setTimeout(() => makeRequest(attempt + 1), 20000); // Ждем 20 сек
                    } else {
                        res.status(500).json({ error: "Нейросеть перегружена. Попробуйте через 5 минут." });
                    }
                }
            });
        };

        makeRequest(1);
    });
};
