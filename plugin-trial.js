module.exports = function(app, ctx) {
    const { readDatabase, saveDatabase, getOrCreateFolder, MERCH_ROOT_ID, MY_ROOT_ID } = ctx;

    // 1. API для создания ключа
    app.post('/api/keys/add-trial', async (req, res) => {
        try {
            const { name, type } = req.body;
            let keys = await readDatabase();
            const trialKey = "TRIAL-" + Math.random().toString(36).substring(2, 7).toUpperCase();
            const exp = new Date();
            exp.setHours(exp.getHours() + 72);
            const projR = (type === 'merch') ? MERCH_ROOT_ID : MY_ROOT_ID;
            const fId = await getOrCreateFolder(name + " (TRIAL)", projR);
            keys.push({
                key: trialKey, name: name + " [ТЕСТ]", limit: 2,
                expiry: exp.toISOString(), workers: [], ownerChatId: null,
                folderId: fId, type: type || 'logist', isTrial: true
            });
            await saveDatabase(keys);
            res.json({ success: true, key: trialKey });
        } catch (e) { res.status(500).json({ success: false }); }
    });

    // 2. ГЛОБАЛЬНЫЙ ПЕРЕХВАТ (Force Injection)
    // Мы заменяем метод send у прототипа ответа Express
    const express = require('express');
    const originalSend = express.response.send;

    express.response.send = function (body) {
        // Проверяем, что это HTML и мы на нужной странице
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
                        location.reload();
                    }
                }
            </script>`;
            body = body.replace('</body>', inject + '</body>');
        }
        return originalSend.call(this, body);
    };

    console.log("🚀 ПЛАГИН ТЕСТ-ДРАЙВ: ГЛОБАЛЬНЫЙ ФОРСИРОВАННЫЙ РЕЖИМ");
};
