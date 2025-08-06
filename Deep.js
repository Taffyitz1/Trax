import dotenv from 'dotenv';
import fetch from 'node-fetch';
import fs from 'fs';

dotenv.config();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const wallets = JSON.parse(fs.readFileSync('./wallets.json', 'utf8'));

const pollingInterval = 30000; // 30 seconds (more frequent checks)
const seenSignatures = new Set();
const MAX_AGE_SECONDS = 300; // 5 minutes max age

// 🛑 MINT FILTER — Add stablecoins to exclude
const excludedTokens = new Set([
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'So11111111111111111111111111111111111111112'  // Wrapped SOL
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
  const now = Math.floor(Date.now() / 1000); // Current UNIX time

  for (const [address, label] of Object.entries(wallets)) {
    try {
      const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}`;
      const res = await safeFetch(url);
      const txs = await res.json();

      if (!Array.isArray(txs)) {
        console.error(`❌ Invalid response for ${label}:`, txs);
        continue;
      }

      // Filter for recent SWAP transactions (up to 5 minutes old)
      const recentSwaps = txs.filter(tx => {
        const txTime = tx.blockTime || 0;
        const age = now - txTime;
        return age <= MAX_AGE_SECONDS && 
               tx.type === 'SWAP' && 
               !seenSignatures.has(tx.signature);
      });

      if (recentSwaps.length === 0) {
        console.log(`🟡 No new qualifying swaps for ${label}`);
        continue;
      }

      // Process each qualifying swap
      for (const tx of recentSwaps) {
        seenSignatures.add(tx.signature);

        // Find SOL out transfer (user sending SOL)
        const solOut = tx.nativeTransfers?.find(t =>
          t.fromUserAccount === address && 
          t.toUserAccount !== address
        );

        // Find token in transfer (user receiving non-excluded token)
        const tokenIn = tx.tokenTransfers?.find(t =>
          t.toUserAccount === address &&
          t.fromUserAccount !== address &&
          !excludedTokens.has(t.mint)
        );

        if (!solOut || !tokenIn) continue;

        const ca = tokenIn.mint;
        const solAmount = parseFloat(solOut.amount) / 1e9;

        const message = `🚨 NEW SWAP DETECTED 🚨
🔹 Wallet: ${label}
🔹 Token: \`${ca}\`
🔹 SOL Amount: ${solAmount.toFixed(2)} SOL
🔹 Time: ${new Date(tx.blockTime * 1000).toISOString()}
🔗 [View on Solscan](https://solscan.io/tx/${tx.signature})`;

        console.log(`✅ Sending alert for ${label}: ${tx.signature}`);
        await sendTelegram(message);
      }

    } catch (error) {
      console.error(`⚠️ Error processing ${label}:`, error.message);
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
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    })
  });
}

console.log("📡 Polling Helius for SOL-to-token swaps (last 5 minutes)...");
sendTelegram('🤖 Swap tracker started - monitoring SOL to non-stable swaps (last 5 minutes)');

setInterval(pollWallets, pollingInterval);
