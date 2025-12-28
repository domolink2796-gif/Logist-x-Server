const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const { google } = require('googleapis');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// --- ДАННЫЕ СИСТЕМЫ ---
const BOT_TOKEN = '7908672389:AAFqJsmCmlJHSckewNPue_XVa_WTxKY7-Aw';
const ADMIN_ID = 6846149935;
const ROOT_FOLDER_ID = '1BsUQsAIKOEd9Q07vsT1daq-3sRTn0ck3'; // ТВОЯ ПАПКА

const GOOGLE_AUTH = {
  client_email: "firebase-adminsdk-fbsvc@logistx-system.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC0Ub6OldzhZhgV\n+47pxI9FTAVkuTF0h7IpL65to/V1b2WHEkbR2AxBkMGwWwL1F28Y864jTlNrlKeY\n/IyByZ4n6P0dPiJdtVccJ8b9He0Npr3L96H8fa/+2J2MoUbiUNaqcwtvoYSsaOxx\njolenopEJWCO6Dbgx/8yKBS3wxRy/82ermvXec4b3RlXYcePG9HW3oteW/Bw0jOn\nUeEeYcWQy1VdYlnaiX13UKuGeJRr1Wj0XEDjBaysBavdEyTjOzGJ78DrM2FARHhi\njueT/fik6bpxn8PewiySPmxpWT0InMmPfESyZ65QLJ8tmVTmfjs0VsxRPTKB6n78\nJ2EptGMdAgMBAAECggEAB3CX/CoSwvoDZGTMsLh7cNCCKHW7pKM0pp5hBAUPy5id\nB8WpRl8zokDmvPAEXzhoTQ9A0BQbPQUVJSrGYVSAQgVK7Dn0EQm6Xl8FxsvFTBrl\nGdVNya0l5c3qMjM1SYEsWjwE7MYtQy/REZ5f7Jd9/PHN2hearAuUa+1bbXmPDm+N\nwYoH+XAaKJf/aIdAh7zaMFZ8cU76+TFyShA9Pm2TA998SLIBTE+pqhb/x26sAr0P\nY/F7XStgQT5GgxV2OGfEthXPsRe2gECzcASByAbiVathPJteJlDgzbnRu+gTcN14\nSb6LHFw001jqCpXboqWZwRSDAeeqA3FdUtGi0j4mAQKBgQDW8ehvkyQmin3XXBsa\ne1M9iRrnHljnKNEadcX0dUgf8q8qTUyqcRHoPWvhjI/1AFI/SHyTSgRmvtxl3TUs\nG5f95wRnJ0n53OoxHs6ZhitEciShhXszGtQtPbrBfnjKfz9lna9r958WDmmupp0/\n9SpVAD/XEKS86N9fXj+4AzRspQKBgQDWwsIOHbM7Mbxq1MaTa+OpxuI+BV5GnSvw\nuB+uriKZXLy4rcj/2vxRpuVekwym3ENXBSn380EjZ/+jybc4mmJWrgqdRv9oJhQ/\nn2bDBW2/IM8MDEZjKYNJr+k1vIETxd7LyEEGp+nO1OkOfefM8TXxsHeEjNbzyfRU\nPQ6C6dD7GQKBgAI/IwvPgOg6OFiA6POc6GDTRwm1Yn6ACbd6FaiZdTiIQ9ZwWmXJ\nqsM/qRoBaxvHdhSdQFgVxPgB9LHH3x9n5m3L9VrSqU5IRdZfmQ83vMoJW2Koz4HY\nPPGAHKybEs4jCFmajVPWkb4cRnSB31Dk0h1zVDd+QAqNcJBBnu7gcbLVAoGBAJ7w\n/tuhoX9ivNa36Ms8Yv7IwbIzGOXb9qQuMMx/9f1YxBdODt9Eu87WXRUUcZ2gkHn7\nyWbHcmL42hrm9CIBKFyMbDCgVfBHll7L4yrcfq+gYXvCLem/1HmZplhtzX3LyKs6\n5t09Mm4v5tgh2Ic10b2w45OHBKLiyV/63B2JXHApAoGAKfmGKx8MsH8ULi682WAA\nWpiVZpkyWupk7srezMBoTSOxHG0MFhgLWueadW5Udrf7CCN6IPwFgiczi+TtwFJe\nWP/qJaGgGsBK8Z2fedX1oAtpoqzoYeh4m1MYePDyR0NdO/68vsBPGwMvD9mjoko3\nRgCzfWgr1AUixmoIVi7J1fU=\n-----END PRIVATE KEY-----\n".replace(/\\n/g, '\n')
};

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const drive = google.drive({ version: 'v3', auth: new google.auth.JWT(GOOGLE_AUTH.client_email, null, GOOGLE_AUTH.private_key, ['https://www.googleapis.com/auth/drive']) });

let licenses = {}; // Простая база в памяти. Для серьезной работы лучше добавить файл JSON.

bot.onText(/\/start/, (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  bot.sendMessage(ADMIN_ID, "Система LOGIST_X онлайн!\n/add_key - создать ключ\n/status - список ключей");
});

bot.onText(/\/add_key/, (msg) => {
  if (msg.from.id !== ADMIN_ID) return;
  const key = "LX-" + Math.random().toString(36).substr(2, 8).toUpperCase();
  licenses[key] = { expiry: Date.now() + (30 * 86400000), deviceId: null, worker: "" };
  bot.sendMessage(ADMIN_ID, `Ключ создан: <code>${key}</code>`, { parse_mode: 'HTML' });
});

app.post('/check-license', (req, res) => {
  const { licenseKey, workerName, deviceId } = req.body;
  const lic = licenses[licenseKey];
  if (!lic || Date.now() > lic.expiry) return res.json({ status: "error", message: "Ключ недействителен" });
  if (!lic.deviceId) { lic.deviceId = deviceId; lic.worker = workerName; }
  if (lic.deviceId !== deviceId) return res.json({ status: "error", message: "ID не совпадает" });
  res.json({ status: "active", expiry: lic.expiry });
});

app.post('/upload', async (req, res) => {
  const data = req.body;
  try {
    const fileMetadata = { name: `${data.address}_${data.client}.jpg`, parents: [ROOT_FOLDER_ID] };
    const media = { mimeType: 'image/jpeg', body: Buffer.from(data.image, 'base64') };
    await drive.files.create({ resource: fileMetadata, media: media });
    bot.sendMessage(ADMIN_ID, `✅ Отчет: ${data.address}\nСотрудник: ${data.worker}\nGPS: ${data.coords}`);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

app.listen(process.env.PORT || 3000);
