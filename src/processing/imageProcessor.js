'use strict';

// Deduplicates image URLs and builds a color→imageUrl mapping.
// When count matches: image[i] → color[i].
// Otherwise: first image maps to all colors.

function processImages(imageUrls, colors) {
  // Deduplicate by URL while preserving order
  const seen  = new Set();
  const deduped = [];
  for (const url of imageUrls) {
    if (url && !seen.has(url)) { seen.add(url); deduped.push(url); }
  }

  const variantImageMap = {};
  if (colors.length > 0 && deduped.length > 0) {
    if (deduped.length >= colors.length) {
      for (let i = 0; i < colors.length; i++) {
        variantImageMap[colors[i]] = deduped[i];
      }
    } else {
      for (const color of colors) {
        variantImageMap[color] = deduped[0];
      }
    }
  }

  return { deduped, variantImageMap };
}

module.exports = { processImages };
