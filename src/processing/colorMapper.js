'use strict';

// Port of color normalization from product_lister2/netlify/functions/shopify-push-sync.js.
// Two-stage: language translation → fashion luxury renaming.

const UK_SPELLING = {
  'Gray': 'Grey', 'Gray Blue': 'Grey Blue', 'Light Gray': 'Light Grey',
  'Dark Gray': 'Dark Grey', 'Charcoal Gray': 'Charcoal Grey',
};

const COLOUR_TRANSLATIONS = {
  // French
  'Noir': 'Black', 'Blanc': 'White', 'Rouge': 'Red', 'Bleu': 'Blue', 'Vert': 'Green',
  'Jaune': 'Yellow', 'Rose': 'Pink', 'Gris': 'Grey', 'Marron': 'Brown',
  'Orange': 'Orange', 'Violet': 'Purple', 'Crème': 'Cream', 'Beige': 'Beige',
  'Abricot': 'Apricot', 'Caramel': 'Caramel', 'Ecru': 'Ecru', 'Kaki': 'Khaki',
  'Corail': 'Coral', 'Turquoise': 'Turquoise', 'Bordeaux': 'Burgundy',
  'Lavande': 'Lavender', 'Menthe': 'Mint', 'Sable': 'Sand', 'Taupe': 'Taupe',
  'Bleu Marine': 'Navy', 'Bleu Clair': 'Light Blue', 'Bleu Foncé': 'Dark Blue',
  'Bleu Ciel': 'Sky Blue', 'Bleu Roi': 'Royal Blue',
  'Vert Foncé': 'Dark Green', 'Vert Clair': 'Light Green', 'Vert Olive': 'Olive',
  'Gris Foncé': 'Dark Grey', 'Gris Clair': 'Light Grey',
  'Rose Poudré': 'Dusty Pink', 'Rose Fuchsia': 'Fuchsia',
  'Blanc Cassé': 'Off White',
  // Italian
  'Nero': 'Black', 'Bianco': 'White', 'Rosso': 'Red', 'Blu': 'Blue', 'Verde': 'Green',
  'Giallo': 'Yellow', 'Rosa': 'Pink', 'Grigio': 'Grey', 'Marrone': 'Brown',
  'Arancione': 'Orange', 'Viola': 'Purple', 'Crema': 'Cream',
  'Blu Navy': 'Navy', 'Blu Scuro': 'Dark Blue',
  // German
  'Schwarz': 'Black', 'Weiß': 'White', 'Weiss': 'White', 'Rot': 'Red',
  'Blau': 'Blue', 'Grün': 'Green', 'Grun': 'Green',
  'Gelb': 'Yellow', 'Grau': 'Grey', 'Braun': 'Brown', 'Lila': 'Purple',
  'Marine': 'Navy', 'Dunkelblau': 'Dark Blue', 'Hellblau': 'Light Blue',
  // Dutch
  'Zwart': 'Black', 'Wit': 'White', 'Rood': 'Red', 'Blauw': 'Blue',
  'Groen': 'Green', 'Geel': 'Yellow', 'Grijs': 'Grey', 'Bruin': 'Brown',
  'Oranje': 'Orange', 'Roze': 'Pink', 'Paars': 'Purple',
  'Donkerblauw': 'Dark Blue', 'Lichtblauw': 'Light Blue',
  // Scandinavian
  'Sort': 'Black', 'Hvid': 'White', 'Rød': 'Red', 'Blå': 'Blue',
  'Grøn': 'Green', 'Gul': 'Yellow', 'Grå': 'Grey', 'Brun': 'Brown',
  'Lyserød': 'Pink', 'Lilla': 'Purple',
  // Spanish
  'Negro': 'Black', 'Blanco': 'White', 'Rojo': 'Red', 'Azul': 'Blue',
  'Amarillo': 'Yellow', 'Marrón': 'Brown', 'Marron': 'Brown',
  'Naranja': 'Orange', 'Morado': 'Purple',
  'Azul Marino': 'Navy', 'Azul Oscuro': 'Dark Blue', 'Azul Claro': 'Light Blue',
};

const FASHION_COLOR_MAP = {
  'Light Pink':    'Blush',        'Baby Pink':    'Blush',     'Pale Pink':  'Blush',
  'Hot Pink':      'Fuchsia',
  'Rose':          'Dusty Rose',   'Dusty Pink':   'Dusty Rose','Mauve Pink':  'Mauve',
  'Purple':        'Violet',
  'Light Purple':  'Lavender',     'Pale Purple':  'Lavender',
  'Dark Purple':   'Plum',         'Dusty Purple': 'Mauve',
  'Light Blue':    'Sky Blue',     'Baby Blue':    'Powder Blue',
  'Dark Blue':     'Navy',         'Royal Blue':   'Cobalt Blue',
  'Light Green':   'Sage Green',
  'Army Green':    'Olive',        'Khaki':        'Olive',
  'Dark Green':    'Bottle Green', 'Forest Green': 'Emerald',   'Mint Green': 'Mint',
  'Off White':     'Ivory',        'Off-White':    'Ivory',     'Cream White': 'Cream',
  'Beige':         'Camel',        'Sand':         'Taupe',     'Tan':        'Camel',
  'Brown':         'Mocha',        'Dark Brown':   'Espresso',  'Light Brown': 'Caramel',
  'Brick':         'Terracotta',   'Burnt Orange': 'Rust',
  'Dark Red':      'Burgundy',     'Wine':         'Burgundy',  'Maroon':     'Burgundy',
  'Bright Red':    'Crimson',
  'Light Grey':    'Silver Grey',  'Light Gray':   'Silver Grey',
  'Dark Grey':     'Charcoal',     'Dark Gray':    'Charcoal',
};

function translateColour(c) {
  if (COLOUR_TRANSLATIONS[c]) {
    const t = COLOUR_TRANSLATIONS[c];
    return UK_SPELLING[t] || t;
  }
  const lower = c.toLowerCase();
  for (const [key, val] of Object.entries(COLOUR_TRANSLATIONS)) {
    if (key.toLowerCase() === lower) return UK_SPELLING[val] || val;
  }
  return UK_SPELLING[c] || c;
}

function normalizeColor(raw) {
  const translated = translateColour(raw.trim());
  return FASHION_COLOR_MAP[translated] || translated;
}

function normalizeColors(rawColors) {
  return rawColors.map(normalizeColor);
}

module.exports = { normalizeColor, normalizeColors };
