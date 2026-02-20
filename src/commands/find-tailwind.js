'use strict';

const { search } = require('../search');
const { buildTailwindColorPattern, COLOR_PREFIXES, COLOR_NAMES, SPECIAL_COLORS, SHADES } = require('../tailwind-colors');

/**
 * Find all Tailwind CSS color utility classes in source files.
 *
 * Matches patterns like: bg-red-500, text-blue-300/50, border-[#ff0000]
 */
function findTailwind(paths, options) {
  const pattern = buildTailwindColorPattern();
  const rawResults = search(pattern, paths, {
    include: options.include,
    exclude: options.exclude,
    fileTypes: options.fileTypes,
  });

  // Post-process: validate and extract Tailwind color classes
  const results = [];
  const twClassRegex = buildTailwindClassRegex();

  for (const result of rawResults) {
    const match = result.match.trim();

    // Skip if in a comment
    const trimmedText = result.text.trimStart();
    if (trimmedText.startsWith('//') || trimmedText.startsWith('*') || trimmedText.startsWith('/*')) continue;

    // Classify the Tailwind color class
    const info = parseTailwindColorClass(match);
    if (!info) continue;

    results.push({
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
    });
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
    outputJson(deduped);
  } else {
    outputText(deduped);
  }
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

function buildTailwindClassRegex() {
  const prefixes = COLOR_PREFIXES.join('|');
  const colors = [...COLOR_NAMES, ...SPECIAL_COLORS].join('|');
  const shades = SHADES.join('|');
  return new RegExp(`\\b(${prefixes})-(${colors})(?:-(${shades}))?(?:/(\\d+))?\\b`, 'g');
}

function outputJson(results) {
  const grouped = groupByFile(results);
  const output = {
    command: 'tailwind',
    summary: {
      totalClasses: results.length,
      totalFiles: Object.keys(grouped).length,
      byPrefix: countByKey(results, 'prefix'),
      byColor: countByKey(results, 'color'),
    },
    results: grouped,
  };
  console.log(JSON.stringify(output, null, 2));
}

function outputText(results) {
  if (results.length === 0) {
    console.log('No Tailwind color classes found.');
    return;
  }

  const grouped = groupByFile(results);
  const fileCount = Object.keys(grouped).length;

  console.log(`\n=== Tailwind Color Classes ===`);
  console.log(`Found ${results.length} Tailwind color classes in ${fileCount} files\n`);

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
