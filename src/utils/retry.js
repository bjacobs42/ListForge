'use strict';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function withRetry(fn, label, maxAttempts = 2, delayMs = 3000) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        console.log(`[retry] ${label} attempt ${attempt} failed: ${err.message} — retrying in ${delayMs}ms`);
        await sleep(delayMs);
      }
    }
  }
  throw lastErr;
}

module.exports = { withRetry, sleep };
