'use strict';

const fs = require('fs');
const path = require('path');
const { search } = require('../search');
const { buildTailwindColorPattern, SPECIAL_COLORS, detectTailwindVersion, parseTailwindV4Theme, TAILWIND_V4_PATTERNS } = require('../tailwind-colors');
const { normalizeToHex, findNearestColor } = require('../color-utils');

/**
 * Find all Tailwind CSS color utility classes in source files.
 *
 * Matches patterns like: bg-red-500, text-blue-300/50, border-[#ff0000]
 *
 * Options:
 *   --vars <file>   Optional. Compare arbitrary values against a palette.
 *   --threshold <n> Delta-E distance for close matches (default: 10).
 */
function findTailwind(paths, options) {
  const pattern = buildTailwindColorPattern();
  const rawResults = search(pattern, paths, {
    include: options.include,
    exclude: options.exclude,
    fileTypes: options.fileTypes,
  });

  // Detect Tailwind version
  const twVersion = options.tailwindVersion || detectTailwindVersion(paths);

  // Load palette for arbitrary value matching
  let palette = null;
  if (options.vars) {
    const { parseVariablesFile } = require('./compare-vars');
    palette = parseVariablesFile(options.vars);
  }
  const threshold = parseFloat(options.threshold) || 10;

  // Post-process: validate and extract Tailwind color classes
  const results = [];

  for (const result of rawResults) {
    const match = result.match.trim();

    // Skip if in a comment
    const trimmedText = result.text.trimStart();
    if (trimmedText.startsWith('//') || trimmedText.startsWith('*') || trimmedText.startsWith('/*')) continue;

    // Classify the Tailwind color class
    const info = parseTailwindColorClass(match);
    if (!info) continue;

    const entry = {
      file: result.file,
      line: result.line,
      column: result.column,
      value: match,
      prefix: info.prefix,
      color: info.color,
      shade: info.shade,
      opacity: info.opacity,
      arbitrary: info.arbitrary,
      context: result.text.trim(),
    };

    // Check arbitrary values against palette
    if (info.arbitrary && palette) {
      const arbHex = normalizeToHex(info.arbitrary);
      if (arbHex) {
        const nearest = findNearestColor(info.arbitrary, palette);
        if (nearest) {
          entry.arbitraryMatch = nearest;
          if (nearest.distance === 0) {
            entry.arbitraryStatus = 'exact';
            entry.suggestion = `Use var(${nearest.name}) or a Tailwind theme color instead of ${info.arbitrary}`;
          } else if (nearest.distance <= threshold) {
            entry.arbitraryStatus = 'close';
            entry.suggestion = `Close to ${nearest.name} (${nearest.hex}, dE=${nearest.distance})`;
          }
        }
      }
    }

    results.push(entry);
  }

  // Detect Tailwind v4 @theme/@utility usage
  let v4Info = null;
  if (twVersion === 4) {
    v4Info = detectV4Usage(paths);
  }

  // Deduplicate
  const seen = new Set();
  const deduped = results.filter(r => {
    const key = `${r.file}:${r.line}:${r.column}:${r.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);

  if (options.format === 'json') {
    outputJson(deduped, twVersion, v4Info);
  } else {
    outputText(deduped, twVersion, v4Info);
  }
}

/**
 * Detect Tailwind v4 @theme and @utility usage in CSS files.
 */
function detectV4Usage(searchPaths) {
  const info = { themeVars: 0, utilities: 0, files: [] };

  for (const searchPath of searchPaths) {
    try {
      const resolved = path.resolve(searchPath);
      const stat = fs.statSync(resolved);
      const files = [];

      if (stat.isFile() && /\.css$/.test(resolved)) {
        files.push(resolved);
      } else if (stat.isDirectory()) {
        // Quick scan of CSS files
        for (const entry of ['tailwind.css', 'globals.css', 'app.css', 'global.css', 'index.css']) {
          const fp = path.join(resolved, entry);
          if (fs.existsSync(fp)) files.push(fp);
        }
      }

      for (const fp of files) {
        const content = fs.readFileSync(fp, 'utf-8');
        if (TAILWIND_V4_PATTERNS.theme.test(content)) {
          const themeColors = parseTailwindV4Theme(content);
          info.themeVars += Object.keys(themeColors).length;
          info.files.push(fp);
        }
        const utilMatches = content.match(/@utility\s+[\w-]+/g);
        if (utilMatches) {
          info.utilities += utilMatches.length;
        }
      }
    } catch { /* skip */ }
  }

  return info;
}

/**
 * Parse a Tailwind color class into its components.
 */
function parseTailwindColorClass(cls) {
  // Arbitrary value: bg-[#ff0000]
  const arbMatch = cls.match(/^(\w+)-\[([^\]]+)\]$/);
  if (arbMatch) {
    return {
      prefix: arbMatch[1],
      color: null,
      shade: null,
      opacity: null,
      arbitrary: arbMatch[2],
    };
  }

  // Standard color with shade: bg-red-500, bg-red-500/50
  const stdMatch = cls.match(/^(\w+)-(\w+)-(\d+)(?:\/(\d+))?$/);
  if (stdMatch) {
    return {
      prefix: stdMatch[1],
      color: stdMatch[2],
      shade: stdMatch[3],
      opacity: stdMatch[4] || null,
      arbitrary: null,
    };
  }

  // Special color (no shade): bg-black, text-white/50
  const specMatch = cls.match(/^(\w+)-(\w+)(?:\/(\d+))?$/);
  if (specMatch && SPECIAL_COLORS.includes(specMatch[2])) {
    return {
      prefix: specMatch[1],
      color: specMatch[2],
      shade: null,
      opacity: specMatch[3] || null,
      arbitrary: null,
    };
  }

  return null;
}

function outputJson(results, twVersion, v4Info) {
  const grouped = groupByFile(results);
  const arbitrary = results.filter(r => r.arbitrary);
  const arbitraryWithMatch = arbitrary.filter(r => r.arbitraryMatch);

  const output = {
    command: 'tailwind',
    tailwindVersion: twVersion,
    summary: {
      totalClasses: results.length,
      totalFiles: Object.keys(grouped).length,
      byPrefix: countByKey(results, 'prefix'),
      byColor: countByKey(results, 'color'),
      arbitraryValues: arbitrary.length,
      arbitraryWithThemeMatch: arbitraryWithMatch.length,
    },
    results: grouped,
  };

  if (v4Info) {
    output.v4 = v4Info;
  }

  console.log(JSON.stringify(output, null, 2));
}

function outputText(results, twVersion, v4Info) {
  if (results.length === 0) {
    console.log('No Tailwind color classes found.');
    return;
  }

  const grouped = groupByFile(results);
  const fileCount = Object.keys(grouped).length;
  const arbitrary = results.filter(r => r.arbitrary);
  const arbitraryWithMatch = arbitrary.filter(r => r.arbitraryMatch);

  console.log(`\n=== Tailwind Color Classes ===`);
  console.log(`Found ${results.length} Tailwind color classes in ${fileCount} files`);
  if (twVersion === 4) {
    console.log(`Tailwind v4 detected`);
  }
  if (arbitrary.length > 0) {
    console.log(`Arbitrary values: ${arbitrary.length}${arbitraryWithMatch.length > 0 ? ` (${arbitraryWithMatch.length} match theme vars)` : ''}`);
  }
  console.log('');

  // Show arbitrary values with theme matches first (high priority)
  if (arbitraryWithMatch.length > 0) {
    console.log(`--- ARBITRARY VALUES MATCHING THEME (${arbitraryWithMatch.length}) ---`);
    for (const r of arbitraryWithMatch) {
      const status = r.arbitraryStatus === 'exact' ? 'EXACT' : `CLOSE (dE=${r.arbitraryMatch.distance})`;
      console.log(`  ${r.file}:${r.line}:${r.column}  ${r.value} -> ${status}: ${r.arbitraryMatch.name} (${r.arbitraryMatch.hex})`);
      if (r.suggestion) console.log(`    ${r.suggestion}`);
    }
    console.log('');
  }

  // Show v4 info
  if (v4Info && (v4Info.themeVars > 0 || v4Info.utilities > 0)) {
    console.log(`--- Tailwind v4 ---`);
    console.log(`  @theme variables: ${v4Info.themeVars}`);
    console.log(`  @utility definitions: ${v4Info.utilities}`);
    console.log('');
  }

  for (const [file, fileResults] of Object.entries(grouped)) {
    console.log(`FILE: ${file}`);
    for (const r of fileResults) {
      const detail = r.arbitrary ? `arbitrary: ${r.arbitrary}` : `${r.color}-${r.shade || 'default'}`;
      console.log(`  L${r.line}:${r.column}  ${r.value}  (${r.prefix}, ${detail})`);
      console.log(`    ${r.context}`);
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

function countByKey(results, key) {
  const counts = {};
  for (const r of results) {
    const val = r[key] || 'arbitrary';
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

module.exports = { findTailwind };
