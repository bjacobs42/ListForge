'use strict';

const { updateCell } = require('./client');
const cfg = require('../config');
const log = require('../utils/logger');

const { GOOGLE_SHEET_ID, STORE_SHEET_TAB, COL, STATUS } = cfg;

function formatDate(d) {
  return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
}

async function markProcessing(token, rows) {
  for (const row of rows) {
    await updateCell(token, GOOGLE_SHEET_ID, STORE_SHEET_TAB, row.rowNum, COL.STATUS, STATUS.PROCESSING);
    log.info(`[sheet] Row ${row.rowNum} → PROCESSING`);
  }
}

async function markListed(token, row, shopifyUrl, title, price) {
  const now = new Date();
  await updateCell(token, GOOGLE_SHEET_ID, STORE_SHEET_TAB, row.rowNum, COL.STATUS,       STATUS.LISTED);
  await updateCell(token, GOOGLE_SHEET_ID, STORE_SHEET_TAB, row.rowNum, COL.SHOPIFY_LINK, shopifyUrl);
  await updateCell(token, GOOGLE_SHEET_ID, STORE_SHEET_TAB, row.rowNum, COL.DATE_LISTED,  formatDate(now));
  await updateCell(token, GOOGLE_SHEET_ID, STORE_SHEET_TAB, row.rowNum, COL.PRODUCT_NAME, title);
  if (price != null) {
    await updateCell(token, GOOGLE_SHEET_ID, STORE_SHEET_TAB, row.rowNum, COL.STORE_PRICE, price);
  }
  log.info(`[sheet] Row ${row.rowNum} → AI LISTED — ${shopifyUrl}`);
}

async function markError(token, row, originalStatus, error) {
  const note = `[${new Date().toISOString().slice(0, 16)}] ${error}`;
  await updateCell(token, GOOGLE_SHEET_ID, STORE_SHEET_TAB, row.rowNum, COL.STATUS,     originalStatus);
  await updateCell(token, GOOGLE_SHEET_ID, STORE_SHEET_TAB, row.rowNum, COL.ERROR_NOTE, note);
  log.error(`[sheet] Row ${row.rowNum} reset to ${originalStatus} — ${error}`);
}

module.exports = { markProcessing, markListed, markError };
