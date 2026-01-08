module.exports = function(app, ctx) {
    const { sheets, drive, readDatabase } = ctx;
    
    console.log("☀️ [DEBUG] Плагин СОЛНЦЕ: Жду данных от телефона...");

    app.post('/save-partial-stock', async (req, res) => {
        const { key, addr, item, userName } = req.body;
        
        // МАЯЧОК №1: Проверяем, пришел ли вообще запрос
        console.log(`📥 [СИГНАЛ] Получены данные: Магазин: ${addr}, Товар: ${item ? item.name : 'неизвестно'}`);

        try {
            const db = await readDatabase();
            const client = db.find(k => k.key === key);
            
            if (!client || !client.folderId) {
                console.log("❌ ОШИБКА: Не нашли папку клиента для ключа: " + key);
                return res.sendStatus(200);
            }

            const tableName = `ОСТАТКИ_МАГАЗИНОВ_${key}`;
            console.log(`🔎 Ищу таблицу "${tableName}" в папке ${client.folderId}`);

            const search = await drive.files.list({
                q: `'${client.folderId}' in parents and name = '${tableName}' and trashed = false`,
                fields: 'files(id)'
            });

            let tId = search.data.files.length > 0 ? search.data.files[0].id : null;

            if (!tId) {
                console.log("🔨 Таблицы нет. СОЗДАЮ новую...");
                const ss = await sheets.spreadsheets.create({ resource: { properties: { title: tableName } } });
                tId = ss.data.spreadsheetId;
                await drive.files.update({ fileId: tId, addParents: client.folderId, removeParents: 'root' });
                
                await sheets.spreadsheets.values.update({
                    spreadsheetId: tId, range: "Sheet1!A1:G1",
                    valueInputOption: "USER_ENTERED",
                    resource: { values: [["Магазин", "Штрихкод", "Товар", "Полка", "Склад", "Время", "Мерч"]] }
                });
                console.log("✅ Таблица успешно создана! ID: " + tId);
            }

            const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
            await sheets.spreadsheets.values.append({
                spreadsheetId: tId, range: "Sheet1!A:G",
                valueInputOption: "USER_ENTERED",
                resource: { values: [[addr, item.bc, item.name, item.shelf || 0, item.stock || 0, time, userName]] }
            });

            console.log(`🎉 ДАННЫЕ ЗАПИСАНЫ для ${item.name}`);
            res.sendStatus(200);
        } catch (e) {
            console.error("❌ КРИТИЧЕСКАЯ ОШИБКА В ПЛАГИНЕ:", e.message);
            res.sendStatus(200);
        }
    });
};
