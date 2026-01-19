module.exports = function(app, context) {
    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запуск (Hugging Face - НОВЫЙ ROUTER)...");
        
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

            const MODEL = "Qwen/Qwen2.5-VL-72B-Instruct"; 

            const payload = {
                model: MODEL,
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: "Сделай фон идеально белым. Одень человека в темно-синий мужской деловой костюм, белую рубашку и галстук. Верни ТОЛЬКО чистый base64 код изображения." },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
                    ]
                }],
                max_tokens: 3000
            };

            const tempFile = path.join(__dirname, `hf_req_${Date.now()}.json`);
            fs.writeFileSync(tempFile, JSON.stringify(payload));

            // ИСПОЛЬЗУЕМ НОВЫЙ АДРЕС ROUTER.HUGGINGFACE.CO
            const cmd = `curl -s -X POST https://router.huggingface.co/hf-inference/v1/chat/completions \
              -H "Authorization: Bearer ${HF_TOKEN}" \
              -H "Content-Type: application/json" \
              -d @${tempFile}`;

            exec(cmd, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout) => {
                try { fs.unlinkSync(tempFile); } catch(e) {}
                if (error) return res.status(500).json({ error: "Ошибка CURL" });

                try {
                    const data = JSON.parse(stdout);
                    if (data.choices && data.choices[0]) {
                        let content = data.choices[0].message.content;
                        let finalBase64 = content.replace(/```base64|```|data:image\/\w+;base64,|data:image\/png;base64,/g, '').trim();
                        console.log("✅ [AI] ФОТО ГОТОВО! (Новый Router)");
                        res.json({ success: true, processedImage: "data:image/jpeg;base64," + finalBase64 });
                    } else {
                        console.error("❌ Ответ API:", stdout);
                        res.status(500).json({ error: "Ошибка модели или перегрузка" });
                    }
                } catch (e) {
                    console.error("❌ Ошибка JSON:", stdout);
                    res.status(500).json({ error: "Ошибка обработки API" });
                }
            });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
};
