'use strict';

// Tailwind CSS color utility prefixes
const COLOR_PREFIXES = [
  'bg', 'text', 'border', 'ring', 'shadow', 'divide', 'outline',
  'accent', 'fill', 'stroke', 'decoration', 'placeholder',
  'from', 'via', 'to', 'caret',
];

// Tailwind color names (v3+)
const COLOR_NAMES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime',
  'green', 'emerald', 'teal', 'cyan', 'sky',
  'blue', 'indigo', 'violet', 'purple', 'fuchsia',
  'pink', 'rose',
];

// Special color values (no shade suffix)
const SPECIAL_COLORS = [
  'black', 'white', 'transparent', 'current', 'inherit',
];

// Valid shade suffixes
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

// Build the ripgrep pattern for Tailwind color classes
function buildTailwindColorPattern() {
  const prefixes = COLOR_PREFIXES.join('|');
  const colors = COLOR_NAMES.join('|');
  const specials = SPECIAL_COLORS.join('|');
  const shades = SHADES.join('|');

  // Match: prefix-color-shade, prefix-color-shade/opacity, prefix-special, prefix-[arbitrary]
  return `\\b(${prefixes})-(${colors})-(${shades})(/\\d+)?\\b`
    + `|\\b(${prefixes})-(${specials})(/\\d+)?\\b`
    + `|\\b(${prefixes})-\\[[^\\]]*\\]`;
}

/**
 * Tailwind v4 detection patterns.
 * In v4, colors are defined via @theme directive with CSS custom properties:
 *   @theme { --color-primary: #10b981; }
 * Utilities are defined via @utility directive:
 *   @utility tab-highlight { ... }
 */
const TAILWIND_V4_PATTERNS = {
  theme: /@theme\s*\{/,
  utility: /@utility\s+[\w-]+\s*\{/,
  // v4 uses --color-* custom properties
  colorVar: /--color-([\w-]+)\s*:/,
};

/**
 * Detect Tailwind version from project files.
 * Returns 4 if v4 patterns are found, 3 otherwise.
 */
function detectTailwindVersion(searchPaths) {
  const fs = require('fs');
  const path = require('path');

  // Check for v4 patterns in CSS files
  for (const searchPath of searchPaths) {
    try {
      const resolved = path.resolve(searchPath);
      const stat = fs.statSync(resolved);

      if (stat.isFile() && /\.css$/.test(resolved)) {
        const content = fs.readFileSync(resolved, 'utf-8');
        if (TAILWIND_V4_PATTERNS.theme.test(content)) return 4;
      }

      if (stat.isDirectory()) {
        // Check common CSS entry points
        for (const entry of ['tailwind.css', 'globals.css', 'app.css', 'global.css', 'index.css']) {
          const fp = path.join(resolved, entry);
          if (fs.existsSync(fp)) {
            const content = fs.readFileSync(fp, 'utf-8');
            if (TAILWIND_V4_PATTERNS.theme.test(content)) return 4;
          }
        }
      }
    } catch { /* skip */ }
  }

  return 3;
}

/**
 * Parse @theme block from Tailwind v4 CSS for color variables.
 * Returns a map of variable name -> hex value.
 */
function parseTailwindV4Theme(cssContent) {
  const colors = {};
  // Find @theme blocks
  const themeMatch = cssContent.match(/@theme\s*\{([^}]+)\}/g);
  if (!themeMatch) return colors;

  for (const block of themeMatch) {
    const inner = block.match(/@theme\s*\{([^}]+)\}/);
    if (!inner) continue;

    const lines = inner[1].split('\n');
    for (const line of lines) {
      const varMatch = line.match(/--([\w-]+)\s*:\s*([^;]+)/);
      if (varMatch) {
        colors[`--${varMatch[1]}`] = varMatch[2].trim();
      }
    }
  }

  return colors;
}

module.exports = {
  SPECIAL_COLORS,
  buildTailwindColorPattern,
  TAILWIND_V4_PATTERNS,
  detectTailwindVersion,
  parseTailwindV4Theme,
};
