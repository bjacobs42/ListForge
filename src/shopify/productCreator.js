'use strict';

// Creates a draft Shopify product and attaches variants, images, and metafields.
// Step sequence matches product_lister2/netlify/functions/shopify-push-sync.js.

const { shopifyRest, shopifyGraphQL } = require('./client');
const cfg = require('../config');
const log = require('../utils/logger');

// ── Taxonomy lookup tables (from product_lister2) ─────────────────────────────

const TAXONOMY_ATTRIBUTES = {
  fit:           'gid://shopify/TaxonomyAttribute/35',
  neckline:      'gid://shopify/TaxonomyAttribute/32',
  sleeve_length: 'gid://shopify/TaxonomyAttribute/15',
  pattern:       'gid://shopify/TaxonomyAttribute/3',
  target_gender: 'gid://shopify/TaxonomyAttribute/837',
  occasion:      'gid://shopify/TaxonomyAttribute/1627',
};

const TAXONOMY_VALUES = {
  fit: {
    'skinny': 'gid://shopify/TaxonomyValue/419', 'slim': 'gid://shopify/TaxonomyValue/6718',
    'slim fit': 'gid://shopify/TaxonomyValue/6718', 'straight': 'gid://shopify/TaxonomyValue/420',
    'wide': 'gid://shopify/TaxonomyValue/3102', 'wide leg': 'gid://shopify/TaxonomyValue/3102',
    'relaxed': 'gid://shopify/TaxonomyValue/3102', 'oversized': 'gid://shopify/TaxonomyValue/3102',
    'regular': 'gid://shopify/TaxonomyValue/420', 'regular fit': 'gid://shopify/TaxonomyValue/420',
    'tailored': 'gid://shopify/TaxonomyValue/6718', 'fitted': 'gid://shopify/TaxonomyValue/6718',
    'loose': 'gid://shopify/TaxonomyValue/3102', 'cropped': 'gid://shopify/TaxonomyValue/3102',
  },
  neckline: {
    'v-neck': 'gid://shopify/TaxonomyValue/390', 'v neck': 'gid://shopify/TaxonomyValue/390',
    'square': 'gid://shopify/TaxonomyValue/17093', 'square neck': 'gid://shopify/TaxonomyValue/17093',
    'round': 'gid://shopify/TaxonomyValue/17092', 'round neck': 'gid://shopify/TaxonomyValue/17092',
    'crew': 'gid://shopify/TaxonomyValue/6711', 'crew neck': 'gid://shopify/TaxonomyValue/6711',
    'off shoulder': 'gid://shopify/TaxonomyValue/6705', 'off-shoulder': 'gid://shopify/TaxonomyValue/6705',
    'halter': 'gid://shopify/TaxonomyValue/6708', 'sweetheart': 'gid://shopify/TaxonomyValue/6714',
    'cowl': 'gid://shopify/TaxonomyValue/6707', 'turtleneck': 'gid://shopify/TaxonomyValue/6715',
    'plunging': 'gid://shopify/TaxonomyValue/6713', 'deep v': 'gid://shopify/TaxonomyValue/6713',
    'strapless': 'gid://shopify/TaxonomyValue/177', 'wrap': 'gid://shopify/TaxonomyValue/6716',
  },
  sleeve_length: {
    'sleeveless': 'gid://shopify/TaxonomyValue/174', 'short': 'gid://shopify/TaxonomyValue/169',
    'short sleeve': 'gid://shopify/TaxonomyValue/169', 'long': 'gid://shopify/TaxonomyValue/17094',
    'long sleeve': 'gid://shopify/TaxonomyValue/17094', '3/4': 'gid://shopify/TaxonomyValue/1405',
    'three quarter': 'gid://shopify/TaxonomyValue/1405', 'spaghetti strap': 'gid://shopify/TaxonomyValue/176',
    'cap': 'gid://shopify/TaxonomyValue/1407', 'cap sleeve': 'gid://shopify/TaxonomyValue/1407',
  },
  pattern: {
    'solid': 'gid://shopify/TaxonomyValue/2874', 'plain': 'gid://shopify/TaxonomyValue/2874',
    'floral': 'gid://shopify/TaxonomyValue/2871', 'striped': 'gid://shopify/TaxonomyValue/2875',
    'stripe': 'gid://shopify/TaxonomyValue/2875', 'checkered': 'gid://shopify/TaxonomyValue/2868',
    'polka dot': 'gid://shopify/TaxonomyValue/2870', 'animal print': 'gid://shopify/TaxonomyValue/24478',
    'abstract': 'gid://shopify/TaxonomyValue/24477', 'geometric': 'gid://shopify/TaxonomyValue/1868',
    'paisley': 'gid://shopify/TaxonomyValue/2873', 'color block': 'gid://shopify/TaxonomyValue/24488',
  },
  target_gender: {
    'women': 'gid://shopify/TaxonomyValue/18', "women's": 'gid://shopify/TaxonomyValue/18',
    'female': 'gid://shopify/TaxonomyValue/18', 'men': 'gid://shopify/TaxonomyValue/19',
    'unisex': 'gid://shopify/TaxonomyValue/20',
  },
  occasion: {
    'casual': 'gid://shopify/TaxonomyValue/20178', 'everyday': 'gid://shopify/TaxonomyValue/10769',
    'work': 'gid://shopify/TaxonomyValue/10769', 'office': 'gid://shopify/TaxonomyValue/10769',
    'evening': 'gid://shopify/TaxonomyValue/20179', 'formal': 'gid://shopify/TaxonomyValue/20179',
    'party': 'gid://shopify/TaxonomyValue/20179', 'smart casual': 'gid://shopify/TaxonomyValue/20178',
    'wedding': 'gid://shopify/TaxonomyValue/10770', 'special occasion': 'gid://shopify/TaxonomyValue/10770',
    'holiday': 'gid://shopify/TaxonomyValue/10770', 'weekend': 'gid://shopify/TaxonomyValue/20178',
  },
};

const TAXONOMY_METAFIELD_KEYS = {
  fit:           { namespace: 'shopify', key: 'fit' },
  neckline:      { namespace: 'shopify', key: 'neckline' },
  sleeve_length: { namespace: 'shopify', key: 'sleeve-length-type' },
  pattern:       { namespace: 'shopify', key: 'color-pattern' },
  target_gender: { namespace: 'shopify', key: 'target-gender' },
  occasion:      { namespace: 'shopify', key: 'occasion-style' },
};

const TAXONOMY_METAOBJECT_TYPES = {
  fit:           'shopify--fit',
  neckline:      'shopify--neckline',
  sleeve_length: 'shopify--sleeve-length-type',
  pattern:       'shopify--color-pattern',
  target_gender: 'shopify--target-gender',
  occasion:      'shopify--occasion-style',
  size:          'shopify--size',
  age_group:     'shopify--age-group',
  color_pattern: 'shopify--color-pattern',
};

const METAFIELD_TO_TAXONOMY = {
  fit: 'fit', neckline: 'neckline', sleeve_length: 'sleeve_length',
  pattern: 'pattern', gender: 'target_gender', occasion: 'occasion',
};

// ── Metaobject cache (per function invocation) ────────────────────────────────
const metaobjectCache = {};

async function getMetaobjectEntries(type) {
  if (metaobjectCache[type]) return metaobjectCache[type];
  const result = await shopifyGraphQL(`
    query getMetaobjects($type: String!) {
      metaobjects(type: $type, first: 250) {
        nodes { id handle fields { key value } }
      }
    }
  `, { type });
  const nodes = result?.data?.metaobjects?.nodes || [];
  if (nodes.length > 0) {
    log.debug(`[shopify] Metaobject "${type}": ${nodes.length} entries. Sample: ${JSON.stringify(nodes[0])}`);
  } else if (result?.errors) {
    log.debug(`[shopify] Metaobject "${type}" query errors: ${JSON.stringify(result.errors)}`);
  }
  metaobjectCache[type] = nodes;
  return nodes;
}

async function findMetaobjectByLabel(type, label) {
  const entries = await getMetaobjectEntries(type);
  if (entries.length === 0) {
    log.debug(`[shopify] Metaobject type "${type}" returned 0 entries — check that read_metaobjects scope is on the access token`);
    return null;
  }
  const needle  = label.toLowerCase().trim();
  for (const e of entries) {
    // Shopify taxonomy metaobjects use 'name'; custom ones often use 'label'
    const lf = e.fields.find(f => f.key === 'name' || f.key === 'label');
    if (lf?.value?.toLowerCase().trim() === needle) return e.id;
  }
  const handleMatch = entries.find(e => e.handle && e.handle.toLowerCase().replace(/-/g, ' ') === needle);
  return handleMatch?.id || null;
}

function lookupTaxonomyValue(attrKey, rawValue) {
  const values = TAXONOMY_VALUES[attrKey];
  if (!values) return null;
  const full  = rawValue.toLowerCase().trim();
  if (values[full]) return values[full];
  for (const part of full.split(/[,;]+/).map(p => p.trim())) {
    if (values[part]) return values[part];
  }
  return null;
}

async function setTaxonomyAttributes(productGid, parsedMetafields, colors, sizes, tags) {
  Object.keys(metaobjectCache).forEach(k => delete metaobjectCache[k]);

  // Accumulate GIDs per metafield key. Both "pattern" (from parsedMetafields) and
  // "colors" write to shopify.color-pattern — accumulating prevents the second call
  // from overwriting the first; they get merged into one combined list.
  const accumulator = {}; // `namespace.key` → { namespace, key, gids: [] }
  function addGid(namespace, key, gid) {
    const k = `${namespace}.${key}`;
    if (!accumulator[k]) accumulator[k] = { namespace, key, gids: [] };
    accumulator[k].gids.push(gid);
  }

  // ── Parsed metafields (fit, neckline, sleeve, occasion, pattern) ──────────
  for (const mf of parsedMetafields) {
    const taxKey        = METAFIELD_TO_TAXONOMY[mf.key];
    if (!taxKey) continue;
    const metaobjectType = TAXONOMY_METAOBJECT_TYPES[taxKey];
    const metafieldKey   = TAXONOMY_METAFIELD_KEYS[taxKey];
    if (!metaobjectType || !metafieldKey) continue;

    let gid = null;
    try {
      const taxVal = lookupTaxonomyValue(taxKey, mf.value);
      if (taxVal) {
        const entries = await getMetaobjectEntries(metaobjectType);
        for (const e of entries) {
          if (e.fields.some(f => f.value && f.value.includes(taxVal))) { gid = e.id; break; }
        }
      }
      if (!gid) gid = await findMetaobjectByLabel(metaobjectType, mf.value);
    } catch (err) {
      log.debug(`[shopify] Metaobject lookup error for ${mf.key}: ${err.message}`);
    }

    if (!gid) { log.debug(`[shopify] No metaobject for ${mf.key}: "${mf.value}"`); continue; }
    addGid(metafieldKey.namespace, metafieldKey.key, gid);
  }

  // ── Colors ────────────────────────────────────────────────────────────────
  for (const color of colors) {
    const gid = await findMetaobjectByLabel('shopify--color-pattern', color).catch(() => null);
    if (gid) addGid('shopify', 'color-pattern', gid);
    else log.debug(`[shopify] Color not found in metaobjects: "${color}" — add manually`);
  }

  // ── Sizes ─────────────────────────────────────────────────────────────────
  for (const size of sizes) {
    const gid = await findMetaobjectByLabel('shopify--size', size).catch(() => null);
    if (gid) addGid('shopify', 'size', gid);
    else log.debug(`[shopify] Size not found in metaobjects: "${size}"`);
  }

  // ── Age group — always Adults ─────────────────────────────────────────────
  const ageGid = await findMetaobjectByLabel('shopify--age-group', 'Adults').catch(() => null);
  if (ageGid) addGid('shopify', 'age-group', ageGid);

  // ── Gender from tags ──────────────────────────────────────────────────────
  const tagStr = (tags || '').toLowerCase();
  const genderLabel = tagStr.includes('women') ? 'Female' : null;
  if (genderLabel) {
    const gid = await findMetaobjectByLabel('shopify--target-gender', genderLabel).catch(() => null);
    if (gid) addGid('shopify', 'target-gender', gid);
  }

  const metafieldsToSet = Object.values(accumulator).map(({ namespace, key, gids }) => ({
    ownerId: productGid, namespace, key,
    type: 'list.metaobject_reference',
    value: JSON.stringify(gids),
  }));

  if (metafieldsToSet.length === 0) return;

  let ok = 0;
  for (const mf of metafieldsToSet) {
    try {
      const result = await shopifyGraphQL(`
        mutation setAttr($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { key namespace }
            userErrors { field message code }
          }
        }
      `, { metafields: [mf] });
      const errors = result?.data?.metafieldsSet?.userErrors || [];
      if (errors.length === 0) ok++;
      else log.debug(`[shopify] Taxonomy attr error: ${errors[0].message}`);
    } catch (err) {
      log.debug(`[shopify] Taxonomy attr failed: ${err.message}`);
    }
  }
  log.info(`[shopify] Taxonomy attributes: ${ok}/${metafieldsToSet.length} set`);
}

// ── Markdown → HTML (from product_lister2) ───────────────────────────────────

function markdownToHtml(md) {
  const lines = md.split('\n');
  const out   = [];
  let inCare = false, inSpecs = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    line = line.replace(/^[·•*]\s+(.+)$/, '<li>$1</li>');
    const trimmed = line.trim();
    if (!trimmed) {
      if (!inCare && !inSpecs) out.push('</p><p>');
      continue;
    }
    if (trimmed === '<strong>Care Instructions</strong>') {
      inCare = true; inSpecs = false;
      out.push('</p><p><strong>Care Instructions</strong><br>');
      continue;
    }
    if (trimmed === '<strong>Specifications</strong>') {
      inSpecs = true; inCare = false;
      out.push('</p><p><strong>Specifications</strong><br>');
      continue;
    }
    if (inCare) {
      if (trimmed.startsWith('<strong>') && trimmed.includes('</strong>') && !trimmed.includes(':</')) {
        inCare = false; i--; continue;
      }
      out.push(trimmed + '<br>');
      continue;
    }
    if (inSpecs) { out.push(trimmed + '<br>'); continue; }
    out.push(trimmed.startsWith('<li>') ? trimmed : trimmed + ' ');
  }

  let html = out.join('');
  html = html.replace(/(<li>[\s\S]*?<\/li>)+/g, m => `<ul>${m}</ul>`);
  html = `<p>${html}</p>`;
  html = html.replace(/<p>\s*<\/p>/g, '').replace(/<p><\/p>/g, '').replace(/<br><\/p>/g, '</p>');
  return html;
}

// ── Metafield parser ──────────────────────────────────────────────────────────

function parseMetafields(metafieldsStr) {
  if (!metafieldsStr?.trim()) return [];
  return metafieldsStr.trim().split('\n').reduce((acc, line) => {
    const ci = line.indexOf(':');
    if (ci === -1) return acc;
    const key   = line.substring(0, ci).trim();
    const value = line.substring(ci + 1).trim();
    if (!key || !value || /^\[.*\]$/.test(value)) return acc;
    const di = key.indexOf('.');
    if (di === -1) return acc;
    acc.push({ namespace: key.substring(0, di), key: key.substring(di + 1), value, type: 'single_line_text_field' });
    return acc;
  }, []);
}

// ── Taxonomy category ─────────────────────────────────────────────────────────

const taxonomyCache = {};
let publicationsCache = null;

async function getAllPublications() {
  if (publicationsCache) return publicationsCache;
  const result = await shopifyGraphQL(`{ publications(first: 20) { nodes { id name } } }`);
  publicationsCache = result?.data?.publications?.nodes || [];
  log.info(`[shopify] Publications: ${publicationsCache.map(p => p.name).join(', ')}`);
  return publicationsCache;
}

async function publishToAllChannels(productGid) {
  const pubs = await getAllPublications();
  if (pubs.length === 0) return;
  const result = await shopifyGraphQL(`
    mutation publish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        publishable { ... on Product { id } }
        userErrors { field message }
      }
    }
  `, { id: productGid, input: pubs.map(p => ({ publicationId: p.id })) });
  const errors = result?.data?.publishablePublish?.userErrors || [];
  if (errors.length > 0) log.debug(`[shopify] Publish errors: ${JSON.stringify(errors)}`);
  else log.info(`[shopify] Published to ${pubs.length} channel(s)`);
}

async function findTaxonomyCategoryId(categoryStr) {
  if (!categoryStr?.trim()) return null;
  if (taxonomyCache[categoryStr] !== undefined) return taxonomyCache[categoryStr];
  const searchTerm = categoryStr.split('>').pop().trim();
  const result = await shopifyGraphQL(`
    query searchTax($search: String!) {
      taxonomy { categories(first: 20, search: $search) { nodes { id name fullName } } }
    }
  `, { search: searchTerm });
  if (result?.errors) {
    log.debug(`[shopify] Taxonomy query errors: ${JSON.stringify(result.errors)}`);
  }
  const nodes = result?.data?.taxonomy?.categories?.nodes || [];
  const exact = nodes.find(n => n.fullName.toLowerCase() === categoryStr.toLowerCase());
  if (!exact) log.debug(`[shopify] Category not found in taxonomy: "${categoryStr}" (${nodes.length} candidates)`);
  taxonomyCache[categoryStr] = exact?.id || null;
  return taxonomyCache[categoryStr];
}

async function setProductCategory(productGid, categoryId) {
  const result = await shopifyGraphQL(`
    mutation updateCat($product: ProductUpdateInput!) {
      productUpdate(product: $product) {
        product { id category { id fullName } }
        userErrors { field message }
      }
    }
  `, { product: { id: productGid, category: categoryId } });
  const errors = result?.data?.productUpdate?.userErrors || [];
  if (errors.length > 0) log.debug(`[shopify] Category errors: ${JSON.stringify(errors)}`);
}

// ── Main product creator ──────────────────────────────────────────────────────

async function createProduct({ title, desc, tags, category, metafields, variants, options, imageUrls, variantImageMap, colors, sizes }) {
  // 1. Create draft product
  const createRes = await shopifyRest('POST', '/products.json', {
    product: {
      title,
      body_html: markdownToHtml(desc),
      tags: tags || '',
      status: 'draft',
      variants,
      ...(options.length > 0 ? { options } : {}),
    },
  });

  if (createRes.status !== 201 || !createRes.body.product) {
    throw new Error(`Product creation failed (${createRes.status}): ${JSON.stringify(createRes.body)}`);
  }

  const product    = createRes.body.product;
  const productId  = product.id;
  const productGid = `gid://shopify/Product/${productId}`;
  log.info(`[shopify] Product created: ${productId} — "${title}"`);

  // 2. Set product_type
  if (category?.trim()) {
    await shopifyRest('PUT', `/products/${productId}.json`, {
      product: { id: productId, product_type: category.split('>').pop().trim() },
    });
  }

  // 3. Set taxonomy category
  try {
    const categoryId = await findTaxonomyCategoryId(category);
    if (categoryId) {
      await setProductCategory(productGid, categoryId);
      log.info(`[shopify] Category set: ${category}`);
    }
  } catch (err) {
    log.debug(`[shopify] Category error (non-fatal): ${err.message}`);
  }

  // 4. Set custom metafields via REST
  const parsedMf = parseMetafields(metafields);
  for (const mf of parsedMf) {
    const r = await shopifyRest('POST', `/products/${productId}/metafields.json`, { metafield: mf });
    log.debug(`[shopify] Metafield ${mf.namespace}.${mf.key} → HTTP ${r.status}`);
  }

  // 5. Set taxonomy attributes (colors, sizes, gender, etc.)
  try {
    await setTaxonomyAttributes(productGid, parsedMf, colors, sizes, tags);
  } catch (err) {
    log.debug(`[shopify] Taxonomy attrs error (non-fatal): ${err.message}`);
  }

  // 6. Upload images and capture IDs
  const uploadedImages = [];
  for (const url of imageUrls) {
    try {
      const imgRes = await shopifyRest('POST', `/products/${productId}/images.json`, { image: { src: url } });
      if (imgRes.body.image?.id) uploadedImages.push({ url, id: imgRes.body.image.id });
    } catch (err) {
      log.debug(`[shopify] Image upload failed: ${err.message}`);
    }
  }
  log.info(`[shopify] Uploaded ${uploadedImages.length}/${imageUrls.length} images`);

  // 7. Link images to variants
  if (uploadedImages.length > 0) {
    const updatedVariants = product.variants.map(v => {
      const colorKey = v.option1;
      const imgUrl   = variantImageMap[colorKey];
      if (!imgUrl) return { id: v.id, image_id: v.image_id };
      const uploaded = uploadedImages.find(i => i.url === imgUrl);
      return { id: v.id, image_id: uploaded?.id || v.image_id };
    });

    for (const v of updatedVariants) {
      if (v.image_id) {
        await shopifyRest('PUT', `/products/${productId}/variants/${v.id}.json`, { variant: v })
          .catch(err => log.debug(`[shopify] Variant image link failed: ${err.message}`));
      }
    }
  }

  // 8. Publish to all sales channels
  try {
    await publishToAllChannels(productGid);
  } catch (err) {
    log.debug(`[shopify] Publish error (non-fatal): ${err.message}`);
  }

  const adminUrl = `https://admin.shopify.com/store/${cfg.SHOPIFY_STORE_SLUG}/products/${productId}`;
  return { productId, adminUrl };
}

module.exports = { createProduct, markdownToHtml, parseMetafields };
