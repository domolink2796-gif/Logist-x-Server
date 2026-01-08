const { google } = require('googleapis');

module.exports = function(app, ctx) {
    const { sheets, drive, readDatabase } = ctx;
    console.log("☀️ [OK] Плагин СОЛНЦЕ запущен и готов к работе");

    app.post('/save-partial-stock', async (req, res) => {
        try {
            const { key, addr, item, userName } = req.body;
            console.log(`📥 Запрос от ${userName}: ${item.name} (${addr})`);

            const db = await readDatabase();
            const client = db.find(k => k.key === key);
            let fId = client ? client.folderId : null;

            if (!fId) {
                const resList = await drive.files.list({
                    q: `name = '${key}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                    fields: 'files(id)'
                });
                if (resList.data.files.length > 0) fId = resList.data.files[0].id;
            }

            if (!fId) {
                console.log("❌ Папка не найдена, отправляем 200 чтобы не ронять телефон");
                return res.sendStatus(200); 
            }

            const name = `ОСТАТКИ_МАГАЗИНОВ_${key}`;
            const search = await drive.files.list({
                q: `'${fId}' in parents and name = '${name}' and trashed = false`,
                fields: 'files(id)'
            });

            let tId = search.data.files.length > 0 ? search.data.files[0].id : null;

            if (!tId) {
                const ss = await sheets.spreadsheets.create({ resource: { properties: { title: name } } });
                tId = ss.data.spreadsheetId;
                await drive.files.update({ fileId: tId, addParents: fId, removeParents: 'root' });
                await sheets.spreadsheets.values.update({
                    spreadsheetId: tId, range: "Sheet1!A1:G1",
                    valueInputOption: "USER_ENTERED",
                    resource: { values: [["Магазин", "Штрихкод", "Товар", "Полка", "Склад", "Время", "Мерч"]] }
                });
            }

            const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
            await sheets.spreadsheets.values.append({
                spreadsheetId: tId, range: "Sheet1!A:G",
                valueInputOption: "USER_ENTERED",
                resource: { values: [[addr, item.bc, item.name, item.shelf||0, item.stock||0, time, userName]] }
            });

            res.sendStatus(200);
        } catch (e) {
            console.error("⚠️ Ошибка плагина:", e.message);
            res.sendStatus(200); // Отвечаем OK в любом случае
        }
    });
};
