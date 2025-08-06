import express from 'express';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs';

dotenv.config();
const app = express();
app.use(express.json());

const wallets = JSON.parse(fs.readFileSync('./wallets.json', 'utf8'));
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

app.post('/webhook', async (req, res) => {
  const txs = req.body;

  for (const event of txs) {
    if (event.type === 'SWAP' && event.nativeInputAmount && event.tokenOutputMint) {
      const label = wallets[event.account] || event.account;
      const solAmount = (event.nativeInputAmount / 1e9).toFixed(2);
      const token = event.tokenOutputMint;

      const msg = `🚨 NEW CALL 🚨

🔹 Wallet: ${label}
🔹 CA: ${token}
🔹 Smart Wallets Invested: ${solAmount} SOL`;

      await sendTelegram(msg);
    }
  }

  res.status(200).send('ok');
});

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🟢 Tracker running on port ${PORT}`);
});
