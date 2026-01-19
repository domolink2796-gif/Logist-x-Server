module.exports = function(app, context) {
    const API_KEY = "AIzaSyDCp29_4e334f1F4YVuzXhsjY9ihDAOrcA";

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запрос получен. Работаем через WARP туннель...");
        try {
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });

            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            // Стабильный адрес Google
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
            
            const { default: fetch } = await import('node-fetch');
            // Подключаем агент для работы через наш туннель (SOCKS5)
            const { SocksProxyAgent } = await import('socks-proxy-agent');
            const agent = new SocksProxyAgent('socks5://127.0.0.1:40000');

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                agent: agent, // ВОТ ОНО! Теперь запрос идет через VPN
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: "Инструкция: Сделай фон идеально белым. Одень человека на фото в темно-синий мужской деловой костюм, белую рубашку и галстук. Верни ТОЛЬКО base64 готового изображения без лишнего текста." },
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

                console.log("✅ [AI] ПОБЕДА! Туннель пробит, фото обработано.");
                res.json({ success: true, processedImage: `data:image/jpeg;base64,${finalBase64}` });
            } else {
                throw new Error("Пустой ответ от нейросети");
            }

        } catch (err) {
            console.error("❌ Ошибка в туннеле:", err.message);
            res.status(500).json({ success: false, error: "Нужно установить модуль агента. Введи: npm install socks-proxy-agent" });
        }
    });

    console.log("✅ МОДУЛЬ PHOTO-AI (WARP TUNNEL) ПОДКЛЮЧЕН");
};
