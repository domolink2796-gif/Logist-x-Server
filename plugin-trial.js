module.exports = function(app, ctx) {
    const { readDatabase, saveDatabase, getOrCreateFolder, MERCH_ROOT_ID, MY_ROOT_ID, bot } = ctx;

    // 1. ЛОГИКА СОЗДАНИЯ ТЕСТОВОГО КЛЮЧА + УВЕДОМЛЕНИЕ
    app.post('/api/keys/add-trial', async (req, res) => {
        try {
            const { name, type } = req.body;
            let keys = await readDatabase();
            const trialKey = "TRIAL-" + Math.random().toString(36).substring(2, 7).toUpperCase();
            
            const exp = new Date();
            exp.setHours(exp.getHours() + 72); // 3 дня

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

            // ОТПРАВКА УВЕДОМЛЕНИЯ ТЕБЕ В ТЕЛЕГРАМ
            const msg = `🎁 **НОВЫЙ ТЕСТ-ДРАЙВ!**\n\n🏢 Объект: ${name}\n🔑 Ключ: \`${trialKey}\` \n📦 Тип: ${type === 'merch' ? 'Мерчендайзинг' : 'Логистика'}\n⏳ Срок: 3 дня`;
            
            try {
                await bot.telegram.sendMessage(MY_TELEGRAM_ID, msg, { parse_mode: 'Markdown' });
            } catch (tgErr) {
                console.log("Ошибка отправки уведомления в TG:", tgErr.message);
            }

            res.json({ success: true, key: trialKey });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 2. ГЛОБАЛЬНЫЙ ПЕРЕХВАТ ИНТЕРФЕЙСА (ДЛЯ АДМИНКИ)
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
                    const r = await fetch('/api/keys/add-trial',{
                        method:'POST',
                        headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({name:n, type:'logist'})
                    });
                    const res = await r.json();
                    if(res.success) {
                        alert('Ключ создан: ' + res.key);
                        if(typeof load === 'function') load();
                    }
                }
            </script>`;
            body = body.replace('</body>', inject + '</body>');
        }
        return originalSend.call(this, body);
    };

    console.log("🚀 ПЛАГИН ТЕСТ-ДРАЙВ: РЕЖИМ С УВЕДОМЛЕНИЯМИ В TG");
};
