<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>X-PLATFORM</title>
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">

    <style>
        body, html { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
        #splash {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: #000; color: #f59e0b;
            display: flex; flex-direction: column; justify-content: center; align-items: center;
            z-index: 999;
        }
        /* Невидимая кнопка на весь экран */
        #tap-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            z-index: 1000; display: none; background: rgba(0,0,0,0.01);
        }
        .loader {
            width: 48px; height: 48px; border: 5px solid #f59e0b;
            border-bottom-color: transparent; border-radius: 50%;
            animation: rotation 1s linear infinite;
        }
        @keyframes rotation { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>

    <div id="splash">
        <span class="loader"></span>
        <div style="margin-top: 20px; font-weight: bold; letter-spacing: 2px;">X-PLATFORM</div>
        <div id="status" style="margin-top: 10px; font-size: 10px; opacity: 0.6;">ПОДГОТОВКА СРЕДЫ...</div>
    </div>

    <div id="tap-overlay" onclick="launchApp()"></div>

    <script>
        const targetUrl = 'https://metrika.yandex.ru/list'; 

        function launchApp() {
            window.location.replace(targetUrl);
        }

        window.onload = () => {
            // Через 2 секунды пробуем авто-запуск
            setTimeout(() => {
                // Если автозапуск блокируется браузером, показываем невидимую кнопку
                document.getElementById('tap-overlay').style.display = 'block';
                document.getElementById('status').innerText = 'НАЖМИТЕ ДЛЯ ВХОДА';
                launchApp(); 
            }, 2500);
        };
    </script>
</body>
</html>
