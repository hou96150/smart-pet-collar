const { createApp } = require('./app');

// Raspberry Pi 與開發電腦可用環境變數調整監聽位置，不必修改程式碼。
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '0.0.0.0';
const server = createApp();

server.listen(port, host, () => {
  console.log(`智慧寵物項圈伺服器：http://${host}:${port}`);
});
