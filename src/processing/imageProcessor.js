'use strict';

// Deduplicates image URLs and builds a color→imageUrl mapping.
// Primary: uses AI-provided colorImageIndices (Claude identifies which image shows which color).
// Fallback: stride-based grouping (assumes Canva pages are grouped by color).

function processImages(imageUrls, colors, colorImageIndices = {}) {
  const seen  = new Set();
  const deduped = [];
  for (const url of imageUrls) {
    if (url && !seen.has(url)) { seen.add(url); deduped.push(url); }
  }

  const variantImageMap = {};
  if (colors.length === 0 || deduped.length === 0) return { deduped, variantImageMap };

  if (Object.keys(colorImageIndices).length > 0) {
    // AI told us exactly which image index belongs to each color
    for (const color of colors) {
      const idx = colorImageIndices[color];
      variantImageMap[color] = (idx !== undefined && deduped[idx]) ? deduped[idx] : deduped[0];
    }
  } else if (deduped.length >= colors.length) {
    // Stride fallback: assume pages are grouped by color
    const stride = Math.floor(deduped.length / colors.length);
    for (let i = 0; i < colors.length; i++) {
      variantImageMap[colors[i]] = deduped[i * stride];
    }
  } else {
    for (const color of colors) {
      variantImageMap[color] = deduped[0];
    }
  }

  return { deduped, variantImageMap };
}

module.exports = { processImages };
