const fs = require("node:fs");
const path = require("node:path");

const CSS_EXT_RE = /\.css$/;
const THEME_VAR_RE = /--([\w-]+)\s*:\s*([^;]+)/;
const THEME_BLOCK_INNER_RE = /@theme\s*\{([^}]+)\}/;

// Tailwind CSS color utility prefixes
const COLOR_PREFIXES = [
  "bg",
  "text",
  "border",
  "ring",
  "shadow",
  "divide",
  "outline",
  "accent",
  "fill",
  "stroke",
  "decoration",
  "placeholder",
  "from",
  "via",
  "to",
  "caret",
];

// Tailwind color names (v3+)
const COLOR_NAMES = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
];

// Special color values (no shade suffix)
const SPECIAL_COLORS = ["black", "white", "transparent", "current", "inherit"];

// Valid shade suffixes
const SHADES = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "950",
];

// Build the ripgrep pattern for Tailwind color classes
function buildTailwindColorPattern() {
  const prefixes = COLOR_PREFIXES.join("|");
  const colors = COLOR_NAMES.join("|");
  const specials = SPECIAL_COLORS.join("|");
  const shades = SHADES.join("|");

  // Match: prefix-color-shade, prefix-color-shade/opacity, prefix-special, prefix-[arbitrary]
  return (
    `\\b(${prefixes})-(${colors})-(${shades})(/\\d+)?\\b` +
    `|\\b(${prefixes})-(${specials})(/\\d+)?\\b` +
    `|\\b(${prefixes})-\\[[^\\]]*\\]`
  );
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

const CSS_ENTRY_POINTS = [
  "tailwind.css",
  "globals.css",
  "app.css",
  "global.css",
  "index.css",
];

/**
 * Check if a file contains Tailwind v4 theme patterns.
 */
function fileHasV4Theme(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return TAILWIND_V4_PATTERNS.theme.test(content);
  } catch {
    return false;
  }
}

/**
 * Check a single path for Tailwind v4 patterns.
 */
function checkPathForV4(searchPath) {
  try {
    const resolved = path.resolve(searchPath);
    const stat = fs.statSync(resolved);

    if (stat.isFile() && CSS_EXT_RE.test(resolved)) {
      return fileHasV4Theme(resolved);
    }

    if (stat.isDirectory()) {
      for (const entry of CSS_ENTRY_POINTS) {
        const fp = path.join(resolved, entry);
        if (fs.existsSync(fp) && fileHasV4Theme(fp)) {
          return true;
        }
      }
    }
  } catch {
    /* skip */
  }
  return false;
}

/**
 * Detect Tailwind version from project files.
 * Returns 4 if v4 patterns are found, 3 otherwise.
 */
function detectTailwindVersion(searchPaths) {
  for (const searchPath of searchPaths) {
    if (checkPathForV4(searchPath)) {
      return 4;
    }
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
  if (!themeMatch) {
    return colors;
  }

  for (const block of themeMatch) {
    const inner = block.match(THEME_BLOCK_INNER_RE);
    if (!inner) {
      continue;
    }

    const lines = inner[1].split("\n");
    for (const line of lines) {
      const varMatch = line.match(THEME_VAR_RE);
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
