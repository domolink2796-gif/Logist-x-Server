module.exports = function(app, ctx) {
    console.log("☀️ ПЛАГИН СОЛНЦЕ: В режиме ожидания");

    app.post('/save-partial-stock', async (req, res) => {
        console.log("📥 Запрос получен, но запись в таблицы временно отключена для теста");
        res.sendStatus(200);
    });
};
