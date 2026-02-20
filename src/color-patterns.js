'use strict';

// Comprehensive color regex patterns for matching in source files
// These are used both for ripgrep search and for post-processing validation

// Hex colors: #fff, #ffffff, #ffffffff (with alpha)
const HEX_PATTERN = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/;
const HEX_PATTERN_STR = '#(?:[0-9a-fA-F]{3,4}){1,2}\\b';

// RGB/RGBA: rgb(255, 0, 0), rgba(255, 0, 0, 0.5), rgb(255 0 0 / 50%)
const RGB_PATTERN = /rgba?\(\s*[\d.]+%?\s*[,\s]\s*[\d.]+%?\s*[,\s]\s*[\d.]+%?\s*(?:[,/]\s*[\d.]+%?\s*)?\)/;
const RGB_PATTERN_STR = 'rgba?\\([^)]+\\)';

// HSL/HSLA: hsl(360, 100%, 50%), hsla(360, 100%, 50%, 0.5)
const HSL_PATTERN = /hsla?\(\s*[\d.]+(?:deg|rad|grad|turn)?\s*[,\s]\s*[\d.]+%?\s*[,\s]\s*[\d.]+%?\s*(?:[,/]\s*[\d.]+%?\s*)?\)/;
const HSL_PATTERN_STR = 'hsla?\\([^)]+\\)';

// Modern CSS color functions
const OKLCH_PATTERN_STR = 'oklch\\([^)]+\\)';
const OKLAB_PATTERN_STR = 'oklab\\([^)]+\\)';
const LCH_PATTERN_STR = 'lch\\([^)]+\\)';
const LAB_PATTERN_STR = 'lab\\([^)]+\\)';
const HWB_PATTERN_STR = 'hwb\\([^)]+\\)';
const COLOR_FN_PATTERN_STR = 'color\\([^)]+\\)';

// CSS properties that take color values (used for named color detection)
const CSS_COLOR_PROPERTIES = [
  'color', 'background-color', 'background', 'border-color',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border', 'outline-color', 'outline', 'text-decoration-color',
  'fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color',
  'column-rule-color', 'caret-color', 'accent-color',
  'box-shadow', 'text-shadow', 'scrollbar-color',
];

// JS-style CSS property names (camelCase, used in JSX inline styles)
const JS_COLOR_PROPERTIES = [
  'color', 'backgroundColor', 'background', 'borderColor',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'border', 'outlineColor', 'outline', 'textDecorationColor',
  'fill', 'stroke', 'boxShadow', 'textShadow',
  'caretColor', 'accentColor', 'columnRuleColor',
];

// Build the combined ripgrep pattern for all color value formats
function buildColorSearchPattern() {
  return [
    HEX_PATTERN_STR,
    RGB_PATTERN_STR,
    HSL_PATTERN_STR,
    OKLCH_PATTERN_STR,
    OKLAB_PATTERN_STR,
    LCH_PATTERN_STR,
    LAB_PATTERN_STR,
    HWB_PATTERN_STR,
    COLOR_FN_PATTERN_STR,
  ].join('|');
}

// Build a pattern for finding named colors in CSS property contexts
function buildNamedColorContextPattern() {
  const props = CSS_COLOR_PROPERTIES.map(p => p.replace('-', '[-]?')).join('|');
  return `(${props})\\s*:\\s*[a-zA-Z]+`;
}

// Combined regex for post-processing: extract color values from a line
function buildColorExtractionRegex() {
  return new RegExp(
    `(${HEX_PATTERN_STR})`
    + `|(${RGB_PATTERN_STR})`
    + `|(${HSL_PATTERN_STR})`
    + `|(oklch\\([^)]+\\))`
    + `|(oklab\\([^)]+\\))`
    + `|(lch\\([^)]+\\))`
    + `|(lab\\([^)]+\\))`
    + `|(hwb\\([^)]+\\))`
    + `|(color\\([^)]+\\))`,
    'gi'
  );
}

// File extensions to search by default
const DEFAULT_FILE_TYPES = [
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'styl',
  'jsx', 'tsx', 'js', 'ts', 'vue', 'svelte', 'astro',
];

function buildFileGlob() {
  return `*.{${DEFAULT_FILE_TYPES.join(',')}}`;
}

module.exports = {
  HEX_PATTERN,
  HEX_PATTERN_STR,
  RGB_PATTERN,
  RGB_PATTERN_STR,
  HSL_PATTERN,
  HSL_PATTERN_STR,
  OKLCH_PATTERN_STR,
  OKLAB_PATTERN_STR,
  LCH_PATTERN_STR,
  LAB_PATTERN_STR,
  HWB_PATTERN_STR,
  COLOR_FN_PATTERN_STR,
  CSS_COLOR_PROPERTIES,
  JS_COLOR_PROPERTIES,
  DEFAULT_FILE_TYPES,
  buildColorSearchPattern,
  buildNamedColorContextPattern,
  buildColorExtractionRegex,
  buildFileGlob,
};
