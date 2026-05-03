'use strict';

// Best-effort competitor page scraper.
// Returns { images, colors, sizes, price } — all fields may be empty on parse failure.
// Uses JSON-LD, OG tags, and common patterns. No headless browser — pure HTTP fetch.

const https = require('https');
const http  = require('http');
const log   = require('../utils/logger');

function fetchUrl(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        req.destroy();
        // location may be relative ("/products/...") — resolve against the original URL
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return resolve(fetchUrl(next, maxRedirects - 1));
      }
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve(raw));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Scrape timed out')); });
  });
}

function extractJsonLd(html) {
  const results = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try { results.push(JSON.parse(m[1])); } catch { /* skip malformed */ }
  }
  return results;
}

function extractOgImages(html) {
  const images = [];
  const re = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) images.push(m[1]);
  return images;
}

function extractLargeImages(html) {
  // Look for image URLs in src/data-src attributes of img tags
  const images = [];
  const re = /<img[^>]+(?:src|data-src|data-original)=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    // Skip tiny icons/thumbnails by filtering out common small-image patterns
    if (/icon|logo|avatar|thumb|badge|placeholder/i.test(url)) continue;
    if (!images.includes(url)) images.push(url);
  }
  return images.slice(0, 20);
}

function parseProductFromJsonLd(jsonLdNodes) {
  for (const node of jsonLdNodes) {
    const items = Array.isArray(node['@graph']) ? node['@graph'] : [node];
    for (const item of items) {
      if (item['@type'] !== 'Product') continue;

      const images = [];
      if (item.image) {
        const imgs = Array.isArray(item.image) ? item.image : [item.image];
        for (const img of imgs) {
          if (typeof img === 'string') images.push(img);
          else if (img.url) images.push(img.url);
        }
      }

      const colors = [];
      const sizes  = [];
      if (item.hasVariant || item.variesBy) {
        const variants = item.hasVariant || [];
        for (const v of variants) {
          if (v.color && !colors.includes(v.color)) colors.push(v.color);
          if (v.size  && !sizes.includes(v.size))   sizes.push(v.size);
        }
      }

      const price = item.offers?.price
        || (Array.isArray(item.offers) ? item.offers[0]?.price : null)
        || null;

      return { images, colors, sizes, price: price ? String(price) : null, title: item.name || '' };
    }
  }
  return null;
}

async function scrape(url) {
  const empty = { images: [], colors: [], sizes: [], price: null, title: '' };
  if (!url) return empty;

  let html;
  try {
    html = await fetchUrl(url);
  } catch (err) {
    log.error(`[scraper] Fetch failed for ${url}: ${err.message}`);
    return empty;
  }

  // 1. Try JSON-LD structured data
  const jsonLd  = extractJsonLd(html);
  const product = parseProductFromJsonLd(jsonLd);
  if (product && product.images.length > 0) {
    log.info(`[scraper] JSON-LD: ${product.images.length} images, ${product.colors.length} colors, ${product.sizes.length} sizes`);
    return product;
  }

  // 2. Fall back to OG tags + large images
  const ogImages   = extractOgImages(html);
  const htmlImages = extractLargeImages(html);
  const images     = ogImages.length > 0 ? ogImages : htmlImages;

  // 3. Extract title from OG or <title>
  const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  log.info(`[scraper] Fallback: ${images.length} images, no structured variants`);
  return { images, colors: [], sizes: [], price: null, title };
}

module.exports = { scrape };
