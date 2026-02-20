'use strict';

const fs = require('fs');
const path = require('path');
const { search } = require('../search');
const { buildColorSearchPattern } = require('../color-patterns');
const { normalizeToHex, findNearestColor, classifyColor } = require('../color-utils');
const { classifyContext, contextLabel, isActionable, clearCache } = require('../context-classifier');

/**
 * Compare hardcoded colors found in source files against a global variables file.
 * Reports matches, close matches, and unmatched colors.
 * Classifies each result by context to separate actionable from non-actionable.
 */
function compareVars(paths, options) {
  if (!options.vars) {
    console.error('Error: --vars <file> is required. Specify a CSS, JSON, JS, or TS variables file.');
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

  const threshold = parseFloat(options.threshold) || 10;

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
    const value = result.match.trim();
    const type = classifyColor(value);
    if (type === 'unknown') continue;

    // Skip comments
    const trimmedText = result.text.trimStart();
    if (trimmedText.startsWith('//') || trimmedText.startsWith('*') || trimmedText.startsWith('/*')) continue;

    // Skip template literal interpolations
    if (value.includes('${')) continue;

    const hex = normalizeToHex(value);
    const nearest = hex ? findNearestColor(value, palette) : null;

    let status;
    if (nearest && nearest.distance === 0) {
      status = 'exact';
    } else if (nearest && nearest.distance <= threshold) {
      status = 'close';
    } else {
      status = 'unmatched';
    }

    // Classify context for actionability
    const context = classifyContext(result);

    results.push({
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
    });
  }

  // Deduplicate
  const seen = new Set();
  const deduped = results.filter(r => {
    const key = `${r.file}:${r.line}:${r.column}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (options.format === 'json') {
    outputJson(deduped, palette, threshold);
  } else {
    outputText(deduped, palette, threshold, options.vars);
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

  const content = fs.readFileSync(resolved, 'utf-8');
  const ext = path.extname(resolved).toLowerCase();

  if (ext === '.json') {
    return parseJsonColors(content);
  } else if (['.css', '.scss', '.sass', '.less'].includes(ext)) {
    return parseCssColors(content);
  } else if (['.js', '.ts', '.mjs', '.cjs'].includes(ext)) {
    return parseJsColors(content);
  }

  // Try all parsers as fallback
  let result = parseCssColors(content);
  if (Object.keys(result).length > 0) return result;
  result = parseJsonColors(content);
  if (Object.keys(result).length > 0) return result;
  return parseJsColors(content);
}

function parseCssColors(content) {
  const palette = {};
  const regex = /--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]+)\s*;?/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const hex = normalizeToHex(match[2].trim());
    if (hex) palette[`--${match[1]}`] = hex;
  }
  return palette;
}

function parseJsonColors(content) {
  const palette = {};
  try {
    flattenColors(JSON.parse(content), '', palette);
  } catch { /* not valid JSON */ }
  return palette;
}

function parseJsColors(content) {
  const palette = {};
  const regex = /['"]?([\w-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const hex = normalizeToHex(match[2].trim());
    if (hex) palette[match[1]] = hex;
  }
  return palette;
}

function flattenColors(obj, prefix, result) {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      const hex = normalizeToHex(value);
      if (hex) result[fullKey] = hex;
    } else if (typeof value === 'object' && value !== null) {
      flattenColors(value, fullKey, result);
    }
  }
}

function outputJson(results, palette, threshold) {
  const actionable = results.filter(r => r.actionable);
  const skipped = results.filter(r => !r.actionable);

  const output = {
    command: 'compare',
    palette,
    threshold,
    summary: {
      total: results.length,
      actionable: actionable.length,
      skipped: skipped.length,
      byStatus: {
        exact: results.filter(r => r.status === 'exact').length,
        close: results.filter(r => r.status === 'close').length,
        unmatched: results.filter(r => r.status === 'unmatched').length,
      },
      actionableByStatus: {
        exact: actionable.filter(r => r.status === 'exact').length,
        close: actionable.filter(r => r.status === 'close').length,
        unmatched: actionable.filter(r => r.status === 'unmatched').length,
      },
      skippedByContext: countByKey(skipped, 'context'),
    },
    actionable: {
      unmatched: actionable.filter(r => r.status === 'unmatched'),
      close: actionable.filter(r => r.status === 'close'),
      exact: actionable.filter(r => r.status === 'exact'),
    },
    skipped: {
      byContext: groupByContext(skipped),
    },
  };
  console.log(JSON.stringify(output, null, 2));
}

function outputText(results, palette, threshold, varsFile) {
  if (results.length === 0) {
    console.log('No hardcoded colors found to compare.');
    return;
  }

  const actionable = results.filter(r => r.actionable);
  const skipped = results.filter(r => !r.actionable);

  const actExact = actionable.filter(r => r.status === 'exact');
  const actClose = actionable.filter(r => r.status === 'close');
  const actUnmatched = actionable.filter(r => r.status === 'unmatched');

  console.log(`\n=== Color Variable Comparison ===`);
  console.log(`Palette: ${Object.keys(palette).length} variables from ${path.basename(varsFile)}`);
  console.log(`Threshold: delta-E <= ${threshold} for close matches`);
  console.log(`Total found: ${results.length} | Actionable: ${actionable.length} | Skipped: ${skipped.length}`);
  console.log(`Actionable: ${actExact.length} exact | ${actClose.length} close | ${actUnmatched.length} unmatched`);

  if (skipped.length > 0) {
    const byCtx = countByKey(skipped, 'contextLabel');
    console.log(`Skipped: ${Object.entries(byCtx).map(([k, v]) => `${v} ${k}`).join(', ')}`);
  }
  console.log('');

  // === ACTIONABLE RESULTS ===
  if (actUnmatched.length > 0) {
    console.log(`--- ACTIONABLE UNMATCHED (${actUnmatched.length}) ---`);
    for (const r of actUnmatched) {
      const nearestInfo = r.match ? ` (nearest: ${r.match.name} ${r.match.hex} dE=${r.match.distance})` : '';
      console.log(`  ${r.file}:${r.line}:${r.column}  ${r.value}${r.hex ? ` -> ${r.hex}` : ''}${nearestInfo}`);
      console.log(`    ${r.lineText}`);
    }
    console.log('');
  }

  if (actClose.length > 0) {
    console.log(`--- ACTIONABLE CLOSE MATCHES (${actClose.length}) ---`);
    for (const r of actClose) {
      console.log(`  ${r.file}:${r.line}:${r.column}  ${r.value} -> use ${r.match.name} (${r.match.hex}, dE=${r.match.distance})`);
      console.log(`    ${r.lineText}`);
    }
    console.log('');
  }

  if (actExact.length > 0) {
    console.log(`--- ACTIONABLE EXACT MATCHES (${actExact.length}) ---`);
    for (const r of actExact) {
      console.log(`  ${r.file}:${r.line}:${r.column}  ${r.value} -> ${r.match.name} (${r.match.hex})`);
      console.log(`    ${r.lineText}`);
    }
    console.log('');
  }

  // === SKIPPED (collapsed summary) ===
  if (skipped.length > 0) {
    console.log(`--- SKIPPED (${skipped.length} non-actionable) ---`);
    const grouped = groupByContext(skipped);
    for (const [ctx, items] of Object.entries(grouped)) {
      console.log(`  [${contextLabel(ctx)}] ${items.length} colors in ${new Set(items.map(r => r.file)).size} files`);
      // Show first 3 as examples
      for (const r of items.slice(0, 3)) {
        const short = r.file.split('/').slice(-2).join('/');
        console.log(`    e.g. ${short}:${r.line}  ${r.value}`);
      }
      if (items.length > 3) {
        console.log(`    ... and ${items.length - 3} more`);
      }
    }
    console.log('');
  }
}

function countByKey(results, key) {
  const counts = {};
  for (const r of results) {
    const val = r[key] || 'unknown';
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

function groupByContext(results) {
  const grouped = {};
  for (const r of results) {
    const ctx = r.context || 'unknown';
    if (!grouped[ctx]) grouped[ctx] = [];
    grouped[ctx].push(r);
  }
  return grouped;
}

module.exports = { compareVars, parseVariablesFile };
