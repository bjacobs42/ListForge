'use strict';

// Builds a Shopify-ready variants array from colors × sizes.
// Mirrors product_lister2 shopify-push-sync.js variant construction.

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildVariants(colors, sizes, productHandle, price, comparePrice) {
  const priceStr       = price        ? Number(price).toFixed(2)        : '0.00';
  const comparePriceStr = comparePrice ? Number(comparePrice).toFixed(2) : null;

  const base = { price: priceStr, compare_at_price: comparePriceStr, requires_shipping: false, taxable: false, inventory_management: null };

  if (colors.length > 0 && sizes.length > 0) {
    const variants = [];
    for (const color of colors) {
      for (const size of sizes) {
        variants.push({
          ...base,
          option1: color,
          option2: size,
          sku: `${slugify(productHandle)}-${slugify(color)}-${slugify(size)}`.toUpperCase(),
        });
      }
    }
    return {
      variants,
      options: [{ name: 'Color', values: colors }, { name: 'Size', values: sizes }],
    };
  }

  if (colors.length > 0) {
    return {
      variants: colors.map(color => ({
        ...base,
        option1: color,
        sku: `${slugify(productHandle)}-${slugify(color)}`.toUpperCase(),
      })),
      options: [{ name: 'Color', values: colors }],
    };
  }

  if (sizes.length > 0) {
    return {
      variants: sizes.map(size => ({
        ...base,
        option1: size,
        sku: `${slugify(productHandle)}-${slugify(size)}`.toUpperCase(),
      })),
      options: [{ name: 'Size', values: sizes }],
    };
  }

  return {
    variants: [{ ...base, sku: slugify(productHandle).toUpperCase() }],
    options: [],
  };
}

module.exports = { buildVariants };
