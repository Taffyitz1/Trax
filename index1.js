import express from 'express';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs';

dotenv.config();

const app = express();
app.use(express.json());

// Load wallets
let wallets = {};
try {
  wallets = JSON.parse(fs.readFileSync('./wallets.json', 'utf8'));
  console.log("📂 Loaded wallets:", wallets);
} catch (err) {
  console.error("❌ Failed to load wallets.json:", err);
}

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

// Track tokens already alerted
const recentTokens = new Set();

// Send startup message
sendTelegram("✅ Webhook bot is live and tracking...").catch(err =>
  console.error("❌ Failed to send startup message:", err)
);

console.log("✅ Webhook server starting...");

app.post('/webhook', async (req, res) => {
  const events = req.body;

  if (!Array.isArray(events) || events.length === 0) {
    console.log('⚠️ Empty or invalid payload received');
    return res.status(200).send('no data');
  }

  for (const event of events) {
    console.log("📩 New Event:", JSON.stringify(event, null, 2));

    // Extract wallet account
    const account = event.account || 
                   event.tokenTransfers?.[0]?.fromUserAccount || 
                   event.tokenTransfers?.[0]?.toUserAccount || 
                   null;

    // Skip if wallet is not in wallets.json
    if (!account || !wallets[account]) {
      console.log(`⏭️ Skipping wallet not in list: ${account}`);
      continue;
    }

    const walletLabel = wallets[account];

    // Extract token mint (CA)
    const tokenMint = event.tokenTransfers?.[0]?.mint || event.tokenOutputMint || null;
    if (!tokenMint) {
      console.log("⚠️ No token mint found — skipping");
      continue;
    }

    // Skip duplicate tokens
    if (recentTokens.has(tokenMint)) {
      console.log(`⏭️ Already alerted for token: ${tokenMint}`);
      continue;
    }
    recentTokens.add(tokenMint);

    // Optional: auto-remove from set after X minutes
    setTimeout(() => recentTokens.delete(tokenMint), 10 * 60 * 1000); // 10 mins

    // Calculate SOL invested
    const solAmount = (event.nativeTransfers || []).reduce((sum, t) => sum + t.amount, 0);

    // Prepare message
    const message = `🚨 NEW CALL 🚨\n\n` +
      `🔹 Wallet: ${escapeMarkdownV2(walletLabel)}\n` +
      `🔹 CA: \`${escapeMarkdownV2(tokenMint)}\`\n` +
      `🔹 Smart Wallets Invested: ${(solAmount / 1e9).toFixed(2)} SOL`;

    await sendTelegram(message, "MarkdownV2");
  }

  res.status(200).send('ok');
});

// Escape special chars for MarkdownV2
function escapeMarkdownV2(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// Telegram send function
async function sendTelegram(text, parseMode = "MarkdownV2") {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode })
  });

  const data = await response.json();
  console.log("📨 Telegram API response:", data);

  if (!data.ok) {
    throw new Error(data.description || 'Unknown Telegram error');
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🟢 Tracker running on port ${PORT}`);
});
