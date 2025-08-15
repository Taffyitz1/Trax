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
      "So11111111111111111111111111111111111111112", // WSOL
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
      "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"  // USDT
    ].map(m => m.toLowerCase());

    function extractBuyTokenMint(event, rawAccount) {
  const user = (rawAccount || '').toLowerCase();

  // Keep a lowercased set for comparisons
  const stableSet = new Set(stableAndBaseMints.map(m => String(m).toLowerCase()));

  // Normalize transfers BUT keep original mint for return
  const transfers = (event.tokenTransfers || []).map(t => ({
    fromLC: t.fromUserAccount?.toLowerCase() || '',
    toLC: t.toUserAccount?.toLowerCase() || '',
    mintLC: t.mint?.toLowerCase() || '',
    mint: t.mint || '' // original case preserved
  }));

  // Helpers
  const hasIncomingStable = transfers.some(t => t.toLC === user && stableSet.has(t.mintLC));
  const hasOutgoingStable = transfers.some(t => t.fromLC === user && stableSet.has(t.mintLC));
  const incomingNonStable = transfers.find(t => t.toLC === user && !stableSet.has(t.mintLC));

  // Native SOL spent by the user (wrap path etc.)
  const lamportsOut = (event.nativeTransfers || [])
    .filter(nt => nt.fromUserAccount?.toLowerCase() === user)
    .reduce((s, nt) => s + (Number(nt.amount) || 0), 0);

  // --- Hard "sell" shield: if any stable comes IN to the user, it's a sell or LP removal
  if (hasIncomingStable) return null;

  // 1) Swap summary fields: stable in -> non-stable out (cleanest signal)
  if (event.tokenInputMint && event.tokenOutputMint) {
    const inLC = String(event.tokenInputMint).toLowerCase();
    const outLC = String(event.tokenOutputMint).toLowerCase();
    if (stableSet.has(inLC) && !stableSet.has(outLC)) {
      return event.tokenOutputMint; // keep original case
    }
  }

  // 2) Order-independent transfers: user sent stable, received non-stable
  if (hasOutgoingStable && incomingNonStable) {
    return incomingNonStable.mint; // keep original case
  }

  // 3) Native SOL path: user spent lamports (wrap), then received non-stable
  //    (guards against airdrops/claims which have no real outflow)
  if (lamportsOut > 0 && incomingNonStable) {
    return incomingNonStable.mint;
  }

  // No clean buy signal
  return null;
    }

    const tokenMint = extractBuyTokenMint(event, account);
    if (!tokenMint) continue;

    // SOL amount calculation
    const solAmount = (event.nativeTransfers || []).reduce((sum, t) => sum + t.amount, 0);

    // Message format
    const message = `🚨 NEW CALL 🚨\n\n` +
                   `🔹 Wallet: ${walletLabel}\n` +
                   `🔹 CA: ${tokenMint} \n` +
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
