'use strict';

// Comprehensive color regex patterns for matching in source files
// These are used both for ripgrep search and for post-processing validation

// Hex colors: #fff, #ffffff, #ffffffff (with alpha)
const HEX_PATTERN = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/;
const HEX_PATTERN_STR = '#(?:[0-9a-fA-F]{3,4}){1,2}\\b';

// RGB/RGBA: rgb(255, 0, 0), rgba(255, 0, 0, 0.5), rgb(255 0 0 / 50%)
// \b prefix prevents matching JS function names like hexToRgba(...)
const RGB_PATTERN = /rgba?\(\s*[\d.]+%?\s*[,\s]\s*[\d.]+%?\s*[,\s]\s*[\d.]+%?\s*(?:[,/]\s*[\d.]+%?\s*)?\)/;
const RGB_PATTERN_STR = '\\brgba?\\([^)]+\\)';

// HSL/HSLA: hsl(360, 100%, 50%), hsla(360, 100%, 50%, 0.5)
const HSL_PATTERN = /hsla?\(\s*[\d.]+(?:deg|rad|grad|turn)?\s*[,\s]\s*[\d.]+%?\s*[,\s]\s*[\d.]+%?\s*(?:[,/]\s*[\d.]+%?\s*)?\)/;
const HSL_PATTERN_STR = '\\bhsla?\\([^)]+\\)';

// Modern CSS color functions (\b prevents matching function names like getNodeColor)
const OKLCH_PATTERN_STR = '\\boklch\\([^)]+\\)';
const OKLAB_PATTERN_STR = '\\boklab\\([^)]+\\)';
const LCH_PATTERN_STR = '\\blch\\([^)]+\\)';
const LAB_PATTERN_STR = '\\blab\\([^)]+\\)';
const HWB_PATTERN_STR = '\\bhwb\\([^)]+\\)';
// CSS color() requires a colorspace keyword to avoid matching JS functions
const COLOR_FN_PATTERN_STR = '\\bcolor\\(\\s*(srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz|xyz-d50|xyz-d65)\\b[^)]*\\)';

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

// File extensions to search by default
const DEFAULT_FILE_TYPES = [
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'styl',
  'jsx', 'tsx', 'js', 'ts', 'vue', 'svelte', 'astro',
];

module.exports = {
  HEX_PATTERN,
  RGB_PATTERN,
  HSL_PATTERN,
  CSS_COLOR_PROPERTIES,
  JS_COLOR_PROPERTIES,
  DEFAULT_FILE_TYPES,
  buildColorSearchPattern,
};
