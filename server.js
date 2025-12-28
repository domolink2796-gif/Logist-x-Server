const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const P_KEY = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC0Ub6OldzhZhgV\n+47pxI9FTAVkuTF0h7IpL65to/V1b2WHEkbR2AxBkMGwWwL1F28Y864jTlNrlKeY\n/IyByZ4n6P0dPiJdtVccJ8b9He0Npr3L96H8fa/+2J2MoUbiUNaqcwtvoYSsaOxx\njolenopEJWCO6Dbgx/8yKBS3wxRy/82ermvXec4b3RlXYcePG9HW3oteW/Bw0jOn\nUeEeYcWQy1VdYlnaiX13UKuGeJRr1Wj0XEDjBaysBavdEyTjOzGJ78DrM2FARHhi\njueT/fik6bpxn8PewiySPmxpWT0InMmPfESyZ65QLJ8tmVTmfjs0VsxRPTKB6n78\nJ2EptGMdAgMBAAECggEAB3CX/CoSwvoDZGTMsLh7cNCCKHW7pKM0pp5hBAUPy5id\nB8WpRl8zokDmvPAEXzhoTQ9A0BQbPQUVJSrGYVSAQgVK7Dn0EQm6Xl8FxsvFTBrl\nGdVNya0l5c3qMjM1SYEsWjwE7MYtQy/REZ5f7Jd9/PHN2hearAuUa+1bbXmPDm+N\nwYoH+XAaKJf/aIdAh7zaMFZ8cU76+TFyShA9Pm2TA998SLIBTE+pqhb/x26sAr0P\nY/F7XStgQT5GgxV2OGfEthXPsRe2gECzcASByAbiVathPJteJlDgzbnRu+gTcN14\nSb6LHFw001jqCpXboqWZwRSDAeeqA3FdUtGi0j4mAQKBgQDW8ehvkyQmin3XXBsa\ne1M9iRrnHljnKNEadcX0dUgf8q8qTUyqcRHoPWvhjI/1AFI/SHyTSgRmvtxl3TUs\nG5f95wRnJ0n53OoxHs6ZhitEciShhXszGtQtPbrBfnjKfz9lna9r958WDmmupp0/\n9SpVAD/XEKS86N9fXj+4AzRspQKBgQDWwsIOHbM7Mbxq1MaTa+OpxuI+BV5GnSvw\nuB+uriKZXLy4rcj/2vxRpuVekwym3ENXBSn380EjZ/+jybc4mmJWrgqdRv9oJhQ/\nn2bDBW2/IM8MDEZjKYNJr+k1vIETxd7LyEEGp+nO1OkOfefM8TXxsHeEjNbzyfRU\PQ6C6dD7GQKBgAI/IwvPgOg6OFiA6POc6GDTRwm1Yn6ACbd6FaiZdTiIQ9ZwWmXJ\qsM/qRoBaxvHdhSdQFgVxPgB9LHH3x9n5m3L9VrSqU5IRdZfmQ83vMoJW2Koz4HY\PPGAHKybEs4jCFmajVPWkb4cRnSB31Dk0h1zVDd+QAqNcJBBnu7gcbLVAoGBAJ7w\n/tuhoX9ivNa36Ms8Yv7IwbIzGOXb9qQuMMx/9f1YxBdODt9Eu87WXRUUcZ2gkHn7\nyWbHcmL42hrm9CIBKFyMbDCgVfBHll7L4yrcfq+gYXvCLem/1HmZplhtzX3LyKs6\n5t09Mm4v5tgh2Ic10b2w45OHBKLiyV/63B2JXHApAoGAKfmGKx8MsH8ULi682WAA\nWpiVZpkyWupk7srezMBoTSOxHG0MFhgLWueadW5Udrf7CCN6IPwFgiczi+TtwFJe\nWP/qJaGgGsBK8Z2fedX1oAtpoqzoYeh4m1MYePDyR0NdO/68vsBPGwMvD9mjoko3\nRgCzfWgr1AUixmoIVi7J1fU=\n-----END PRIVATE KEY-----\n";

const auth = new google.auth.JWT(
    "firebase-adminsdk-fbsvc@logistx-system.iam.gserviceaccount.com",
    null,
    P_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/drive']
);
const drive = google.drive({ version: 'v3', auth });

app.get('/status', (req, res) => res.json({ status: "ok" }));

app.post('/upload', async (req, res) => {
    console.log("--- СТАРТ ЗАГРУЗКИ ---");
    try {
        const { image, address, pod, workType } = req.body;
        
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const fileName = `${address || 'отчет'}_п.${pod || '0'}_${workType || ''}.jpg`;

        await drive.files.create({
            resource: { 
                name: fileName, 
                parents: ['1BsUQsAIKOEd9Q07vsT1daq-3sRTn0ck3'] // ЛЬЕМ ПРЯМО В КОРЕНЬ ПАПКИ ДЛЯ ТЕСТА
            },
            media: { 
                mimeType: 'image/jpeg', 
                body: require('stream').Readable.from(Buffer.from(base64Data, 'base64')) 
            }
        });
        
        console.log("✅ УРА! ФАЙЛ НА ДИСКЕ!");
        res.json({ success: true });
    } catch (e) {
        console.error("❌ ОШИБКА DRIVE:", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/check-license', (req, res) => res.json({ status: "active" }));

app.listen(process.env.PORT || 3000, () => console.log("--- SERVER RUNNING ---"));
