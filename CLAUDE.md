# CLAUDE.md — Aria (product_lister3)

## Project goal

Aria is a scheduled Netlify function (Node.js, no npm dependencies) that runs 4× daily. It reads product rows from Google Sheets with STATUS = `COPY` or `QUOTED`, enriches them via Canva / CJ Dropshipping / competitor scraping, generates copy with Claude (Rolenna US prompt), creates draft Shopify products with full taxonomy, and writes `AI LISTED` back to the sheet.

Aria is the first stage in the pipeline: **Aria → Ignite (`product_activator`) → Stitch (`shopify_patcher`)**.

---

## Running locally

```bash
# Copy and fill in env vars
cp .env.example .env

# Run the full pipeline
node run-local.js

# List all taxonomy metaobject labels in the store
node check-metaobjects.js

# Run the pure-function test suite
node test.js
```

---

## Project structure

```
run-local.js              Local runner — loads .env, calls pipeline.run()
check-metaobjects.js      Diagnostic — dumps taxonomy metaobject entries

netlify/functions/
  run-pipeline.js         Scheduled entry point — validates TRIGGER_SECRET, calls pipeline.run()

src/
  config.js               All constants and env var bindings (single source of truth)

  sheets/
    client.js             Google JWT auth (RS256), getRows(), updateCell()
    lock.js               Distributed run lock via Config Sheet!D2 (ms timestamp, TTL-based)
    getProducts.js        Read COPY/QUOTED rows; parsePrice() for EU-format strings
    updateStatus.js       markProcessing(), markListed(), markError()

  sources/
    canvaClient.js        Canva Connect API — export job + poll; token stored in Config Sheet!A2:C2
    cjClient.js           CJ Dropshipping API — POST /authentication/getAccessToken → GET /product/query
    competitorScraper.js  Scraper: Shopify JSON (.json endpoint) → JSON-LD → OG tags → HTML img

  processing/
    colorMapper.js        Multi-language + luxury fashion color normalization
    variantBuilder.js     Color × Size → Shopify variant array with SKUs
    imageProcessor.js     Deduplicate images; AI-guided color→image assignment with stride fallback

  ai/
    generator.js          Claude API, Rolenna system prompt, prompt caching, parseOutput()

  shopify/
    client.js             shopifyRest() + shopifyGraphQL() with 429 auto-retry
    productCreator.js     Full product creation (8 steps — see below)

  pipeline/
    copyFlow.js           COPY row orchestration
    quotedFlow.js         QUOTED row orchestration
    productPipeline.js    Top-level: lock, getProducts, dispatch, summary

  utils/
    retry.js              withRetry(fn, label, maxAttempts=2, delayMs=3000)
    logger.js             Timestamped log.info / log.debug / log.error
```

---

## Google Sheets structure

### Store Sheet tab — `'Store Sheet'`

Data rows start at **row 4** (rows 1–2 headers, row 3 blank). All column references come from `src/config.js` — never hardcode indices elsewhere.

| Column | 1-based (`COL.*`) | 0-based (`IDX.*`) | Field | R/W |
|--------|-------------------|-------------------|-------|-----|
| A | 1 | 0 | DATE LISTED | W |
| C | 3 | 2 | PRODUCT NAME | W |
| E | 5 | 4 | ERROR NOTE | W |
| G | 7 | 6 | STATUS | R+W |
| K | 11 | 10 | SHOPIFY LINK | W |
| L | 12 | 11 | CJ LINK | R |
| N | 14 | 13 | CREATIVES | R |
| O | 15 | 14 | COMPETITOR LINK | R |
| Q | 17 | 16 | COMPARE AT PRICE | R |
| T | 20 | 19 | SUGGESTED PRICE | R |
| U | 21 | 20 | STORE PRICE | R+W |

**First-run requirement:** Config Sheet!D2 must be empty (not manually set to a timestamp) before the first deploy.

### Config Sheet tab — `'Config Sheet'`

| Cell | Purpose |
|------|---------|
| A2:C2 | Canva tokens: `[accessToken, refreshToken, expiresAt]` |
| D2 | Run lock — Aria owns this cell; Ignite/Stitch must not touch it |

---

## Config constants (`src/config.js`)

All magic numbers live here. Never hardcode column indices, tab names, or status strings in module files.

```js
STORE_SHEET_TAB:  'Store Sheet'
CONFIG_SHEET_TAB: 'Config Sheet'

COL.*   // 1-based column indices for updateCell()
IDX.*   // 0-based for array access after getRows()

DATA_ROW_START:      4
SHOPIFY_API_VERSION: '2026-04'
CLAUDE_MODEL:        'claude-sonnet-4-6'

STATUS.COPY:       'COPY'
STATUS.QUOTED:     'QUOTED'
STATUS.PROCESSING: 'PROCESSING'
STATUS.LISTED:     'AI LISTED'

BATCH_SIZE:      parseInt(process.env.BATCH_SIZE || '5', 10)
LOCK_TTL_MS:     parseInt(process.env.LOCK_TTL_MINUTES || '15', 10) * 60 * 1000

SHOPIFY_HOSTNAME:   // protocol-stripped from SHOPIFY_STORE_URL
SHOPIFY_STORE_SLUG: // hostname without .myshopify.com — used in admin URLs
```

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from service account JSON key |
| `GOOGLE_PRIVATE_KEY` | `private_key` with literal `\n` for newlines |
| `GOOGLE_SHEET_ID` | Spreadsheet ID from URL |
| `SHOPIFY_STORE_URL` | Store domain, e.g. `yourstore.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | Admin API access token (`shpat_...`) |
| `CANVA_CLIENT_ID` | Canva OAuth app client ID |
| `CANVA_CLIENT_SECRET` | Canva OAuth app client secret |
| `CJ_API_KEY` | CJ Dropshipping API key |
| `TRIGGER_SECRET` | Optional — POST requests must include `x-trigger-secret: <value>` |
| `BATCH_SIZE` | Max rows per run (default: `5`) |
| `LOCK_TTL_MINUTES` | Stale lock age before override in minutes (default: `15`) |

`GOOGLE_PRIVATE_KEY` processing in `config.js`:
```js
(process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
```

---

## Shopify product creation sequence (`productCreator.js`)

All 8 steps run in order for every product:

```
1. POST /products.json                 — create draft (title, body_html, variants, options)
2. PUT  /products/{id}.json            — set product_type
3. GraphQL productUpdate               — set taxonomy category (from Claude SHOPIFY CATEGORY field)
4. POST /products/{id}/metafields.json — set custom metafields (category-specific — see below)
5. GraphQL metafieldsSet               — set taxonomy metafields (color-pattern, size, gender, age-group)
   Filtered by CATEGORY_TAXONOMY_ALLOWLIST before sending — prevents Owner subtype errors.
   Accumulator pattern: colors + pattern both write to shopify.color-pattern; merged into one call.
   Unknown colors: logged as "add manually", skipped — no partial GID.
6. GraphQL productOptionUpdate         — link Color/Size options to metafields (connected options).
   Each option value needs a linkedMetafieldValue GID. Unknown values sent without GID.
7. POST /products/{id}/images.json     — upload each image, capture returned image.id
   PUT  /products/{id}/variants/{vid}.json — assign image_id to each variant
8. GraphQL publishablePublish          — publish to all sales channels
```

---

## Taxonomy metaobjects

Shopify taxonomy metafields (`shopify.*`) must reference metaobject GIDs, not raw strings. The code queries each type once per invocation (cached in `metaobjectCache`) and matches by `label` field (not `name`).

Known types and current store entry counts (run `node check-metaobjects.js` for live data):

| Type | Count | Notes |
|------|-------|-------|
| `shopify--fit` | 3 | Slim, Straight leg, Wide — only set for Pants, Shorts, Outfit Sets (see CATEGORY_TAXONOMY_ALLOWLIST) |
| `shopify--neckline` | 11 | Asymmetric, Halter, Hooded, Mock, Plunging, Round, Square, Sweetheart, Turtle, V-neck |
| `shopify--sleeve-length-type` | 7 | Short, Long, Sleeveless, 3/4, Cap, Spaghetti Strap |
| `shopify--occasion-style` | 2 | Casual, Dress — add Evening/Work/Smart Casual/Party/Formal/Wedding in store |
| `shopify--color-pattern` | 129 | Includes Multicolor, most standard fashion colors |
| `shopify--size` | 11 | XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL, One size, 3XS |
| `shopify--age-group` | 1 | Adults |
| `shopify--target-gender` | 1 | Female |

**Required Shopify scopes:** `read_metaobjects`, `write_metaobjects`, `read_publications`, `write_publications`

---

## Claude output format

`generator.js` sends images + a system prompt (Rolenna US voice, prompt-cached). The model outputs these sections in order, separated by `---`:

```
PRODUCT TITLE          → parsed.title
PRODUCT DESCRIPTION    → parsed.desc
SHOPIFY TAGS           → parsed.tags
SHOPIFY CATEGORY       → parsed.category
COLORS                 → parsed.colors (comma-separated; "Multicolor" for prints)
SIZES                  → parsed.sizes
COLOR IMAGE INDICES    → parsed.colorImageIndices ({ ColorName: imageIndex })
METAFIELDS             → parsed.metafields (raw string, parsed by parseMetafields())
```

**Color vs Multicolor rule:** Separate colorways → list each color. Prints/patterns (abstract, floral, tie-dye, etc.) → output `Multicolor` only.

**COLOR IMAGE INDICES:** Only emitted for multi-colorway products. `imageProcessor.js` uses these indices to assign the correct image to each colorway. Falls back to stride-based grouping if the section is absent.

**METAFIELDS — category-specific fields:** Claude only outputs the fields applicable to the chosen SHOPIFY CATEGORY. The METAFIELD RULES in the system prompt define which fields apply per category (sourced from Shopify product taxonomy). Custom fields (`custom.*`) are set via REST in step 4; taxonomy fields (`shopify.*`) are filtered by `CATEGORY_TAXONOMY_ALLOWLIST` before step 5.

| Category group | Custom metafields emitted |
|---|---|
| Dresses | occasion, pattern, neckline, sleeve_length, dress_length, dress_style |
| One-Pieces (jumpsuits) | occasion, pattern, one_piece_style, neckline, sleeve_length, pants_length |
| Clothing Tops | occasion, pattern, neckline, sleeve_length, top_length |
| Outfit Sets | occasion, pattern, neckline, sleeve_length, top_length, fit, waist_rise, pants_length OR skirt_length/skirt_style |
| Suits | occasion, pattern, neckline, sleeve_length |
| Outerwear | occasion, pattern, sleeve_length |
| Pants | occasion, pattern, fit, waist_rise, pants_length |
| Shorts | occasion, pattern, fit, waist_rise |
| Skirts | occasion, pattern, skirt_length, skirt_style, waist_rise |
| Swimwear | pattern, swimwear_style, sleeve_length |
| Activewear | occasion, pattern, activity, sleeve_length |
| Shoes | heel_height, toe_style, closure_type |
| Non-clothing | pattern (if visibly patterned) |

**Suit vs Jumpsuit distinction:** The category rules explicitly separate suits (two separate pieces → `...Suits`) from jumpsuits/rompers (one continuous garment → `...One-Pieces`). This prevents misclassification of tuxedo suits as jumpsuits.

---

## CJ Dropshipping API

- Auth: `POST /api2.0/v1/authentication/getAccessToken` with `{ apiKey }` → `data.accessToken`
- Sizes: `GET /api2.0/v1/product/query?pid={pid}` → `data.variants[]`
- Size field: **`variantKey`** (format: `"Black-XL"`) — split on `-`, match against size pattern. `variantNameEn` is the full label and does not reliably contain sizes alone.
- Product ID extraction: `/-p-([^/]+)\.html/` from CJ URL

---

## Competitor scraper

Three-stage fallback chain:
1. **Shopify JSON** (`/products/{handle}.json`) — structured, includes all variants and images. Only attempted for `/products/` URLs. Fails silently on Cloudflare-protected stores.
2. **JSON-LD** (`application/ld+json` blocks) — `@type: Product` nodes with `image`, `hasVariant`.
3. **OG tags + HTML images** — `og:image` meta tags; `<img src/data-src>` with icon/logo/avatar filtered out.

---

## Key function signatures

### `src/sheets/client.js`

```js
getGoogleAccessToken() → Promise<string>
// RS256 JWT → oauth2.googleapis.com/token. Valid 1 hour.

getRows(token, sheetId, tabName) → Promise<string[][]>
// Returns ragged 2D array — missing cells are absent. Always access as (row[idx] || '').

updateCell(token, sheetId, tabName, rowNum, colNum, value) → Promise<void>
// rowNum and colNum are 1-based.
```

### `src/shopify/client.js`

```js
shopifyRest(method, path, body) → Promise<{ status, body }>
// path relative, e.g. '/products.json'. Auto-retries on 429 via Retry-After. Timeout 30s.

shopifyGraphQL(query, variables) → Promise<object>
// Returns parsed response body. Caller checks .data and .errors.
```

### `src/processing/colorMapper.js`

```js
normalizeColor(raw) → string
// Multi-language map (FR/IT/DE/NL/ES) → English → US/UK spelling → luxury fashion name.
// Note: 'Rose' → 'Pink' (French intercepts before FASHION_COLOR_MAP).

normalizeColors(rawArray) → string[]
// Deduplicates after normalization.
```

### `src/processing/imageProcessor.js`

```js
processImages(imageUrls, colors, colorImageIndices={}) → { deduped, variantImageMap }
// colorImageIndices: { ColorName: 0-based image index } from Claude output.
// Fallback: stride = floor(total / colors.length), color[i] → deduped[i * stride].
```

---

## Important constraints and gotchas

- **No npm dependencies.** Uses only Node built-ins: `https`, `crypto`. Do not add packages.
- **Column indices must come from `config.js`** — never hardcode numbers in module files.
- **`getRows` returns a ragged array.** Always access cells as `(row[idx] || '').trim()`.
- **Run lock:** Acquired at pipeline start via Config Sheet!D2. If the cell holds a timestamp less than `LOCK_TTL_MS` old, the run is skipped. Always released in a `finally` block.
- **Accumulator pattern for `shopify.color-pattern`:** Both the pattern metafield and each color write to the same metafield key. The accumulator merges all GIDs before making a single `metafieldsSet` call. Without this, the second write silently overwrites the first.
- **`shopify.fit` Owner subtype errors:** Shopify enforces category constraints — `fit` is only valid for Pants, Shorts, and Outfit Sets. `CATEGORY_TAXONOMY_ALLOWLIST` in `productCreator.js` pre-filters which taxonomy metafields are sent per category before step 5, eliminating these errors. The allowlist is derived from Shopify product taxonomy data (shopify.github.io/product-taxonomy). Unknown categories (not in the map) pass all keys through as a safe default.
- **New category-specific custom metafields** (`custom.dress_length`, `custom.dress_style`, `custom.one_piece_style`, `custom.pants_length`, `custom.waist_rise`, `custom.skirt_length`, `custom.skirt_style`, `custom.top_length`, `custom.swimwear_style`, `custom.activity`, `custom.heel_height`, `custom.toe_style`, `custom.closure_type`) are stored as `single_line_text_field` via REST and require no Shopify store setup.
- **Price format:** Prices in the sheet use EU format (`.` = thousands, `,` = decimal). `parsePrice()` strips `.` then replaces one `,` with `.`. Values like `49,99` → `49.99`. Single replacement is correct because EU prices have at most one comma.
- **Canva token rotation:** Tokens are read from `Config Sheet!A2:C2`, used, and a refreshed token pair is written back. Never store Canva tokens in env vars — they expire and the sheet is the source of truth.
- **Cloudflare-protected competitors:** Stores like scacto.com return a bot challenge page. Scraping returns 0 images and the row fails/resets. Workaround: switch the row to QUOTED and add a Canva design URL.
- **`withRetry` default is 2 attempts.** First failure retried once after 3s. Permanent errors surface after the second attempt.
- **Variant options connected to metafields:** `productOptionUpdate` requires a `linkedMetafieldValue` GID for every option value. Unknown colors (not in metaobjects) are sent without a GID; Shopify may partially link the option. The Size option always links fully since all sizes exist in the store.
- **Publications:** Requires `read_publications` + `write_publications` scopes. Queried once per invocation (`publicationsCache`). If empty, no publish step runs.
- **Shopify API version:** `2026-04` — set in `config.js`. Update here only.
