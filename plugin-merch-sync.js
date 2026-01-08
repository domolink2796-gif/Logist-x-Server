module.exports = function(app, db) {
    // Используем db, который уже есть в твоем основном server.js
    console.log("📦 Серверный плагин: Синхронизация через базу данных активна");

    // 1. Прием данных (Катя сохраняет)
    app.post('/save-partial-stock', async (req, res) => {
        const { key, addr, item } = req.body;
        if (!key || !addr || !item) return res.sendStatus(400);

        try {
            // Записываем в таблицу, где хранятся текущие остатки
            // Если такой товар уже был для этого магазина — обновляем цифры
            await db.query(`
                INSERT INTO shop_stocks (lic_key, address, barcode, name, shelf, stock)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (lic_key, address, barcode) 
                DO UPDATE SET shelf = $5, stock = $6
            `, [key, addr, item.bc, item.name, item.shelf, item.stock]);

            res.sendStatus(200);
        } catch (e) {
            console.error("Ошибка сохранения в БД:", e);
            res.sendStatus(500);
        }
    });

    // 2. Раздача данных (Ваня забирает)
    app.get('/get-shop-stock', async (req, res) => {
        const { key, addr } = req.query;
        if (!key || !addr) return res.json([]);

        try {
            const result = await db.query(
                "SELECT barcode as bc, name, shelf, stock FROM shop_stocks WHERE lic_key = $1 AND address = $2",
                [key, addr]
            );
            res.json(result.rows);
        } catch (e) {
            res.json([]);
        }
    });
};
