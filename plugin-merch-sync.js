module.exports = function(app, googleSheets, auth) {
    console.log("🚀 Серверный плагин: Индивидуальные таблицы остатков активны");

    // Память сервера, чтобы не искать ID таблицы в Google каждый раз
    let clientTables = {}; 

    // Функция поиска или создания таблицы для клиента
    async function getClientTable(key) {
        if (clientTables[key]) return clientTables[key];

        const fileName = `STOCKS_STORAGE_${key}`;
        try {
            // Ищем файл на диске
            const drive = google.drive({ version: 'v3', auth });
            const response = await drive.files.list({
                q: `name = '${fileName}' and mimeType = 'application/vnd.google-apps.spreadsheet'`,
                fields: 'files(id, name)',
            });

            if (response.data.files.length > 0) {
                clientTables[key] = response.data.files[0].id;
            } else {
                // Создаем новую таблицу, если не нашли
                const spreadsheet = await googleSheets.spreadsheets.create({
                    resource: { properties: { title: fileName } },
                    fields: 'spreadsheetId',
                });
                const newId = spreadsheet.data.spreadsheetId;
                
                // Создаем заголовки в новой таблице
                await googleSheets.spreadsheets.values.update({
                    spreadsheetId: newId,
                    range: "Sheet1!A1:F1",
                    valueInputOption: "USER_ENTERED",
                    resource: { values: [["address", "bc", "name", "shelf", "stock", "last_update"]] }
                });
                
                clientTables[key] = newId;
                console.log(`✨ Создана новая таблица для клиента ${key}: ${newId}`);
            }
            return clientTables[key];
        } catch (e) { console.error("Ошибка Диска:", e); return null; }
    }

    // ПРИЕМ ДАННЫХ
    app.post('/save-partial-stock', async (req, res) => {
        const { key, addr, item } = req.body;
        const tableId = await getClientTable(key);
        if (!tableId) return res.sendStatus(500);

        try {
            // Добавляем запись: Адрес, Штрихкод, Имя, Полка, Склад, Время
            await googleSheets.spreadsheets.values.append({
                spreadsheetId: tableId,
                range: "Sheet1!A:F",
                valueInputOption: "USER_ENTERED",
                resource: { values: [[addr, item.bc, item.name, item.shelf, item.stock, new Date().toISOString()]] }
            });
            res.sendStatus(200);
        } catch (e) { res.sendStatus(500); }
    });

    // ВЫДАЧА ДАННЫХ (для Кати, Вани и др.)
    app.get('/get-shop-stock', async (req, res) => {
        const { key, addr } = req.query;
        const tableId = await getClientTable(key);
        if (!tableId) return res.json([]);

        try {
            const result = await googleSheets.spreadsheets.values.get({
                spreadsheetId: tableId,
                range: "Sheet1!A:F",
            });
            const rows = result.data.values || [];
            const filtered = rows.filter(r => r[0] === addr);
            
            // Берем только самое последнее состояние каждого товара
            const lastState = {};
            filtered.forEach(r => {
                lastState[r[1]] = { bc: r[1], name: r[2], shelf: r[3], stock: r[4] };
            });
            res.json(Object.values(lastState));
        } catch (e) { res.json([]); }
    });
};
