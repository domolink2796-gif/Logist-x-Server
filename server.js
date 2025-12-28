const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { google } = require('googleapis');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ТВОИ ДАННЫЕ
const BOT_TOKEN = '7908672389:AAFqJsmCmlJHSckewNPue_XVa_WTxKY7-Aw';
const ADMIN_ID = 6846149935;
const ROOT_FOLDER_ID = '1BsUQsAIKOEd9Q07vsT1daq-3sRTn0ck3';

const P_KEY = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC0Ub6OldzhZhgV\n+47pxI9FTAVkuTF0h7IpL65to/V1b2WHEkbR2AxBkMGwWwL1F28Y864jTlNrlKeY\n/IyByZ4n6P0dPiJdtVccJ8b9He0Npr3L96H8fa/+2J2MoUbiUNaqcwtvoYSsaOxx\njolenopEJWCO6Dbgx/8yKBS3wxRy/82ermvXec4b3RlXYcePG9HW3oteW/Bw0jOn\nUeEeYcWQy1VdYlnaiX13UKuGeJRr1Wj0XEDjBaysBavdEyTjOzGJ78DrM2FARHhi\njueT/fik6bpxn8PewiySPmxpWT0InMmPfESyZ65QLJ8tmVTmfjs0VsxRPTKB6n78\nJ2EptGMdAgMBAAECggEAB3CX/CoSwvoDZGTMsLh7cNCCKHW7pKM0pp5hBAUPy5id\nB8WpRl8zokDmvPAEXzhoTQ9A0BQbPQUVJSrGYVSAQgVK7Dn0EQm6Xl8FxsvFTBrl\nGdVNya0l5c3qMjM1SYEsWjwE7MYtQy/REZ5f7Jd9/PHN2hearAuUa+1bbXmPDm+N\nwYoH+XAaKJf/aIdAh7zaMFZ8cU76+TFyShA9Pm2TA998SLIBTE+pqhb/x26sAr0P\nY/F7XStgQT5GgxV2OGfEthXPsRe2gECzcASByAbiVathPJteJlDgzbnRu+gTcN14\nSb6LHFw001jqCpXboqWZwRSDAeeqA3FdUtGi0j4mAQKBgQDW8ehvkyQmin3XXBsa\ne1M9iRrnHljnKNEadcX0dUgf8q8qTUyqcRHoPWvhjI/1AFI/SHyTSgRmvtxl3TUs\nG5f95wRnJ0n53OoxHs6ZhitEciShhXszGtQtPbrBfnjKfz9lna9r958WDmmupp0/\n9SpVAD/XEKS86N9fXj+4AzRspQKBgQDWwsIOHbM7Mbxq1MaTa+OpxuI+BV5GnSvw\nuB+uriKZXLy4rcj/2vxRpuVekwym3ENXBSn380EjZ/+jybc4mmJWrgqdRv9oJhQ/\nn2bDBW2/IM8MDEZjKYNJr+k1vIETxd7LyEEGp+nO1OkOfefM8TXxsHeEjNbzyfRU\PQ6C6dD7GQKBgAI/IwvPgOg6OFiA6POc6GDTRwm1Yn6ACbd6FaiZdTiIQ9ZwWmXJ\qsM/qRoBaxvHdhSdQFgVxPgB9LHH3x9n5m3L9VrSqU5IRdZfmQ83vMoJW2Koz4HY\PPGAHKybEs4jCFmajVPWkb4cRnSB31Dk0h1zVDd+QAqNcJBBnu7gcbLVAoGBAJ7w\n/tuhoX9ivNa36Ms8Yv7IwbIzGOXb9qQuMMx/9f1YxBdODt9Eu87WXRUUcZ2gkHn7\nyWbHcmL42hrm9CIBKFyMbDCgVfBHll7L4yrcfq+gYXvCLem/1HmZplhtzX3LyKs6\n5t09Mm4v5tgh2Ic10b2w45OHBKLiyV/63B2JXHApAoGAKfmGKx8MsH8ULi682WAA\nWpiVZpkyWupk7srezMBoTSOxHG0MFhgLWueadW5Udrf7CCN6IPwFgiczi+TtwFJe\nWP/qJaGgGsBK8Z2fedX1oAtpoqzoYeh4m1MYePDyR0NdO/68vsBPGwMvD9mjoko3\nRgCzfWgr1AUixmoIVi7J1fU=\n-----END PRIVATE KEY-----\n";

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const auth = new google.auth.JWT("firebase-adminsdk-fbsvc@logistx-system.iam.gserviceaccount.com", null, P_KEY.replace(/\\n/g, '\n'), ['https://www.googleapis.com/auth/drive']);
const drive = google.drive({ version: 'v3', auth });

async function getOrCreateFolder(name, parentId) {
    try {
        const res = await drive.files.list({ q: `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, fields: 'files(id)' });
        if (res.data.files.length > 0) return res.data.files[0].id;
        const folder = await drive.files.create({ resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id' });
        return folder.data.id;
    } catch (e) { return parentId; }
}

// ЭТО МЫ ДОБАВИЛИ ДЛЯ ПРОВЕРКИ
app.get('/status', (req, res) => {
    res.json({ status: "ok", message: "Server is running", time: new Date().toISOString() });
});

// ПРИЕМ ФОТО
app.post('/upload', async (req, res) => {
    console.log("--- ПОЛУЧЕН ЗАПРОС НА ЗАГРУЗКУ ---");
    try {
        const { worker, city, client, address, pod, image, coords, workType } = req.body;
        
        if (!image) {
            return res.status(400).json({ success: false, error: "No image data" });
        }

        const date = new Date().toLocaleDateString('ru-RU');
        
        const f1 = await getOrCreateFolder(worker || "Монтажник", ROOT_FOLDER_ID);
        const f2 = await getOrCreateFolder(city || "Город", f1);
        const f3 = await getOrCreateFolder(date, f2);
        const f4 = await getOrCreateFolder(client || "Общий", f3);
        
        const fileName = `${address}_п.${pod}_${workType || ''}.jpg`.replace(/[/\\?%*:|"<>]/g, '-');
        
        await drive.files.create({
            resource: { name: fileName, parents: [f4] },
            media: { mimeType: 'image/jpeg', body: Buffer.from(image, 'base64') }
        });
        
        console.log(`✅ Файл загружен: ${fileName}`);
        bot.sendMessage(ADMIN_ID, `✅ ПРИНЯТО: ${address}\n👤 ${worker}\n📍 ${coords}\n🛠 ${workType || 'Работа'}`);
        res.json({ success: true });
    } catch (e) {
        console.error("❌ ОШИБКА ЗАГРУЗКИ:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ПРОВЕРКА ЛИЦЕНЗИИ
app.post('/check-license', (req, res) => {
    res.json({ status: "active", expiry: Date.now() + 31536000000 });
});

app.listen(process.env.PORT || 3000, () => console.log("--- СИСТЕМА LOGIST_X ЗАПУЩЕНА ---"));
