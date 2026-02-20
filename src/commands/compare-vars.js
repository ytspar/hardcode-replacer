'use strict';

const fs = require('fs');
const path = require('path');
const { search } = require('../search');
const { buildColorSearchPattern } = require('../color-patterns');
const { normalizeToHex, findNearestColor, classifyColor } = require('../color-utils');

/**
 * Compare hardcoded colors found in source files against a global variables file.
 * Reports matches, close matches, and unmatched colors.
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
  const colorPattern = buildColorSearchPattern();
  const rawResults = search(colorPattern, paths, {
    include: options.include,
    exclude: options.exclude,
  });

  // 3. Compare each found color against the palette
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

    results.push({
      file: result.file,
      line: result.line,
      column: result.column,
      value,
      type,
      hex,
      status,
      match: nearest,
      context: result.text.trim(),
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

  deduped.sort((a, b) => {
    // Sort: unmatched first, then close, then exact
    const statusOrder = { unmatched: 0, close: 1, exact: 2 };
    const sDiff = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
    if (sDiff !== 0) return sDiff;
    return a.file.localeCompare(b.file) || a.line - b.line;
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

/**
 * Parse CSS custom properties: --color-name: #hex;
 */
function parseCssColors(content) {
  const palette = {};
  const regex = /--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]+)\s*;?/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    const value = match[2].trim();
    const hex = normalizeToHex(value);
    if (hex) {
      palette[`--${name}`] = hex;
    }
  }

  return palette;
}

/**
 * Parse JSON color definitions.
 * Handles nested objects (e.g., Tailwind theme format).
 */
function parseJsonColors(content) {
  const palette = {};
  try {
    const data = JSON.parse(content);
    flattenColors(data, '', palette);
  } catch {
    // Not valid JSON
  }
  return palette;
}

/**
 * Parse JS/TS color definitions using regex.
 * Catches patterns like: primary: '#hex', "color-name": "rgb(...)"
 */
function parseJsColors(content) {
  const palette = {};
  const regex = /['"]?([\w-]+)['"]?\s*:\s*['"]([^'"]+)['"]/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    const value = match[2].trim();
    const hex = normalizeToHex(value);
    if (hex) {
      palette[name] = hex;
    }
  }

  return palette;
}

/**
 * Recursively flatten a nested color object into dot-notation keys.
 */
function flattenColors(obj, prefix, result) {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      const hex = normalizeToHex(value);
      if (hex) {
        result[fullKey] = hex;
      }
    } else if (typeof value === 'object' && value !== null) {
      flattenColors(value, fullKey, result);
    }
  }
}

function outputJson(results, palette, threshold) {
  const exact = results.filter(r => r.status === 'exact');
  const close = results.filter(r => r.status === 'close');
  const unmatched = results.filter(r => r.status === 'unmatched');

  const output = {
    command: 'compare',
    palette,
    threshold,
    summary: {
      total: results.length,
      exact: exact.length,
      close: close.length,
      unmatched: unmatched.length,
    },
    results: { unmatched, close, exact },
  };
  console.log(JSON.stringify(output, null, 2));
}

function outputText(results, palette, threshold, varsFile) {
  if (results.length === 0) {
    console.log('No hardcoded colors found to compare.');
    return;
  }

  const exact = results.filter(r => r.status === 'exact');
  const close = results.filter(r => r.status === 'close');
  const unmatched = results.filter(r => r.status === 'unmatched');

  console.log(`\n=== Color Variable Comparison ===`);
  console.log(`Palette: ${Object.keys(palette).length} variables from ${path.basename(varsFile)}`);
  console.log(`Threshold: delta-E <= ${threshold} for close matches`);
  console.log(`Found: ${results.length} total | ${exact.length} exact | ${close.length} close | ${unmatched.length} unmatched\n`);

  if (unmatched.length > 0) {
    console.log(`--- UNMATCHED (${unmatched.length}) - need new variables or are deviations ---`);
    for (const r of unmatched) {
      const nearestInfo = r.match ? ` (nearest: ${r.match.name} ${r.match.hex} dE=${r.match.distance})` : '';
      console.log(`  ${r.file}:${r.line}:${r.column}  ${r.value}${r.hex ? ` -> ${r.hex}` : ''}${nearestInfo}`);
      console.log(`    ${r.context}`);
    }
    console.log('');
  }

  if (close.length > 0) {
    console.log(`--- CLOSE MATCHES (${close.length}) - likely should use the variable ---`);
    for (const r of close) {
      console.log(`  ${r.file}:${r.line}:${r.column}  ${r.value} -> use ${r.match.name} (${r.match.hex}, dE=${r.match.distance})`);
      console.log(`    ${r.context}`);
    }
    console.log('');
  }

  if (exact.length > 0) {
    console.log(`--- EXACT MATCHES (${exact.length}) - replace with variable reference ---`);
    for (const r of exact) {
      console.log(`  ${r.file}:${r.line}:${r.column}  ${r.value} -> ${r.match.name} (${r.match.hex})`);
      console.log(`    ${r.context}`);
    }
    console.log('');
  }
}

module.exports = { compareVars, parseVariablesFile };
