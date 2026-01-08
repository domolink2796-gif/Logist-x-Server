module.exports = function(app, ctx) {
    const { sheets, drive, readDatabase } = ctx;
    
    console.log("☀️ [DEBUG] Плагин СОЛНЦЕ: Система памяти активирована!");

    app.post('/save-partial-stock', async (req, res) => {
        try {
            const { key, addr, item, userName } = req.body;
            if (!key || !addr || !item) return res.sendStatus(200);

            let finalName = item.name || `Товар ${item.bc}`;
            console.log(`📥 [СИГНАЛ] Магазин: ${addr}, Товар: ${finalName}`);

            const db = await readDatabase();
            const client = db.find(k => k.key === key);
            if (!client || !client.folderId) return res.sendStatus(200);

            const tableName = `ОСТАТКИ_МАГАЗИНОВ_${key}`;
            const search = await drive.files.list({ 
                q: `'${client.folderId}' in parents and name = '${tableName}' and trashed = false`,
                fields: 'files(id, name)'
            });
            
            let tId = search.data.files.length > 0 ? search.data.files[0].id : null;

            // 1. ЕСЛИ ТАБЛИЦЫ НЕТ - СОЗДАЕМ И СРАЗУ ПИШЕМ ШАПКУ
            if (!tId) {
                console.log("🛠 Создаю новую таблицу и записываю заголовки...");
                const ss = await sheets.spreadsheets.create({ 
                    resource: { properties: { title: tableName } } 
                });
                tId = ss.data.spreadsheetId;
                
                // Перемещаем в папку клиента
                await drive.files.update({ fileId: tId, addParents: client.folderId, removeParents: 'root' });

                // ПИШЕМ ШАПКУ (используем индекс листа 0, чтобы не зависеть от имени Sheet1/Лист1)
                await sheets.spreadsheets.values.update({
                    spreadsheetId: tId, 
                    range: "A1:G1", // Убрали Sheet1!
                    valueInputOption: "USER_ENTERED",
                    resource: { values: [["Магазин", "Штрихкод", "Товар", "Полка", "Склад", "Обновлено", "Мерч"]] }
                });
            }

            // 2. ПОЛУЧАЕМ ДАННЫЕ ДЛЯ ПРОВЕРКИ СУЩЕСТВУЮЩЕЙ СТРОКИ
            const result = await sheets.spreadsheets.values.get({ 
                spreadsheetId: tId, 
                range: "A:G" 
            });
            const rows = result.data.values || [];
            
            // Ищем строку по Адресу (колонка A) и Штрихкоду (колонка B)
            const rowIndex = rows.findIndex(r => r[0] === addr && String(r[1]) === String(item.bc));
            
            const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
            const newValues = [
                addr, 
                String(item.bc), 
                finalName, 
                item.shelf || 0, 
                item.stock || 0, 
                time, 
                userName || "Мерчендайзер"
            ];

            if (rowIndex !== -1) {
                // ОБНОВЛЯЕМ
                await sheets.spreadsheets.values.update({
                    spreadsheetId: tId, 
                    range: `A${rowIndex + 1}:G${rowIndex + 1}`,
                    valueInputOption: "USER_ENTERED", 
                    resource: { values: [newValues] }
                });
                console.log("✅ Данные обновлены в строке " + (rowIndex + 1));
            } else {
                // ДОБАВЛЯЕМ НОВУЮ
                await sheets.spreadsheets.values.append({
                    spreadsheetId: tId, 
                    range: "A:G",
                    valueInputOption: "USER_ENTERED", 
                    resource: { values: [newValues] }
                });
                console.log("➕ Добавлена новая строка");
            }

            res.sendStatus(200);
        } catch (e) { 
            console.error("❌ ОШИБКА ПЛАГИНА:", e);
            res.sendStatus(200); 
        }
    });

    // --- ПЕРЕДАЧА ДАННЫХ В ТЕЛЕФОН ---
    app.get('/get-shop-stock', async (req, res) => {
        try {
            const { key, addr } = req.query;
            const db = await readDatabase();
            const client = db.find(k => k.key === key);
            if (!client || !client.folderId) return res.json([]);

            const tableName = `ОСТАТКИ_МАГАЗИНОВ_${key}`;
            const search = await drive.files.list({ q: `'${client.folderId}' in parents and name = '${tableName}' and trashed = false` });
            if (search.data.files.length === 0) return res.json([]);

            const tId = search.data.files[0].id;
            const result = await sheets.spreadsheets.values.get({ spreadsheetId: tId, range: "A:G" });
            const rows = result.data.values || [];

            const shopItems = rows.slice(1)
                .filter(r => r[0] === addr)
                .map(r => ({ bc: r[1], name: r[2], shelf: r[3], stock: r[4] }));

            res.json(shopItems);
        } catch (e) { res.json([]); }
    });
};
