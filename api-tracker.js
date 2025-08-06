import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs';

dotenv.config();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const wallets = JSON.parse(fs.readFileSync('./wallets.json', 'utf8'));
const pollingInterval = 15000; // 15 seconds

const seenSignatures = new Set();

async function pollWallets() {
  for (const [address, label] of Object.entries(wallets)) {
    try {
      console.log(`🔍 Checking wallet: ${label} (${address})`);

      const url = `https://api.helius.xyz/v0/addresses/${address}/transactions/?api-key=${HELIUS_API_KEY}`;
      const res = await fetch(url);
      const txs = await res.json();

      if (!Array.isArray(txs)) {
        console.error(`❌ Invalid response for ${label}:`, txs);
        continue;
      }

      if (txs.length === 0) {
        console.log(`📭 No transactions found for ${label}`);
        continue;
      }

      let newTxFound = false;

      for (const tx of txs) {
        if (seenSignatures.has(tx.signature)) continue;

        seenSignatures.add(tx.signature);
        newTxFound = true;

        const message = `🚨 New TX for ${label} (${address}):
🔹 Type: ${tx.type}
🔹 Amount: ${tx.nativeTransfers?.[0]?.amount || 'N/A'} SOL
🔹 From: ${tx.nativeTransfers?.[0]?.fromUserAccount || 'N/A'}
🔹 To: ${tx.nativeTransfers?.[0]?.toUserAccount || 'N/A'}
🔹 Tx: https://solscan.io/tx/${tx.signature}`;

        await sendTelegram(message);
      }

      if (!newTxFound) {
        console.log(`🟡 No new transactions for ${label}`);
      }

    } catch (error) {
      console.error(`⚠️ Error fetching txs for ${label}:`, error.message);
    }
  }
}

// ✅ Now pollWallets is closed, define sendTelegram below
async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' })
  });
}

console.log("📡 Polling Helius for wallet activity...");
sendTelegram('🤖 Wallet tracker started and polling Helius...');
setInterval(pollWallets, pollingInterval);
