/**
 * =========================================================================================
 * TITANIUM X-PLATFORM v130.1 | THE HYPER-MONOLITH MASTER CORE
 * -----------------------------------------------------------------------------------------
 * ИСПРАВЛЕНИЕ: Синхронизация API и путей маршрутизации
 * =========================================================================================
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const LOGO_URL = "https://raw.githubusercontent.com/domolink2796-gif/Logist-x-Server/main/logo.png";

module.exports = function(app, context) {
    // Проверка наличия необходимых инструментов из server.js
    const { 
        drive, google, MY_ROOT_ID, MERCH_ROOT_ID, 
        readDatabase, saveDatabase
    } = context;

    if (!drive) {
        console.error("❌ CRITICAL: Google Drive instance is missing in context!");
    }

    const upload = multer({ 
        dest: 'uploads/',
        limits: { fileSize: 500 * 1024 * 1024 }
    });

    // --- НЕЙРОННЫЙ ДВИЖОК (БЕЗ ИЗМЕНЕНИЙ ЛОГИКИ) ---
    async function xNeuralProcess(file, pId, action) {
        try {
            const memoryPath = path.join(__dirname, 'server_memory.json');
            let db = [];
            if (fs.existsSync(memoryPath)) {
                try {
                    const raw = fs.readFileSync(memoryPath, 'utf8');
                    db = raw ? JSON.parse(raw) : [];
                } catch(e) { db = []; }
            }
            const keys = (typeof readDatabase === 'function') ? await readDatabase() : [];
            const owner = keys.find(k => k.folderId === pId || k.folderId === file.id);
            const n = file.name || "UNNAMED_ASSET";
            
            let addr = { street: null, house: null, block: null, ent: null, fl: null };
            const reg = /([^0-9_]+)\s*(\d+)\s*(?:к|корп|корпус)?\s*(\d+)?\s*(?:п|под|подъезд|эт|этаж)?\s*(\d+)?\s*(?:эт|этаж)?\s*(\d+)?/i;
            const m = n.match(reg);
            
            if (m) {
                addr.street = m[1].trim();
                addr.house = m[2];
                addr.block = m[3] || null;
                addr.ent = m[4] || "1";
                addr.fl = m[5] || null;
            }

            const record = {
                v: "130.1",
                ts: new Date().toISOString(),
                event: action,
                item: { id: file.id, name: n, mime: file.mimeType },
                brain: { project: owner ? owner.type : 'manual', addr: addr }
            };

            db.push(record);
            if (db.length > 1000) db.shift();
            fs.writeFileSync(memoryPath, JSON.stringify(db, null, 2));
        } catch (e) { console.error("🧠 X-NEURAL ERROR:", e.message); }
    }

    // --- ИНТЕРФЕЙС (ИСПРАВЛЕНЫ ПУТИ ЗАПРОСОВ) ---
    const UI = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>X-PLATFORM TITAN</title>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@700&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { --b: #050505; --g: #f0b90b; --s: #ffffff; --t: #1a1a1b; --gr: #5f6368; --bl: #1a73e8; --br: #dadce0; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; }
        body, html { height: 100%; width: 100%; font-family: 'Roboto', sans-serif; background: #fff; overflow: hidden; position: fixed; }
        header { height: 75px; background: var(--b); border-bottom: 5px solid var(--g); display: flex; align-items: center; justify-content: space-between; padding: 0 25px; color: #fff; padding-top: env(safe-area-inset-top); }
        .logo { display: flex; align-items: center; gap: 15px; }
        .logo img { height: 48px; border-radius: 12px; filter: drop-shadow(0 0 10px var(--g)); }
        .shell { display: flex; height: calc(100% - 75px); width: 100%; }
        aside { width: 300px; background: #fff; border-right: 1px solid var(--br); display: flex; flex-direction: column; padding: 25px 0; transition: 0.4s; z-index: 4000; }
        @media (max-width: 768px) { aside { position: absolute; left: -300px; height: 100%; box-shadow: 20px 0 60px rgba(0,0,0,0.3); } aside.open { left: 0; } }
        .nav-link { height: 56px; margin: 4px 18px; border-radius: 28px; display: flex; align-items: center; padding: 0 25px; cursor: pointer; font-weight: 500; }
        .nav-link i { width: 40px; font-size: 22px; color: var(--gr); }
        .nav-link.active { background: #e8f0fe; color: var(--bl); }
        main { flex: 1; overflow-y: auto; background: #fff; }
        .toolbar { height: 70px; border-bottom: 1px solid var(--br); display: flex; align-items: center; padding: 0 25px; position: sticky; top: 0; background: #fff; z-index: 10; }
        .grid { width: 100%; border-collapse: collapse; }
        .grid td { padding: 20px; border-bottom: 1px solid #f5f5f5; }
        .f-item { display: flex; align-items: center; gap: 15px; }
        .fab { position: fixed; bottom: 30px; right: 30px; width: 70px; height: 70px; border-radius: 20px; background: var(--b); border: 2px solid var(--g); display: flex; align-items: center; justify-content: center; z-index: 6000; }
        #pop { position: fixed; display: none; bottom: 110px; right: 30px; background: #fff; border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); border: 1px solid var(--br); z-index: 7000; width: 250px; }
        .m-row { padding: 15px 20px; display: flex; align-items: center; gap: 15px; cursor: pointer; border-bottom: 1px solid #eee; }
        #viewer { display: none; position: fixed; inset: 0; background: #000; z-index: 9000; flex-direction: column; }
    </style>
</head>
<body>
<header>
    <div class="logo" onclick="document.getElementById('sidebar').classList.toggle('open')">
        <img src="${LOGO_URL}"> <b style="font-size:20px">X-PLATFORM</b>
    </div>
    <div style="font-weight: 900; color: var(--g);">ЕВГЕНИЙ</div>
</header>
<div class="shell">
    <aside id="sidebar">
        <div class="nav-link active" id="n-root" onclick="nav('root', 'Мой диск')"><i class="fa fa-cloud"></i> Мой диск</div>
        <div class="nav-link" onclick="nav('${MY_ROOT_ID}', 'Логистика')"><i class="fa fa-truck"></i> Логистика X</div>
        <div class="nav-link" onclick="nav('${MERCH_ROOT_ID}', 'Мерч')"><i class="fa fa-tag"></i> Мерчандайзинг</div>
    </aside>
    <main>
        <div class="toolbar"><div id="bc" style="font-weight:700; color:var(--gr)">Мой диск</div></div>
        <table class="grid"><tbody id="f-body"></tbody></table>
    </main>
</div>
<div class="fab" onclick="document.getElementById('pop').style.display='block'"><img src="${LOGO_URL}" width="40"></div>
<div id="pop" onclick="this.style.display='none'">
    <div class="m-row" onclick="mkdir()"><i class="fa fa-folder-plus"></i> Создать объект</div>
    <div class="m-row" onclick="document.getElementById('fin').click()"><i class="fa fa-upload"></i> Загрузить</div>
    <div class="m-row" onclick="sync(curId)"><i class="fa fa-sync"></i> Обновить</div>
</div>
<div id="viewer">
    <div style="height:60px; background:#000; display:flex; align-items:center; justify-content:flex-end; padding:0 20px;">
        <i class="fa fa-times" onclick="closePv()" style="color:#fff; font-size:30px"></i>
    </div>
    <iframe id="v-f" style="flex:1; border:none; background:#fff"></iframe>
</div>
<input type="file" id="fin" style="display:none" multiple onchange="hUp(this.files)">

<script>
    let curId = 'root'; let cache = [];
    async function sync(id) {
        curId = id; const b = document.getElementById('f-body');
        b.innerHTML = '<tr><td style="text-align:center; padding:50px;"><i class="fa fa-sync fa-spin"></i> Синхронизация...</td></tr>';
        try {
            // Исправлен путь к API (добавлен префикс /storage)
            const r = await fetch('/storage/api/list?folderId=' + id);
            if (!r.ok) throw new Error('Ошибка сети');
            cache = await r.json();
            render();
        } catch(e) { 
            b.innerHTML = '<tr><td style="text-align:center; padding:50px; color:red;">Критическая ошибка синхронизации<br><small>'+e.message+'</small></td></tr>'; 
        }
    }
    function render() {
        const body = document.getElementById('f-body');
        body.innerHTML = cache.length ? '' : '<tr><td style="text-align:center; padding:50px;">Пусто</td></tr>';
        cache.forEach(f => {
            const isD = f.mimeType.includes('folder');
            const tr = document.createElement('tr');
            tr.innerHTML = \`<td><div class="f-item"><i class="fa \${isD?'fa-folder':'fa-file'}" style="color:\${isD?'#fbc02d':'#1a73e8'}"></i> \${f.name}</div></td>\`;
            tr.onclick = () => isD ? nav(f.id, f.name) : pv(f.id, f.name);
            body.appendChild(tr);
        });
    }
    function nav(id, n) { document.getElementById('bc').innerText = n; sync(id); }
    function pv(id, n) { document.getElementById('v-f').src = 'https://drive.google.com/file/d/'+id+'/preview'; document.getElementById('viewer').style.display = 'flex'; }
    function closePv() { document.getElementById('viewer').style.display = 'none'; document.getElementById('v-f').src = ''; }
    async function hUp(files) { for(let f of files) { const fd = new FormData(); fd.append('file',f); fd.append('folderId',curId); await fetch('/storage/api/upload',{method:'POST',body:fd}); } sync(curId); }
    async function mkdir() { const n = prompt("Имя папки:"); if(n) { await fetch('/storage/api/mkdir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parentId:curId,name:n})}); sync(curId); } }
    sync('root');
</script>
</body>
</html>
    `;

    // --- BACKEND API (ГЛУБОКАЯ ПРОВЕРКА DRIVE) ---

    app.get('/storage', (req, res) => res.send(UI));

    app.get('/storage/api/list', async (req, res) => {
        try {
            if (!drive) throw new Error("Бэкенд: Drive API не инициализирован");
            const folderId = req.query.folderId || 'root';
            const r = await drive.files.list({
                q: `'${folderId}' in parents and trashed = false`,
                fields: 'files(id, name, mimeType, size, modifiedTime)',
                orderBy: 'folder, name'
            });
            res.json(r.data.files);
        } catch (e) {
            console.error("❌ API LIST ERROR:", e.message);
            res.status(500).json({error: e.message});
        }
    });

    app.post('/storage/api/upload', upload.single('file'), async (req, res) => {
        try {
            const r = await drive.files.create({ 
                resource: { name: req.file.originalname, parents: [req.body.folderId] },
                media: { mimeType: req.file.mimetype, body: fs.createReadStream(req.file.path) },
                fields: 'id, name, mimeType'
            });
            await xNeuralProcess(r.data, req.body.folderId, 'USER_UPLOAD');
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    app.post('/storage/api/mkdir', express.json(), async (req, res) => {
        try {
            const r = await drive.files.create({ 
                resource: { name: req.body.name, mimeType: 'application/vnd.google-apps.folder', parents: [req.body.parentId] },
                fields: 'id, name'
            });
            res.sendStatus(200);
        } catch (e) { res.status(500).send(e.message); }
    });

    console.log("🚀 TITANIUM v130.1 PATCHED & READY");
};
