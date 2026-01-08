const { google } = require('googleapis');

module.exports = function(app, ctx) {
    // Достаем инструменты из контекста сервера
    const { sheets, drive, readDatabase } = ctx;
    console.log("🚀 Серверный плагин: ЖИВАЯ ТАБЛИЦА подключен");

    // 1. Функция поиска или создания таблицы в папке клиента
    async function getTable(key) {
        try {
            // Читаем базу ключей, чтобы найти folderId (папку клиента)
            const keys = await readDatabase();
            const kData = keys.find(k => k.key === key);
            
            if (!kData || !kData.folderId) {
                console.log(`⚠️ Для ключа ${key} не найдена папка на Диске`);
                return null;
            }

            // Имя таблицы уникально для клиента
            const name = `ОСТАТКИ_МАГАЗИНОВ_${key}`;
            
            // Ищем, есть ли уже такая таблица в этой папке
            const q = `'${kData.folderId}' in parents and name = '${name}' and trashed = false`;
            const search = await drive.files.list({ q, fields: 'files(id)' });

            if (search.data.files && search.data.files.length > 0) {
                // Если есть - возвращаем её ID
                return search.data.files[0].id;
            }

            // Если нет - создаем новую
            console.log(`🔨 Создаю новую таблицу остатков для: ${key}`);
            const ss = await sheets.spreadsheets.create({
                resource: { properties: { title: name } }
            });
            const id = ss.data.spreadsheetId;

            // Перемещаем таблицу в папку клиента
            await drive.files.update({ fileId: id, addParents: kData.folderId, removeParents: 'root' });
            // Даем права на запись
            await drive.permissions.create({ fileId: id, resource: { type: 'anyone', role: 'writer' } });

            // Создаем заголовки
            await sheets.spreadsheets.values.update({
                spreadsheetId: id, range: "Sheet1!A1:G1",
                valueInputOption: "USER_ENTERED",
                resource: { values: [["Магазин", "Штрихкод", "Товар", "Полка (шт)", "Склад (шт)", "Время", "Мерч"]] }
            });

            return id;
        } catch (e) { 
            console.error("❌ Ошибка при работе с таблицей:", e.message); 
            return null; 
        }
    }

    // 2. МАРШРУТ: Сохранение (когда Маша меняет цифру)
    app.post('/save-partial-stock', async (req, res) => {
        const { key, addr, item, userName } = req.body;
        // item содержит: { bc: "...", name: "...", shelf: 5, stock: 20 }
        
        console.log(`📥 Обновление: ${addr} -> ${item.name} (${item.shelf}/${item.stock})`);
        
        const tId = await getTable(key);
        if (!tId) return res.status(500).send("Нет таблицы");

        try {
            // Читаем всю таблицу, чтобы найти нужную строку
            const getRes = await sheets.spreadsheets.values.get({ spreadsheetId: tId, range: "Sheet1!A:G" });
            const rows = getRes.data.values || [];
            
            // Ищем строку, где совпадает и АДРЕС, и ШТРИХКОД
            const rowIndex = rows.findIndex(r => r[0] === addr && r[1] === item.bc);
            
            const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
            
            // Формируем строку данных
            const newRow = [
                addr, 
                item.bc, 
                item.name, 
                item.shelf || 0, 
                item.stock || 0, 
                timestamp, 
                userName || 'Мерч'
            ];

            if (rowIndex !== -1) {
                // Если товар уже был - ОБНОВЛЯЕМ строку (rowIndex + 1, т.к. в Sheets отсчет с 1)
                await sheets.spreadsheets.values.update({
                    spreadsheetId: tId, range: `Sheet1!A${rowIndex + 1}:G${rowIndex + 1}`,
                    valueInputOption: "USER_ENTERED", resource: { values: [newRow] }
                });
            } else {
                // Если товара не было - ДОБАВЛЯЕМ новую строку в конец
                await sheets.spreadsheets.values.append({
                    spreadsheetId: tId, range: "Sheet1!A:G",
                    valueInputOption: "USER_ENTERED", resource: { values: [newRow] }
                });
            }
            res.sendStatus(200);
        } catch (e) { 
            console.error(e);
            res.sendStatus(500); 
        }
    });

    // 3. МАРШРУТ: Получение (когда Петя заходит в магазин)
    app.get('/get-shop-stock', async (req, res) => {
        const { key, addr } = req.query;
        console.log(`📤 Запрос остатков для: ${addr}`);

        const tId = await getTable(key);
        if (!tId) return res.json([]); // Если таблицы нет, отдаем пустой список

        try {
            const result = await sheets.spreadsheets.values.get({ spreadsheetId: tId, range: "Sheet1!A:G" });
            const rows = result.data.values || [];
            
            // Фильтруем: берем только строки для ТЕКУЩЕГО магазина (addr)
            const filtered = rows.slice(1).filter(r => r[0] === addr);
            
            // Превращаем строки таблицы обратно в понятный приложению JSON
            // ВАЖНО: parseInt делает из текста цифры!
            const responseData = filtered.map(r => ({ 
                bc: r[1], 
                name: r[2], 
                shelf: parseInt(r[3]) || 0, 
                stock: parseInt(r[4]) || 0 
            }));

            res.json(responseData);
        } catch (e) { 
            console.error(e);
            res.json([]); 
        }
    });
};
