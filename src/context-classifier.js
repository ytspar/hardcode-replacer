'use strict';

const fs = require('fs');
const path = require('path');

// Cache for file-level analysis (imports, patterns)
const fileCache = new Map();

// Canvas/WebGL library import patterns
const CANVAS_IMPORTS = [
  'three', '@react-three', 'react-force-graph', 'sigma', '@sigma',
  'graphology', 'pixi', 'pixijs', '@pixi', 'd3', 'canvas',
  'fabric', 'konva', 'react-konva', 'paper', 'p5', 'chart.js',
  'recharts', 'visx', 'nivo', 'sharp', 'jimp', 'node-canvas',
];

// File path patterns for theme/config definition files
const DEFINITION_FILE_PATTERNS = [
  /\.theme\.[jt]sx?$/,             // *.theme.ts, *.theme.tsx
  /[/\\]theme\.[jt]sx?$/,          // standalone theme.ts, theme.tsx
  /[/\\]themes?[/\\].*\.[jt]sx?$/, // theme/ or themes/ directory
  /[/\\]tokens?\.[jt]sx?$/,        // tokens.ts
  /[/\\]palette\.[jt]sx?$/,        // palette.ts
  /[/\\]colors?\.[jt]sx?$/,        // colors.ts, color.ts
  /design-tokens/,                  // design-tokens directory
  /tailwind\.config/,               // tailwind.config.*
];

// File path patterns for mapping/service files that use colors as lookup keys
const MAPPING_FILE_PATTERNS = [
  /[Ee]ngine\.[jt]sx?$/,
  /[Mm]apper\.[jt]sx?$/,
  /[Cc]onverter\.[jt]sx?$/,
  /[Mm]apping\.[jt]sx?$/,
  /MCP[Ss]ervice\.[jt]sx?$/,       // MCP service stubs with color mappings
];

// Patterns indicating the file content is a theme/config builder
const THEME_BUILDER_PATTERNS = [
  /createTheme\s*\(/,
  /createMuiTheme\s*\(/,
  /extendTheme\s*\(/,
];

/**
 * Classify the context of a color match to determine actionability.
 *
 * Returns one of:
 *   'actionable'       - Can be replaced with var()
 *   'css-definition'   - This IS a CSS variable definition
 *   'theme-definition' - In a theme/token definition file
 *   'canvas'           - In a canvas/WebGL context (can't use var())
 *   'mapping'          - Used as a lookup key or mapping value
 *   'generated'        - In generated/template code
 *   'meta'             - Meta tags, manifest, OG images (browser-level, no CSS)
 */
function classifyContext(result) {
  const { file, text } = result;
  const trimmed = (text || '').trim();

  // 1. CSS variable definition: --name: #hex or --name: rgba(...)
  if (/^\s*--[\w-]+\s*:/.test(trimmed)) {
    return 'css-definition';
  }

  // 2. File-level classification
  const fileInfo = getFileInfo(file);

  if (fileInfo.isCanvasConsumer) {
    return 'canvas';
  }

  // Files that use getCssVar() are CSS-to-canvas bridges —
  // ALL hardcoded colors in them are fallback values for canvas contexts
  if (fileInfo.hasCssVarUsage && !fileInfo.isCssFile) {
    return 'canvas';
  }

  if (fileInfo.isThemeBuilder) {
    return 'theme-definition';
  }

  if (fileInfo.isDefinitionFile) {
    if (trimmed.includes('var(--')) {
      return 'actionable';
    }
    return 'theme-definition';
  }

  if (fileInfo.isMappingFile) {
    return 'mapping';
  }

  // 3. Line-level heuristics

  // Meta tags and manifest values (browser needs raw hex, no CSS vars)
  if (/(?:content|color)\s*[:=]\s*["']#[0-9a-fA-F]/.test(trimmed) &&
      /(?:theme-color|msapplication|mask-icon|safari-pinned)/.test(trimmed)) {
    return 'meta';
  }

  // Template literal generating code
  if (/`[\s\S]*<[\s\S]*>/.test(trimmed) && /\$\{/.test(trimmed)) {
    return 'generated';
  }

  // Quoted CSS property string as object key: "background-color: #hex": "..."
  if (/^\s*['"][\w-]+\s*:.*#[0-9a-fA-F]/.test(trimmed) && /['"].*['"]/.test(trimmed.split(':').slice(-1)[0] || '')) {
    return 'mapping';
  }

  // Object key position: '#hex': value or ['#hex']
  if (/^\s*['"]#[0-9a-fA-F]{3,8}['"]/.test(trimmed)) {
    return 'mapping';
  }

  // CSS string values used as lookup keys: css: "border-color: rgba(...)"
  if (/^\s*css\s*:\s*['"]/.test(trimmed)) {
    return 'mapping';
  }

  // getCssVar() on the same line
  if (/getCssVar|getComputedStyle|getPropertyValue/.test(trimmed)) {
    return 'canvas';
  }

  // Fallback color in OR conditional with getCssVar: getCssVar(x) || '#hex'
  if (/\|\|\s*['"]#/.test(trimmed)) {
    return 'canvas';
  }

  return 'actionable';
}

/**
 * Analyze a file once and cache the result.
 */
function getFileInfo(filePath) {
  if (fileCache.has(filePath)) {
    return fileCache.get(filePath);
  }

  const info = {
    isCanvasConsumer: false,
    isDefinitionFile: false,
    isMappingFile: false,
    isThemeBuilder: false,
    hasCssVarUsage: false,
    isCssFile: false,
  };

  const ext = path.extname(filePath).toLowerCase();
  info.isCssFile = ['.css', '.scss', '.sass', '.less'].includes(ext);

  // Check filename patterns
  for (const pattern of DEFINITION_FILE_PATTERNS) {
    if (pattern.test(filePath)) {
      info.isDefinitionFile = true;
      break;
    }
  }

  for (const pattern of MAPPING_FILE_PATTERNS) {
    if (pattern.test(filePath)) {
      info.isMappingFile = true;
      break;
    }
  }

  // Read file to check imports and content patterns (only for JS/TS files)
  if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const head = content.split('\n').slice(0, 100).join('\n');

      // Check for canvas/WebGL library imports
      for (const lib of CANVAS_IMPORTS) {
        const escaped = lib.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const importPattern = new RegExp(`(?:from|require)\\s*\\(?\\s*['"]${escaped}`, 'i');
        if (importPattern.test(head)) {
          info.isCanvasConsumer = true;
          break;
        }
      }

      // Check for theme builder patterns (createTheme, etc.)
      for (const pattern of THEME_BUILDER_PATTERNS) {
        if (pattern.test(content)) {
          info.isThemeBuilder = true;
          break;
        }
      }

      // Check for getCssVar/getComputedStyle usage (CSS-to-canvas bridge)
      if (content.includes('getCssVar') || content.includes('getComputedStyle')) {
        info.hasCssVarUsage = true;
      }

      // OG image generators (satori, @vercel/og)
      if (/(?:from|require).*(?:satori|@vercel\/og|ImageResponse)/.test(head)) {
        info.isCanvasConsumer = true;
      }
    } catch {
      // Can't read file, leave defaults
    }
  }

  fileCache.set(filePath, info);
  return info;
}

function clearCache() {
  fileCache.clear();
}

function contextLabel(ctx) {
  const labels = {
    'actionable': 'ACTIONABLE',
    'css-definition': 'CSS VAR DEFINITION',
    'theme-definition': 'THEME DEFINITION',
    'canvas': 'CANVAS/WEBGL',
    'mapping': 'MAPPING/LOOKUP',
    'generated': 'GENERATED CODE',
    'meta': 'META/MANIFEST',
  };
  return labels[ctx] || ctx;
}

function isActionable(ctx) {
  return ctx === 'actionable';
}

module.exports = {
  classifyContext,
  getFileInfo,
  clearCache,
  contextLabel,
  isActionable,
  CANVAS_IMPORTS,
  DEFINITION_FILE_PATTERNS,
};
