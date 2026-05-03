'use strict';

// CJ Dropshipping API — extracts size variants from a product URL.
// Auth: POST apiKey → CJ-Access-Token header.
// Product ID extracted from URL pattern: -p-{pid}.html

const https  = require('https');
const cfg    = require('../config');
const log    = require('../utils/logger');

const BASE_URL = 'developers.cjdropshipping.com';
const API_PATH = '/api2.0/v1';

function cjRequest(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req  = https.request({
      hostname: BASE_URL,
      path: `${API_PATH}${path}`,
      method,
      headers: {
        'CJ-Access-Token': token || '',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('CJ request timed out')); });
    if (data) req.write(data);
    req.end();
  });
}

async function getAccessToken() {
  if (!cfg.CJ_API_KEY) throw new Error('CJ_API_KEY not configured');
  const res = await cjRequest('POST', '/authentication/getAccessToken', null, { apiKey: cfg.CJ_API_KEY });
  const token = res.body?.data?.accessToken;
  if (!token) throw new Error(`CJ auth failed: ${JSON.stringify(res.body)}`);
  return token;
}

function extractProductId(cjUrl) {
  // Pattern: -p-{pid}.html  (e.g. https://cjdropshipping.com/product/...-p-abcd1234.html)
  const match = cjUrl.match(/-p-([^/]+)\.html/);
  return match ? match[1] : null;
}

// Extract unique size labels from variant names like "Black-XL", "Red-M", "32", "S/M"
function parseSizesFromVariants(variants) {
  const sizes = new Set();
  const sizePattern = /^(xs|s|m|l|xl|xxl|2xl|3xl|4xl|5xl|one size|\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)$/i;

  for (const v of variants) {
    const name = (v.variantNameEn || v.variantName || '').trim();
    if (!name) continue;

    // Split "Color-Size" or "Color/Size" compound names
    const parts = name.split(/[-\/]/).map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      if (sizePattern.test(part)) {
        sizes.add(part.toUpperCase().replace('XXL', '2XL'));
      }
    }
  }

  return [...sizes];
}

async function getSizes(cjUrl) {
  if (!cjUrl) return [];
  const pid = extractProductId(cjUrl);
  if (!pid) {
    log.debug(`[cj] Could not extract product ID from URL: ${cjUrl}`);
    return [];
  }

  try {
    const token    = await getAccessToken();
    const res      = await cjRequest('GET', `/product/query?pid=${pid}`, token);
    const variants = res.body?.data?.variants || [];
    const sizes    = parseSizesFromVariants(variants);
    log.info(`[cj] Product ${pid}: ${sizes.length} size(s) found`);
    return sizes;
  } catch (err) {
    log.error(`[cj] getSizes failed for ${cjUrl}: ${err.message}`);
    return [];
  }
}

module.exports = { getSizes, parseSizesFromVariants };
