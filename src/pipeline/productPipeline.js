'use strict';

const { getGoogleAccessToken }    = require('../sheets/client');
const { acquireLock, releaseLock } = require('../sheets/lock');
const { getProducts }             = require('../sheets/getProducts');
const { markProcessing, markListed, markError } = require('../sheets/updateStatus');
const { runCopyFlow }             = require('./copyFlow');
const { runQuotedFlow }           = require('./quotedFlow');
const { withRetry, sleep }        = require('../utils/retry');
const cfg                         = require('../config');
const log                         = require('../utils/logger');

function validateEnv() {
  const required = ['GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'GOOGLE_SHEET_ID', 'SHOPIFY_STORE_URL', 'SHOPIFY_ACCESS_TOKEN', 'ANTHROPIC_API_KEY'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length > 0) throw new Error(`Missing env vars: ${missing.join(', ')}`);
}

async function run() {
  validateEnv();
  log.info('[pipeline] Starting');

  const gToken = await getGoogleAccessToken();
  const locked = await acquireLock(gToken);
  if (!locked) {
    log.info('[pipeline] Skipping — another instance is running');
    return { skipped: true, reason: 'lock_held' };
  }

  const summary = { processed: 0, succeeded: 0, failed: 0, rows: [] };

  try {
    const rows = await withRetry(() => getProducts(gToken), 'getProducts');
    if (rows.length === 0) {
      log.info('[pipeline] No COPY/QUOTED rows to process');
      return { ...summary, skipped: false };
    }
    log.info(`[pipeline] Processing ${rows.length} row(s)`);

    await markProcessing(gToken, rows);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      summary.processed++;
      try {
        let result;
        if (row.status === cfg.STATUS.COPY) {
          result = await withRetry(() => runCopyFlow(row), `copyFlow row ${row.rowNum}`);
        } else {
          result = await withRetry(() => runQuotedFlow(row, gToken), `quotedFlow row ${row.rowNum}`);
        }
        await markListed(gToken, row, result.adminUrl, result.title, result.price);
        summary.succeeded++;
        summary.rows.push({ rowNum: row.rowNum, status: 'success', title: result.title });
        log.info(`[pipeline] Row ${row.rowNum} done — ${result.adminUrl}`);
      } catch (err) {
        log.error(`[pipeline] Row ${row.rowNum} failed: ${err.message}`);
        await markError(gToken, row, row.status, err.message).catch(() => {});
        summary.failed++;
        summary.rows.push({ rowNum: row.rowNum, status: 'error', error: err.message });
      }

      // 2-second gap between products
      if (i < rows.length - 1) await sleep(2000);
    }
  } finally {
    await releaseLock(gToken);
  }

  log.info(`[pipeline] Done — ${summary.succeeded} succeeded, ${summary.failed} failed`);
  return summary;
}

module.exports = { run };
