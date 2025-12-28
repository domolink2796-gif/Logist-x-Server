const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const KEY = {
  "client_email": "firebase-adminsdk-fbsvc@logistx-system.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC0Ub6OldzhZhgV\n+47pxI9FTAVkuTF0h7IpL65to/V1b2WHEkbR2AxBkMGwWwL1F28Y864jTlNrlKeY\n/IyByZ4n6P0dPiJdtVccJ8b9He0Npr3L96H8fa/+2J2MoUbiUNaqcwtvoYSsaOxx\njolenopEJWCO6Dbgx/8yKBS3wxRy/82ermvXec4b3RlXYcePG9HW3oteW/Bw0jOn\nUeEeYcWQy1VdYlnaiX13UKuGeJRr1Wj0XEDjBaysBavdEyTjOzGJ78DrM2FARHhi\njueT/fik6bpxn8PewiySPmxpWT0InMmPfESyZ65QLJ8tmVTmfjs0VsxRPTKB6n78\nJ2EptGMdAgMBAAECggEAB3CX/CoSwvoDZGTMsLh7cNCCKHW7pKM0pp5hBAUPy5id\nB8WpRl8zokDmvPAEXzhoTQ9A0BQbPQUVJSrGYVSAQgVK7Dn0EQm6Xl8FxsvFTBrl\nGdVNya0l5c3qMjM1SYEsWjwE7MYtQy/REZ5f7Jd9/PHN2hearAuUa+1bbXmPDm+N\nwYoH+XAaKJf/aIdAh7zaMFZ8cU76+TFyShA9Pm2TA998SLIBTE+pqhb/x26sAr0P\nY/F7XStgQT5GgxV2OGfEthXPsRe2gECzcASByAbiVathPJteJlDgzbnRu+gTcN14\nSb6LHFw001jqCpXboqWZwRSDAeeqA3FdUtGi0j4mAQKBgQDW8ehvkyQmin3XXBsa\ne1M9iRrnHljnKNEadcX0dUgf8q8qTUyqcRHoPWvhjI/1AFI/SHyTSgRmvtxl3TUs\nG5f95wRnJ0n53OoxHs6ZhitEciShhXszGtQtPbrBfnjKfz9lna9r958WDmmupp0/\n9SpVAD/XEKS86N9fXj+4AzRspQKBgQDWwsIOHbM7Mbxq1MaTa+OpxuI+BV5GnSvw\nuB+uriKZXLy4rcj/2vxRpuVekwym3ENXBSn380EjZ/+jybc4mmJWrgqdRv9oJhQ/\nn2bDBW2/IM8MDEZjKYNJr+k1vIETxd7LyEEGp+nO1OkOfefM8TXxsHeEjNbzyfRU\PQ6C6dD7GQKBgAI/IwvPgOg6OFiA6POc6GDTRwm1Yn6ACbd6FaiZdTiIQ9ZwWmXJ\qsM/qRoBaxvHdhSdQFgVxPgB9LHH3x9n5m3L9VrSqU5IRdZfmQ83vMoJW2Koz4HY\nPPGAHKybEs4jCFmajVPWkb4cRnSB31Dk0h1zVDd+QAqNcJBBnu7gcbLVAoGBAJ7w\n/tuhoX9ivNa36Ms8Yv7IwbIzGOXb9qQuMMx/9f1YxBdODt9Eu87WXRUUcZ2gkHn7\nyWbHcmL42hrm9CIBKFyMbDCgVfBHll7L4yrcfq+gYXvCLem/1HmZplhtzX3LyKs6\n5t09Mm4v5tgh2Ic10b2w45OHBKLiyV/63B2JXHApAoGAKfmGKx8MsH8ULi682WAA\nWpiVZpkyWupk7srezMBoTSOxHG0MFhgLWueadW5Udrf7CCN6IPwFgiczi+TtwFJe\nWP/qJaGgGsBK8Z2fedX1oAtpoqzoYeh4m1MYePDyR0NdO/68vsBPGwMvD9mjoko3\nRgCzfWgr1AUixmoIVi7J1fU=\n-----END PRIVATE KEY-----\n"
};

const PARENT_ID = '1Q0NHwF4xhODJXAT0U7HUWMNNXhdNGf2A';

// Авторизация с использованием JWT
const auth = new google.auth.JWT(KEY.client_email, null, KEY.private_key, ['https://www.googleapis.com/auth/drive']);
const drive = google.drive({ version: 'v3', auth });

async function getOrCreateFolder(name, parentId) {
    const res = await drive.files.list({
        q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
    });
    if (res.data.files.length > 0) return res.data.files[0].id;
    const folder = await drive.files.create({
        resource: { name, parentId, mimeType: 'application/vnd.google-apps.folder' },
        fields: 'id',
        supportsAllDrives: true
    });
    return folder.data.id;
}

app.post('/upload', async (req, res) => {
    console.log("🚀 Начинаю загрузку...");
    try {
        const { image, address, city, worker, client, pod } = req.body;
        const dateStr = new Date().toLocaleDateString('ru-RU').replace(/\./g, '-');
        
        // Создаем иерархию папок
        const workerFolder = await getOrCreateFolder(worker || "БезИмени", PARENT_ID);
        const cityFolder = await getOrCreateFolder(city || "БезГорода", workerFolder);
        const clientFolder = await getOrCreateFolder(client || "БезКлиента", cityFolder);

        const fileName = `${dateStr}_${address}_п${pod || 0}_${Date.now()}.jpg`;
        const buffer = Buffer.from(image, 'base64');

        // ЗАГРУЗКА ФАЙЛА
        const file = await drive.files.create({
            resource: { 
                name: fileName, 
                parents: [clientFolder]
            },
            media: { 
                mimeType: 'image/jpeg', 
                body: Readable.from(buffer) 
            },
            fields: 'id',
            supportsAllDrives: true
        });

        console.log(`✅ Успех! ID: ${file.data.id}`);
        res.json({ success: true });
    } catch (e) {
        console.error("❌ ОШИБКА:", e.message);
        // Если ошибка квоты, выводим подробности
        res.status(500).send(e.message);
    }
});

app.listen(process.env.PORT || 3000, () => console.log("Drive Server Online"));
