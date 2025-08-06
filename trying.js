import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs';

dotenv.config();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const wallets = JSON.parse(fs.readFileSync('./wallets.json', 'utf8'));
const pollingInterval = 60000; // 15 seconds

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

        if (tx.type !== 'SWAP') {
          console.log(`⚠️ Skipping non-swap tx: ${tx.signature}`);
          continue;
        }

        const solOut = tx.nativeTransfers?.find(t =>
          t.fromUserAccount === address && t.toUserAccount !== address
        );

        const tokenIn = tx.tokenTransfers?.find(t =>
          t.toUserAccount === address && t.fromUserAccount !== address
        );

        if (!solOut || !tokenIn) {
          console.log(`⚠️ Not a SOL ➝ Token buy for ${label}`);
          continue;
        }

        const ca = tokenIn.mint || 'N/A';
        const solAmount = parseFloat(solOut.amount) / 1e9;

        const message = `🚨 NEW CALL 🚨

🔹 Wallet: ${label}
🔹 CA: \`${ca}\`
🔹 Smart Wallets Invested: ${solAmount.toFixed(2)} SOL`;

        console.log(`✅ Sending BUY alert for ${label}: ${tx.signature}`);
        await sendTelegram(message);
        newTxFound = true;
        break; // Send only one new transaction per wallet per cycle
      }

      if (!newTxFound) {
        console.log(`🟡 No new BUY transactions for ${label}`);
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
