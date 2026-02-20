'use strict';

const { search } = require('../search');

/**
 * Find repeated className/class patterns that could be extracted into
 * shared variables (CVA variants, Tailwind @apply, component abstractions).
 *
 * Approach:
 * 1. Extract all className strings from JSX/HTML files
 * 2. Normalize class strings (sort alphabetically, deduplicate)
 * 3. Count occurrences of each normalized pattern
 * 4. Report patterns appearing >= minCount times
 */
function findPatterns(paths, options) {
  const minCount = parseInt(options.minCount) || 2;
  const minClasses = parseInt(options.minClasses) || 2;
  const searchPaths = paths.length > 0 ? paths : ['.'];

  // 1. Find all className and class attribute occurrences
  const classResults = findClassAttributes(searchPaths, options);

  // 2. Normalize and count
  const patternMap = new Map(); // normalized string -> { count, locations, original }

  for (const result of classResults) {
    const classes = extractClassList(result.classString);
    if (classes.length < minClasses) continue;

    // Normalize: sort classes alphabetically
    const normalized = [...classes].sort().join(' ');

    if (!patternMap.has(normalized)) {
      patternMap.set(normalized, {
        normalized,
        classes,
        classCount: classes.length,
        count: 0,
        locations: [],
      });
    }

    const entry = patternMap.get(normalized);
    entry.count++;
    entry.locations.push({
      file: result.file,
      line: result.line,
      column: result.column,
      original: result.classString,
      context: result.context,
    });
  }

  // 3. Filter by minimum count
  const patterns = Array.from(patternMap.values())
    .filter(p => p.count >= minCount)
    .sort((a, b) => {
      // Sort by count * classCount (impact score) descending
      const scoreA = a.count * a.classCount;
      const scoreB = b.count * b.classCount;
      return scoreB - scoreA;
    });

  // 4. Also find frequently used individual class subsets
  const subPatterns = findCommonSubsets(patternMap, minCount, minClasses);

  if (options.format === 'json') {
    outputJson(patterns, subPatterns, minCount, minClasses);
  } else {
    outputText(patterns, subPatterns, minCount, minClasses);
  }
}

/**
 * Find all className="..." and class="..." attributes in source files.
 */
function findClassAttributes(searchPaths, options) {
  const results = [];

  // Pattern to find className or class attributes with static strings
  const patterns = [
    'className="[^"]*"',
    "className='[^']*'",
    'class="[^"]*"',
    "class='[^']*'",
  ];

  for (const pattern of patterns) {
    const rawResults = search(pattern, searchPaths, {
      include: options.include,
      exclude: options.exclude,
      caseSensitive: true,
    });

    for (const result of rawResults) {
      const match = result.match || '';

      // Extract the class string value
      const valueMatch = match.match(/(?:className|class)=["']([^"']*)["']/);
      if (!valueMatch) continue;

      const classString = valueMatch[1].trim();
      if (!classString) continue;

      // Skip if in a comment
      const trimmedText = result.text.trimStart();
      if (trimmedText.startsWith('//') || trimmedText.startsWith('*') || trimmedText.startsWith('{/*')) continue;

      results.push({
        file: result.file,
        line: result.line,
        column: result.column,
        classString,
        context: result.text.trim(),
      });
    }
  }

  return results;
}

/**
 * Extract individual class names from a class string.
 * Handles whitespace variations.
 */
function extractClassList(classString) {
  return classString.split(/\s+/).filter(Boolean);
}

/**
 * Find common subsets of classes that appear together frequently.
 * This catches cases where the same group of 3+ classes appears
 * within larger class strings across different elements.
 */
function findCommonSubsets(patternMap, minCount, minClasses) {
  // Count frequency of each individual class
  const classFreq = new Map();

  for (const entry of patternMap.values()) {
    for (const loc of entry.locations) {
      for (const cls of entry.classes) {
        classFreq.set(cls, (classFreq.get(cls) || 0) + 1);
      }
    }
  }

  // Find pairs/triples of classes that frequently co-occur
  const pairFreq = new Map();

  for (const entry of patternMap.values()) {
    const sorted = [...entry.classes].sort();
    // Generate all pairs
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        // Only consider pairs where both classes are common
        if ((classFreq.get(sorted[i]) || 0) >= minCount &&
            (classFreq.get(sorted[j]) || 0) >= minCount) {
          const pair = `${sorted[i]} ${sorted[j]}`;
          pairFreq.set(pair, (pairFreq.get(pair) || 0) + entry.count);
        }
      }
    }
  }

  // Return frequent pairs as sub-patterns
  return Array.from(pairFreq.entries())
    .filter(([, count]) => count >= minCount * 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20) // Top 20
    .map(([pattern, count]) => ({ pattern, count }));
}

function outputJson(patterns, subPatterns, minCount, minClasses) {
  const output = {
    command: 'patterns',
    summary: {
      totalPatterns: patterns.length,
      minCount,
      minClasses,
      totalLocations: patterns.reduce((sum, p) => sum + p.count, 0),
    },
    patterns: patterns.map(p => ({
      normalized: p.normalized,
      classCount: p.classCount,
      occurrences: p.count,
      impactScore: p.count * p.classCount,
      locations: p.locations,
    })),
    frequentSubsets: subPatterns,
  };
  console.log(JSON.stringify(output, null, 2));
}

function outputText(patterns, subPatterns, minCount, minClasses) {
  if (patterns.length === 0) {
    console.log(`No repeated class patterns found (min ${minCount} occurrences, min ${minClasses} classes).`);
    return;
  }

  const totalLocs = patterns.reduce((sum, p) => sum + p.count, 0);

  console.log(`\n=== Repeated Class Patterns ===`);
  console.log(`Found ${patterns.length} repeated patterns across ${totalLocs} locations`);
  console.log(`Criteria: ≥${minCount} occurrences, ≥${minClasses} classes\n`);

  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i];
    const impact = p.count * p.classCount;

    console.log(`${i + 1}. "${p.normalized}"`);
    console.log(`   Classes: ${p.classCount} | Occurrences: ${p.count} | Impact score: ${impact}`);
    console.log(`   Consider: CVA variant, @apply directive, or component extraction`);
    console.log(`   Locations:`);
    for (const loc of p.locations) {
      console.log(`     ${loc.file}:${loc.line}:${loc.column}`);
      if (loc.original !== p.normalized) {
        console.log(`       original: "${loc.original}"`);
      }
    }
    console.log('');
  }

  if (subPatterns.length > 0) {
    console.log(`--- Frequently Co-occurring Class Pairs ---`);
    console.log(`These class pairs appear together often and may form a logical group:\n`);
    for (const sp of subPatterns) {
      console.log(`  "${sp.pattern}" (${sp.count} co-occurrences)`);
    }
    console.log('');
  }

  console.log(`TIP: Use class-variance-authority (CVA) to create typed variants from repeated patterns.`);
  console.log(`TIP: Use tailwind-merge to simplify conflicting/duplicate Tailwind classes.`);
  console.log(`TIP: Consider extracting patterns into @apply directives or shared components.\n`);
}

module.exports = { findPatterns };
