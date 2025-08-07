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
app.post('/webhook', async (req, res) => {
  try {
    console.log("📩 Webhook HIT from Helius!");
    console.log("📦 Payload:", JSON.stringify(req.body, null, 2));

    const webhook = req.body;

    if (!webhook || !webhook.data || !webhook.data.events) {
      console.log('⚠️ Invalid webhook format');
      return res.status(200).send('invalid format');
    }

    const { description, events } = webhook.data;
    const msgChunks = [];

    // Handle token transfers
    if (events.tokenTransfers && events.tokenTransfers.length > 0) {
      for (const tx of events.tokenTransfers) {
        msgChunks.push(`🔄 Token Transfer
🧾 From: ${tx.fromUserAccount}
📥 To: ${tx.toUserAccount}
🪙 Token: ${tx.mint}
💰 Amount: ${tx.tokenAmount}`);
      }
    }
// Handle NFT events
    if (events.nftEvents && events.nftEvents.length > 0) {
      for (const nft of events.nftEvents) {
        msgChunks.push(`🎨 NFT Event
📦 Type: ${nft.type}
🧾 Mint: ${nft.mint}
🎯 Buyer: ${nft.buyer}
💸 Seller: ${nft.seller}`);
      }
    }

// Handle DeFi events (liquidity, staking, etc)
    if (events.dexTrades && events.dexTrades.length > 0) {
      for (const dex of events.dexTrades) {
        msgChunks.push(`💹 DEX Trade
🪙 From: ${dex.baseMint}
➡ To: ${dex.quoteMint}
💰 Amount In: ${dex.baseAmount}
💰 Amount Out: ${dex.quoteAmount}`);
   }
      }
    // Handle native (SOL) transfers
    if (events.nativeTransfers && events.nativeTransfers.length > 0) {
      for (const tx of events.nativeTransfers) {
        msgChunks.push(`⚡ SOL Transfer
🧾 From: ${tx.fromUserAccount}
📥 To: ${tx.toUserAccount}
💰 Amount: ${tx.amount / 1e9} SOL`);
      }
    }

    // Handle swaps (optional)
    if (events.swaps && events.swaps.length > 0) {
      for (const swap of events.swaps) {
        msgChunks.push(`🔁 Swap Detected
💸 ${swap.nativeInputAmount / 1e9} SOL ➡ ${swap.tokenOutputAmount / 1e9} ${swap.tokenOutputSymbol || 'Token'}
🧠 Source: ${description || "N/A"}`);
      }
    }

    if (msgChunks.length > 0) {
      await sendTelegram(`📡 Helius Webhook Received:\n\n${msgChunks.join('\n\n')}`);
    } else {
      console.log("ℹ️ No events to send.");
    }

    res.status(200).send('ok');
  } catch (err) {
    console.error('❌ Error processing webhook:', err);
    res.status(500).send('error');
  }
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
