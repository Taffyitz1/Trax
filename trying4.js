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

// 🛑 MINT FILTER — Add known utility mints to exclude
const utilityTokens = new Set([
  'So11111111111111111111111111111111111111112', // Wrapped SOL
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'  // USDC
]);

// 📦 Safe fetch with retries
async function safeFetch(url, options = {}, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      console.error(`⚠️ Network error (attempt ${i + 1}): ${err.message}`);
      if (i < retries - 1) await new Promise(res => setTimeout(res, delay));
    }
  }
  throw new Error(`🛑 Failed after ${retries} attempts: ${url}`);
}

async function pollWallets() {
  const now = Math.floor(Date.now() / 1000); // UNIX time

  for (const [address, label] of Object.entries(wallets)) {
    try {
     // console.log(`🔍 Checking wallet: ${label} (${address})`);
      const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}`;
      const res = await safeFetch(url);

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

        // ⏱ Skip if older than 2 minutes
        if (age > 360) continue;

        // 🧠 Skip if we've seen this tx before
        if (seenSignatures.has(tx.signature)) continue;

        seenSignatures.add(tx.signature);

        if (tx.type !== 'SWAP') {
          console.log(`⚠️ Skipping non-swap tx: ${tx.signature}`);
          continue;
        }

        const solOut = tx.nativeTransfers?.find(t =>
          t.fromUserAccount === address && t.toUserAccount !== address
        );

        const tokenIn = tx.tokenTransfers?.find(t =>
          t.toUserAccount === address &&
          t.fromUserAccount !== address &&
          !utilityTokens.has(t.mint)
        );

        if (!solOut || !tokenIn) {
         // console.log(`⚠️ Not a SOL ➝ Token buy for ${label}`);
          continue;
        }

        const ca = tokenIn.mint || 'N/A';
        const solAmount = parseFloat(solOut.amount) / 1e9;

        const message = `🚨 NEW CALL 🚨
🔹 Wallet: ${label}
🔹 CA: \`${ca}\`
🔹 Smart Wallets Invested: ${solAmount.toFixed(2)} SOL
🔗 [View on Solscan](https://solscan.io/tx/${tx.signature})`;

        console.log(`✅ Sending BUY alert for ${label}: ${tx.signature}`);
        await sendTelegram(message);
        newTxFound = true;
        break; // Send only one new tx per wallet per cycle
      }

      if (!newTxFound) {
        console.log(`🟡 No new BUY transactions for ${label}`);
      }

    } catch (error) {
      console.error(`⚠️ Error fetching txs for ${label}:`, error.message);
    }

    // ⏱ Wait between wallets to avoid rate limit
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  await safeFetch(url, {
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
