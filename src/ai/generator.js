'use strict';

// Claude API integration using the Rolenna (US women's fashion) prompt system.
// Ported from product_lister2/netlify/functions/generate.js — SYSTEM_PROMPT_ROLENNA.
// Prompt caching applied to the system prompt block.

const https = require('https');
const cfg   = require('../config');
const log   = require('../utils/logger');

// ── Rolenna system prompt (assembled from generate.js constants) ──────────────

const KEYWORD_BANK_US = `
KEYWORD BANK — use to optimize titles and descriptions where applicable. Never force a keyword that does not fit.

WOMEN'S PRIORITY KEYWORDS (low competition / best CPC value):
- mini dress (110k vol, $0.93 CPC)
- black mini dress (49.5k, $0.88)
- formal mini dress (12.1k, $0.79)
- short prom dresses (14.8k, $0.83)
- kitten heels (201k, $1.16)
- stilettos (90.5k, $1.30)
- white heels (90.5k, $0.84)
- mary jane heels (33.1k, $0.85)
- block heels (27.1k, $1.35)
- slingback (9.9k, $1.10)
- platform heels (49.5k, $1.26)
- comfortable sandals (74k, $2.03)
- wedges (90.5k, $1.32)
- cocktail knee length dresses (40.5k, $1.04)
- knee length dresses for wedding guests (12.1k, $0.74)
- floor length wedding guest dress (27.1k, $1.14)
- midi wedding guest dress (22.2k, $1.02)
- formal maxi dress (18.1k, $0.93)
- bridesmaid maxi dress (2.4k, $0.92)
- maxi dress (165k, $1.23)
- midi dress (90.5k, $1.26)
- jean skirt (90.5k, $1.10)
- black skirt (60.5k, $1.05)
- bubble skirt (4.4k, $0.84)
- denim skirt women (27.1k, $1.07)
- blazer (301k, $1.44)
- blazer dress women (8.1k, $0.97)
- faux leather blazer (14.8k, $1.20)
- cardigan (201k, $1.42)
- crochet cardigan (14.8k, $0.88)
- off the shoulder sweater (49.5k, $1.19)
- pant suits for women (33.1k, $1.12)
- cocktail pants suits (5.4k, $0.74)
- denim two piece set (14.8k, $0.88)
- going out sets (5.4k, $0.94)
- two piece graduation dress (3.6k, $0.82)
- sequin top (27.1k, $0.97)
- dressy tops for evening wear (3.6k, $0.72)
- off the shoulder tops (40.5k, $1.05)
- trench coat women (33.1k, $1.14)
- faux fur coat (49.5k, $1.33)
- ankle boots women (60.5k, $1.21)
- platform boots (33.1k, $1.15)
- knee high boots (90.5k, $1.16)
- penny loafers (74k, $1.70)
- jumpsuit for wedding (8.1k, $0.88)
- dressy jumpsuit women (9.9k, $0.95)
- linen pants women (49.5k, $1.47)
- wide leg pants women (40.5k, $1.43)
- palazzo pants (60.5k, $1.40)
- going out tops (12.1k, $1.24)
- heels (201k, $1.12)
- cotton harem pants (12.1k, $1.44)
- low rise jeans y2k (18.1k, $1.36)
`;

const OUTPUT_FORMAT_STANDARD = `
OUTPUT FORMAT — use exactly this structure every single time, including the --- separators. The PRODUCT DESCRIPTION block must include the description text AND the Care Instructions AND the Specifications sections — all within the same block before the next --- separator.

---
PRODUCT TITLE
[title]

CHARACTER COUNT
[number] characters

KEYWORDS USED IN TITLE
[list each keyword from the bank used in the title]

---
PRODUCT DESCRIPTION

[description paragraph(s) per store rules]

**Care Instructions**
[care instructions per store rules]

**Specifications**
[specifications per store rules — each on its own line with bold labels]

---
KEYWORDS USED IN DESCRIPTION
[list each keyword from the bank used in the description]

FORBIDDEN WORD CHECK
Clear — no forbidden words used.

---
SHOPIFY TAGS
[comma-separated tags based on collection mapping — e.g. women, dress, midi]

---
SHOPIFY CATEGORY
[Copy EXACTLY one string from the VALID CATEGORY LIST below. Never invent, abbreviate, or paraphrase. Never wrap the value in quotes.]

---
COLORS
[Comma-separated product colors using professional fashion industry names — e.g. Ivory, Cream, Blush, Dusty Rose, Mauve, Burgundy, Crimson, Cobalt Blue, Navy, Sage Green, Olive, Emerald, Camel, Taupe, Charcoal, Mocha, Terracotta, Rust, Lavender, Lilac, Fuchsia, Plum. Only list colors clearly visible in the images. If the color is uncertain or not visible, write: Unknown]

---
SIZES
[Comma-separated standard US clothing sizes for this product type. For most women's clothing use: XS, S, M, L, XL, 2XL. Only use canonical names — 2XS, XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL. Never use formats like S(4-6) or M(8-10). Write One Size if the product is clearly one-size-fits-all.]

---
METAFIELDS
custom.fit: [value if visible — e.g. Slim, Regular, Oversized, Relaxed]
custom.neckline: [value if visible — e.g. V-Neck, Round Neck, Square Neck, Off-Shoulder]
custom.sleeve_length: [value if visible — e.g. Sleeveless, Short Sleeve, Long Sleeve, 3/4 Sleeve]
custom.occasion: [value — e.g. Casual, Work, Evening, Smart Casual]
custom.pattern: [value if visible — e.g. Solid, Floral, Striped, Abstract, Animal Print]
`;

const CATEGORY_LIST = `
CATEGORY RULES — read before choosing:
- Dresses → "Apparel & Accessories > Clothing > Dresses"
- Skirts → "Apparel & Accessories > Clothing > Skirts"
- Blouses → "Apparel & Accessories > Clothing > Clothing Tops > Blouses"
- Tank Tops → "Apparel & Accessories > Clothing > Clothing Tops > Tank Tops"
- T-Shirts → "Apparel & Accessories > Clothing > Clothing Tops > T-Shirts"
- Sweaters / knitwear → "Apparel & Accessories > Clothing > Clothing Tops > Sweaters"
- Cardigans → "Apparel & Accessories > Clothing > Clothing Tops > Cardigans"
- Matching sets / co-ords → "Apparel & Accessories > Clothing > Outfit Sets"
- Pants → "Apparel & Accessories > Clothing > Pants > Trousers"
- Leggings → "Apparel & Accessories > Clothing > Pants > Leggings"
- Shorts → "Apparel & Accessories > Clothing > Shorts"
- Jumpsuits / Rompers → "Apparel & Accessories > Clothing > One-Pieces"
- Coats / Jackets → "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets"
- Swimwear → "Apparel & Accessories > Clothing > Swimwear"
- Heels / Stilettos → "Apparel & Accessories > Shoes > Heels"
- Boots → "Apparel & Accessories > Shoes > Boots"
- Sandals → "Apparel & Accessories > Shoes > Sandals"
- Sneakers → "Apparel & Accessories > Shoes > Sneakers"
- Loafers / Flats → "Apparel & Accessories > Shoes > Flats"
- Handbags → "Apparel & Accessories > Handbags, Wallets & Cases > Handbags"

VALID CATEGORY LIST — only these exact strings are accepted:
"Apparel & Accessories > Clothing > Activewear"
"Apparel & Accessories > Clothing > Activewear > Activewear Pants > Leggings"
"Apparel & Accessories > Clothing > Clothing Tops"
"Apparel & Accessories > Clothing > Clothing Tops > Blouses"
"Apparel & Accessories > Clothing > Clothing Tops > Bodysuits"
"Apparel & Accessories > Clothing > Clothing Tops > Cardigans"
"Apparel & Accessories > Clothing > Clothing Tops > Hoodies"
"Apparel & Accessories > Clothing > Clothing Tops > Overshirts"
"Apparel & Accessories > Clothing > Clothing Tops > Shirts"
"Apparel & Accessories > Clothing > Clothing Tops > Sweaters"
"Apparel & Accessories > Clothing > Clothing Tops > Sweatshirts"
"Apparel & Accessories > Clothing > Clothing Tops > T-Shirts"
"Apparel & Accessories > Clothing > Clothing Tops > Tank Tops"
"Apparel & Accessories > Clothing > Dresses"
"Apparel & Accessories > Clothing > One-Pieces"
"Apparel & Accessories > Clothing > Outerwear"
"Apparel & Accessories > Clothing > Outerwear > Coats & Jackets"
"Apparel & Accessories > Clothing > Outerwear > Coats & Jackets > Bomber Jackets"
"Apparel & Accessories > Clothing > Outerwear > Coats & Jackets > Overcoats"
"Apparel & Accessories > Clothing > Outerwear > Coats & Jackets > Puffer Jackets"
"Apparel & Accessories > Clothing > Outerwear > Coats & Jackets > Trench Coats"
"Apparel & Accessories > Clothing > Outfit Sets"
"Apparel & Accessories > Clothing > Pants"
"Apparel & Accessories > Clothing > Pants > Jeans"
"Apparel & Accessories > Clothing > Pants > Joggers"
"Apparel & Accessories > Clothing > Pants > Leggings"
"Apparel & Accessories > Clothing > Pants > Trousers"
"Apparel & Accessories > Clothing > Shorts"
"Apparel & Accessories > Clothing > Skirts"
"Apparel & Accessories > Clothing > Suits"
"Apparel & Accessories > Clothing > Swimwear"
"Apparel & Accessories > Clothing Accessories > Belts"
"Apparel & Accessories > Clothing Accessories > Hats"
"Apparel & Accessories > Clothing Accessories > Scarves & Shawls"
"Apparel & Accessories > Clothing Accessories > Sunglasses"
"Apparel & Accessories > Handbags, Wallets & Cases > Handbags"
"Apparel & Accessories > Handbags, Wallets & Cases > Handbags > Clutch Bags"
"Apparel & Accessories > Handbags, Wallets & Cases > Handbags > Cross Body Bags"
"Apparel & Accessories > Handbags, Wallets & Cases > Handbags > Shoulder Bags"
"Apparel & Accessories > Jewelry"
"Apparel & Accessories > Jewelry > Earrings"
"Apparel & Accessories > Jewelry > Necklaces"
"Apparel & Accessories > Shoes"
"Apparel & Accessories > Shoes > Boots"
"Apparel & Accessories > Shoes > Flats"
"Apparel & Accessories > Shoes > Heels"
"Apparel & Accessories > Shoes > Sandals"
"Apparel & Accessories > Shoes > Sneakers"

---
METAFIELDS
custom.fit: [value if visible]
custom.neckline: [value if visible]
custom.sleeve_length: [value if visible]
custom.occasion: [value]
custom.pattern: [value if visible]
`;

const SYSTEM_PROMPT = `You are a top-tier e-commerce copywriter for an American women's fashion webshop. Write in American English throughout (color, center, jewelry, pants, recognize, favorite, sneakers, sweater).

Tone: bold, feminine, aspirational, trend-aware, and social-media savvy — yet simple enough for an 18-year-old to understand. Inspired by PrettyLittleThing, Fashion Nova, and Revolve.

ONLY MENTION FABRIC IF IT SAYS SO IN THE COMPETITOR TITLE.

Product titles must be between 50-75 characters INCLUDING spaces.
Always begin titles with "Women's".
Titles must be neutral, factual, Google Merchant Center-safe. Include product type, sleeve type, length, closure, neckline, structure. Use - instead of commas. Never include color unless explicitly provided. Never include emotional/stylistic words (elegant, chic, flattering), promotional language, lifestyle references, body/confidence claims, emojis, symbols, ALL CAPS.

TITLE GOLDEN RULE: Describe the object. Not the experience. Not the person. Not the feeling.

Sales Paragraph: 1 paragraph only. Must be between 190 and 250 characters (including spaces) — count carefully before submitting. Aspirational, sensory, social-media-aware, transformational. Lead with the feeling and the moment. Write as though texting a friend about the best thing you just found online. Must apply across all variants. Never include color unless explicitly given. Never say "handcrafted", "confident", "confidence".

DESCRIPTION GOLDEN RULE: Sell the moment. Sell the feeling. Never lie.

Care Instructions (always identical):
Machine wash cold on gentle cycle.
Do not bleach.
Tumble dry low or air dry flat.
Iron on low heat if needed.

Specifications:
**Design:** [product-specific details]
**Season:** [All-season OR Autumn/Winter only]
**Gender:** Women's
**Occasion:** [Work, Evening, Casual, Smart Casual, Event, etc.]
**Fit:** [Insert if applicable]

Section titles (Care Instructions, Specifications) must be bold. Specification labels must be bold. Each line on its own line with no blank lines between them.

No em-dashes (—). No lines between sections. No numbering of sections. No bullets/dashes/numbering in descriptions. All products are Women's.
${KEYWORD_BANK_US}
${OUTPUT_FORMAT_STANDARD}
${CATEGORY_LIST}`;

// ── Output parser ─────────────────────────────────────────────────────────────

function get(raw, re) {
  const m = raw.match(re);
  return (m?.[1] || '').trim();
}

function parseOutput(raw) {
  const title      = get(raw, /PRODUCT TITLE\s*\n([^\n]+)/);
  const desc       = get(raw, /PRODUCT DESCRIPTION\s*\n([\s\S]+?)(?=---\s*KEYWORDS USED IN DESCRIPTION)/);
  const tags       = get(raw, /SHOPIFY TAGS\s*\n([^\n-][^\n]*)/);
  const category   = get(raw, /SHOPIFY CATEGORY\s*\n([^\n-][^\n]*)/).replace(/"/g, '').trim();
  const metafields = get(raw, /(?:^|\n)METAFIELDS\s*\n([\s\S]+?)(?:\n---|\s*$)/);

  // Colors: comma-separated list after COLORS section
  const colorsRaw = get(raw, /COLORS\s*\n([^\n-][^\n]*)/);
  const colors = colorsRaw && colorsRaw.toLowerCase() !== 'unknown'
    ? colorsRaw.split(',').map(c => c.trim()).filter(Boolean)
    : [];

  // Sizes: comma-separated list after SIZES section
  const sizesRaw = get(raw, /SIZES\s*\n([^\n-][^\n]*)/);
  const sizes = sizesRaw
    ? sizesRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  return { title, desc, tags, category, metafields, colors, sizes };
}

// ── Claude API call ───────────────────────────────────────────────────────────

function claudeRequest(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': cfg.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('Failed to parse Claude response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Claude request timed out')); });
    req.write(data);
    req.end();
  });
}

async function generate(imageUrls, competitorTitle) {
  const userText = competitorTitle
    ? `Competitor title: ${competitorTitle}\n\nGenerate a product listing for the item shown in the following ${imageUrls.length} image(s).`
    : `Generate a product listing for the item shown in the following ${imageUrls.length} image(s).`;

  const imageContent = imageUrls.map(url => ({
    type: 'image',
    source: { type: 'url', url },
  }));

  const res = await claudeRequest({
    model: cfg.CLAUDE_MODEL,
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          ...imageContent,
          { type: 'text', text: userText },
        ],
      },
    ],
  });

  if (res.error) throw new Error(`Claude error: ${res.error.message}`);
  if (!res.content?.[0]?.text) throw new Error('Empty Claude response');

  const raw    = res.content[0].text;
  const parsed = parseOutput(raw);

  log.info(`[ai] Generated title: "${parsed.title}"`);
  log.debug(`[ai] Colors: ${parsed.colors.join(', ')} | Sizes: ${parsed.sizes.join(', ')}`);

  return parsed;
}

module.exports = { generate, parseOutput };
