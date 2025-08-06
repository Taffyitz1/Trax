import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs';

dotenv.config();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const wallets = JSON.parse(fs.readFileSync('./wallets.json', 'utf8'));
const pollingInterval = 60000; // 1 minute

const seenSignatures = new Set();

async function pollWallets() {
  const now = Math.floor(Date.now() / 1000); // current UNIX time in seconds

  for (const [address, label] of Object.entries(wallets)) {
    try {
      console.log(`🔍 Checking wallet: ${label} (${address})`);

      const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}`;
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
        const txTime = tx.blockTime || 0;
        const age = now - txTime;

       // if (age > 120) continue; // skip if older than 2 minutes
       // if (seenSignatures.has(tx.signature)) continue;

       // seenSignatures.add(tx.signature);
        newTxFound = true;

        // Grab contract address (CA)
        const contractAddress = tx.tokenTransfers?.[0]?.mint || 'N/A';

        // Sum total SOL invested in this TX
        const amount = (tx.nativeTransfers || [])
          .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
          .toFixed(2);

        const message = `🚨 NEW CALL 🚨

🔹 Wallet: ${label}
🔹 CA: ${contractAddress}
🔹 Smart Wallets Invested: ${amount} SOL`;

        console.log(`📨 Sending TX for ${label}: ${tx.signature}`);
        await sendTelegram(message);
        break; // Send only one new transaction per wallet per cycle
      }

      if (!newTxFound) {
        console.log(`🟡 No new transactions for ${label}`);
      }

    } catch (error) {
      console.error(`⚠️ Error fetching txs for ${label}:`, error.message);
    }
  }
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'Markdown'
    })
  });
}

console.log("📡 Polling Helius for wallet activity...");
sendTelegram('🤖 Wallet tracker started and polling Helius...');
setInterval(pollWallets, pollingInterval);
