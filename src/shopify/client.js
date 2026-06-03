'use strict';

// Shopify REST + GraphQL client.
// Ported from product_lister2/netlify/functions/shopify-push-sync.js.

const https = require('https');
const cfg   = require('../config');

function shopifyRest(method, path, body, _retries = 0) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req  = https.request({
      hostname: cfg.SHOPIFY_HOSTNAME,
      path: `/admin/api/${cfg.SHOPIFY_API_VERSION}${path}`,
      method,
      headers: {
        'X-Shopify-Access-Token': cfg.SHOPIFY_TOKEN,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', async () => {
        try {
          const parsed = JSON.parse(raw);
          if (res.statusCode === 429) {
            if (_retries >= 5) return reject(new Error(`Shopify rate limit: too many 429s on ${method} ${path}`));
            const wait = parseInt(res.headers['retry-after'] || '2', 10) * 1000;
            await new Promise(r => setTimeout(r, wait));
            resolve(shopifyRest(method, path, body, _retries + 1));
          } else {
            resolve({ status: res.statusCode, body: parsed });
          }
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Shopify request timed out')); });
    if (data) req.write(data);
    req.end();
  });
}

function shopifyGraphQL(query, variables) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query, variables });
    const req  = https.request({
      hostname: cfg.SHOPIFY_HOSTNAME,
      path: `/admin/api/${cfg.SHOPIFY_API_VERSION}/graphql.json`,
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': cfg.SHOPIFY_TOKEN,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('Failed to parse GraphQL response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('GraphQL request timed out')); });
    req.write(data);
    req.end();
  });
}

module.exports = { shopifyRest, shopifyGraphQL };
