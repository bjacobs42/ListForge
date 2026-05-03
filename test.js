'use strict';

const assert = require('assert');

const { parsePrice }              = require('./src/sheets/getProducts');
const { normalizeColor, normalizeColors } = require('./src/processing/colorMapper');
const { buildVariants }           = require('./src/processing/variantBuilder');
const { processImages }           = require('./src/processing/imageProcessor');
const { parseSizesFromVariants }  = require('./src/sources/cjClient');
const { parseOutput }             = require('./src/ai/generator');
const { markdownToHtml, parseMetafields } = require('./src/shopify/productCreator');

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${label}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ── parsePrice ────────────────────────────────────────────────────────────────
console.log('\nparsePrice');
test('EU decimal comma',        () => assert.strictEqual(parsePrice('€49,99'),      49.99));
test('EU thousands dot',        () => assert.strictEqual(parsePrice('€1.299,99'), 1299.99));
test('pound symbol',            () => assert.strictEqual(parsePrice('£29,95'),      29.95));
test('no currency symbol',      () => assert.strictEqual(parsePrice('79,00'),       79.00));
test('integer (no decimals)',   () => assert.strictEqual(parsePrice('€50'),         50));
test('empty string → null',     () => assert.strictEqual(parsePrice(''),            null));
test('whitespace only → null',  () => assert.strictEqual(parsePrice('   '),         null));

// ── normalizeColor ────────────────────────────────────────────────────────────
console.log('\nnormalizeColor');
test('French Noir → Black',          () => assert.strictEqual(normalizeColor('Noir'),       'Black'));
test('French Rose → Pink (FR translation runs before fashion map)', () => assert.strictEqual(normalizeColor('Rose'), 'Pink'));
test('German Schwarz → Black',       () => assert.strictEqual(normalizeColor('Schwarz'),    'Black'));
test('Spanish Negro → Black',        () => assert.strictEqual(normalizeColor('Negro'),      'Black'));
test('Dark Blue → Navy',             () => assert.strictEqual(normalizeColor('Dark Blue'),  'Navy'));
test('Light Pink → Blush',           () => assert.strictEqual(normalizeColor('Light Pink'), 'Blush'));
test('Brown → Mocha',                () => assert.strictEqual(normalizeColor('Brown'),      'Mocha'));
test('Off White → Ivory',            () => assert.strictEqual(normalizeColor('Off White'),  'Ivory'));
test('Khaki → Olive',                () => assert.strictEqual(normalizeColor('Khaki'),      'Olive'));
test('passthrough — Navy unchanged', () => assert.strictEqual(normalizeColor('Navy'),       'Navy'));
test('passthrough — Blush unchanged',() => assert.strictEqual(normalizeColor('Blush'),      'Blush'));

// ── normalizeColors ───────────────────────────────────────────────────────────
console.log('\nnormalizeColors');
test('batch normalize', () =>
  assert.deepStrictEqual(normalizeColors(['Noir', 'Rose', 'Navy']), ['Black', 'Pink', 'Navy']));
test('empty array',     () =>
  assert.deepStrictEqual(normalizeColors([]), []));

// ── buildVariants ─────────────────────────────────────────────────────────────
console.log('\nbuildVariants');
test('color × size matrix — variant count', () => {
  const { variants } = buildVariants(['Blush', 'Navy'], ['S', 'M', 'L'], 'wrap-midi-dress', 49.99, 79.99);
  assert.strictEqual(variants.length, 6);
});
test('color × size matrix — first variant fields', () => {
  const { variants } = buildVariants(['Blush', 'Navy'], ['S', 'M', 'L'], 'wrap-midi-dress', 49.99, 79.99);
  assert.strictEqual(variants[0].option1, 'Blush');
  assert.strictEqual(variants[0].option2, 'S');
  assert.strictEqual(variants[0].price, '49.99');
  assert.strictEqual(variants[0].compare_at_price, '79.99');
});
test('color × size matrix — SKU format', () => {
  const { variants } = buildVariants(['Blush', 'Navy'], ['S', 'M', 'L'], 'wrap-midi-dress', 49.99, 79.99);
  assert.strictEqual(variants[0].sku, 'WRAP-MIDI-DRESS-BLUSH-S');
});
test('color × size matrix — options', () => {
  const { options } = buildVariants(['Blush', 'Navy'], ['S', 'M', 'L'], 'wrap-midi-dress', 49.99, 79.99);
  assert.strictEqual(options.length, 2);
  assert.strictEqual(options[0].name, 'Color');
  assert.strictEqual(options[1].name, 'Size');
});
test('color-only (no sizes)', () => {
  const { variants, options } = buildVariants(['Black', 'White'], [], 'linen-trousers', 39.99, null);
  assert.strictEqual(variants.length, 2);
  assert.strictEqual(variants[0].option1, 'Black');
  assert.ok(!variants[0].option2);
  assert.strictEqual(variants[0].compare_at_price, null);
  assert.strictEqual(options.length, 1);
  assert.strictEqual(options[0].name, 'Color');
});
test('size-only (no colors)', () => {
  const { variants, options } = buildVariants([], ['XS', 'S', 'M'], 'palazzo-pants', 59.99, null);
  assert.strictEqual(variants.length, 3);
  assert.strictEqual(variants[0].option1, 'XS');
  assert.strictEqual(options[0].name, 'Size');
});
test('single fallback (no colors, no sizes)', () => {
  const { variants, options } = buildVariants([], [], 'hair-clip', 9.99, null);
  assert.strictEqual(variants.length, 1);
  assert.strictEqual(variants[0].sku, 'HAIR-CLIP');
  assert.strictEqual(options.length, 0);
});
test('SKU slugification — spaces and special chars', () => {
  const { variants } = buildVariants(['Dusty Rose'], ['2XL'], 'v-neck blouse', 29.99, null);
  assert.strictEqual(variants[0].sku, 'V-NECK-BLOUSE-DUSTY-ROSE-2XL');
});

// ── processImages ─────────────────────────────────────────────────────────────
console.log('\nprocessImages');
test('deduplicates URLs, preserves order', () => {
  const { deduped } = processImages(['a.jpg', 'b.jpg', 'a.jpg', 'c.jpg'], []);
  assert.deepStrictEqual(deduped, ['a.jpg', 'b.jpg', 'c.jpg']);
});
test('index-based mapping when image count matches color count', () => {
  const { variantImageMap } = processImages(['a.jpg', 'b.jpg', 'c.jpg'], ['Black', 'White', 'Navy']);
  assert.strictEqual(variantImageMap['Black'], 'a.jpg');
  assert.strictEqual(variantImageMap['White'], 'b.jpg');
  assert.strictEqual(variantImageMap['Navy'],  'c.jpg');
});
test('index-based mapping when more images than colors', () => {
  const { variantImageMap } = processImages(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], ['Black', 'White']);
  assert.strictEqual(variantImageMap['Black'], 'a.jpg');
  assert.strictEqual(variantImageMap['White'], 'b.jpg');
});
test('all colors map to first image when fewer images than colors', () => {
  const { variantImageMap } = processImages(['a.jpg'], ['Black', 'White', 'Navy']);
  assert.strictEqual(variantImageMap['Black'], 'a.jpg');
  assert.strictEqual(variantImageMap['White'], 'a.jpg');
  assert.strictEqual(variantImageMap['Navy'],  'a.jpg');
});
test('no colors → empty variantImageMap', () => {
  const { variantImageMap, deduped } = processImages(['a.jpg', 'b.jpg'], []);
  assert.deepStrictEqual(variantImageMap, {});
  assert.deepStrictEqual(deduped, ['a.jpg', 'b.jpg']);
});
test('empty image list → empty results', () => {
  const { deduped, variantImageMap } = processImages([], ['Black']);
  assert.deepStrictEqual(deduped, []);
  assert.deepStrictEqual(variantImageMap, {});
});

// ── parseSizesFromVariants ────────────────────────────────────────────────────
console.log('\nparseSizesFromVariants');
test('parses "Color-Size" compound names', () => {
  const sizes = parseSizesFromVariants([
    { variantNameEn: 'Black-XL' },
    { variantNameEn: 'Red-M' },
    { variantNameEn: 'Blue-XL' },
  ]);
  assert.ok(sizes.includes('XL'));
  assert.ok(sizes.includes('M'));
  assert.strictEqual(sizes.length, 2);
});
test('parses numeric sizes', () => {
  const sizes = parseSizesFromVariants([{ variantNameEn: '32' }, { variantNameEn: '34' }]);
  assert.ok(sizes.includes('32'));
  assert.ok(sizes.includes('34'));
});
test('XXL normalised to 2XL', () => {
  const sizes = parseSizesFromVariants([{ variantNameEn: 'White-XXL' }]);
  assert.ok(sizes.includes('2XL'));
  assert.ok(!sizes.includes('XXL'));
});
test('non-size part (color name) ignored', () => {
  const sizes = parseSizesFromVariants([{ variantNameEn: 'Default' }]);
  assert.strictEqual(sizes.length, 0);
});
test('empty input → empty array', () => {
  assert.deepStrictEqual(parseSizesFromVariants([]), []);
});
test('falls back to variantName when variantNameEn absent', () => {
  const sizes = parseSizesFromVariants([{ variantName: 'Green-S' }]);
  assert.ok(sizes.includes('S'));
});

// ── parseOutput ───────────────────────────────────────────────────────────────
console.log('\nparseOutput');

const SAMPLE_CLAUDE_RESPONSE = `
---
PRODUCT TITLE
Women's Floral Wrap Midi Dress - V-Neck Long Sleeve

CHARACTER COUNT
55 characters

KEYWORDS USED IN TITLE
midi dress

---
PRODUCT DESCRIPTION

Step into effortless style with this floral wrap midi dress. The V-neck keeps you chic all day.

**Care Instructions**
Machine wash cold on gentle cycle.
Do not bleach.
Tumble dry low or air dry flat.
Iron on low heat if needed.

**Specifications**
**Design:** Wrap silhouette with floral print
**Season:** All-season
**Gender:** Women's
**Occasion:** Casual

---
KEYWORDS USED IN DESCRIPTION
midi dress

FORBIDDEN WORD CHECK
Clear — no forbidden words used.

---
SHOPIFY TAGS
women, dress, midi, floral, wrap

---
SHOPIFY CATEGORY
Apparel & Accessories > Clothing > Dresses

---
COLORS
Blush, Navy, Ivory

---
SIZES
XS, S, M, L, XL, 2XL

---
METAFIELDS
custom.fit: Regular
custom.neckline: V-Neck
custom.sleeve_length: Long Sleeve
custom.occasion: Casual
custom.pattern: Floral
`;

test('parses title', () => {
  const r = parseOutput(SAMPLE_CLAUDE_RESPONSE);
  assert.strictEqual(r.title, "Women's Floral Wrap Midi Dress - V-Neck Long Sleeve");
});
test('parses tags', () => {
  const r = parseOutput(SAMPLE_CLAUDE_RESPONSE);
  assert.strictEqual(r.tags, 'women, dress, midi, floral, wrap');
});
test('parses category — no surrounding quotes', () => {
  const r = parseOutput(SAMPLE_CLAUDE_RESPONSE);
  assert.strictEqual(r.category, 'Apparel & Accessories > Clothing > Dresses');
});
test('parses colors as array', () => {
  const r = parseOutput(SAMPLE_CLAUDE_RESPONSE);
  assert.deepStrictEqual(r.colors, ['Blush', 'Navy', 'Ivory']);
});
test('parses sizes as array', () => {
  const r = parseOutput(SAMPLE_CLAUDE_RESPONSE);
  assert.deepStrictEqual(r.sizes, ['XS', 'S', 'M', 'L', 'XL', '2XL']);
});
test('desc contains care instructions', () => {
  const r = parseOutput(SAMPLE_CLAUDE_RESPONSE);
  assert.ok(r.desc.includes('Care Instructions'), `desc missing care instructions: ${r.desc}`);
  assert.ok(r.desc.includes('Machine wash cold'));
});
test('metafields string contains all custom lines', () => {
  const r = parseOutput(SAMPLE_CLAUDE_RESPONSE);
  assert.ok(r.metafields.includes('custom.fit: Regular'));
  assert.ok(r.metafields.includes('custom.neckline: V-Neck'));
  assert.ok(r.metafields.includes('custom.pattern: Floral'));
});
test('Unknown colors → empty array', () => {
  const r = parseOutput(SAMPLE_CLAUDE_RESPONSE.replace('Blush, Navy, Ivory', 'Unknown'));
  assert.deepStrictEqual(r.colors, []);
});
test('category with quotes stripped', () => {
  const r = parseOutput(SAMPLE_CLAUDE_RESPONSE.replace(
    'Apparel & Accessories > Clothing > Dresses',
    '"Apparel & Accessories > Clothing > Dresses"'
  ));
  assert.strictEqual(r.category, 'Apparel & Accessories > Clothing > Dresses');
});

// ── parseMetafields ───────────────────────────────────────────────────────────
console.log('\nparseMetafields');
test('parses namespace, key, value, type', () => {
  const mf = parseMetafields('custom.fit: Slim\ncustom.neckline: V-Neck');
  assert.strictEqual(mf.length, 2);
  assert.strictEqual(mf[0].namespace, 'custom');
  assert.strictEqual(mf[0].key, 'fit');
  assert.strictEqual(mf[0].value, 'Slim');
  assert.strictEqual(mf[0].type, 'single_line_text_field');
});
test('skips lines with no dot in key', () => {
  const mf = parseMetafields('nodot: value\ncustom.fit: Slim');
  assert.strictEqual(mf.length, 1);
  assert.strictEqual(mf[0].key, 'fit');
});
test('skips placeholder values like [value if visible]', () => {
  const mf = parseMetafields('custom.fit: [value if visible]\ncustom.neckline: V-Neck');
  assert.strictEqual(mf.length, 1);
  assert.strictEqual(mf[0].key, 'neckline');
});
test('skips lines without colon', () => {
  const mf = parseMetafields('custom.fit\ncustom.neckline: V-Neck');
  assert.strictEqual(mf.length, 1);
});
test('empty string → empty array', () => {
  assert.deepStrictEqual(parseMetafields(''), []);
});
test('null → empty array', () => {
  assert.deepStrictEqual(parseMetafields(null), []);
});

// ── markdownToHtml ────────────────────────────────────────────────────────────
console.log('\nmarkdownToHtml');
test('wraps output in <p>', () => {
  const html = markdownToHtml('Hello world.');
  assert.ok(html.startsWith('<p>'), `expected <p> start, got: ${html}`);
  assert.ok(html.endsWith('</p>'), `expected </p> end, got: ${html}`);
});
test('converts **bold** to <strong>', () => {
  const html = markdownToHtml('This is **bold** text.');
  assert.ok(html.includes('<strong>bold</strong>'));
});
test('bullet list → <ul><li>', () => {
  const html = markdownToHtml('• Item one\n• Item two');
  assert.ok(html.includes('<ul>'), `expected <ul>, got: ${html}`);
  assert.ok(html.includes('<li>Item one</li>'));
  assert.ok(html.includes('<li>Item two</li>'));
});
test('Care Instructions section uses <br> per line', () => {
  const html = markdownToHtml('**Care Instructions**\nMachine wash cold.\nDo not bleach.');
  assert.ok(html.includes('Machine wash cold.<br>'), `expected <br>, got: ${html}`);
});
test('Specifications section uses <br> per line', () => {
  const html = markdownToHtml('**Specifications**\n**Design:** Wrap\n**Season:** All-season');
  assert.ok(html.includes('<strong>Design:</strong>'), `got: ${html}`);
  assert.ok(html.includes('<br>'));
});
test('empty <p> tags removed', () => {
  const html = markdownToHtml('First paragraph\n\nSecond paragraph');
  assert.ok(!html.includes('<p></p>'), `unexpected empty <p></p> in: ${html}`);
  assert.ok(!html.match(/<p>\s*<\/p>/));
});

// ── Summary ───────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n${total} tests: ${passed} passed${failed > 0 ? `, ${failed} failed` : ''}`);
if (failed > 0) process.exit(1);
