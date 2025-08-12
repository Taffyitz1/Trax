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
                   "Unknown";

    // Wallet label from wallets.json with proper fallback
    const walletLabel = wallets[account] || 
                       (account !== "Unknown" ? `${account.slice(0, 4)}...${account.slice(-4)}` : "Unknown Wallet");

    const stableAndBaseMints = [
      "So11111111111111111111111111111111111111111", // SOL
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
      "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"  // USDT
    ].map(m => m.toLowerCase());

    function extractBuyTokenMint(event, userAccount) {
      userAccount = userAccount.toLowerCase();

      if (event.tokenTransfers?.length >= 2) {  
        // Find index of outgoing stable  
        const outgoingIndex = event.tokenTransfers.findIndex(t =>   
          t.fromUserAccount?.toLowerCase() === userAccount &&  
          stableAndBaseMints.includes(t.mint?.toLowerCase())  
        );  

        if (outgoingIndex === -1) {  
          return null; // No outgoing stable — not a buy  
        }  

        // Find incoming non-stable that happens after the outgoing stable  
        const incomingAfter = event.tokenTransfers.find((t, idx) =>   
          idx > outgoingIndex &&  
          t.toUserAccount?.toLowerCase() === userAccount &&  
          !stableAndBaseMints.includes(t.mint?.toLowerCase())  
        );  

        if (incomingAfter) {  
          return incomingAfter.mint; // This is the bought token  
        }  
      }  

      // Fallback for DEX swap events if tokenTransfers not available  
      if (event.tokenInputMint && event.tokenOutputMint) {  
        const isOutgoingStable = stableAndBaseMints.includes(event.tokenInputMint.toLowerCase());  
        const isIncomingStable = stableAndBaseMints.includes(event.tokenOutputMint.toLowerCase());  

        if (isOutgoingStable && !isIncomingStable) {  
          return event.tokenOutputMint;  
        }  
      }  

      return null;
    }

    const tokenMint = extractBuyTokenMint(event, account);
    if (!tokenMint) continue;

    // SOL amount calculation - summing all native transfers
    const solAmount = (event.nativeTransfers || []).reduce((sum, t) => sum + t.amount, 0);

    // Message format
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
