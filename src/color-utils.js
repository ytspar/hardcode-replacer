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
 */
function rgbStringToRgb(str) {
  const match = str.match(/rgba?\(\s*([\d.]+)%?\s*[,\s]\s*([\d.]+)%?\s*[,\s]\s*([\d.]+)%?/);
  if (!match) return null;

  let [, r, g, b] = match;
  r = parseFloat(r);
  g = parseFloat(g);
  b = parseFloat(b);

  // Handle percentage values
  if (str.includes('%')) {
    r = Math.round(r * 2.55);
    g = Math.round(g * 2.55);
    b = Math.round(b * 2.55);
  }

  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

/**
 * Parse hsl()/hsla() string to RGB values.
 */
function hslStringToRgb(str) {
  const match = str.match(/hsla?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)%?\s*[,\s]\s*([\d.]+)%?/);
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

module.exports = {
  hexToRgb,
  rgbStringToRgb,
  hslStringToRgb,
  parseColor,
  rgbToHex,
  normalizeToHex,
  rgbToLab,
  colorDistance,
  findNearestColor,
  classifyColor,
};
