const fs = require("node:fs");
const path = require("node:path");
const { search } = require("../search");
const {
  buildTailwindColorPattern,
  SPECIAL_COLORS,
  detectTailwindVersion,
  parseTailwindV4Theme,
  TAILWIND_V4_PATTERNS,
} = require("../tailwind-colors");
const { normalizeToHex, findNearestColor } = require("../color-utils");
const { groupByFile, countByKey } = require("../utils");

const CSS_FILE_RE = /\.css$/;
const ARB_VALUE_RE = /^(\w+)-\[([^\]]+)\]$/;
const STD_COLOR_RE = /^(\w+)-(\w+)-(\d+)(?:\/(\d+))?$/;
const SPEC_COLOR_RE = /^(\w+)-(\w+)(?:\/(\d+))?$/;

/**
 * Match an arbitrary color value against a theme palette.
 */
function matchArbitraryToTheme(entry, arbitrary, palette, threshold) {
  const arbHex = normalizeToHex(arbitrary);
  if (!arbHex) {
    return;
  }

  const nearest = findNearestColor(arbitrary, palette);
  if (!nearest) {
    return;
  }

  entry.arbitraryMatch = nearest;
  if (nearest.distance === 0) {
    entry.arbitraryStatus = "exact";
    entry.suggestion = `Use var(${nearest.name}) or a Tailwind theme color instead of ${arbitrary}`;
  } else if (nearest.distance <= threshold) {
    entry.arbitraryStatus = "close";
    entry.suggestion = `Close to ${nearest.name} (${nearest.hex}, dE=${nearest.distance})`;
  }
}

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
  });

  // Detect Tailwind version
  const twVersion = options.tailwindVersion || detectTailwindVersion(paths);

  // Load palette for arbitrary value matching
  let palette = null;
  if (options.vars) {
    const { parseVariablesFile } = require("./compare-vars");
    palette = parseVariablesFile(options.vars);
  }
  const threshold = Number.parseFloat(options.threshold) || 10;

  // Post-process: validate and extract Tailwind color classes
  const results = [];

  for (const result of rawResults) {
    const match = result.match.trim();

    // Skip if in a comment
    const trimmedText = result.text.trimStart();
    if (
      trimmedText.startsWith("//") ||
      trimmedText.startsWith("*") ||
      trimmedText.startsWith("/*")
    ) {
      continue;
    }

    // Classify the Tailwind color class
    const info = parseTailwindColorClass(match);
    if (!info) {
      continue;
    }

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
      matchArbitraryToTheme(entry, info.arbitrary, palette, threshold);
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
  const deduped = results.filter((r) => {
    const key = `${r.file}:${r.line}:${r.column}:${r.value}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  deduped.sort(
    (a, b) =>
      a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column
  );

  if (options.format === "json") {
    outputJson(deduped, twVersion, v4Info);
  } else {
    outputText(deduped, twVersion, v4Info);
  }
}

const V4_CSS_ENTRIES = [
  "tailwind.css",
  "globals.css",
  "app.css",
  "global.css",
  "index.css",
];
const UTILITY_MATCH_RE = /@utility\s+[\w-]+/g;

/**
 * Collect CSS files from a search path.
 */
function collectCssFiles(searchPath) {
  const files = [];
  try {
    const resolved = path.resolve(searchPath);
    const stat = fs.statSync(resolved);

    if (stat.isFile() && CSS_FILE_RE.test(resolved)) {
      files.push(resolved);
    } else if (stat.isDirectory()) {
      for (const entry of V4_CSS_ENTRIES) {
        const fp = path.join(resolved, entry);
        if (fs.existsSync(fp)) {
          files.push(fp);
        }
      }
    }
  } catch {
    /* skip */
  }
  return files;
}

/**
 * Analyze a single CSS file for v4 theme/utility usage.
 */
function analyzeV4File(fp, info) {
  const content = fs.readFileSync(fp, "utf-8");
  if (TAILWIND_V4_PATTERNS.theme.test(content)) {
    const themeColors = parseTailwindV4Theme(content);
    info.themeVars += Object.keys(themeColors).length;
    info.files.push(fp);
  }
  const utilMatches = content.match(UTILITY_MATCH_RE);
  if (utilMatches) {
    info.utilities += utilMatches.length;
  }
}

/**
 * Detect Tailwind v4 @theme and @utility usage in CSS files.
 */
function detectV4Usage(searchPaths) {
  const info = { themeVars: 0, utilities: 0, files: [] };

  for (const searchPath of searchPaths) {
    for (const fp of collectCssFiles(searchPath)) {
      try {
        analyzeV4File(fp, info);
      } catch {
        /* skip */
      }
    }
  }

  return info;
}

/**
 * Parse a Tailwind color class into its components.
 */
function parseTailwindColorClass(cls) {
  // Arbitrary value: bg-[#ff0000]
  const arbMatch = cls.match(ARB_VALUE_RE);
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
  const stdMatch = cls.match(STD_COLOR_RE);
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
  const specMatch = cls.match(SPEC_COLOR_RE);
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
  const arbitrary = results.filter((r) => r.arbitrary);
  const arbitraryWithMatch = arbitrary.filter((r) => r.arbitraryMatch);

  const output = {
    command: "tailwind",
    tailwindVersion: twVersion,
    summary: {
      totalClasses: results.length,
      totalFiles: Object.keys(grouped).length,
      byPrefix: countByKey(results, "prefix"),
      byColor: countByColor(results),
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

function printArbitraryMatches(arbitraryWithMatch) {
  if (arbitraryWithMatch.length === 0) {
    return;
  }
  console.log(
    `--- ARBITRARY VALUES MATCHING THEME (${arbitraryWithMatch.length}) ---`
  );
  for (const r of arbitraryWithMatch) {
    const status =
      r.arbitraryStatus === "exact"
        ? "EXACT"
        : `CLOSE (dE=${r.arbitraryMatch.distance})`;
    console.log(
      `  ${r.file}:${r.line}:${r.column}  ${r.value} -> ${status}: ${r.arbitraryMatch.name} (${r.arbitraryMatch.hex})`
    );
    if (r.suggestion) {
      console.log(`    ${r.suggestion}`);
    }
  }
  console.log("");
}

function printV4Info(v4Info) {
  if (v4Info && (v4Info.themeVars > 0 || v4Info.utilities > 0)) {
    console.log("--- Tailwind v4 ---");
    console.log(`  @theme variables: ${v4Info.themeVars}`);
    console.log(`  @utility definitions: ${v4Info.utilities}`);
    console.log("");
  }
}

function outputText(results, twVersion, v4Info) {
  if (results.length === 0) {
    console.log("No Tailwind color classes found.");
    return;
  }

  const grouped = groupByFile(results);
  const fileCount = Object.keys(grouped).length;
  const arbitrary = results.filter((r) => r.arbitrary);
  const arbitraryWithMatch = arbitrary.filter((r) => r.arbitraryMatch);

  console.log("\n=== Tailwind Color Classes ===");
  console.log(
    `Found ${results.length} Tailwind color classes in ${fileCount} files`
  );
  if (twVersion === 4) {
    console.log("Tailwind v4 detected");
  }
  if (arbitrary.length > 0) {
    console.log(
      `Arbitrary values: ${arbitrary.length}${arbitraryWithMatch.length > 0 ? ` (${arbitraryWithMatch.length} match theme vars)` : ""}`
    );
  }
  console.log("");

  printArbitraryMatches(arbitraryWithMatch);
  printV4Info(v4Info);

  for (const [file, fileResults] of Object.entries(grouped)) {
    console.log(`FILE: ${file}`);
    for (const r of fileResults) {
      const detail = r.arbitrary
        ? `arbitrary: ${r.arbitrary}`
        : `${r.color}-${r.shade || "default"}`;
      console.log(
        `  L${r.line}:${r.column}  ${r.value}  (${r.prefix}, ${detail})`
      );
      console.log(`    ${r.context}`);
    }
    console.log("");
  }
}

// countByKey with 'arbitrary' fallback for Tailwind color grouping
function countByColor(results) {
  return countByKey(results, "color", "arbitrary");
}

module.exports = { findTailwind };
