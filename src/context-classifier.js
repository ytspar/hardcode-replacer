const fs = require("node:fs");
const path = require("node:path");

// Cache for file-level analysis (imports, patterns)
const fileCache = new Map();
// Cache for block comment ranges per file
const commentCache = new Map();

// Regex patterns extracted to top level for performance
const CSS_VAR_DEF_RE = /^\s*--[\w-]+\s*:/;
const META_CONTENT_RE = /(?:content|color)\s*[:=]\s*["']#[0-9a-fA-F]/;
const META_TAG_RE = /(?:theme-color|msapplication|mask-icon|safari-pinned)/;
const TEMPLATE_OPEN_RE = /`[\s\S]*<[\s\S]*>/;
const TEMPLATE_INTERP_RE = /\$\{/;
const OBJ_KEY_CSS_RE = /^\s*['"][\w-]+\s*:.*#[0-9a-fA-F]/;
const OBJ_KEY_SUFFIX_RE = /['"].*['"]/;
const OBJ_KEY_HEX_RE = /^\s*['"]#[0-9a-fA-F]{3,8}['"]/;
const CSS_STRING_KEY_RE = /^\s*css\s*:\s*['"]/;
const CSS_VAR_BRIDGE_RE = /getCssVar|getComputedStyle|getPropertyValue/;
const FALLBACK_OR_HEX_RE = /\|\|\s*['"]#/;
const RGBA_BLACK_RE = /^rgba?\(\s*0\s*,\s*0\s*,\s*0[\s,]/;
const RGBA_WHITE_RE = /^rgba?\(\s*255\s*,\s*255\s*,\s*255[\s,]/;
const RGB_BLACK_MODERN_RE = /^rgb\(\s*0\s+0\s+0\s*\//;
const RGB_WHITE_MODERN_RE = /^rgb\(\s*255\s+255\s+255\s*\//;
const BW_HEX_RE = /^#(?:000(?:000)?|fff(?:fff)?)$/i;
const SHADOW_GRADIENT_RE = /shadow|gradient|scan|glow|overlay/i;
const OG_IMAGE_RE = /(?:from|require).*(?:satori|@vercel\/og|ImageResponse)/;

// Canvas/WebGL library import patterns
const CANVAS_IMPORTS = [
  "three",
  "@react-three",
  "react-force-graph",
  "sigma",
  "@sigma",
  "graphology",
  "pixi",
  "pixijs",
  "@pixi",
  "d3",
  "canvas",
  "fabric",
  "konva",
  "react-konva",
  "paper",
  "p5",
  "chart.js",
  "recharts",
  "visx",
  "nivo",
  "sharp",
  "jimp",
  "node-canvas",
];

// File path patterns for theme/config definition files
const DEFINITION_FILE_PATTERNS = [
  /\.theme\.[jt]sx?$/, // *.theme.ts, *.theme.tsx
  /[/\\]theme\.[jt]sx?$/, // standalone theme.ts, theme.tsx
  /[/\\]themes?[/\\].*\.[jt]sx?$/, // theme/ or themes/ directory
  /[/\\]tokens?\.[jt]sx?$/, // tokens.ts
  /[/\\]palette\.[jt]sx?$/, // palette.ts
  /[/\\]colors?\.[jt]sx?$/, // colors.ts, color.ts
  /design-tokens/, // design-tokens directory
  /tailwind\.config/, // tailwind.config.*
];

// File path patterns for mapping/service files that use colors as lookup keys
const MAPPING_FILE_PATTERNS = [
  /[Ee]ngine\.[jt]sx?$/,
  /[Mm]apper\.[jt]sx?$/,
  /[Cc]onverter\.[jt]sx?$/,
  /[Mm]apping\.[jt]sx?$/,
  /MCP[Ss]ervice\.[jt]sx?$/, // MCP service stubs with color mappings
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
 *   'effect'           - Pure black/white with alpha in effects (shadows, overlays)
 */
function classifyContext(result) {
  const { file, text, match: matchedValue } = result;
  const trimmed = (text || "").trim();

  // 1. CSS variable definition: --name: #hex or --name: rgba(...)
  if (CSS_VAR_DEF_RE.test(trimmed)) {
    return "css-definition";
  }

  // 2. File-level classification
  const fileResult = classifyByFileInfo(file, trimmed);
  if (fileResult) {
    return fileResult;
  }

  // 3. Line-level heuristics
  const lineResult = classifyByLineHeuristics(trimmed, matchedValue);
  if (lineResult) {
    return lineResult;
  }

  return "actionable";
}

/**
 * Classify based on file-level information (imports, file path patterns).
 * Returns a context string or null if no file-level classification applies.
 */
function classifyByFileInfo(file, trimmed) {
  const fileInfo = getFileInfo(file);

  if (fileInfo.isCanvasConsumer) {
    return "canvas";
  }

  // Files that use getCssVar() are CSS-to-canvas bridges —
  // ALL hardcoded colors in them are fallback values for canvas contexts
  if (fileInfo.hasCssVarUsage && !fileInfo.isCssFile) {
    return "canvas";
  }

  if (fileInfo.isThemeBuilder) {
    return "theme-definition";
  }

  if (fileInfo.isDefinitionFile) {
    if (trimmed.includes("var(--")) {
      return "actionable";
    }
    return "theme-definition";
  }

  if (fileInfo.isMappingFile) {
    return "mapping";
  }

  return null;
}

/**
 * Classify based on line-level heuristics (text patterns on the matched line).
 * Returns a context string or null if no heuristic matches.
 */
function classifyByLineHeuristics(trimmed, matchedValue) {
  // Meta tags and manifest values (browser needs raw hex, no CSS vars)
  if (META_CONTENT_RE.test(trimmed) && META_TAG_RE.test(trimmed)) {
    return "meta";
  }

  // Template literal generating code
  if (TEMPLATE_OPEN_RE.test(trimmed) && TEMPLATE_INTERP_RE.test(trimmed)) {
    return "generated";
  }

  // Quoted CSS property string as object key: "background-color: #hex": "..."
  if (
    OBJ_KEY_CSS_RE.test(trimmed) &&
    OBJ_KEY_SUFFIX_RE.test(trimmed.split(":").at(-1) || "")
  ) {
    return "mapping";
  }

  // Object key position: '#hex': value or ['#hex']
  if (OBJ_KEY_HEX_RE.test(trimmed)) {
    return "mapping";
  }

  // CSS string values used as lookup keys: css: "border-color: rgba(...)"
  if (CSS_STRING_KEY_RE.test(trimmed)) {
    return "mapping";
  }

  // getCssVar() on the same line
  if (CSS_VAR_BRIDGE_RE.test(trimmed)) {
    return "canvas";
  }

  // Fallback color in OR conditional with getCssVar: getCssVar(x) || '#hex'
  if (FALLBACK_OR_HEX_RE.test(trimmed)) {
    return "canvas";
  }

  // Pure black/white with alpha used in effects (shadows, gradients, overlays).
  if (matchedValue) {
    const effectResult = classifyEffectColor(matchedValue, trimmed);
    if (effectResult) {
      return effectResult;
    }
  }

  return null;
}

/**
 * Check if a matched color value is a black/white effect color.
 */
function classifyEffectColor(matchedValue, trimmed) {
  const val = matchedValue.toLowerCase();
  if (
    RGBA_BLACK_RE.test(val) ||
    RGBA_WHITE_RE.test(val) ||
    RGB_BLACK_MODERN_RE.test(val) ||
    RGB_WHITE_MODERN_RE.test(val)
  ) {
    return "effect";
  }
  // #000 / #000000 / #fff / #ffffff in shadow/gradient contexts
  if (BW_HEX_RE.test(val) && SHADOW_GRADIENT_RE.test(trimmed)) {
    return "effect";
  }
  return null;
}

const REGEX_ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;

/**
 * Check if a file imports canvas/WebGL libraries.
 */
function hasCanvasImport(head) {
  for (const lib of CANVAS_IMPORTS) {
    const escaped = lib.replace(REGEX_ESCAPE_RE, "\\$&");
    const importPattern = new RegExp(
      `(?:from|require)\\s*\\(?\\s*['"]${escaped}`,
      "i"
    );
    if (importPattern.test(head)) {
      return true;
    }
  }
  return false;
}

/**
 * Analyze file content for imports, theme patterns, etc.
 */
function analyzeFileContent(filePath, info) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const head = content.split("\n").slice(0, 100).join("\n");

    if (hasCanvasImport(head) || OG_IMAGE_RE.test(head)) {
      info.isCanvasConsumer = true;
    }

    for (const pattern of THEME_BUILDER_PATTERNS) {
      if (pattern.test(content)) {
        info.isThemeBuilder = true;
        break;
      }
    }

    if (content.includes("getCssVar") || content.includes("getComputedStyle")) {
      info.hasCssVarUsage = true;
    }
  } catch {
    // Can't read file, leave defaults
  }
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
  info.isCssFile = [".css", ".scss", ".sass", ".less"].includes(ext);

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
  if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(ext)) {
    analyzeFileContent(filePath, info);
  }

  fileCache.set(filePath, info);
  return info;
}

/**
 * Parse block comment ranges from file content.
 */
function parseBlockCommentRanges(filePath) {
  const ranges = [];
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    let inBlock = false;
    let blockStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (inBlock) {
        if (line.includes("*/")) {
          ranges.push([blockStart, i + 1]); // [start, end] inclusive, 1-indexed
          inBlock = false;
        }
      } else {
        const openIdx = line.indexOf("/*");
        if (openIdx !== -1 && line.indexOf("*/", openIdx + 2) === -1) {
          inBlock = true;
          blockStart = i + 1; // 1-indexed
        }
      }
    }
    if (inBlock) {
      ranges.push([blockStart, lines.length]);
    }
  } catch {
    // Can't read file
  }
  return ranges;
}

/**
 * Check if a line is inside a block comment.
 */
function isInBlockComment(filePath, lineNum) {
  if (!commentCache.has(filePath)) {
    commentCache.set(filePath, parseBlockCommentRanges(filePath));
  }

  const ranges = commentCache.get(filePath);
  for (const [start, end] of ranges) {
    if (lineNum >= start && lineNum <= end) {
      return true;
    }
  }
  return false;
}

function clearCache() {
  fileCache.clear();
  commentCache.clear();
}

function contextLabel(ctx) {
  const labels = {
    actionable: "ACTIONABLE",
    "css-definition": "CSS VAR DEFINITION",
    "theme-definition": "THEME DEFINITION",
    canvas: "CANVAS/WEBGL",
    mapping: "MAPPING/LOOKUP",
    generated: "GENERATED CODE",
    meta: "META/MANIFEST",
    effect: "EFFECT (black/white alpha)",
  };
  return labels[ctx] || ctx;
}

function isActionable(ctx) {
  return ctx === "actionable";
}

module.exports = {
  classifyContext,
  clearCache,
  contextLabel,
  isActionable,
  isInBlockComment,
};
