module.exports = function(app, ctx) {
    // Безопасное извлечение инструментов
    const { sheets, drive, readDatabase } = ctx;
    
    console.log("☀️ ПЛАГИН СОЛНЦЕ ЗАГРУЖЕН");

    // Маршрут для проверки, что плагин вообще работает
    app.get('/api/sun-status', (req, res) => {
        res.json({ status: "working", plugin: "sun" });
    });

    // Минимальный обработчик сохранения
    app.post('/save-partial-stock', async (req, res) => {
        try {
            const { key, addr, item, userName } = req.body;
            console.log(`📥 Данные получены: ${item.name} (${addr})`);
            // Просто отвечаем OK, чтобы проверить связь
            res.sendStatus(200);
        } catch (e) {
            console.error("Ошика в плагине:", e.message);
            res.status(500).send(e.message);
        }
    });
};
