import express from 'express';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs';

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());

// Load wallets with tag names
let wallets = {};
try {
  wallets = JSON.parse(fs.readFileSync('./wallets.json', 'utf8'));
  console.log("📂 Loaded wallets:", wallets);
} catch (err) {
  console.error("❌ Failed to load wallets.json:", err);
}

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

// Optional: Notify Telegram when bot starts
sendTelegram("✅ Webhook bot is live and tracking...").catch(err =>
  console.error("❌ Failed to send startup message:", err)
);

console.log("✅ Webhook server starting...");

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  const webhook = req.body;
  console.log("📩 Webhook HIT from Helius!");
  console.log("📦 Raw Payload:", JSON.stringify(webhook, null, 2));

// Send ALL transactions to Telegram
const message = `🔔 New Transaction from Helius!\n\n` +
                `📌 Type: ${webhook.type}\n` +
                `🧾 Source: ${webhook.description || "No description"}\n` +
                `💰 Balance Change: ${JSON.stringify(webhook.accountData, null, 2)}`;

await sendTelegram(message);
// console.log('📩 Webhook HIT from Helius!');
//  console.log('📦 Raw Payload:', JSON.stringify(req.body, null, 2));

  //const events = req.body;

//  if (!Array.isArray(events) || events.length === 0) {
//    console.log('⚠️ Empty or invalid payload received');
//    return res.status(200).send('no data');
//  }

//  for (const event of events) {
//    console.log(`🔎 Event Type: ${event.type}`);

//    if (
//      event.type === 'SWAP' &&
//      event.nativeInputAmount &&
//      event.tokenOutputMint
//    ) {
//      const label = wallets[event.account] || event.account;
//      const solAmount = (event.nativeInputAmount / 1e9).toFixed(2);
//      const token = event.tokenOutputMint;

//      const msg = `🚨 NEW CALL 🚨

//🔹 Wallet: ${label}
//🔹 CA: ${token}
//🔹 Smart Wallets Invested: ${solAmount} SOL`;

 //     try {
  //      await sendTelegram(msg);
 //       console.log(`📤 Sent Telegram alert for wallet: ${label}`);
 //     } catch (err) {
//        console.error('❌ Failed to send Telegram message:', err);
//      }    } else {
//      console.log('ℹ️ Event didn’t match SWAP logic — skipping');
//    }
//  }

  res.status(200).send('ok');
});

// Telegram alert function
async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });

  const data = await response.json();
  console.log("📨 Telegram API response:", data);

  if (!data.ok) {
    throw new Error(data.description || 'Unknown Telegram error');
  }
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🟢 Tracker running on port ${PORT}`);
});
