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
  console.log('🔔 Webhook triggered');
  const events = req.body;

  if (!Array.isArray(events) || events.length === 0) {
    console.warn('⚠️ Empty or invalid event body:', JSON.stringify(events, null, 2));
    return res.status(400).send('Invalid webhook payload');
  }

  for (const event of events) {
    console.log('📦 Processing event:', event);

    if (/*event.type === 'SWAP' &&*/ event.nativeInputAmount && event.tokenOutputMint) {
      const account = event.source || event.account || 'unknown';
      const label = wallets[account] || account;
      const solAmount = (event.nativeInputAmount / 1e9).toFixed(2);
      const token = event.tokenOutputMint;

      const msg = `🚨 NEW CALL 🚨

🔹 Wallet: ${label}
🔹 CA: ${token}
🔹 Smart Wallets Invested: ${solAmount} SOL`;

      console.log('📨 Sending Telegram message:', msg);

      try {
        await sendTelegram(msg);
        console.log('✅ Telegram alert sent successfully');
      } catch (err) {
        console.error('❌ Failed to send Telegram message:', err);
      }
    } else {
      console.log('⛔ Skipping non-SWAP or incomplete event:', event.type);
    }
  }

  res.status(200).send('ok');
});

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram API error: ${errorText}`);
  }
}

// Start the server and notify via Telegram
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🟢 Webhook tracker running on port ${PORT}`);
  try {
    await sendTelegram(`✅ Wallet Tracker is live and listening on port ${PORT}`);
    console.log('📢 Startup message sent to Telegram');
  } catch (err) {
    console.error('❌ Could not send startup message to Telegram:', err);
  }
});
