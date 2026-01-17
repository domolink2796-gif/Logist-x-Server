module.exports = function(app, ctx) {
    const { readDatabase, saveDatabase, getOrCreateFolder, MERCH_ROOT_ID, MY_ROOT_ID } = ctx;

    // Эндпоинт для создания тестового ключа
    app.post('/api/keys/add-trial', async (req, res) => {
        try {
            const { name, type } = req.body;
            let keys = await readDatabase();

            // Генерируем ключ с префиксом TRIAL
            const trialKey = "TRIAL-" + Math.random().toString(36).substring(2, 7).toUpperCase();
            
            // Устанавливаем срок на 3 дня (72 часа)
            const exp = new Date();
            exp.setHours(exp.getHours() + 72);

            const projectRoot = (type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
            const fId = await getOrCreateFolder(name + " (TRIAL)", projectRoot);

            const newTrial = {
                key: trialKey,
                name: name + " [ТЕСТ]",
                limit: 2, // Ограничение для теста
                expiry: exp.toISOString(),
                workers: [],
                ownerChatId: null,
                folderId: fId,
                type: type || 'logist',
                isTrial: true // Метка, что это тест
            };

            keys.push(newTrial);
            await saveDatabase(keys);

            res.json({ success: true, key: trialKey });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    console.log("✅ ПЛАГИН ТЕСТ-ДРАЙВ (TRIAL) ПОДКЛЮЧЕН");
};
