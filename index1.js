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

const seenTokens = new Set(); 

// Optional: No async (tify Telegram when bot starts
sendTelegram("✅ Webhook bot is live and tracking...").catch(err =>
  console.error("❌ Failed to send startup message:", err)
);

console.log("✅ Webhook server starting...");

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  const events = req.body;

  if (!Array.isArray(events) || events.length === 0) {
    console.log('⚠️ Empty or invalid payload received');
    return res.status(200).send('no data');
  }

  for (const event of events) {
    console.log("📩 New Event:", JSON.stringify(event, null, 2));

    // Extract wallet account - using the method that worked before
    const account = event.account || 
                   event.tokenTransfers?.[0]?.fromUserAccount || 
                   event.tokenTransfers?.[0]?.toUserAccount || 
                   "Unknown";

    // Skip if wallet not in wallets.json
    if (!wallets[account]) {
      console.log(`⏩ Skipping - Wallet not in tracking list: ${account}`);
      continue;
    }
    const walletLabel = wallets[account]; // Only uses names from wallets.json

    // Extract token mint (CA) - using working method
    const tokenMint = event.tokenTransfers?.[0]?.mint || event.tokenOutputMint || "N/A";

    // Skip if we've already alerted about this token
    if (seenTokens.has(tokenMint)) {
      console.log(`⏩ Skipping duplicate token: ${tokenMint}`);
      continue;
      
    seenTokens.add(tokenMint);

    // SOL amount calculation - summing all native transfers as originally
    const solAmount = (event.nativeTransfers || []).reduce((sum, t) => sum + t.amount, 0);

    // Your exact desired message format
    const message = `🚨 NEW CALL 🚨\n\n` +
                   🔹 Wallet: ${walletLabel}\n` +
                   🔹 CA: ${tokenMint} \n` +
                   🔹 Smart Wallets Invested: ${(solAmount / 1e9).toFixed(2)} SOL`;

    await sendTelegram(message);
  }

  res.status(200).send('ok');
});

// Telegram alert function
async function sendTelegram(text, parse_mode) {
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
