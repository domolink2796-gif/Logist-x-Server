module.exports = function(app, context) {
    const API_KEY = "AIzaSyDCp29_4e334f1F4YVuzXhsjY9ihDAOrcA";

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запрос получен. Работаем через WARP туннель...");
        try {
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });

            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
            
            // Загружаем модули только в момент вызова, чтобы не злить Linter гитхаба
            const nodeFetch = await import('node-fetch');
            const fetch = nodeFetch.default;
            const socks = await import('socks-proxy-agent');
            const SocksProxyAgent = socks.SocksProxyAgent;
            
            // Настройка агента для твоего VPN (порт 40000)
            const agent = new SocksProxyAgent('socks5://127.0.0.1:40000');

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                agent: agent,
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: "Ты — профессиональный ИИ ретушер системы Logist_X. Инструкция: Сделай фон идеально белым. Одень мужчину на фото в темно-синий деловой костюм, белую рубашку и галстук. Верни ТОЛЬКО base64 код готового изображения." },
                            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                        ]
                    }]
                })
            });

            const data = await response.json();

            if (data.error) {
                console.error("❌ Ошибка Google:", data.error.message);
                return res.status(500).json({ success: false, error: data.error.message });
            }

            if (data.candidates && data.candidates[0].content) {
                let resultText = data.candidates[0].content.parts[0].text;
                let finalBase64 = resultText.trim().replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();

                console.log("✅ [AI] ФОТО ОБРАБОТАНО ЧЕРЕЗ VPN!");
                res.json({ success: true, processedImage: `data:image/jpeg;base64,${finalBase64}` });
            } else {
                throw new Error("Пустой ответ от нейросети");
            }

        } catch (err) {
            console.error("❌ Ошибка:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    console.log("✅ МОДУЛЬ PHOTO-AI (VPN-READY) ПОДКЛЮЧЕН");
};
