'use strict';

// QUOTED flow: Canva images → AI generate (colors from images) → CJ/competitor sizes → Shopify create

const { getImages }       = require('../sources/canvaClient');
const { getSizes }        = require('../sources/cjClient');
const { scrape }          = require('../sources/competitorScraper');
const { normalizeColors } = require('../processing/colorMapper');
const { processImages }   = require('../processing/imageProcessor');
const { buildVariants }   = require('../processing/variantBuilder');
const { generate }        = require('../ai/generator');
const { createProduct }   = require('../shopify/productCreator');
const log                 = require('../utils/logger');

function slug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

async function runQuotedFlow(row, gToken) {
  log.info(`[quoted] Row ${row.rowNum} — canva: ${row.canvaUrl}`);

  // 1. Fetch Canva images
  const imageUrls = await getImages(row.canvaUrl, gToken);
  if (imageUrls.length === 0) throw new Error('No images exported from Canva');
  log.info(`[quoted] Canva: ${imageUrls.length} image(s)`);

  // 2. AI generation — Claude derives colors from images
  const ai = await generate(imageUrls);

  // 3. Sizes: CJ (priority) → competitor → AI default
  let sizes = [];
  if (row.cjUrl) {
    sizes = await getSizes(row.cjUrl);
    if (sizes.length > 0) log.info(`[quoted] Using CJ sizes: ${sizes.join(', ')}`);
  }
  if (sizes.length === 0 && row.competitorUrl) {
    const scraped = await scrape(row.competitorUrl).catch(() => ({ sizes: [] }));
    sizes = scraped.sizes;
    if (sizes.length > 0) log.info(`[quoted] Using competitor sizes: ${sizes.join(', ')}`);
  }
  if (sizes.length === 0 && ai.sizes.length > 0) {
    sizes = ai.sizes;
    log.info(`[quoted] Using AI sizes: ${sizes.join(', ')}`);
  }

  // 4. Normalize colors
  const colors = normalizeColors(ai.colors.length > 0 ? ai.colors : []);

  // 5. Image processing
  const { deduped, variantImageMap } = processImages(imageUrls, colors);

  // 6. Build variants
  const price = row.storePrice || row.suggestedPrice;
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

  return { title: ai.title, adminUrl, productId };
}

module.exports = { runQuotedFlow };
