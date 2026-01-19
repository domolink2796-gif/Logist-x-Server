module.exports = function(app, context) {
    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запуск (Hugging Face - Прямое соединение)...");
        
        const fs = require('fs');
        const path = require('path');
        const { exec } = require('child_process');

        try {
            const keyPath = '/root/my-system/ai-key.txt';
            if (!fs.existsSync(keyPath)) return res.status(500).json({ error: "Ключ не найден" });
            const HF_TOKEN = fs.readFileSync(keyPath, 'utf8').trim();

            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            // Используем проверенную модель напрямую
            const MODEL = "Qwen/Qwen2-VL-7B-Instruct"; 

            const payload = {
                inputs: {
                    image: base64Data,
                    question: "Сделай фон белым. Одень человека в темно-синий мужской костюм, белую рубашку и галстук. Верни ТОЛЬКО чистый base64."
                }
            };

            const tempFile = path.join(__dirname, `hf_req_${Date.now()}.json`);
            fs.writeFileSync(tempFile, JSON.stringify(payload));

            // ПРЯМАЯ ССЫЛКА НА МОДЕЛЬ (самый надежный способ)
            const cmd = `curl -s -X POST https://api-inference.huggingface.co/models/${MODEL} \
              -H "Authorization: Bearer ${HF_TOKEN}" \
              -H "Content-Type: application/json" \
              -d @${tempFile}`;

            exec(cmd, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout) => {
                try { fs.unlinkSync(tempFile); } catch(e) {}
                
                if (error) return res.status(500).json({ error: "Ошибка сети" });

                try {
                    const data = JSON.parse(stdout);
                    
                    // У HF прямой ответ может быть картинкой или текстом
                    let content = "";
                    if (Array.isArray(data) && data[0].generated_text) content = data[0].generated_text;
                    else if (data.generated_text) content = data.generated_text;
                    else if (typeof data === 'string') content = data;
                    else content = JSON.stringify(data);

                    if (content.length > 100) {
                        let finalBase64 = content.replace(/```base64|```|data:image\/\w+;base64,|data:image\/png;base64,/g, '').trim();
                        console.log("✅ [AI] ФОТО ГОТОВО!");
                        res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
                    } else {
                        console.error("❌ Недостаточно данных в ответе:", stdout);
                        res.status(500).json({ error: "Модель загружается, подождите 20 секунд" });
                    }
                } catch (e) {
                    console.error("❌ Ошибка разбора:", stdout);
                    res.status(500).json({ error: "Ошибка сервера AI" });
                }
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
};
