const fs = require("node:fs");
const path = require("node:path");
const { search } = require("../search");
const { buildColorSearchPattern } = require("../color-patterns");
const {
  normalizeToHex,
  classifyColor,
  extractAlpha,
  colorMixSuggestion,
  suggestVariableName,
  extractCssProperty,
  colorDistance,
  parseColor,
} = require("../color-utils");
const {
  classifyContext,
  contextLabel,
  isActionable,
  clearCache,
  isInBlockComment,
} = require("../context-classifier");
const { countByKey } = require("../utils");

/**
 * Semantic property categories — used to prefer variable matches
 * that share the same semantic domain as the CSS property context.
 */
const PROPERTY_CATEGORIES = {
  background: ["background", "backgroundColor", "bg"],
  text: ["color", "textDecorationColor", "caretColor"],
  border: [
    "borderColor",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "border-color",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "outlineColor",
    "outline-color",
  ],
  shadow: ["boxShadow", "textShadow", "box-shadow", "text-shadow"],
  fill: ["fill", "stroke"],
};

// Map variable name patterns to property categories
const VAR_NAME_CATEGORIES = {
  background: /bg|background/i,
  text: /text|font|foreground/i,
  border: /border|outline|ring|divide/i,
  shadow: /shadow/i,
  fill: /fill|stroke/i,
};

/**
 * Check if a search result line is a comment.
 */
function isComment(text) {
  const trimmed = text.trimStart();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*")
  );
}

/**
 * Determine match status from nearest color.
 */
function getMatchStatus(nearest, threshold) {
  if (nearest && nearest.distance === 0) {
    return "exact";
  }
  if (nearest && nearest.distance <= threshold) {
    return "close";
  }
  return "unmatched";
}

/**
 * Build a replacement suggestion for a matched color.
 */
function buildSuggestion(nearest, status, value) {
  if (!nearest || (status !== "exact" && status !== "close")) {
    return null;
  }
  const alpha = extractAlpha(value);
  if (alpha != null && alpha < 1) {
    return colorMixSuggestion(nearest.name, alpha);
  }
  return `var(${nearest.name})`;
}

/**
 * Process a single raw color search result into a comparison entry.
 */
function processColorResult(result, palette, threshold) {
  const value = result.match.trim();
  const type = classifyColor(value);
  if (type === "unknown") {
    return null;
  }

  if (isComment(result.text)) {
    return null;
  }
  if (isInBlockComment(result.file, result.line)) {
    return null;
  }
  if (value.includes("${")) {
    return null;
  }

  const hex = normalizeToHex(value);
  const cssProp = extractCssProperty(result.text);
  const nearest = hex
    ? findNearestColorSemantic(value, palette, cssProp)
    : null;
  const status = getMatchStatus(nearest, threshold);
  const context = classifyContext(result);
  const suggestion = buildSuggestion(nearest, status, value);
  const nameSuggestion =
    status === "unmatched" && isActionable(context)
      ? suggestVariableName(value, cssProp)
      : null;

  return {
    file: result.file,
    line: result.line,
    column: result.column,
    value,
    type,
    hex,
    status,
    match: nearest,
    context,
    contextLabel: contextLabel(context),
    actionable: isActionable(context),
    lineText: result.text.trim(),
    suggestion,
    nameSuggestion,
    cssProperty: cssProp,
  };
}

/**
 * Compare hardcoded colors found in source files against a global variables file.
 * Reports matches, close matches, and unmatched colors.
 * Classifies each result by context to separate actionable from non-actionable.
 *
 * Options:
 *   --vars <file>      Required. CSS/JSON/JS/TS variables file.
 *   --threshold <n>    Delta-E distance for "close" match (default: 10).
 *   --fix              Auto-replace exact matches with var() references.
 *   --baseline <file>  Save results to a baseline file.
 *   --diff <file>      Compare against a baseline, show only new issues.
 */
function compareVars(paths, options) {
  if (!options.vars) {
    console.error(
      "Error: --vars <file> is required. Specify a CSS, JSON, JS, or TS variables file."
    );
    process.exitCode = 1;
    return;
  }

  // 1. Parse the variables file
  const palette = parseVariablesFile(options.vars);
  if (!palette || Object.keys(palette).length === 0) {
    console.error(`Error: No color variables found in ${options.vars}`);
    process.exitCode = 1;
    return;
  }

  const threshold = Number.parseFloat(options.threshold) || 10;

  // 2. Find all hardcoded colors
  clearCache();
  const colorPattern = buildColorSearchPattern();
  const rawResults = search(colorPattern, paths, {
    include: options.include,
    exclude: options.exclude,
  });

  // 3. Compare each found color against the palette, classify context
  const results = [];
  for (const result of rawResults) {
    const entry = processColorResult(result, palette, threshold);
    if (entry) {
      results.push(entry);
    }
  }

  // Deduplicate
  const seen = new Set();
  const deduped = results.filter((r) => {
    const key = `${r.file}:${r.line}:${r.column}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  // Baseline/diff handling
  if (options.baseline) {
    saveBaseline(deduped, options.baseline);
  }

  let finalResults = deduped;
  if (options.diff) {
    finalResults = diffAgainstBaseline(deduped, options.diff);
  }

  // --fix mode: auto-replace exact matches
  if (options.fix) {
    const fixCount = applyFixes(finalResults);
    console.log(`Fixed ${fixCount} exact matches with var() replacements.`);
    return;
  }

  if (options.format === "json") {
    outputJson(finalResults, palette, threshold);
  } else {
    outputText(finalResults, palette, threshold, options.vars);
  }
}

/**
 * Find nearest color with semantic awareness.
 * When multiple variables have the same color distance,
 * prefer variables whose name matches the CSS property context.
 */
function findNearestColorSemantic(colorStr, palette, cssProp) {
  const rgb = parseColor(colorStr);
  if (!rgb) {
    return null;
  }

  const propCategory = cssProp ? getPropertyCategory(cssProp) : null;

  let nearest = null;
  let minDistance = Number.POSITIVE_INFINITY;
  let bestSemanticScore = 0;

  for (const [name, hex] of Object.entries(palette)) {
    const paletteRgb = parseColor(hex);
    if (!paletteRgb) {
      continue;
    }

    const dist = colorDistance(rgb, paletteRgb);
    const roundedDist = Math.round(dist * 100) / 100;

    // Semantic score: higher is better match for the property context
    let semanticScore = 0;
    if (propCategory) {
      const varPattern = VAR_NAME_CATEGORIES[propCategory];
      if (varPattern?.test(name)) {
        semanticScore = 1;
      }
    }

    // Prefer: lower distance first, then higher semantic score
    const isBetter =
      dist < minDistance - 0.5 ||
      (Math.abs(dist - minDistance) <= 0.5 &&
        semanticScore > bestSemanticScore);

    if (isBetter) {
      minDistance = dist;
      bestSemanticScore = semanticScore;
      nearest = { name, hex, distance: roundedDist };
    }
  }

  return nearest;
}

function getPropertyCategory(cssProp) {
  const prop = cssProp.toLowerCase();
  for (const [category, props] of Object.entries(PROPERTY_CATEGORIES)) {
    for (const p of props) {
      if (prop === p.toLowerCase() || prop.includes(p.toLowerCase())) {
        return category;
      }
    }
  }
  return null;
}

/**
 * Apply --fix: replace exact matches with var() or color-mix() in source files.
 */
function applyFixes(results) {
  const exactActionable = results.filter(
    (r) => r.actionable && r.status === "exact" && r.suggestion
  );

  // Group by file for efficient processing
  const byFile = {};
  for (const r of exactActionable) {
    if (!byFile[r.file]) {
      byFile[r.file] = [];
    }
    byFile[r.file].push(r);
  }

  let fixCount = 0;

  for (const [filePath, fileResults] of Object.entries(byFile)) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      // Process replacements in reverse order (by line, then column) to preserve positions
      const sorted = [...fileResults].sort(
        (a, b) => b.line - a.line || b.column - a.column
      );

      for (const r of sorted) {
        const lineIdx = r.line - 1;
        if (lineIdx < 0 || lineIdx >= lines.length) {
          continue;
        }

        const line = lines[lineIdx];
        const col = r.column - 1;

        // Find the exact match in the line at the expected position
        const matchIdx = line.indexOf(r.value, col > 0 ? col - 1 : 0);
        if (matchIdx === -1) {
          continue;
        }

        // Replace
        lines[lineIdx] =
          line.substring(0, matchIdx) +
          r.suggestion +
          line.substring(matchIdx + r.value.length);
        fixCount++;
      }

      fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
    } catch (err) {
      console.error(`Error fixing ${filePath}: ${err.message}`);
    }
  }

  return fixCount;
}

/**
 * Save results as a baseline JSON file for future diffing.
 */
function saveBaseline(results, filePath) {
  const baseline = results.map((r) => ({
    file: r.file,
    line: r.line,
    column: r.column,
    value: r.value,
    hex: r.hex,
    status: r.status,
    context: r.context,
  }));

  const resolved = path.resolve(filePath);
  fs.writeFileSync(resolved, JSON.stringify(baseline, null, 2), "utf-8");
  console.log(`Baseline saved: ${baseline.length} entries to ${resolved}`);
}

/**
 * Diff current results against a baseline, returning only new issues.
 */
function diffAgainstBaseline(results, baselinePath) {
  const resolved = path.resolve(baselinePath);
  if (!fs.existsSync(resolved)) {
    console.error(
      `Warning: Baseline file not found: ${resolved}. Showing all results.`
    );
    return results;
  }

  try {
    const baseline = JSON.parse(fs.readFileSync(resolved, "utf-8"));
    const baselineKeys = new Set(
      baseline.map((b) => `${b.file}:${b.value}:${b.hex}`)
    );

    const newResults = results.filter(
      (r) => !baselineKeys.has(`${r.file}:${r.value}:${r.hex}`)
    );
    console.log(
      `Diff: ${newResults.length} new issues (${results.length - newResults.length} already in baseline)\n`
    );
    return newResults;
  } catch {
    console.error(
      "Warning: Could not parse baseline file. Showing all results."
    );
    return results;
  }
}

/**
 * Parse a variables file and return color name to hex mappings.
 * Supports CSS custom properties, JSON, and JS/TS exports.
 */
function parseVariablesFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: File not found: ${resolved}`);
    process.exitCode = 1;
    return null;
  }

  const content = fs.readFileSync(resolved, "utf-8");
  const ext = path.extname(resolved).toLowerCase();

  if (ext === ".json") {
    return parseJsonColors(content);
  }
  if ([".css", ".scss", ".sass", ".less"].includes(ext)) {
    return parseCssColors(content);
  }
  if ([".js", ".ts", ".mjs", ".cjs"].includes(ext)) {
    return parseJsColors(content);
  }

  // Try all parsers as fallback
  let result = parseCssColors(content);
  if (Object.keys(result).length > 0) {
    return result;
  }
  result = parseJsonColors(content);
  if (Object.keys(result).length > 0) {
    return result;
  }
  return parseJsColors(content);
}

function parseCssColors(content) {
  const palette = {};
  const regex =
    /--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]+)\s*;?/g;
  for (const match of content.matchAll(regex)) {
    const hex = normalizeToHex(match[2].trim());
    if (hex) {
      palette[`--${match[1]}`] = hex;
    }
  }
  return palette;
}

function parseJsonColors(content) {
  const palette = {};
  try {
    flattenColors(JSON.parse(content), "", palette);
  } catch {
    /* not valid JSON */
  }
  return palette;
}

function parseJsColors(content) {
  const palette = {};
  const regex = /['"]?([\w-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g;
  for (const match of content.matchAll(regex)) {
    const hex = normalizeToHex(match[2].trim());
    if (hex) {
      palette[match[1]] = hex;
    }
  }
  return palette;
}

function flattenColors(obj, prefix, result) {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      const hex = normalizeToHex(value);
      if (hex) {
        result[fullKey] = hex;
      }
    } else if (typeof value === "object" && value !== null) {
      flattenColors(value, fullKey, result);
    }
  }
}

function outputJson(results, palette, threshold) {
  const actionable = results.filter((r) => r.actionable);
  const skipped = results.filter((r) => !r.actionable);

  const output = {
    command: "compare",
    palette,
    threshold,
    summary: {
      total: results.length,
      actionable: actionable.length,
      skipped: skipped.length,
      byStatus: {
        exact: results.filter((r) => r.status === "exact").length,
        close: results.filter((r) => r.status === "close").length,
        unmatched: results.filter((r) => r.status === "unmatched").length,
      },
      actionableByStatus: {
        exact: actionable.filter((r) => r.status === "exact").length,
        close: actionable.filter((r) => r.status === "close").length,
        unmatched: actionable.filter((r) => r.status === "unmatched").length,
      },
      skippedByContext: countByKey(skipped, "context"),
    },
    actionable: {
      unmatched: actionable.filter((r) => r.status === "unmatched"),
      close: actionable.filter((r) => r.status === "close"),
      exact: actionable.filter((r) => r.status === "exact"),
    },
    skipped: {
      byContext: groupByContext(skipped),
    },
  };
  console.log(JSON.stringify(output, null, 2));
}

function printUnmatched(items) {
  if (items.length === 0) {
    return;
  }
  console.log(`--- ACTIONABLE UNMATCHED (${items.length}) ---`);
  for (const r of items) {
    const nearestInfo = r.match
      ? ` (nearest: ${r.match.name} ${r.match.hex} dE=${r.match.distance})`
      : "";
    const nameInfo = r.nameSuggestion ? ` [suggest: ${r.nameSuggestion}]` : "";
    console.log(
      `  ${r.file}:${r.line}:${r.column}  ${r.value}${r.hex ? ` -> ${r.hex}` : ""}${nearestInfo}${nameInfo}`
    );
    console.log(`    ${r.lineText}`);
  }
  console.log("");
}

function printCloseMatches(items) {
  if (items.length === 0) {
    return;
  }
  console.log(`--- ACTIONABLE CLOSE MATCHES (${items.length}) ---`);
  for (const r of items) {
    const replacement = r.suggestion ? ` | replace: ${r.suggestion}` : "";
    console.log(
      `  ${r.file}:${r.line}:${r.column}  ${r.value} -> use ${r.match.name} (${r.match.hex}, dE=${r.match.distance})${replacement}`
    );
    console.log(`    ${r.lineText}`);
  }
  console.log("");
}

function printExactMatches(items) {
  if (items.length === 0) {
    return;
  }
  console.log(`--- ACTIONABLE EXACT MATCHES (${items.length}) ---`);
  for (const r of items) {
    const replacement = r.suggestion ? ` | replace: ${r.suggestion}` : "";
    console.log(
      `  ${r.file}:${r.line}:${r.column}  ${r.value} -> ${r.match.name} (${r.match.hex})${replacement}`
    );
    console.log(`    ${r.lineText}`);
  }
  console.log("");
}

function printSkipped(skipped) {
  if (skipped.length === 0) {
    return;
  }
  console.log(`--- SKIPPED (${skipped.length} non-actionable) ---`);
  const grouped = groupByContext(skipped);
  for (const [ctx, items] of Object.entries(grouped)) {
    console.log(
      `  [${contextLabel(ctx)}] ${items.length} colors in ${new Set(items.map((r) => r.file)).size} files`
    );
    for (const r of items.slice(0, 3)) {
      const short = r.file.split("/").slice(-2).join("/");
      console.log(`    e.g. ${short}:${r.line}  ${r.value}`);
    }
    if (items.length > 3) {
      console.log(`    ... and ${items.length - 3} more`);
    }
  }
  console.log("");
}

function outputText(results, palette, threshold, varsFile) {
  if (results.length === 0) {
    console.log("No hardcoded colors found to compare.");
    return;
  }

  const actionable = results.filter((r) => r.actionable);
  const skipped = results.filter((r) => !r.actionable);

  const actExact = actionable.filter((r) => r.status === "exact");
  const actClose = actionable.filter((r) => r.status === "close");
  const actUnmatched = actionable.filter((r) => r.status === "unmatched");

  console.log("\n=== Color Variable Comparison ===");
  console.log(
    `Palette: ${Object.keys(palette).length} variables from ${path.basename(varsFile)}`
  );
  console.log(`Threshold: delta-E <= ${threshold} for close matches`);
  console.log(
    `Total found: ${results.length} | Actionable: ${actionable.length} | Skipped: ${skipped.length}`
  );
  console.log(
    `Actionable: ${actExact.length} exact | ${actClose.length} close | ${actUnmatched.length} unmatched`
  );

  if (skipped.length > 0) {
    const byCtx = countByKey(skipped, "contextLabel");
    console.log(
      `Skipped: ${Object.entries(byCtx)
        .map(([k, v]) => `${v} ${k}`)
        .join(", ")}`
    );
  }
  console.log("");

  printUnmatched(actUnmatched);
  printCloseMatches(actClose);
  printExactMatches(actExact);
  printSkipped(skipped);
}

function groupByContext(results) {
  const grouped = {};
  for (const r of results) {
    const ctx = r.context || "unknown";
    if (!grouped[ctx]) {
      grouped[ctx] = [];
    }
    grouped[ctx].push(r);
  }
  return grouped;
}

module.exports = { compareVars, parseVariablesFile };
