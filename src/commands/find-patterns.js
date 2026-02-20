'use strict';

const { search } = require('../search');

/**
 * Find repeated className/class patterns that could be extracted into
 * shared variables (CVA variants, Tailwind @apply, component abstractions).
 *
 * Approach:
 * 1. Extract all className strings from JSX/HTML files
 * 2. Also extract from cn(), clsx(), twMerge(), cva() calls
 * 3. Normalize class strings (sort alphabetically, deduplicate)
 * 4. Count occurrences of each normalized pattern
 * 5. Detect patterns that are subsets of larger patterns
 * 6. Report patterns appearing >= minCount times
 */
function findPatterns(paths, options) {
  const minCount = parseInt(options.minCount) || 2;
  const minClasses = parseInt(options.minClasses) || 2;
  const searchPaths = paths.length > 0 ? paths : ['.'];

  // 1. Find all className/class and cn()/clsx()/twMerge() occurrences
  const classResults = findClassAttributes(searchPaths, options);
  const fnResults = findClassNameFunctions(searchPaths, options);
  const allResults = [...classResults, ...fnResults];

  // 2. Normalize and count
  const patternMap = new Map(); // normalized string -> { count, locations, original }

  for (const result of allResults) {
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
      source: result.source || 'className',
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

  // 4. Find frequently used individual class subsets
  const subPatterns = findCommonSubsets(patternMap, minCount, minClasses);

  // 5. Detect subset relationships between found patterns
  const subsetRelations = findSubsetRelations(patterns);

  if (options.format === 'json') {
    outputJson(patterns, subPatterns, subsetRelations, minCount, minClasses);
  } else {
    outputText(patterns, subPatterns, subsetRelations, minCount, minClasses);
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
        source: 'className',
      });
    }
  }

  return results;
}

/**
 * Find cn(), clsx(), twMerge(), cva() function calls with string arguments.
 * Extracts static string class lists from these utility functions.
 */
function findClassNameFunctions(searchPaths, options) {
  const results = [];

  // Match cn("...", "..."), clsx("..."), twMerge("..."), cva("...")
  const fnPatterns = [
    '(?:cn|clsx|twMerge|cva)\\(\\s*["\']([^"\']*)["\']',
    '(?:cn|clsx|twMerge|cva)\\([^)]*["\']([^"\']+)["\']',
  ];

  for (const pattern of fnPatterns) {
    const rawResults = search(pattern, searchPaths, {
      include: options.include,
      exclude: options.exclude,
      caseSensitive: true,
    });

    for (const result of rawResults) {
      const match = result.match || result.text;

      // Extract all quoted string arguments
      const stringArgs = match.match(/["']([^"']+)["']/g);
      if (!stringArgs) continue;

      // Skip if in a comment
      const trimmedText = result.text.trimStart();
      if (trimmedText.startsWith('//') || trimmedText.startsWith('*') || trimmedText.startsWith('{/*')) continue;

      for (const arg of stringArgs) {
        const classString = arg.slice(1, -1).trim();
        if (!classString || classString.includes('${')) continue;
        // Must look like Tailwind/CSS classes (has dashes or spaces)
        if (!classString.includes('-') && !classString.includes(' ')) continue;

        results.push({
          file: result.file,
          line: result.line,
          column: result.column,
          classString,
          context: result.text.trim(),
          source: 'cn/clsx',
        });
      }
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
    for (const cls of entry.classes) {
      classFreq.set(cls, (classFreq.get(cls) || 0) + entry.count);
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

/**
 * Find patterns that are subsets of other patterns.
 * If pattern A's classes are a subset of pattern B's classes,
 * and both appear frequently, they can share a base extraction.
 */
function findSubsetRelations(patterns) {
  const relations = [];

  for (let i = 0; i < patterns.length; i++) {
    const a = new Set(patterns[i].classes);

    for (let j = 0; j < patterns.length; j++) {
      if (i === j) continue;
      const b = new Set(patterns[j].classes);

      // Check if a is a proper subset of b
      if (a.size < b.size && [...a].every(cls => b.has(cls))) {
        relations.push({
          subset: patterns[i].normalized,
          superset: patterns[j].normalized,
          subsetCount: patterns[i].count,
          supersetCount: patterns[j].count,
          sharedClasses: [...a],
          extraClasses: [...b].filter(cls => !a.has(cls)),
        });
      }
    }
  }

  // Deduplicate and return top relations
  return relations.slice(0, 10);
}

function outputJson(patterns, subPatterns, subsetRelations, minCount, minClasses) {
  const output = {
    command: 'patterns',
    summary: {
      totalPatterns: patterns.length,
      minCount,
      minClasses,
      totalLocations: patterns.reduce((sum, p) => sum + p.count, 0),
      subsetRelations: subsetRelations.length,
    },
    patterns: patterns.map(p => ({
      normalized: p.normalized,
      classCount: p.classCount,
      occurrences: p.count,
      impactScore: p.count * p.classCount,
      locations: p.locations,
    })),
    subsetRelations,
    frequentSubsets: subPatterns,
  };
  console.log(JSON.stringify(output, null, 2));
}

function outputText(patterns, subPatterns, subsetRelations, minCount, minClasses) {
  if (patterns.length === 0) {
    console.log(`No repeated class patterns found (min ${minCount} occurrences, min ${minClasses} classes).`);
    return;
  }

  const totalLocs = patterns.reduce((sum, p) => sum + p.count, 0);

  console.log(`\n=== Repeated Class Patterns ===`);
  console.log(`Found ${patterns.length} repeated patterns across ${totalLocs} locations`);
  console.log(`Criteria: >=${minCount} occurrences, >=${minClasses} classes\n`);

  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i];
    const impact = p.count * p.classCount;

    console.log(`${i + 1}. "${p.normalized}"`);
    console.log(`   Classes: ${p.classCount} | Occurrences: ${p.count} | Impact score: ${impact}`);

    // Show sources (className vs cn/clsx)
    const sources = new Set(p.locations.map(l => l.source));
    if (sources.size > 1 || sources.has('cn/clsx')) {
      console.log(`   Sources: ${[...sources].join(', ')}`);
    }

    console.log(`   Consider: CVA variant, @apply directive, or component extraction`);
    console.log(`   Locations:`);
    for (const loc of p.locations) {
      const sourceTag = loc.source === 'cn/clsx' ? ' [cn/clsx]' : '';
      console.log(`     ${loc.file}:${loc.line}:${loc.column}${sourceTag}`);
      if (loc.original !== p.normalized) {
        console.log(`       original: "${loc.original}"`);
      }
    }
    console.log('');
  }

  // Subset relationships
  if (subsetRelations.length > 0) {
    console.log(`--- Subset Relationships ---`);
    console.log(`These patterns share a common base that could be extracted:\n`);
    for (const rel of subsetRelations) {
      console.log(`  Base: "${rel.subset}" (${rel.subsetCount}x)`);
      console.log(`    is subset of: "${rel.superset}" (${rel.supersetCount}x)`);
      console.log(`    extra classes: ${rel.extraClasses.join(', ')}`);
      console.log('');
    }
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
