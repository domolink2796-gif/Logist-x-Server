const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const DROPBOX_TOKEN = 'Sl.u.AGMQi4Tv5zDLFH0PCu8O2lX-rGA1Ad5Xp_1R3E2ryqApDVho5MDqM5ESnPpvWQ1cNO-dw2YuBHz-YC_ciGo_focnemsbSIYRUq3Q5zhWTvfuO9OIow5iAlH_rjTZ_nOJx-ShuI1Bu0Ig6Z90rcsvG1r763FzVnoyqIDNHG-J7QUSoqlIRqN7PIznzjSyzZQg-VDv42N3mxUuDrWV1_UPEr5xSXOuY1da2LWU7QHm7vVVozt7zCzwVow91gcIll8UAP6xK1ge81cxb-OG5cfg_IjTYznyutDJ7-8-35wRFR90ztJhBNt1bn6IO31jOEcKNpmvZO9xO41y8QZDGem5UiGCZelVFHMz3pzWfZmmt9co_ONM3JrtsgPrfAdwILhCzHOdue6Aj4OAFP7ToahWC_6PnfhaWhO-UoIo4geIODhTeMMGWCNczCAJYlSpkVFwHgwClqB-oGxshK_jeA4K-OhG-lJwx-YSEOXRjcRAIDLybBPQCCaQi5hrQWBskp91eOdehReBQ92T_8qbtQDopCRh83zLXxhZjxhbrdOqd5X3jsT5KyiRIvC_7F1n1NnfEMc75nYO36HFzffvmkTxEPacVbd-vUvlYytcD37k3hNyvLwVqawrh1l1MT8g5vLXjWYczT4N3M4a-8eq-A_F7GhCnFOxbt3F0m7440-NSb3psYJLI4uBc7LJsOmytu1scOUivhGFPgISEEF6WUJOUD6ylKxEsLPK5qRr0jCt_ze2BaXbvIskc9eAoCPL-GQ6--KqNnNtKUoyiKp-c1uJe2f1gePLKaAsGq-A0E-3ZRMD1H3ce0wzrC3n7Ogfn-Nhc2dNRh7p_bII5pvNI4QsCQaf65EucmDEojc-PU0F7aSV8KCdvHX2eciLaQkXKS1mZtyEpMa94-ZxJce5ghKww-b1-kLOJGLeb7F-6F5z1NPx4ucYcviHfE1b89D_S7nODjbEz7f2H-cQkK6orujW3CKPARUY0ZVt1SLwk93c2oPWniSA_peCWAOB55axKtxrO37QISeDDQ7p3LNjrxqFt8jMGJ3-LwACXZdY-I7HkQ0d8QoWdvsqmJT3JpsosGdQZInW6U2him_0wdPXk0qVNiO3MtCqqtkklwmgkH69jGYBP-o-cp2xfQ5G-ylvU3l3IEf2aUm4cy6RcRncHuSKPHrqjNu3EUU1LSIc6NWZodGGQWmdwnHQtdL-HZDX6dwApcC8fu-1gPY0UJvUMViaG7LM6iOilwOxXfNE1M-4Vkaavq8bUSZmJfTOTn1S2-AxhdnPL0vzoesz-q7uPgBLcE_s-MkiRfMTQrxcDvvItVHYJHa9sI8TcKX6pVJCXQIqECY';

app.get('/status', (req, res) => res.json({ status: "Dropbox Server Online" }));

app.post('/upload', async (req, res) => {
    try {
        const { image, address, pod, workType, city } = req.body;
        if (!image) return res.status(400).json({ success: false });

        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const date = new Date().toLocaleDateString('ru-RU').replace(/\./g, '-');
        
        // Формируем путь
        const fullPath = `/LogistX/${workType || 'Работа'}/${city || 'Город'}/${date}/${address || 'Фото'}_п${pod || 0}.jpg`;
        console.log("Загрузка в:", fullPath);

        // ВАЖНО: Кодируем путь так, чтобы Dropbox не ругался на русские буквы
        const safePath = JSON.stringify({
            path: fullPath,
            mode: 'add',
            autorename: true
        }).replace(/[^\x00-\x7F]/g, (c) => '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4));

        await axios({
            method: 'post',
            url: 'https://content.dropboxapi.com/2/files/upload',
            headers: {
                'Authorization': `Bearer ${DROPBOX_TOKEN.trim()}`,
                'Content-Type': 'application/octet-stream',
                'Dropbox-API-Arg': safePath
            },
            data: buffer
        });

        console.log("✅ ЗАГРУЖЕНО!");
        res.json({ success: true });

    } catch (e) {
        console.log("❌ ОШИБКА DROPBOX:");
        console.log(e.response ? JSON.stringify(e.response.data) : e.message);
        res.status(500).json({ success: false });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server Live`));
