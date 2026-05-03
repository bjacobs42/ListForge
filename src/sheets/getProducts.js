'use strict';

const { getRows } = require('./client');
const cfg = require('../config');

function parsePrice(raw) {
  if (!raw || !raw.trim()) return null;
  let s = raw.replace(/[£$€\s]/g, '');
  // European format: . = thousands, , = decimal
  s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

async function getProducts(token) {
  const rows  = await getRows(token, cfg.GOOGLE_SHEET_ID, cfg.STORE_SHEET_TAB);
  const items = [];
  const { IDX, DATA_ROW_START, STATUS, BATCH_SIZE } = cfg;

  for (let i = DATA_ROW_START - 1; i < rows.length && items.length < BATCH_SIZE; i++) {
    const row    = rows[i];
    const status = (row[IDX.STATUS] || '').trim();
    if (status !== STATUS.COPY && status !== STATUS.QUOTED) continue;

    items.push({
      rowNum:         i + 1,
      status,
      canvaUrl:       (row[IDX.CREATIVES]       || '').trim(),
      competitorUrl:  (row[IDX.COMPETITOR]       || '').trim(),
      cjUrl:          (row[IDX.CJ_LINK]          || '').trim(),
      storePrice:     parsePrice(row[IDX.STORE_PRICE]      || ''),
      suggestedPrice: parsePrice(row[IDX.SUGGESTED_PRICE]  || ''),
      comparePrice:   parsePrice(row[IDX.COMPARE_PRICE]    || ''),
    });
  }

  return items;
}

module.exports = { getProducts, parsePrice };
