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

//const sentTokenMints = new Set();
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

    // Wallet label from wallets.json with proper fallback
    const walletLabel = wallets[account] || 
                       (account !== "Unknown" ? `${account.slice(0, 4)}...${account.slice(-4)}` : "Unknown Wallet");
   // if (!wallets[account]) {
    //  console.log(`⏭️ Skipping wallet not in wallets.json: ${account}`);
    //  continue;
    }
    // Extract token mint (CA) - using working method
    const stableAndBaseMints = [
      "so11111111111111111111111111111111111111112", // SOL
      "epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwydt1v", // USDC
      "es9vmfrzacersdjq5jyuh...nyb"                 // USDT (shortened for example)
    ];

// 1. Check tokenTransfers for incoming tokens (toUserAccount = user, not a base/stable)
    const incomingTokenMints = event.tokenTransfers
      ?.filter(t => 
        t.toUserAccount?.toLowerCase() === account.toLowerCase() && // Received by user
        !stableAndBaseMints.includes(t.mint?.toLowerCase())        // Not a base/stablecoin
      )
      .map(t => t.mint) || [];

// 2. Fallback: Check if the event explicitly defines input/output mints
// (Prioritize tokenInputMint or similar fields if available)
    const fallbackMint = 
      event.tokenInputMint ||    // Some DEXs label the incoming token explicitly
      event.tokenInMint ||       // Alternative common field name
      event.destinationMint ||   // Sometimes called "destination"
      event.tokenOutputMint ||   // Last resort (but may be outgoing token)
      event.mint || 
      event.token?.mint || 
      "N/A";

// 3. Combine and dedupe, preferring incoming transfers over fallback
    const tokenMint = [...new Set([...incomingTokenMints, fallbackMint])]
      .find(m => m && m !== "N/A") || "N/A";
    // Skip if this tokenMint has already been sent once
    //if (sentTokenMints.has(tokenMint)) {
   //   console.log(`⏭️ Skipping already-sent tokenMint: ${tokenMint}`);
  //    continue;
    }

// Store the tokenMint
 //   sentTokenMints.add(tokenMint);
 //   console.log(`Added token mint to tracking: ${tokenMint}`);
    // SOL amount calculation - summing all native transfers as originally
    const solAmount = (event.nativeTransfers || []).reduce((sum, t) => sum + t.amount, 0);

    // Your exact desired message format
    const message = `🚨 NEW CALL 🚨\n\n` +
                   `🔹 Wallet: ${walletLabel}\n` +
                   `🔹 CA:${tokenMint} \n` +
                   `🔹 Smart Wallets Invested: ${(solAmount / 1e9).toFixed(2)} SOL`;

    await sendTelegram(message);
  }

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
