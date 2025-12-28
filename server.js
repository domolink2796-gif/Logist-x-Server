app.post('/upload', async (req, res) => {
  const data = req.body;
  try {
    // 1. Создаем/находим иерархию папок
    const dateStr = new Date().toLocaleDateString('ru-RU').replace(/\//g, '.');
    
    const workerFolder = await getOrCreateFolder(data.worker || "Без имени", ROOT_FOLDER_ID);
    const cityFolder = await getOrCreateFolder(data.city || "Без города", workerFolder);
    const dateFolder = await getOrCreateFolder(dateStr, cityFolder);
    const clientFolder = await getOrCreateFolder(data.client || "ОБЩИЙ", dateFolder); // Тот самый 4-й уровень

    // 2. Формируем чистое имя файла: Адрес_Подъезд
    const fileName = `${data.address}_п.${data.pod || '?'}.jpg`.replace(/[/\\?%*:|"<>]/g, '-');

    const fileMetadata = { 
        name: fileName, 
        parents: [clientFolder] // Кладем фото в папку клиента
    };
    
    const media = { 
        mimeType: 'image/jpeg', 
        body: Buffer.from(data.image, 'base64') 
    };
    
    await drive.files.create({ resource: fileMetadata, media: media });
    
    // 3. Отправляем уведомление в Телеграм
    bot.sendMessage(ADMIN_ID, `✅ Фото сохранено!\n📂 Путь: ${data.worker}/${data.city}/${dateStr}/${data.client}\n📍 Адрес: ${data.address}\n🌍 GPS: ${data.coords}`);
    
    res.json({ success: true });
  } catch (e) {
    console.error("Ошибка при загрузке:", e);
    res.json({ success: false, message: e.message });
  }
});
