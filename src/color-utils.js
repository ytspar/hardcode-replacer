'use strict';

const { NAMED_COLORS, NAMED_COLOR_SET } = require('./css-named-colors');

/**
 * Parse a hex color string to RGB values.
 * Supports #rgb, #rgba, #rrggbb, #rrggbbaa
 */
function hexToRgb(hex) {
  hex = hex.replace('#', '');

  if (hex.length === 3 || hex.length === 4) {
    hex = hex.split('').map(c => c + c).join('');
  }

  // Take only the first 6 chars (ignore alpha)
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return { r, g, b };
}

/**
 * Parse rgb()/rgba() string to RGB values.
 * Supports both legacy comma-separated and modern space-separated syntax:
 *   rgb(255, 0, 0)           — legacy
 *   rgb(255 0 0)             — modern
 *   rgb(255 0 0 / 50%)       — modern with alpha
 *   rgba(255, 0, 0, 0.5)     — legacy with alpha
 */
function rgbStringToRgb(str) {
  // Try modern space-separated first: rgb(255 0 0) or rgb(255 0 0 / 50%)
  const modernMatch = str.match(/rgba?\(\s*([\d.]+)%?\s+([\d.]+)%?\s+([\d.]+)%?\s*(?:\/\s*([\d.]+%?)\s*)?\)/);
  // Then try legacy comma-separated: rgb(255, 0, 0) or rgba(255, 0, 0, 0.5)
  const legacyMatch = str.match(/rgba?\(\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*(?:,\s*([\d.]+%?)\s*)?\)/);

  const match = modernMatch || legacyMatch;
  if (!match) return null;

  let [, r, g, b] = match;
  r = parseFloat(r);
  g = parseFloat(g);
  b = parseFloat(b);

  // Handle percentage values for r/g/b
  if (str.match(/rgba?\(\s*[\d.]+%/)) {
    r = Math.round(r * 2.55);
    g = Math.round(g * 2.55);
    b = Math.round(b * 2.55);
  }

  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

/**
 * Parse hsl()/hsla() string to RGB values.
 * Supports both legacy and modern syntax:
 *   hsl(360, 100%, 50%)         — legacy
 *   hsl(360 100% 50%)           — modern
 *   hsl(360 100% 50% / 50%)     — modern with alpha
 */
function hslStringToRgb(str) {
  // Modern space-separated
  const modernMatch = str.match(/hsla?\(\s*([\d.]+)(?:deg|rad|grad|turn)?\s+([\d.]+)%?\s+([\d.]+)%?\s*(?:\/\s*[\d.]+%?\s*)?\)/);
  // Legacy comma-separated
  const legacyMatch = str.match(/hsla?\(\s*([\d.]+)(?:deg|rad|grad|turn)?\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*(?:,\s*[\d.]+%?\s*)?\)/);
  const match = modernMatch || legacyMatch;
  if (!match) return null;

  let [, h, s, l] = match;
  h = parseFloat(h) / 360;
  s = parseFloat(s) / 100;
  l = parseFloat(l) / 100;

  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

/**
 * Parse any supported color string to RGB.
 */
function parseColor(str) {
  if (!str || typeof str !== 'string') return null;
  str = str.trim().toLowerCase();

  // Named color
  if (NAMED_COLOR_SET.has(str)) {
    return hexToRgb(NAMED_COLORS[str]);
  }

  // Hex
  if (str.startsWith('#')) {
    return hexToRgb(str);
  }

  // RGB/RGBA
  if (str.startsWith('rgb')) {
    return rgbStringToRgb(str);
  }

  // HSL/HSLA
  if (str.startsWith('hsl')) {
    return hslStringToRgb(str);
  }

  return null;
}

/**
 * Convert RGB to hex string.
 */
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c =>
    Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')
  ).join('');
}

/**
 * Normalize any color to a canonical hex form for comparison.
 */
function normalizeToHex(colorStr) {
  const rgb = parseColor(colorStr);
  if (!rgb) return null;
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

/**
 * Convert RGB to LAB color space for perceptual distance calculation.
 * Uses the CIE 1976 LAB color space.
 */
function rgbToLab(r, g, b) {
  // RGB to XYZ (sRGB, D65 illuminant)
  let rr = r / 255, gg = g / 255, bb = b / 255;
  rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
  gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
  bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;

  let x = (rr * 0.4124564 + gg * 0.3575761 + bb * 0.1804375) / 0.95047;
  let y = (rr * 0.2126729 + gg * 0.7151522 + bb * 0.0721750);
  let z = (rr * 0.0193339 + gg * 0.1191920 + bb * 0.9503041) / 1.08883;

  const f = t => t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116;

  x = f(x);
  y = f(y);
  z = f(z);

  return {
    l: (116 * y) - 16,
    a: 500 * (x - y),
    b: 200 * (y - z),
  };
}

/**
 * Calculate CIE76 Delta-E color distance (perceptual).
 * Values: 0 = identical, <1 = imperceptible, 1-2 = close, 2-10 = noticeable, >10 = different
 */
function colorDistance(color1, color2) {
  const rgb1 = typeof color1 === 'string' ? parseColor(color1) : color1;
  const rgb2 = typeof color2 === 'string' ? parseColor(color2) : color2;

  if (!rgb1 || !rgb2) return Infinity;

  const lab1 = rgbToLab(rgb1.r, rgb1.g, rgb1.b);
  const lab2 = rgbToLab(rgb2.r, rgb2.g, rgb2.b);

  return Math.sqrt(
    Math.pow(lab2.l - lab1.l, 2) +
    Math.pow(lab2.a - lab1.a, 2) +
    Math.pow(lab2.b - lab1.b, 2)
  );
}

/**
 * Find the nearest color from a palette.
 * @param {string} colorStr - The color to match
 * @param {Object} palette - Map of { name: hexValue }
 * @returns {{ name, hex, distance } | null}
 */
function findNearestColor(colorStr, palette) {
  const rgb = parseColor(colorStr);
  if (!rgb) return null;

  let nearest = null;
  let minDistance = Infinity;

  for (const [name, hex] of Object.entries(palette)) {
    const paletteRgb = parseColor(hex);
    if (!paletteRgb) continue;

    const dist = colorDistance(rgb, paletteRgb);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = { name, hex, distance: Math.round(dist * 100) / 100 };
    }
  }

  return nearest;
}

/**
 * Classify a color type from its string representation.
 */
function classifyColor(str) {
  str = str.trim().toLowerCase();
  if (str.startsWith('#')) return 'hex';
  if (str.startsWith('rgba')) return 'rgba';
  if (str.startsWith('rgb')) return 'rgb';
  if (str.startsWith('hsla')) return 'hsla';
  if (str.startsWith('hsl')) return 'hsl';
  if (str.startsWith('oklch')) return 'oklch';
  if (str.startsWith('oklab')) return 'oklab';
  if (str.startsWith('lch')) return 'lch';
  if (str.startsWith('lab')) return 'lab';
  if (str.startsWith('hwb')) return 'hwb';
  if (str.startsWith('color(')) return 'color()';
  if (NAMED_COLOR_SET.has(str)) return 'named';
  return 'unknown';
}

/**
 * Extract alpha value from a color string.
 * Returns alpha as a float (0-1) or null if no alpha / fully opaque.
 */
function extractAlpha(colorStr) {
  if (!colorStr) return null;
  const str = colorStr.trim().toLowerCase();

  // #rrggbbaa or #rgba
  if (str.startsWith('#')) {
    const hex = str.slice(1);
    if (hex.length === 8) {
      const a = parseInt(hex.substring(6, 8), 16) / 255;
      return a < 1 ? Math.round(a * 100) / 100 : null;
    }
    if (hex.length === 4) {
      const a = parseInt(hex[3] + hex[3], 16) / 255;
      return a < 1 ? Math.round(a * 100) / 100 : null;
    }
    return null;
  }

  // rgba(r, g, b, a) or rgb(r g b / a)
  if (str.startsWith('rgb')) {
    // Modern: rgb(r g b / alpha)
    const modernAlpha = str.match(/\/\s*([\d.]+)(%?)\s*\)/);
    if (modernAlpha) {
      const val = parseFloat(modernAlpha[1]);
      return modernAlpha[2] === '%' ? val / 100 : val;
    }
    // Legacy: rgba(r, g, b, alpha)
    const legacyAlpha = str.match(/,\s*([\d.]+)\s*\)/);
    if (legacyAlpha && str.startsWith('rgba')) {
      return parseFloat(legacyAlpha[1]);
    }
    return null;
  }

  // hsla(h, s, l, a) or hsl(h s l / a)
  if (str.startsWith('hsl')) {
    const modernAlpha = str.match(/\/\s*([\d.]+)(%?)\s*\)/);
    if (modernAlpha) {
      const val = parseFloat(modernAlpha[1]);
      return modernAlpha[2] === '%' ? val / 100 : val;
    }
    const legacyAlpha = str.match(/,\s*([\d.]+)\s*\)/);
    if (legacyAlpha && str.startsWith('hsla')) {
      return parseFloat(legacyAlpha[1]);
    }
    return null;
  }

  return null;
}

/**
 * Generate a color-mix() replacement suggestion for a color with alpha.
 * @param {string} varName - The CSS variable name (e.g., '--primary-500')
 * @param {number} alpha - Alpha value (0-1)
 * @returns {string} The color-mix() expression
 */
function colorMixSuggestion(varName, alpha) {
  const pct = Math.round(alpha * 100);
  return `color-mix(in srgb, var(${varName}) ${pct}%, transparent)`;
}

/**
 * Suggest a CSS variable name for an unmatched color based on its characteristics.
 * @param {string} colorStr - The color value
 * @param {string} cssProperty - The CSS property context (e.g., 'background-color')
 * @returns {string} Suggested variable name
 */
function suggestVariableName(colorStr, cssProperty) {
  const rgb = parseColor(colorStr);
  if (!rgb) return '--color-custom';

  // Determine a hue-based name
  const hueName = getHueName(rgb);

  // Determine a lightness descriptor
  const lab = rgbToLab(rgb.r, rgb.g, rgb.b);
  let lightness = '';
  if (lab.l < 20) lightness = '-dark';
  else if (lab.l < 40) lightness = '-700';
  else if (lab.l < 60) lightness = '-500';
  else if (lab.l < 80) lightness = '-300';
  else lightness = '-light';

  // Determine a prefix from the CSS property context
  let prefix = 'color';
  if (cssProperty) {
    const prop = cssProperty.toLowerCase();
    if (prop.includes('background') || prop === 'bg') prefix = 'bg';
    else if (prop.includes('border')) prefix = 'border';
    else if (prop.includes('text') || prop === 'color') prefix = 'text';
    else if (prop.includes('shadow')) prefix = 'shadow';
    else if (prop.includes('outline')) prefix = 'outline';
  }

  return `--${prefix}-${hueName}${lightness}`;
}

/**
 * Get a human-readable hue name from RGB values.
 */
function getHueName(rgb) {
  const { r, g, b } = rgb;

  // Grayscale detection
  if (Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && Math.abs(r - b) < 15) {
    if (r < 30) return 'black';
    if (r > 225) return 'white';
    return 'gray';
  }

  // Calculate hue
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h;

  if (delta === 0) h = 0;
  else if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  h = Math.round(h * 60);
  if (h < 0) h += 360;

  if (h < 15 || h >= 345) return 'red';
  if (h < 45) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 150) return 'green';
  if (h < 190) return 'teal';
  if (h < 250) return 'blue';
  if (h < 290) return 'purple';
  if (h < 345) return 'pink';
  return 'red';
}

/**
 * Extract the CSS property from a line of text.
 */
function extractCssProperty(lineText) {
  if (!lineText) return null;
  // CSS: property: value
  const cssMatch = lineText.match(/\b([\w-]+)\s*:\s*(?:#|rgb|hsl|oklch|oklab|lch|lab|hwb|color\()/i);
  if (cssMatch) return cssMatch[1];
  // JS: property: "value" or property: 'value'
  const jsMatch = lineText.match(/\b(\w+)\s*:\s*['"]/);
  if (jsMatch) return jsMatch[1];
  return null;
}

module.exports = {
  parseColor,
  normalizeToHex,
  colorDistance,
  findNearestColor,
  classifyColor,
  extractAlpha,
  colorMixSuggestion,
  suggestVariableName,
  extractCssProperty,
};
