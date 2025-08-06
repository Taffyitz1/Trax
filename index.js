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

// Send Telegram startup message
sendTelegram('✅ Wallet Tracker started.');

// Webhook listener
app.post('/webhook', async (req, res) => {
  const txs = req.body;

  console.log(`📩 Received webhook with ${txs.length} transactions`);

  for (const event of txs) {
    console.log(`🔎 Event Type: ${event.type}`);

    if (event.type === 'SWAP' && event.nativeInputAmount && event.tokenOutputMint) {
      const label = wallets[event.account] || event.account;
      const solAmount = (event.nativeInputAmount / 1e9).toFixed(2);
      const token = event.tokenOutputMint;

      const msg = `🚨 NEW CALL 🚨

🔹 Wallet: ${label}
🔹 CA: ${token}
🔹 Smart Wallets Invested: ${solAmount} SOL`;

      try {
        await sendTelegram(msg);
        console.log(`📤 Sent Telegram alert for wallet: ${label}`);
      } catch (err) {
        console.error(`❌ Failed to send Telegram message:`, err);
      }
    }
  }

  res.status(200).send('ok');
});

// Telegram send function
async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  const data = await res.json();

  if (!data.ok) {
    throw new Error(`Telegram API Error: ${data.description}`);
  }
}

// Server start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🟢 Tracker running on port ${PORT}`);
});
