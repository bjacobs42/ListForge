'use strict';

// COPY flow: competitor scrape → CJ sizes → AI generate → Shopify create

const { scrape }          = require('../sources/competitorScraper');
const { getSizes }        = require('../sources/cjClient');
const { normalizeColors } = require('../processing/colorMapper');
const { processImages }   = require('../processing/imageProcessor');
const { buildVariants }   = require('../processing/variantBuilder');
const { generate }        = require('../ai/generator');
const { createProduct }   = require('../shopify/productCreator');
const log                 = require('../utils/logger');

function slug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

async function runCopyFlow(row) {
  log.info(`[copy] Row ${row.rowNum} — competitor: ${row.competitorUrl}`);

  // 1. Scrape competitor
  const scraped = await scrape(row.competitorUrl);
  log.info(`[copy] Scraped: ${scraped.images.length} images, ${scraped.colors.length} colors, ${scraped.sizes.length} sizes`);

  // 2. Fetch CJ sizes (priority over competitor)
  let sizes = scraped.sizes;
  if (row.cjUrl) {
    const cjSizes = await getSizes(row.cjUrl);
    if (cjSizes.length > 0) {
      sizes = cjSizes;
      log.info(`[copy] Using CJ sizes: ${sizes.join(', ')}`);
    }
  }

  if (scraped.images.length === 0) {
    throw new Error('No images found on competitor page');
  }

  // 3. AI generation
  const ai = await generate(scraped.images, scraped.title);

  // 4. Normalize colors (competitor → AI colors preferred)
  const rawColors = ai.colors.length > 0 ? ai.colors : scraped.colors;
  const colors    = normalizeColors(rawColors);

  // Use AI sizes if CJ and competitor had none
  if (sizes.length === 0 && ai.sizes.length > 0) sizes = ai.sizes;

  // 5. Image processing
  const { deduped, variantImageMap } = processImages(scraped.images, colors, ai.colorImageIndices || {});

  // 6. Build variants
  const price   = row.storePrice || row.suggestedPrice;
  const { variants, options } = buildVariants(colors, sizes, slug(ai.title), price, row.comparePrice);

  // 7. Create Shopify product
  const { productId, adminUrl } = await createProduct({
    title:          ai.title,
    desc:           ai.desc,
    tags:           ai.tags,
    category:       ai.category,
    metafields:     ai.metafields,
    variants,
    options,
    imageUrls:      deduped,
    variantImageMap,
    colors,
    sizes,
  });

  return { title: ai.title, adminUrl, productId, price };
}

module.exports = { runCopyFlow };
