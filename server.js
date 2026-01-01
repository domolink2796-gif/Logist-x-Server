<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>LOGIST_X | MERCH ANALYTICS PRO</title>
    
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    
    <style>
        :root { --bg: #000000; --card: #111111; --accent: #ffffff; --green: #00ff00; --border: #222222; --text: #ffffff; --blue: #007aff; --red: #ff3b30; --gold: #f59e0b; }
        body { font-family: -apple-system, system-ui, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding-bottom: 50px; overflow-x: hidden; }
        
        .header { background: var(--bg); padding: 20px 15px; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 100; }
        .logo { font-size: 1.4rem; font-weight: 900; letter-spacing: -1px; margin-bottom: 15px; }
        .logo span { color: var(--gold); }

        .stats-main { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; }
        .s-box { background: var(--card); border: 1px solid var(--border); padding: 12px; border-radius: 12px; text-align: center; }
        .s-v { display: block; font-size: 1.1rem; font-weight: 800; }
        .s-t { font-size: 0.6rem; text-transform: uppercase; opacity: 0.5; margin-top: 4px; font-weight: 700; }

        .btn-blue { background: var(--blue); color: white; padding: 16px; border-radius: 14px; text-align: center; font-weight: 700; cursor: pointer; border: none; width: 100%; display: block; box-sizing: border-box; margin-bottom: 10px; }
        
        #srch { width: calc(100% - 30px); margin: 10px 15px; padding: 14px; background: var(--card); border: 1px solid var(--border); color: white; border-radius: 12px; box-sizing: border-box; }

        .card { background: var(--card); border: 1px solid var(--border); margin: 10px 15px; padding: 18px; border-radius: 16px; position: relative; }
        .card-net { font-size: 0.7rem; color: var(--gold); font-weight: 800; text-transform: uppercase; margin-bottom: 4px; }
        .card-addr { font-size: 1rem; font-weight: 600; line-height: 1.3; }
        .dot { position: absolute; right: 18px; top: 18px; width: 10px; height: 10px; border-radius: 50%; background: #222; }

        .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 1000; display: none; align-items: center; justify-content: center; padding: 15px; }
        .m-form { background: #000; width: 100%; max-width: 420px; padding: 25px; border-radius: 28px; border: 1px solid var(--border); box-sizing: border-box; max-height: 95vh; overflow-y: auto; }
        
        .f-label { font-size: 0.65rem; text-transform: uppercase; opacity: 0.5; font-weight: 800; margin-top: 15px; display: block; }
        input, select, textarea { width: 100%; padding: 14px; background: #111; border: 1px solid var(--border); color: white; border-radius: 12px; margin-top: 5px; font-size: 16px; box-sizing: border-box; }
        
        .photo-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 10px; }
        .cam-btn { background: #111; border: 1px solid var(--border); height: 75px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 12px; font-size: 0.55rem; font-weight: 800; color: #666; cursor: pointer; text-align: center; }
        .cam-btn.ok { border-color: var(--green); color: var(--green); background: rgba(0,255,0,0.05); }

        #pdf-render { position: absolute; left: -9999px; width: 600px; background: #fff; color: #000; padding: 40px; }
        .hidden { display: none; }
    </style>
</head>
<body>

<div class="header">
    <div class="logo">LOGIST_X <span>MERCH</span></div>
    <div class="stats-main">
        <div class="s-box"><span class="s-v" id="st-total">0</span><span class="s-t">План</span></div>
        <div class="s-box"><span class="s-v" id="st-done" style="color:var(--green)">0</span><span class="s-t">Визиты</span></div>
    </div>
    <label class="btn-blue" for="file-in">ЗАГРУЗИТЬ EXCEL ПЛАН</label>
    <input type="file" id="file-in" class="hidden" onchange="processFile(this)">
</div>

<input type="text" id="srch" placeholder="Поиск магазина..." oninput="render()">

<div id="list"></div>

<div id="task-modal" class="modal">
    <div class="m-form">
        <div id="m-net" style="color:var(--gold); font-weight:800; font-size:0.8rem;"></div>
        <div id="m-addr" style="font-weight: 800; font-size: 1.1rem; margin-bottom: 15px; border-bottom: 1px solid var(--border); padding-bottom: 10px;"></div>
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div>
                <span class="f-label">Остаток (шт)</span>
                <input type="number" id="inp-stock" placeholder="0">
            </div>
            <div>
                <span class="f-label">Фейсинг (ряд)</span>
                <input type="number" id="inp-shelf" placeholder="0">
            </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div>
                <span class="f-label">Цена (Мы)</span>
                <input type="number" id="inp-p-my" placeholder="0.00">
            </div>
            <div>
                <span class="f-label">Цена (Конк)</span>
                <input type="number" id="inp-p-comp" placeholder="0.00">
            </div>
        </div>

        <span class="f-label">Срок годности до:</span>
        <input type="date" id="inp-exp">

        <span class="f-label">Рекомендация</span>
        <select id="inp-rec">
            <option>✅ Все в норме</option>
            <option>📦 Требуется выкладка</option>
            <option>🚚 Срочный довоз</option>
            <option>📉 Плохое место</option>
            <option>⚠️ Нет ценников</option>
        </select>

        <span class="f-label">Фото (До / После / Ценник)</span>
        <div class="photo-grid">
            <label class="cam-btn" id="lbl-pre" for="cam-pre">📸<br>ДО</label>
            <input type="file" id="cam-pre" accept="image/*" capture="camera" class="hidden" onchange="compressImg(this, 'pre')">
            
            <label class="cam-btn" id="lbl-post" for="cam-post">📸<br>ПОСЛЕ</label>
            <input type="file" id="cam-post" accept="image/*" capture="camera" class="hidden" onchange="compressImg(this, 'post')">
            
            <label class="cam-btn" id="lbl-price" for="cam-price">📸<br>ЦЕННИК</label>
            <input type="file" id="cam-price" accept="image/*" capture="camera" class="hidden" onchange="compressImg(this, 'price')">
        </div>

        <button class="btn-blue" id="send-btn" style="background:var(--green); color:black; margin-top:20px;" onclick="generateAndSend()">ОТПРАВИТЬ ОТЧЕТ (PDF)</button>
        <button class="btn-blue" style="background:none; color:#555;" onclick="closeModal()">ЗАКРЫТЬ</button>
    </div>
</div>

<div id="pdf-render">
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:5px solid #000; padding-bottom:10px;">
        <div style="font-size:24px; font-weight:900;">LOGIST_X <span style="color:#f59e0b">MERCH</span></div>
        <div id="p-date" style="font-size:12px; text-align:right;"></div>
    </div>
    
    <div style="margin-top:20px;">
        <div id="p-net" style="color:#f59e0b; font-weight:800; font-size:14px;"></div>
        <div id="p-addr" style="font-size:22px; font-weight:900;"></div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:30px; margin-top:30px;">
        <div style="background:#f0f0f0; padding:25px; border-radius:20px;">
            <div style="font-size:10px; opacity:0.6;">ОСТАТОК / ФЕЙСИНГ</div>
            <div style="font-size:32px; font-weight:900;"><span id="p-stock">0</span> / <span id="p-shelf">0</span></div>
            
            <div style="font-size:10px; opacity:0.6; margin-top:10px;">ЦЕНЫ (МЫ / КОНК)</div>
            <div style="font-size:22px; font-weight:900;"><span id="p-p-my">0</span> / <span id="p-p-comp">0</span></div>
        </div>
        <div style="height:150px;"><canvas id="p-chart"></canvas></div>
    </div>

    <div style="margin-top:25px; padding:15px; border-left:5px solid #007aff; background:#f0f7ff;">
        <div style="font-size:12px; color:#007aff; font-weight:800;">РЕКОМЕНДАЦИЯ МЕРЧАНДАЙЗЕРА:</div>
        <div id="p-rec" style="font-size:18px; font-weight:700;"></div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-top:30px;">
        <div><img id="p-img1" style="width:100%; height:160px; object-fit:cover; border-radius:10px;"><center style="font-size:10px; margin-top:5px;">ДО</center></div>
        <div><img id="p-img2" style="width:100%; height:160px; object-fit:cover; border-radius:10px;"><center style="font-size:10px; margin-top:5px;">ПОСЛЕ</center></div>
        <div><img id="p-img3" style="width:100%; height:160px; object-fit:cover; border-radius:10px;"><center style="font-size:10px; margin-top:5px;">ЦЕННИК</center></div>
    </div>
</div>

<script>
    const API = 'https://logist-x-server-production.up.railway.app/merch-upload';
    let STATE = { shops: [], current: null, worker: "Алексей (Мерч)" };
    let IMGS = { pre: null, post: null, price: null };

    function processFile(inp) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const wb = XLSX.read(new Uint8Array(e.target.result), {type: 'array'});
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1});
            const head = rows[0].map(v => String(v || "").toLowerCase());
            const idxA = head.findIndex(v => v.includes('адрес') || v.includes('улица'));
            const idxN = head.findIndex(v => v.includes('сеть') || v.includes('клиент') || v.includes('магазин'));
            const idxC = head.findIndex(v => v.includes('город'));
            
            STATE.shops = rows.slice(1).filter(r => r[idxA]).map((r, i) => ({
                id: i, 
                addr: r[idxA], 
                net: idxN !== -1 ? r[idxN] : "Общая сеть", 
                city: idxC !== -1 ? r[idxC] : "Орёл",
                done: false
            }));
            render();
        };
        reader.readAsArrayBuffer(inp.files[0]);
    }

    async function compressImg(el, type) {
        const file = el.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const w = 800; canvas.width = w; canvas.height = (img.height/img.width)*w;
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                IMGS[type] = canvas.toDataURL('image/jpeg', 0.7);
                document.getElementById('lbl-'+type).classList.add('ok');
            };
        };
        reader.readAsDataURL(file);
    }

    async function generateAndSend() {
        if(!IMGS.pre || !IMGS.post || !IMGS.price) return alert("Нужно 3 фото!");
        const btn = document.getElementById('send-btn');
        btn.innerText = "ОБРАБОТКА..."; btn.disabled = true;

        // Заполнение данных для PDF рендеринга
        document.getElementById('p-date').innerText = new Date().toLocaleString();
        document.getElementById('p-net').innerText = STATE.current.net;
        document.getElementById('p-addr').innerText = STATE.current.addr;
        document.getElementById('p-stock').innerText = document.getElementById('inp-stock').value || 0;
        document.getElementById('p-shelf').innerText = document.getElementById('inp-shelf').value || 0;
        document.getElementById('p-p-my').innerText = document.getElementById('inp-p-my').value || 0;
        document.getElementById('p-p-comp').innerText = document.getElementById('inp-p-comp').value || 0;
        document.getElementById('p-rec').innerText = document.getElementById('inp-rec').value;
        document.getElementById('p-img1').src = IMGS.pre;
        document.getElementById('p-img2').src = IMGS.post;
        document.getElementById('p-img3').src = IMGS.price;

        const ctx = document.getElementById('p-chart').getContext('2d');
        if(window.myChart) window.myChart.destroy();
        window.myChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Товар', 'Пусто'],
                datasets: [{ data: [parseInt(document.getElementById('inp-stock').value) || 1, 20], backgroundColor: ['#f59e0b', '#eeeeee'] }]
            },
            options: { animation: false, plugins: { legend: { display: false } } }
        });

        setTimeout(async () => {
            const canvas = await html2canvas(document.getElementById('pdf-render'), { scale: 2 });
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297);
            
            // Payload для server.js
            const payload = {
                worker: STATE.worker,
                net: STATE.current.net,
                address: STATE.current.addr,
                city: STATE.current.city,
                stock: document.getElementById('inp-stock').value,
                shelf: document.getElementById('inp-shelf').value,
                priceMy: document.getElementById('inp-p-my').value,
                priceComp: document.getElementById('inp-p-comp').value,
                expDate: document.getElementById('inp-exp').value || "-",
                pdf: pdf.output('datauristring')
            };

            try {
                const res = await fetch(API, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload) 
                });
                const resData = await res.json();
                if(resData.success) { 
                    STATE.shops.find(s => s.id === STATE.current.id).done = true; 
                    alert("ОТЧЕТ УСПЕШНО ЗАГРУЖЕН!"); 
                    closeModal(); render(); 
                } else {
                    alert("Ошибка: " + (resData.error || "Неизвестная ошибка"));
                }
            } catch(e) { alert("Ошибка связи: " + e.message); }
            btn.innerText = "ОТПРАВИТЬ ОТЧЕТ (PDF)"; btn.disabled = false;
        }, 800);
    }

    function render() {
        const f = document.getElementById('srch').value.toLowerCase();
        document.getElementById('st-total').innerText = STATE.shops.length;
        document.getElementById('st-done').innerText = STATE.shops.filter(s => s.done).length;
        document.getElementById('list').innerHTML = STATE.shops.map(s => {
            if(f && !s.addr.toLowerCase().includes(f)) return '';
            return `<div class="card" onclick="openModal(${s.id})"><div class="dot" style="background:${s.done ? 'var(--green)' : '#222'}"></div><div class="card-net">${s.net}</div><div class="card-addr">${s.addr}</div></div>`;
        }).join('');
    }

    function openModal(id) {
        STATE.current = STATE.shops.find(s => s.id === id);
        document.getElementById('m-net').innerText = STATE.current.net;
        document.getElementById('m-addr').innerText = STATE.current.addr;
        document.getElementById('task-modal').style.display = 'flex';
    }

    function closeModal() {
        document.getElementById('task-modal').style.display = 'none';
        IMGS = { pre: null, post: null, price: null };
        document.getElementById('inp-stock').value = "";
        document.getElementById('inp-shelf').value = "";
        document.getElementById('inp-p-my').value = "";
        document.getElementById('inp-p-comp').value = "";
        ['pre','post','price'].forEach(t => document.getElementById('lbl-'+t).classList.remove('ok'));
    }
</script>
</body>
</html>
