module.exports = function(app, context) {
    const API_KEY = "AIzaSyAWSlp-5uEKSR_v_LaClqCvKMfi5nXmAJY";

    app.post('/api/photo-ai-process', async (req, res) => {
        console.log("🔍 [DIAGNOSTIC] Проверяю доступность ключа и моделей...");
        try {
            const { default: fetch } = await import('node-fetch');
            
            // Запрашиваем список всех доступных моделей для этого ключа
            const checkUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
            const response = await fetch(checkUrl);
            const data = await response.json();

            if (data.error) {
                console.error("❌ КЛЮЧ НЕ РАБОТАЕТ:", JSON.stringify(data.error));
                return res.status(500).json({ success: false, error: "Проблема с ключом: " + data.error.message });
            }

            // Выводим список моделей в консоль сервера
            console.log("✅ ДОСТУПНЫЕ МОДЕЛИ ДЛЯ ЭТОГО КЛЮЧА:");
            if (data.models) {
                data.models.forEach(m => console.log(` - ${m.name}`));
            } else {
                console.log("⚠️ Ключ рабочий, но моделей не найдено.");
            }

            res.json({ success: false, info: "Диагностика завершена, проверь логи сервера." });

        } catch (err) {
            console.error("❌ Ошибка диагностики:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    console.log("✅ МОДУЛЬ ДИАГНОСТИКИ ПОДКЛЮЧЕН");
};
