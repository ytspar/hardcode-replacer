'use strict';

const { search } = require('../search');
const { buildColorSearchPattern, CSS_COLOR_PROPERTIES, JS_COLOR_PROPERTIES } = require('../color-patterns');
const { NAMED_COLORS, NAMED_COLOR_SET } = require('../css-named-colors');
const { classifyColor, normalizeToHex } = require('../color-utils');
const { classifyContext, contextLabel, isActionable, clearCache } = require('../context-classifier');

/**
 * Find all hardcoded color values in source files.
 *
 * Searches for: hex, rgb, rgba, hsl, hsla, oklch, oklab, lch, lab, hwb,
 * color(), and optionally CSS named colors.
 */
function findColors(paths, options) {
  clearCache();
  const results = [];

  // 1. Search for function-based and hex color values
  const colorPattern = buildColorSearchPattern();
  const rawResults = search(colorPattern, paths, {
    include: options.include,
    exclude: options.exclude,
    fileTypes: options.fileTypes,
  });

  // Post-process: validate color values from matched lines
  for (const result of rawResults) {
    const match = result.match.trim();
    const type = classifyColor(match);

    // Skip non-color matches
    if (type === 'unknown') continue;

    // Skip colors in comments
    const trimmedText = result.text.trimStart();
    if (trimmedText.startsWith('//') || trimmedText.startsWith('*') || trimmedText.startsWith('/*')) continue;

    // Skip template literal interpolations (e.g., `rgba(${r}, ${g}, ${b})`)
    if (match.includes('${')) continue;

    // Skip matches that are clearly type annotations or function signatures
    if (/:\s*(string|number|boolean|void|any)\b/.test(result.text) && !result.text.includes("'") && !result.text.includes('"')) continue;

    const ctx = classifyContext(result);
    results.push({
      file: result.file,
      line: result.line,
      column: result.column,
      value: match,
      type,
      hex: normalizeToHex(match),
      lineText: result.text.trim(),
      context: ctx,
      contextLabel: contextLabel(ctx),
      actionable: isActionable(ctx),
    });
  }

  // 2. Search for named CSS colors (if not disabled)
  if (options.named !== false) {
    const namedResults = findNamedColors(paths, options);
    results.push(...namedResults);
  }

  // Deduplicate by file:line:column
  const seen = new Set();
  const deduped = results.filter(r => {
    const key = `${r.file}:${r.line}:${r.column}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by file, then line
  deduped.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);

  // Output
  if (options.format === 'json') {
    outputJson(deduped);
  } else {
    outputText(deduped);
  }
}

/**
 * Find named CSS colors used in CSS property contexts.
 */
function findNamedColors(paths, options) {
  const results = [];

  // Build a pattern matching CSS color properties followed by a word
  const cssProps = CSS_COLOR_PROPERTIES.join('|');
  const jsProps = JS_COLOR_PROPERTIES.join('|');

  // CSS context: color: red; background-color: blue;
  const cssPattern = `(${cssProps})\\s*:\\s*([a-zA-Z]+)`;
  // JS/JSX context: color: 'red', backgroundColor: "blue"
  const jsPattern = `(${jsProps})\\s*:\\s*['"]([a-zA-Z]+)['"]`;

  for (const pattern of [cssPattern, jsPattern]) {
    const rawResults = search(pattern, paths, {
      include: options.include,
      exclude: options.exclude,
      fileTypes: options.fileTypes,
      caseSensitive: true,
    });

    for (const result of rawResults) {
      // Extract the color name from the match
      const matchStr = result.match || result.text;
      const colorMatch = matchStr.match(/:\s*['"]?([a-zA-Z]+)['"]?\s*[;,}]?\s*$/);
      if (!colorMatch) continue;

      const colorName = colorMatch[1].toLowerCase();
      if (!NAMED_COLOR_SET.has(colorName)) continue;

      // Skip common false positives
      if (['inherit', 'initial', 'unset', 'revert', 'currentcolor', 'transparent', 'none', 'auto'].includes(colorName)) continue;

      // Skip if in a comment
      const trimmedText = result.text.trimStart();
      if (trimmedText.startsWith('//') || trimmedText.startsWith('*') || trimmedText.startsWith('/*')) continue;

      results.push({
        file: result.file,
        line: result.line,
        column: result.column,
        value: colorName,
        type: 'named',
        hex: NAMED_COLORS[colorName] || null,
        context: result.text.trim(),
      });
    }
  }

  return results;
}

/**
 * Output results in JSON format.
 */
function outputJson(results) {
  const actionable = results.filter(r => r.actionable);
  const skipped = results.filter(r => !r.actionable);
  const output = {
    command: 'colors',
    summary: {
      totalColors: results.length,
      actionable: actionable.length,
      skipped: skipped.length,
      totalFiles: new Set(results.map(r => r.file)).size,
      byType: countByType(results),
      skippedByContext: countByKey(skipped, 'context'),
    },
    actionable: groupByFile(actionable),
    skipped: groupByFile(skipped),
  };
  console.log(JSON.stringify(output, null, 2));
}

function outputText(results) {
  if (results.length === 0) {
    console.log('No hardcoded color values found.');
    return;
  }

  const actionable = results.filter(r => r.actionable);
  const skipped = results.filter(r => !r.actionable);
  const fileCount = new Set(results.map(r => r.file)).size;
  const typeCount = countByType(results);

  console.log(`\n=== Hardcoded Colors ===`);
  console.log(`Found ${results.length} hardcoded color values in ${fileCount} files`);
  console.log(`Actionable: ${actionable.length} | Skipped: ${skipped.length}`);
  console.log(`Types: ${Object.entries(typeCount).map(([k, v]) => `${k}(${v})`).join(', ')}\n`);

  // Actionable results first
  if (actionable.length > 0) {
    const grouped = groupByFile(actionable);
    for (const [file, fileResults] of Object.entries(grouped)) {
      console.log(`FILE: ${file}`);
      for (const r of fileResults) {
        const hex = r.hex ? ` -> ${r.hex}` : '';
        console.log(`  L${r.line}:${r.column}  ${r.value}  (${r.type}${hex})`);
        console.log(`    ${r.lineText}`);
      }
      console.log('');
    }
  }

  // Collapsed summary of skipped
  if (skipped.length > 0) {
    const byCtx = countByKey(skipped, 'contextLabel');
    console.log(`--- Skipped ${skipped.length} non-actionable colors ---`);
    for (const [ctx, count] of Object.entries(byCtx)) {
      const files = new Set(skipped.filter(r => r.contextLabel === ctx).map(r => r.file));
      console.log(`  [${ctx}] ${count} colors in ${files.size} files`);
    }
    console.log('');
  }
}

function groupByFile(results) {
  const grouped = {};
  for (const r of results) {
    if (!grouped[r.file]) grouped[r.file] = [];
    grouped[r.file].push(r);
  }
  return grouped;
}

function countByType(results) {
  const counts = {};
  for (const r of results) {
    counts[r.type] = (counts[r.type] || 0) + 1;
  }
  return counts;
}

function countByKey(results, key) {
  const counts = {};
  for (const r of results) {
    const val = r[key] || 'unknown';
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

module.exports = { findColors };
