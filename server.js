const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Я взяла твой токен и обернула его в очистку от пробелов
const RAW_TOKEN = 'Sl.u.AGMVlhUlBPwfAlQ5EgUo0TlXIKvu-55LFR2UoIZxD8ZnUFNAZlQnx6KWgBeBSigRrN_nd7zhILVcqf-Gu4hoNwhSi-18CELbPRP-GVz9Ck2TenmVnLuWYFjLEpe2Fqjt7KGkMLlt9I2acl-a7q9vXdZ2chrj9zqCS2qxfRCM-LO8RWrJq2Ho8Pdy0Okcdf_-MERWQHE0cAYnUoSydAQTHokOe5agU_sXXS97VRJ4C8y0NmMQpXqgC6wHjp0QHZ45_unSA0s2DKbQp66Re2_ascZ28ZjGZ0cBb_4Z1PW4tETVfcAsrZz1y2_lHcZA_EBAtyfoZrFq93VjcgM0YUrXbtxsK0ofMJ2EEYckObeV9xloefR5PdZ2pufzXtnptb67aU338hOQ2O5IzxNrWIwXnVUsVmMwAdxVGfThx3dJEqrwyY1x-3G3NK1KpsHAOkkjU743mn_xufFUGWNL_CeEfmekLchYWGeG7CJO1muUt3e_Ynm1CcYjY450K3TCzXhakC6OSYrLuGqD6XKeL_vhKnuy9Xg3ehMcp68NAvkczBiEi72R1IhkYRUYChSPXhZuvLR3mBka6MVqwKsn11tcOovfodPF7eTvph4MFhSTmVkXyeg2S_O71aKHoyjMUvC7-p84tuasY_7X35B7jYAYiHsb048OW7XmkGsDZO6A4u4axPyHd-B3mu4OuoPLCwYfdo7EhVJfm8f6O7CQCd8dby7sLA_m_4M0pg3uCxju-rCzarapz8gr-DZmtMx2HHksMLzkf-4nnvb90AKpcEqf8hvo8y0_PAMXQ6TMHjsqg_nWF-y9NjCvFqNvHOIDpDy2NINlgDnA8AcUKsRwHLt0cVAxPJp56KAttkR8bRZB7UXWoAEHgBdJucTJ8WNpn1qRvjHcnXJMJavbKEd1U_sn_5hlkRGBJWexNKlfHxZQr0YGGtLq09VRAnufKOKubVwgSsdwGeoxYKcyksYtoYNH7Funzs5Qbgy1efH_-0op_nIv_3noPzPyPisq50ik5BApuMXNfQ1P31GpyOpcUUs7fdaPD-S3zA-5p3s-KjiPpELGRP_Fb7GCu7ZjOmytWqxMhfnd5Nulydlv4y1b4QMNvIZ5jZWt6759qjWqlE4J4mbJfjZ6jYQMFq1pXiaChjW2rP4jfiY2D0Zz3N7ReQu9wWdTi1TzwBK_k-5cfh6_VGdUVcZglDN8oScLJbjWaT0ZwjK2nD2yWalWuttjvC47xw2ioF-gwqGEjwTBMp58AeFQaRm3sJ8kywccbQOVvfUWn-A2u16JoDrZ2PZAY8ojtFAJSa_iNDvAfMRG8_GjqTS8YL4pPLRG5Peh6NeL6ZE';
const DBX_TOKEN = RAW_TOKEN.trim().replace(/['"]+/g, ''); 

app.post('/upload', async (req, res) => {
    console.log("--- ПОПЫТКА ЗАГРУЗКИ ---");
    try {
        const { image, address, city, worker, client, pod } = req.body;
        
        if (!image) return res.status(400).send("No image");

        const date = new Date().toLocaleDateString('ru-RU').replace(/\./g, '-');
        const fileName = `${address || 'Photo'}_п${pod || 0}_${Date.now()}.jpg`;
        const fullPath = `/${client || 'Client'}/${city || 'City'}/${date}/${worker || 'Worker'}/${fileName}`;

        console.log("Путь:", fullPath);

        const dbxArg = JSON.stringify({
            path: fullPath,
            mode: 'add',
            autorename: true
        }).replace(/[^\x00-\x7F]/g, c => "\\u" + ("000" + c.charCodeAt(0).toString(16)).slice(-4));

        const response = await axios({
            method: 'post',
            url: 'https://content.dropboxapi.com/2/files/upload',
            headers: {
                'Authorization': `Bearer ${DBX_TOKEN}`,
                'Content-Type': 'application/octet-stream',
                'Dropbox-API-Arg': dbxArg
            },
            data: Buffer.from(image, 'base64')
        });

        console.log("✅ УСПЕХ!");
        res.json({ success: true });

    } catch (e) {
        console.log("❌ ОШИБКА DROPBOX:");
        if (e.response) {
            console.log(JSON.stringify(e.response.data));
            res.status(400).send(e.response.data);
        } else {
            console.log(e.message);
            res.status(500).send(e.message);
        }
    }
});

app.listen(process.env.PORT || 3000, () => console.log("SERVER LIVE"));
