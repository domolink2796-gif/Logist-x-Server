module.exports = function(app, ctx) {
    const { readDatabase, saveDatabase, getOrCreateFolder, MERCH_ROOT_ID, MY_ROOT_ID } = ctx;

    // 1. ЛОГИКА СОЗДАНИЯ КЛЮЧА
    app.post('/api/keys/add-trial', async (req, res) => {
        try {
            const { name, type } = req.body;
            let keys = await readDatabase();
            const trialKey = "TRIAL-" + Math.random().toString(36).substring(2, 7).toUpperCase();
            
            const exp = new Date();
            exp.setHours(exp.getHours() + 72); // Ровно 3 дня

            const projectRoot = (type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
            const fId = await getOrCreateFolder(name + " (TRIAL)", projectRoot);

            keys.push({
                key: trialKey,
                name: name + " [ТЕСТ]",
                limit: 2, 
                expiry: exp.toISOString(),
                workers: [],
                ownerChatId: null,
                folderId: fId,
                type: type || 'logist',
                isTrial: true
            });

            await saveDatabase(keys);
            res.json({ success: true, key: trialKey });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 2. ВНЕДРЕНИЕ КНОПКИ В ТВОЙ ИНТЕРФЕЙС (MAGIC INJECTION)
    // Мы перехватываем ответ от /dashboard и добавляем кнопку программно
    app.use('/dashboard', (req, res, next) => {
        const send = res.send;
        res.send = function (body) {
            if (typeof body === 'string' && body.includes('add()')) {
                // Вставляем кнопку рядом с основной
                let modified = body.replace(
                    'onclick="add()">СОЗДАТЬ КЛЮЧ</button>',
                    'onclick="add()">СОЗДАТЬ КЛЮЧ</button><button class="btn" style="background:#4ade80; color:#000; margin-top:10px;" onclick="addTrial()">🎁 ТЕСТ-ДРАЙВ (3 ДНЯ)</button>'
                );
                // Вставляем JS функцию для работы кнопки
                modified = modified.replace(
                    'load();',
                    `load(); 
                    window.addTrial = async () => {
                        const n = document.getElementById('n').value;
                        const t = document.getElementById('t').value;
                        if(!n) return alert('Введите имя объекта');
                        const r = await fetch('/api/keys/add-trial',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,type:t})});
                        const resData = await r.json();
                        if(resData.success) alert('Тестовый ключ: ' + resData.key);
                        load();
                    };`
                );
                body = modified;
            }
            send.call(this, body);
        };
        next();
    });

    console.log("✅ ПЛАГИН ТЕСТ-ДРАЙВ С АВТО-КНОПКОЙ ПОДКЛЮЧЕН");
};
