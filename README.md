# ListForge

Automated product listing pipeline for Bobby June. Reads product rows from a Google Sheet, enriches them via Canva, CJ Dropshipping, and competitor scraping, generates SEO-optimised copy using Claude AI, creates draft products on Shopify with full taxonomy metadata and variant images — all on a scheduled basis or on demand.

---

## How it works

Two listing workflows, both triggered from the same Google Sheet:

### COPY rows — competitor scraping
Reads a competitor product URL, attempts Shopify product JSON first (fast, structured), then falls back to HTML scraping with JSON-LD and OG tags. Calls Claude to generate the title, description, and metafields in the Rolenna US-English voice. Creates a Shopify draft with all variants, taxonomy attributes, and images assigned to matching colour variants.

### QUOTED rows — Canva design export
Reads a Canva design URL, exports all pages as PNG images via the Canva Connect API, then calls Claude to derive colours from the visuals and generate the full listing. Sizes are sourced from CJ Dropshipping (priority) or a fallback competitor URL. Same Shopify creation pipeline as the COPY flow.

Both flows run automatically 4 times daily via a Netlify scheduled function. Any row can also be triggered immediately by posting to the function endpoint.

---

## Architecture

```
Google Sheet (Store Sheet tab)
    │
    ├── rows with STATUS = "COPY"    ──► competitor scrape + Claude ──► Shopify draft
    └── rows with STATUS = "QUOTED"  ──► Canva export + Claude      ──► Shopify draft
                                                                           │
                                            variants, images, taxonomy, metafields, publication
```

### Pipeline (per row)

```
Mark STATUS → PROCESSING
  → fetch images (Canva export or competitor scrape)
  → fetch sizes (CJ Dropshipping API or competitor scrape)
  → Claude: generate title, description, colors, metafields
  → colorMapper: normalize raw colors to luxury fashion names
  → variantBuilder: build Color × Size variant matrix
  → imageProcessor: assign one image per colorway
  → productCreator:
       1. POST /products.json — create draft
       2. PUT product_type
       3. GraphQL productUpdate — set taxonomy category
       4. POST /metafields.json — set custom metafields
       5. metafieldsSet mutation — set taxonomy attributes (color-pattern, size, gender, age group)
       6. productOptionUpdate mutation — link Color/Size options to metafields (connected options)
       7. POST /images.json per image — upload and assign to variants
       8. publishablePublish mutation — publish to all sales channels
  → write AI LISTED, SHOPIFY LINK, DATE LISTED, PRODUCT NAME, STORE PRICE to sheet
```

On any error the row resets to its original status for automatic retry on the next scheduled run.

---

## Google Sheet structure

Sheet: **Store Sheet**, data starts at row 4 (rows 1–2 headers, row 3 blank).

| Column | 1-based | Field | Read/Write | Notes |
|--------|---------|-------|------------|-------|
| A | 1 | DATE LISTED | Written | D-M-YYYY on success |
| C | 3 | PRODUCT NAME | Written | Final title from Claude |
| E | 5 | ERROR NOTE | Written | Timestamped error string |
| G | 7 | STATUS | Read + Written | See status values below |
| K | 11 | SHOPIFY LINK | Written | Admin URL after creation |
| L | 12 | CJ LINK | Read | CJ Dropshipping product URL |
| N | 14 | CREATIVES | Read | Canva design URL (QUOTED rows) |
| O | 15 | COMPETITOR LINK | Read | Competitor URL (COPY rows; optional context for QUOTED) |
| Q | 17 | COMPARE AT PRICE | Read | Before-sale price (EU format) |
| T | 20 | SUGGESTED PRICE | Read | Fallback selling price |
| U | 21 | STORE PRICE | Read + Written | Primary selling price; written back after listing |

**Status values:**

| Status | Meaning |
|--------|---------|
| `COPY` | Ready to process via competitor URL |
| `QUOTED` | Ready to process via Canva design |
| `PROCESSING` | Currently being processed (auto-cleared on completion or error) |
| `AI LISTED` | Successfully created on Shopify |

### Config Sheet tab

| Cell | Purpose |
|------|---------|
| A2:C2 | Canva tokens: `[accessToken, refreshToken, expiresAt]` |
| D2 | Run lock (ms timestamp) — pipeline writes this, do not edit manually |

---

## Setup

### 1. Environment variables

Set these in the Netlify dashboard under **Site configuration → Environment variables**, and in your local `.env` file for local testing:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account `client_email` |
| `GOOGLE_PRIVATE_KEY` | Service account `private_key` with literal `\n` for newlines |
| `GOOGLE_SHEET_ID` | Spreadsheet ID from the sheet URL |
| `SHOPIFY_STORE_URL` | Store domain, e.g. `yourstore.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | Admin API access token (`shpat_...`) |
| `CANVA_CLIENT_ID` | Canva OAuth app client ID |
| `CANVA_CLIENT_SECRET` | Canva OAuth app client secret |
| `CJ_API_KEY` | CJ Dropshipping API key |
| `TRIGGER_SECRET` | Optional — POST requests must include `x-trigger-secret: <value>` |
| `BATCH_SIZE` | Max rows per run (default: `5`) |
| `LOCK_TTL_MINUTES` | Stale lock age before override (default: `15`) |

### 2. Google service account

1. Create a service account in Google Cloud Console with the Sheets API enabled.
2. Download the JSON key. Copy `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `private_key` → `GOOGLE_PRIVATE_KEY` (keep `\n` as literal `\n`).
3. Share the spreadsheet with the service account email (Editor access).

### 3. Shopify custom app

1. Shopify Admin → Settings → Apps → Develop apps → Create an app.
2. Grant the following Admin API scopes:
   `read_products`, `write_products`, `read_metaobjects`, `write_metaobjects`, `read_publications`, `write_publications`
3. Install the app and copy the Admin API access token → `SHOPIFY_ACCESS_TOKEN`.

### 4. Canva

1. Create a Canva app at `canva.com/developers`, get `CANVA_CLIENT_ID` and `CANVA_CLIENT_SECRET`.
2. Obtain an initial access + refresh token pair via the Canva OAuth flow.
3. Paste them into `Config Sheet!A2:C2` in the format `[accessToken, refreshToken, expiresAt]`. The pipeline rotates and persists the tokens automatically on every Canva export.

### 5. CJ Dropshipping

Generate an API key in your CJ Dropshipping account dashboard → `CJ_API_KEY`.

---

## Running locally

```bash
# Copy and fill in env vars
cp .env.example .env

# Run the pipeline (reads from sheet, processes up to BATCH_SIZE rows)
node run-local.js

# Diagnostic: list all taxonomy metaobject entries in the store
node check-metaobjects.js

# Run the test suite (no dependencies, pure functions only)
node test.js
```

---

## Deployment

1. Connect the repository to Netlify.
2. Add all environment variables under **Site configuration → Environment variables**.
3. Deploy — Netlify picks up the cron schedule from `netlify.toml`.

The pipeline fires at **6am, 9am, 12pm, and 3pm UTC** daily.

To trigger immediately:
```
POST https://{your-site}.netlify.app/.netlify/functions/run-pipeline
x-trigger-secret: <TRIGGER_SECRET>
```

---

## Project structure

```
run-local.js              Local runner — loads .env, runs pipeline, exits on failure
check-metaobjects.js      Diagnostic — lists all taxonomy metaobject entries in the store
test.js                   Test suite — pure function tests, no dependencies

netlify/functions/
  run-pipeline.js         Scheduled handler — validates secret, calls pipeline.run()

src/
  config.js               All constants and env var bindings (single source of truth)

  sheets/
    client.js             Google JWT auth, getRows(), updateCell()
    lock.js               Distributed run lock via Config Sheet!D2
    getProducts.js        Read COPY and QUOTED rows from Store Sheet
    updateStatus.js       markProcessing(), markListed(), markError()

  sources/
    canvaClient.js        Canva Connect API — export job + poll, token rotation
    cjClient.js           CJ Dropshipping API — sizes from variantKey field
    competitorScraper.js  Scrape competitor pages — Shopify JSON → JSON-LD → OG → HTML

  processing/
    colorMapper.js        Raw color names → luxury fashion names (multi-language)
    variantBuilder.js     Color × Size → Shopify variant array with SKUs
    imageProcessor.js     Deduplicate images, assign one per colorway (AI-guided)

  ai/
    generator.js          Claude API — Rolenna US prompt, prompt caching, output parser

  shopify/
    client.js             REST + GraphQL wrapper with 429 auto-retry
    productCreator.js     Full product creation: variants, images, metafields, taxonomy,
                          connected options, publication

  pipeline/
    copyFlow.js           Orchestrate one COPY row end-to-end
    quotedFlow.js         Orchestrate one QUOTED row end-to-end
    productPipeline.js    Read sheet, dispatch flows, lock, batch cap

  utils/
    retry.js              withRetry(fn, label, maxAttempts, delayMs)
    logger.js             Timestamped structured logging
```

---

## What gets created on Shopify

All products are created as **drafts** and immediately published to all sales channels. Each product includes:

- Title and description (Claude-generated, US English, Rolenna voice)
- Colour × Size variant matrix with SKUs
- Compare-at price and selling price
- Shopify taxonomy category (selected from the valid category list)
- Custom metafields: fit, neckline, sleeve length, occasion, pattern
- Taxonomy metafields: colour-pattern, size, age group, target gender (linked to store metaobjects)
- Variant options connected to their metafields (colour swatches, size chips in storefront)
- Product images uploaded and assigned to matching colour variants

---

## Price handling

Prices are read from the sheet in EU format (`.` = thousands separator, `,` = decimal). `storePrice` takes precedence over `suggestedPrice`. The final price used is written back to column U (STORE PRICE) after a successful listing.

---

## Cloudflare-protected sites

Some competitor sites (e.g. scacto.com) return a Cloudflare challenge page to automated requests. When a COPY row's competitor URL is behind Cloudflare, scraping returns 0 images and the row fails and resets. The workaround is to change the row status to `QUOTED` and supply a Canva design URL with the product images instead.
