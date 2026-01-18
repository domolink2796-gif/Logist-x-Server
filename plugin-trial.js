module.exports = function(app, ctx) {
    const { readDatabase, saveDatabase, getOrCreateFolder, MERCH_ROOT_ID, MY_ROOT_ID, bot } = ctx;

    // СЮДА ВСТАВИТЬ ТВОЙ ID (цифрами, без кавычек)
    const MY_TELEGRAM_ID = 575405332940; 

    // 1. ЛОГИКА СОЗДАНИЯ ТЕСТОВОГО КЛЮЧА + УВЕДОМЛЕНИЕ
    app.post('/api/keys/add-trial', async (req, res) => {
        try {
            const { name, type } = req.body;
            let keys = await readDatabase();
            
            // Генерация ключа
            const trialKey = "TRIAL-" + Math.random().toString(36).substring(2, 7).toUpperCase();
            
            const exp = new Date();
            exp.setHours(exp.getHours() + 72); // Доступ на 3 дня

            // Выбор корня диска в зависимости от программы
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

            // ФОРМИРОВАНИЕ СООБЩЕНИЯ
            const projectTypeLabel = type === 'merch' ? '📊 MERCH_X' : '🚚 LOGIST_X';
            const msg = `🎁 **НОВЫЙ ТЕСТ-ДРАЙВ!**\n\n🏢 Объект: **${name}**\n🔑 Ключ: \`${trialKey}\` \n📦 Проект: ${projectTypeLabel}\n⏳ Срок: 3 дня`;
            
            // ОТПРАВКА УВЕДОМЛЕНИЯ
            try {
                if (MY_TELEGRAM_ID) {
                    await bot.telegram.sendMessage(MY_TELEGRAM_ID, msg, { parse_mode: 'Markdown' });
                }
            } catch (tgErr) {
                console.log("Ошибка отправки в TG. Проверь ID или запущен ли бот:", tgErr.message);
            }

            res.json({ success: true, key: trialKey });
        } catch (e) {
            console.error("Ошибка в add-trial:", e);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 2. ГЛОБАЛЬНЫЙ ПЕРЕХВАТ ИНТЕРФЕЙСА (Кнопка в админке)
    const express = require('express');
    const originalSend = express.response.send;

    express.response.send = function (body) {
        if (typeof body === 'string' && body.includes('ПАНЕЛЬ УПРАВЛЕНИЯ')) {
            const inject = `
            <div id="trial-float" style="position:fixed; top:80px; right:10px; z-index:99999;">
                <button onclick="addTrial()" style="background:#4ade80; color:#000; border:2px solid #fff; padding:12px; border-radius:12px; font-weight:900; box-shadow:0 5px 15px rgba(0,0,0,0.5); cursor:pointer;">🎁 ТЕСТ-ДРАЙВ</button>
            </div>
            <script>
                async function addTrial(){
                    const n = prompt('Название объекта для теста:');
                    if(!n) return;
                    
                    // Выбор типа при создании из админки
                    const t = confirm('Это проект MERCH_X? (ОК - Да, Отмена - LOGIST_X)') ? 'merch' : 'logist';
                    
                    const r = await fetch('/api/keys/add-trial',{
                        method:'POST',
                        headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({name: n, type: t})
                    });
                    const res = await r.json();
                    if(res.success) {
                        alert('Ключ создан: ' + res.key + ' (уведомление отправлено)');
                        if(typeof load === 'function') load();
                    }
                }
            </script>`;
            body = body.replace('</body>', inject + '</body>');
        }
        return originalSend.call(this, body);
    };

    console.log("🚀 ПЛАГИН ТЕСТ-ДРАЙВ: ГОТОВ К РАБОТЕ");
};
