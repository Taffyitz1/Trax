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
  console.log("📂 Loaded wallets:", Object.keys(wallets).length, "wallets");
} catch (err) {
  console.error("❌ Failed to load wallets.json:", err);
  process.exit(1); // Exit if wallets.json can't be loaded
}

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

// Track seen transactions to avoid duplicates
const seenTransactions = new Set();

// Telegram alert function with MarkdownV2 support
async function sendTelegram(text, parse_mode = "MarkdownV2") {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = { 
    chat_id: chatId, 
    text,
    parse_mode
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.description || 'Unknown Telegram error');
    }
    return data;
  } catch (err) {
    console.error('❌ Telegram send error:', err);
    throw err;
  }
}

// Startup message
sendTelegram("✅ Webhook bot is live and tracking...").catch(err => 
  console.error("❌ Startup message failed:", err)
);

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  const events = req.body;

  if (!Array.isArray(events) || events.length === 0) {
    console.log('⚠️ Empty or invalid payload received');
    return res.status(200).send('no data');
  }

  for (const event of events) {
    try {
      console.log("📩 New Event:", JSON.stringify(event, null, 2));

      // Skip if not a swap or missing data
      if (event.type !== 'SWAP' || !event.tokenTransfers?.length) {
        console.log('↩️ Skipping non-swap event');
        continue;
      }

      // Get buyer wallet address
      const account = event.tokenTransfers[0].fromUserAccount || event.account;
      if (!account || !wallets[account]) {
        console.log(`⏩ Skipping - Wallet not in tracking list: ${account}`);
        continue;
      }

      // Get token being bought
      const tokenMint = event.tokenOutputMint || event.tokenTransfers[0].mint;
      
      // Create unique transaction ID to prevent duplicates
      const txId = `${account}:${tokenMint}:${event.signature}`;
      if (seenTransactions.has(txId)) {
        console.log('⏩ Skipping duplicate transaction:', txId);
        continue;
      }
      seenTransactions.add(txId);

      // Calculate SOL spent (only outgoing from buyer)
      const solAmount = (event.nativeTransfers || [])
        .filter(t => t.fromUserAccount === account)
        .reduce((sum, t) => sum + t.amount, 0);

      if (solAmount <= 0) {
        console.log('⏩ Skipping - No SOL invested');
        continue;
      }

      // Format message with proper escaping
      const escapeMd = (text) => String(text).replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
      const message = `🚨 NEW CALL 🚨\n\n` +
                     `🔹 Wallet: ${escapeMd(wallets[account])}\n` +
                     `🔹 CA: \`${escapeMd(tokenMint)}\`\n` +
                     `🔹 SOL Invested: ${escapeMd((solAmount / 1e9).toFixed(2))} SOL` +
                     (event.source ? `\n🔹 DEX: ${escapeMd(event.source)}` : '');

      await sendTelegram(message);
      console.log(`📤 Alert sent for ${wallets[account]} buying ${tokenMint}`);

    } catch (err) {
      console.error('⚠️ Error processing event:', err);
    }
  }

  res.status(200).send('ok');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🟢 Tracker running on port ${PORT}`);
  // Clear seen transactions every hour to prevent memory buildup
  setInterval(() => seenTransactions.clear(), 60 * 60 * 1000);
});
