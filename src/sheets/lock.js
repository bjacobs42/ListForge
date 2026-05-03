'use strict';

// Distributed run lock using Config Sheet!D2.
// Writes a ms timestamp on acquire; clears to blank on release.
// A timestamp < LOCK_TTL_MS old means another instance is running.
// Compatible with product_lister2 — same cell (D2), same format.

const { readRange, writeRange } = require('./client');
const cfg = require('../config');
const log = require('../utils/logger');

async function acquireLock(token) {
  const row = await readRange(token, cfg.GOOGLE_SHEET_ID, cfg.LOCK_CELL);
  const existing = parseInt(row[0] || '0', 10) || 0;

  if (existing && Date.now() - existing < cfg.LOCK_TTL_MS) {
    log.info(`[lock] Pipeline already running (lock age: ${Math.round((Date.now() - existing) / 1000)}s)`);
    return false;
  }

  await writeRange(token, cfg.GOOGLE_SHEET_ID, cfg.LOCK_CELL, [[String(Date.now())]]);
  return true;
}

async function releaseLock(token) {
  try {
    await writeRange(token, cfg.GOOGLE_SHEET_ID, cfg.LOCK_CELL, [['']] );
  } catch (err) {
    log.error(`[lock] Failed to release lock: ${err.message}`);
  }
}

module.exports = { acquireLock, releaseLock };
