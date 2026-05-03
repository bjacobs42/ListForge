'use strict';

// ── Sheet tabs ────────────────────────────────────────────────────────────────
const STORE_SHEET_TAB  = 'Store Sheet';
const CONFIG_SHEET_TAB = 'Config Sheet';

// ── Store Sheet column indices (1-based for updateCell) ───────────────────────
// 0-based = (1-based - 1); letter = String.fromCharCode(64 + 1-based)
// A=1  DATE LISTED
// C=3  PRODUCT NAME
// E=5  ERROR NOTE
// G=7  STATUS
// K=11 SHOPIFY LINK
// N=14 CREATIVES (Canva URL)
// O=15 COMPETITOR LINK
// Q=17 COMPARE AT PRICE
// T=20 SUGGESTED PRICE
// U=21 STORE PRICE
// L=12 CJ LINK
const COL = {
  DATE_LISTED:     1,
  PRODUCT_NAME:    3,
  ERROR_NOTE:      5,
  STATUS:          7,
  SHOPIFY_LINK:   11,
  CJ_LINK:        12,
  CREATIVES:      14,
  COMPETITOR:     15,
  COMPARE_PRICE:  17,
  SUGGESTED_PRICE:20,
  STORE_PRICE:    21,
};

// 0-based equivalents for array access after getRows()
const IDX = Object.fromEntries(Object.entries(COL).map(([k, v]) => [k, v - 1]));

// ── Sheet row config ──────────────────────────────────────────────────────────
const DATA_ROW_START = 4;   // rows 1-2 headers, row 3 blank

// ── Config Sheet cells ────────────────────────────────────────────────────────
const CANVA_TOKEN_RANGE = 'Config Sheet!A2:C2';   // [accessToken, refreshToken, expiresAt]
const LOCK_CELL         = 'Config Sheet!D2';       // run lock (ms timestamp)
// E2 is product_activator's previous-count cell — do not touch

// ── Status values ─────────────────────────────────────────────────────────────
const STATUS = {
  COPY:       'COPY',
  QUOTED:     'QUOTED',
  PROCESSING: 'PROCESSING',
  LISTED:     'AI LISTED',
};

// ── Pipeline config ───────────────────────────────────────────────────────────
const BATCH_SIZE    = parseInt(process.env.BATCH_SIZE    || '5',  10);
const LOCK_TTL_MS   = parseInt(process.env.LOCK_TTL_MINUTES || '15', 10) * 60 * 1000;

// ── Shopify ───────────────────────────────────────────────────────────────────
const SHOPIFY_API_VERSION = '2026-04';
const SHOPIFY_HOSTNAME    = (process.env.SHOPIFY_STORE_URL || '').replace(/^https?:\/\//, '');
const SHOPIFY_TOKEN       = process.env.SHOPIFY_ACCESS_TOKEN || '';
const SHOPIFY_STORE_SLUG  = SHOPIFY_HOSTNAME.replace(/\.myshopify\.com$/, '').replace(/^https?:\/\//, '');

// ── Google ────────────────────────────────────────────────────────────────────
const GOOGLE_SA_EMAIL  = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
const GOOGLE_SA_KEY    = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const GOOGLE_SHEET_ID  = process.env.GOOGLE_SHEET_ID || '';

// ── Canva ─────────────────────────────────────────────────────────────────────
const CANVA_CLIENT_ID     = process.env.CANVA_CLIENT_ID     || '';
const CANVA_CLIENT_SECRET = process.env.CANVA_CLIENT_SECRET || '';

// ── CJ Dropshipping ───────────────────────────────────────────────────────────
const CJ_API_KEY = process.env.CJ_API_KEY || '';

// ── Claude ────────────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const CLAUDE_MODEL      = 'claude-sonnet-4-6';

module.exports = {
  STORE_SHEET_TAB, CONFIG_SHEET_TAB,
  COL, IDX, DATA_ROW_START,
  CANVA_TOKEN_RANGE, LOCK_CELL, LOCK_TTL_MS,
  STATUS, BATCH_SIZE,
  SHOPIFY_API_VERSION, SHOPIFY_HOSTNAME, SHOPIFY_TOKEN, SHOPIFY_STORE_SLUG,
  GOOGLE_SA_EMAIL, GOOGLE_SA_KEY, GOOGLE_SHEET_ID,
  CANVA_CLIENT_ID, CANVA_CLIENT_SECRET,
  CJ_API_KEY,
  ANTHROPIC_API_KEY, CLAUDE_MODEL,
};
