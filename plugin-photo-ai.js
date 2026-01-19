module.exports = function(app, context) {
    // Твой новый ключ уже здесь
    const API_KEY = "AIzaSyDCp29_4e334f1F4YVuzXhsjY9ihDAOrcA";

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] Запрос получен. Пробиваем туннель через прокси...");
        try {
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });

            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            // Используем специальный шлюз-прокси, который скроет твой российский IP от Google
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`
            )}`;
            
            const { default: fetch } = await import('node-fetch');

            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: "Ты профессиональный ретушер. Инструкция: 1. Сделай фон идеально белым. 2. Одень мужчину на фото в темно-синий деловой костюм, белую рубашку и галстук. 3. Верни ТОЛЬКО base64 готового изображения." },
                            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                        ]
                    }]
                })
            });

            const data = await response.json();

            // Если прокси сработал, мы получим ответ от Google
            if (data.error) {
                console.error("❌ Ошибка Google через прокси:", JSON.stringify(data.error));
                return res.status(500).json({ success: false, error: data.error.message });
            }

            if (data.candidates && data.candidates[0].content) {
                let resultText = data.candidates[0].content.parts[0].text;
                // Очистка от лишних символов
                let finalBase64 = resultText.trim().replace(/```base64|```|data:image\/jpeg;base64,|data:image\/png;base64,/g, '').trim();

                console.log("✅ [AI] ПОБЕДА! Фото успешно обработано в обход блокировки.");
                res.json({ success: true, processedImage: `data:image/jpeg;base64,${finalBase64}` });
            } else {
                throw new Error("Пустой ответ от нейросети");
            }

        } catch (err) {
            console.error("❌ Критическая ошибка туннеля:", err.message);
            res.status(500).json({ success: false, error: "Ошибка связи с ИИ. Повторите попытку." });
        }
    });

    console.log("✅ МОДУЛЬ PHOTO-AI (РЕЖИМ ТУННЕЛЬ) АКТИВИРОВАН С НОВЫМ КЛЮЧОМ");
};
