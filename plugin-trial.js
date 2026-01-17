module.exports = function(app, ctx) {
    const { readDatabase, saveDatabase, getOrCreateFolder, MERCH_ROOT_ID, MY_ROOT_ID } = ctx;

    // 1. ЛОГИКА СОЗДАНИЯ КЛЮЧА
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
            res.json({ success: true, key: trialKey });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 2. УЛУЧШЕННОЕ ВНЕДРЕНИЕ КНОПКИ (РАБОТАЕТ В TG И БРАУЗЕРЕ)
    app.use('/dashboard', (req, res, next) => {
        const send = res.send;
        res.send = function (body) {
            if (typeof body === 'string' && body.includes('</body>')) {
                // Скрипт, который найдет блок создания ключа и добавит туда кнопку программно
                const injection = `
                <script>
                    (function() {
                        const checkExist = setInterval(function() {
                           const container = document.querySelector('.card'); // Ищем первую карточку (добавление объекта)
                           if (container && container.innerHTML.includes('add()')) {
                              const trialBtn = document.createElement('button');
                              trialBtn.className = 'btn';
                              trialBtn.style.background = '#4ade80';
                              trialBtn.style.color = '#000';
                              trialBtn.style.marginTop = '10px';
                              trialBtn.innerHTML = '🎁 СОЗДАТЬ ТЕСТ-ДРАЙВ (3 ДНЯ)';
                              trialBtn.onclick = async () => {
                                  const n = document.getElementById('n').value;
                                  const t = document.getElementById('t').value;
                                  if(!n) return alert('Введите имя объекта');
                                  const r = await fetch('/api/keys/add-trial',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,type:t})});
                                  const resData = await r.json();
                                  if(resData.success) alert('Тестовый ключ создан: ' + resData.key);
                                  load();
                              };
                              container.appendChild(trialBtn);
                              clearInterval(checkExist);
                           }
                        }, 100);
                    })();
                </script>
                `;
                body = body.replace('</body>', injection + '</body>');
            }
            send.call(this, body);
        };
        next();
    });

    console.log("✅ ПЛАГИН ТЕСТ-ДРАЙВ (УНИВЕРСАЛЬНЫЙ) ПОДКЛЮЧЕН");
};
