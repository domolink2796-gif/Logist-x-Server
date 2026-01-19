module.exports = function(app, context) {
    const API_KEY = "AIzaSyC_paJdUz25HtozDaB-TrN7iZsHjh9EwT0"; // Твой ключ

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("📥 [AI] ЗАПУСК ДИАГНОСТИКИ (ListModels)...");
        
        const { SocksProxyAgent } = require('socks-proxy-agent');
        const agent = new SocksProxyAgent('socks5://127.0.0.1:40000');

        try {
            // 1. Спрашиваем у Google список доступных моделей
            const listUrl = "https://generativelanguage.googleapis.com/v1beta/models?key=" + API_KEY;
            
            const listResponse = await fetch(listUrl, {
                method: 'GET',
                agent: agent
            });

            const listData = await listResponse.json();

            // ВЫВОДИМ СПИСОК В ЛОГ
            if (listData.models) {
                console.log("📋 [AI] СПИСОК ДОСТУПНЫХ МОДЕЛЕЙ:");
                listData.models.forEach(m => console.log("   👉 " + m.name));
            } else {
                console.error("❌ [AI] Список моделей ПУСТ или ОШИБКА:", JSON.stringify(listData));
            }

            // 2. Если есть Gemini Flash, пробуем её использовать
            const { image } = req.body;
            if (!image) return res.status(400).json({ error: "Нет фото" });
            
            // Пробуем самый стандартный путь после проверки
            const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + API_KEY;
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                agent: agent,
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: "Тест. Верни просто слово OK." },
                            { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                        ]
                    }]
                })
            });
            
            const data = await response.json();
            if (data.error) {
                console.error("❌ Ошибка генерации:", data.error.message);
                res.status(500).json({ error: data.error.message, models: listData });
            } else {
                console.log("✅ [AI] Генерация прошла успешно!");
                res.json({ success: true, processedImage: image }); // Возвращаем то же фото для теста
            }

        } catch (err) {
            console.error("❌ Сбой диагностики:", err.message);
            res.status(500).json({ error: err.message });
        }
    });

    console.log("✅ МОДУЛЬ-СКАНЕР ПОДКЛЮЧЕН");
};
