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

// Build a simpler pattern for all Tailwind utility classes (not just colors)
function buildTailwindUtilityPattern() {
  return 'className=["\'{]|class=["\']';
}

module.exports = {
  COLOR_PREFIXES,
  COLOR_NAMES,
  SPECIAL_COLORS,
  SHADES,
  buildTailwindColorPattern,
  buildTailwindUtilityPattern,
};
