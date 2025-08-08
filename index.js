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

// Optional: No async (tify Telegram when bot starts
sendTelegram("✅ Webhook bot is live and tracking...").catch(err =>
  console.error("❌ Failed to send startup message:", err)
);

console.log("✅ Webhook server starting...");

// Webhook endpoint
app.post('/webhook', async (req, res) => {
app.post('/webhook', async (req, res) => {
  const events = req.body;

  if (!Array.isArray(events) || events.length === 0) {
    console.log('⚠️ Empty or invalid payload received');
    return res.status(200).send('no data');
  }

  for (const event of events) {
    console.log("📩 New Event:", JSON.stringify(event, null, 2));

    // 1. RELIABLE ACCOUNT DETECTION (event.account first)
    const account = event.account || 
                    event.tokenTransfers?.[0]?.fromUserAccount || 
                    event.tokenTransfers?.[0]?.toUserAccount || 
                    "Unknown";

    // 2. WALLET LABEL (tag from wallets.json or shortened address)
    const walletLabel = wallets[account] || 
                       (account !== "Unknown" ? `${account.slice(0, 4)}...${account.slice(-4)}` : "Unknown Wallet");

    // 3. CONTRACT ADDRESS (CA) DETECTION
    const CA = event.tokenTransfers?.[0]?.mint || 
               event.tokenOutputMint || 
               "N/A";

    // 4. ACCURATE SOL CALCULATION - Only outgoing transfers from this account
    const solAmount = (event.nativeTransfers || [])
      .filter(t => t.fromUserAccount === account)
      .reduce((sum, t) => sum + t.amount, 0);

    // Skip if no valid investment detected
    if (solAmount <= 0) {
      console.log('⏩ Skipping - No SOL invested:', account);
      continue;
    }

    // 5. MESSAGE FORMAT FROM WORKING VERSION (with CA in monospace)
    const message = `🚨 NEW CALL 🚨\n\n` +
                   `🔹 Wallet: ${walletLabel}\n` +
                   `🔹 CA: \`${CA}\`\n` +
                   `🔹 Smart Wallets Invested: ${(solAmount / 1e9).toFixed(2)} SOL`;

    await sendTelegram(message, "Markdown");
  }

  res.status(200).send('ok');
});
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

//  res.status(200).send('ok');
//});

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
