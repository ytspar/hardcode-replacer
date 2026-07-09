const fs = require("node:fs");
const { search } = require("../search");

// Extensions this command parses. Non-JS/TS files are out of scope: the whole
// point is a real AST (RegExpLiteral vs division, TemplateLiteral vs string).
const JS_TS_EXTS = ["js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts"];
const DEFAULT_INCLUDE = `*.{${JS_TS_EXTS.join(",")}}`;

// A source file that has any string, template, or regex literal necessarily
// contains a quote or backtick, so this cheap ripgrep pass gives us the full
// set of candidate files without walking the tree ourselves (and it honors the
// same include/exclude globs the other commands use).
const QUOTE_MARKER = "['\"`]";

const TEST_FILE_RE = /(\.(test|spec)\.[jt]sx?$)|(^|\/)__tests__\//;
const PURE_NUMBER_RE = /^\d+(?:\.\d+)?$/;
const IMPORT_PATH_PREFIX_RE = /^(?:\.|@|node:|~)/;
// A bare all-lowercase word with no separators/digits/case ("background",
// "className") is almost never a drift-dangerous domain constant — those carry
// structure (a separator, digits, mixed/upper case): URLs, id patterns, command
// names, env-var names, verdict tokens like APPROVE. Skipping pure lowercase
// words cuts the bulk of a broad string scan's noise while keeping every real
// shared constant. (Regex literals and `--include-tests` are unaffected; raise
// `--min-length` or use `--kind regex` to tune further.)
const BARE_LOWERCASE_WORD_RE = /^[a-z]+$/;

// Trivial tokens that are duplicated everywhere but never worth single-sourcing.
const TRIVIAL_LITERALS = new Set([
  "use strict",
  "use client",
  "use server",
  "utf-8",
  "utf8",
  "ascii",
  "base64",
  "binary",
  "hex",
]);

/**
 * Find string / template / regex literals that are duplicated across >= 2
 * source files (the cross-file drift class — a regex copy-pasted into a dozen
 * files that then diverge).
 *
 * Pure analysis function: it does NOT print. Returns the structured result so
 * an in-process caller (e.g. verticalint/tools el-hook) can
 * `require("hardcode-replacer/duplicate-literals")` and gate on it directly.
 * The CLI wrapper (src/cli.js) renders the result and applies `--check`.
 *
 * AST-based on purpose: text/regex extraction gets regex literals wrong. An
 * AST gives real `RegExpLiteral` nodes, so `/a\/b/g` is captured while a
 * division `a / b` is not.
 *
 * @param {string[]} paths - files or directories to scan
 * @param {Object} [options]
 * @param {string|number} [options.minOccurrences=3] - min total occurrences
 * @param {string|number} [options.minFiles=2] - min distinct files spanned
 * @param {string|number} [options.minLength=8] - min string length (strings
 *   only; regex literals bypass this — a short shared regex is still drift-prone)
 * @param {'string'|'regex'|'all'} [options.kind='all'] - literal kind filter
 * @param {boolean} [options.includeTests=false] - include *.test.* / *.spec.* / __tests__
 * @param {string} [options.include] - ripgrep include glob
 * @param {string[]} [options.exclude] - ripgrep exclude globs
 * @returns {DuplicateLiteralsResult}
 */
function findDuplicateLiterals(paths, options = {}) {
  const minOccurrences = Number.parseInt(options.minOccurrences, 10) || 3;
  const minFiles = Number.parseInt(options.minFiles, 10) || 2;
  const minLength = Number.parseInt(options.minLength, 10) || 8;
  const kind = normalizeKind(options.kind);
  const includeTests = Boolean(options.includeTests);
  const searchPaths = paths.length > 0 ? paths : ["."];

  // Lazily require the parser so the color / CSS commands pay nothing for it.
  const parser = require("@babel/parser");

  const files = discoverFiles(searchPaths, options, includeTests);

  // key = `${kind} ${value}` -> aggregation entry
  const map = new Map();
  const warnings = [];
  let scannedFiles = 0;

  for (const file of files) {
    let source;
    try {
      source = fs.readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    let ast;
    try {
      ast = parser.parse(source, {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
        errorRecovery: true,
      });
    } catch (err) {
      warnings.push(`skipped ${file} (parse error: ${err.message})`);
      continue;
    }

    scannedFiles++;
    const literals = collectLiterals(ast.program, kind);
    for (const lit of literals) {
      if (!passesNoiseFilter(lit, minLength)) {
        continue;
      }
      const mapKey = `${lit.kind} ${lit.value}`;
      let entry = map.get(mapKey);
      if (!entry) {
        entry = { value: lit.value, kind: lit.kind, locations: [] };
        map.set(mapKey, entry);
      }
      entry.locations.push({
        file,
        line: lit.line,
        column: lit.column,
        exported: lit.exported,
      });
    }
  }

  const findings = buildFindings(map, minOccurrences, minFiles);

  return {
    command: "duplicate-literals",
    summary: {
      totalFindings: findings.length,
      minOccurrences,
      minFiles,
      minLength,
      kind,
      scannedFiles,
      skippedFiles: warnings.length,
      totalLocations: findings.reduce((sum, f) => sum + f.occurrences, 0),
    },
    findings,
    warnings,
  };
}

function normalizeKind(kind) {
  const k = String(kind || "all").toLowerCase();
  return k === "string" || k === "regex" ? k : "all";
}

/**
 * Turn the aggregation map into the sorted, threshold-filtered findings list.
 */
function buildFindings(map, minOccurrences, minFiles) {
  const findings = [];
  for (const entry of map.values()) {
    const occurrences = entry.locations.length;
    const fileCount = new Set(entry.locations.map((l) => l.file)).size;
    if (occurrences < minOccurrences || fileCount < minFiles) {
      continue;
    }
    findings.push({
      value: entry.value,
      kind: entry.kind,
      occurrences,
      files: fileCount,
      suggestedSource: suggestSource(entry.locations),
      locations: entry.locations,
    });
  }

  // Highest-impact first: most occurrences, then most files spanned.
  findings.sort(
    (a, b) =>
      b.occurrences - a.occurrences ||
      b.files - a.files ||
      a.value.localeCompare(b.value)
  );
  return findings;
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function discoverFiles(searchPaths, options, includeTests) {
  const results = search(QUOTE_MARKER, searchPaths, {
    include: options.include || DEFAULT_INCLUDE,
    exclude: options.exclude,
    caseSensitive: true,
  });

  const fileSet = new Set();
  for (const r of results) {
    if (!includeTests && TEST_FILE_RE.test(r.file)) {
      continue;
    }
    fileSet.add(r.file);
  }
  return [...fileSet].sort();
}

// ---------------------------------------------------------------------------
// AST literal collection
// ---------------------------------------------------------------------------

// Node keys that hold metadata / comment cross-links, never child AST we want.
const SKIP_KEYS = new Set([
  "type",
  "loc",
  "start",
  "end",
  "range",
  "extra",
  "leadingComments",
  "trailingComments",
  "innerComments",
  "comments",
  "tokens",
  "errors",
]);

/**
 * Walk the AST collecting StringLiteral, no-expression TemplateLiteral, and
 * RegExpLiteral nodes. Tracks two bits of parent context per literal:
 *  - `exported`: the literal is the init of an `export const NAME = <literal>`
 *    (used for the canonical-source hint).
 *  - import/require sources are excluded (a duplicated `"./utils"` import path
 *    is not the drift class this command targets).
 */
function collectLiterals(root, kindFilter) {
  const out = [];
  const excluded = new WeakSet();

  const walk = (node, ancestors) => {
    if (!node || typeof node.type !== "string") {
      return;
    }

    // Mark import / require / dynamic-import source strings as excluded before
    // we descend into them.
    markExcludedSources(node, excluded);

    const lit = literalFromNode(node);
    if (lit) {
      if (!excluded.has(node)) {
        addLiteral(out, kindFilter, { ...lit, node, ancestors });
      }
      return;
    }

    walkChildren(node, [...ancestors, node], walk);
  };

  walk(root, []);
  return out;
}

/**
 * Classify a node as a collectable literal, or null. Only no-expression
 * TemplateLiterals count (a `${...}` template is a partial, not a literal).
 *
 * Note: a no-expression template `` `foo` `` and a plain string `"foo"` both
 * yield `{ kind: "string", value: "foo" }`, so they aggregate into ONE finding.
 * That is intentional — they are the same literal *content* duplicated, which is
 * exactly the drift this detects (a value copy-pasted in mixed quote styles).
 */
function literalFromNode(node) {
  if (node.type === "StringLiteral") {
    return { kind: "string", value: node.value };
  }
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    const quasi = node.quasis[0];
    return { kind: "string", value: quasi.value.cooked ?? quasi.value.raw };
  }
  if (node.type === "RegExpLiteral") {
    return { kind: "regex", value: `/${node.pattern}/${node.flags}` };
  }
  return null;
}

function walkChildren(node, ancestors, walk) {
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) {
      continue;
    }
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        walk(item, ancestors);
      }
    } else if (child && typeof child.type === "string") {
      walk(child, ancestors);
    }
  }
}

function markExcludedSources(node, excluded) {
  if (
    (node.type === "ImportDeclaration" ||
      node.type === "ExportNamedDeclaration" ||
      node.type === "ExportAllDeclaration") &&
    node.source &&
    node.source.type === "StringLiteral"
  ) {
    excluded.add(node.source);
    return;
  }
  if (
    node.type === "ImportExpression" &&
    node.source?.type === "StringLiteral"
  ) {
    excluded.add(node.source);
    return;
  }
  // require("...") / require.resolve("...")
  if (
    node.type === "CallExpression" &&
    isRequireCallee(node.callee) &&
    node.arguments[0]?.type === "StringLiteral"
  ) {
    excluded.add(node.arguments[0]);
  }
}

function isRequireCallee(callee) {
  if (!callee) {
    return false;
  }
  if (callee.type === "Identifier") {
    return callee.name === "require";
  }
  return (
    callee.type === "MemberExpression" &&
    callee.object?.type === "Identifier" &&
    callee.object.name === "require"
  );
}

function addLiteral(out, kindFilter, lit) {
  if (kindFilter !== "all" && lit.kind !== kindFilter) {
    return;
  }
  const loc = lit.node.loc?.start || { line: 0, column: 0 };
  out.push({
    kind: lit.kind,
    value: lit.value,
    line: loc.line,
    column: loc.column + 1, // 1-indexed to match the other commands
    exported: isExportedConstInit(lit.node, lit.ancestors),
  });
}

/**
 * True when the literal is the initializer of an exported const, i.e.
 * `export const NAME = <literal>` — the file that already single-sources it.
 */
function isExportedConstInit(node, ancestors) {
  const parent = ancestors.at(-1);
  const grandparent = ancestors.at(-2);
  const greatGrand = ancestors.at(-3);
  return Boolean(
    parent &&
      parent.type === "VariableDeclarator" &&
      parent.init === node &&
      grandparent &&
      grandparent.type === "VariableDeclaration" &&
      greatGrand &&
      greatGrand.type === "ExportNamedDeclaration"
  );
}

// ---------------------------------------------------------------------------
// Noise filtering
// ---------------------------------------------------------------------------

function passesNoiseFilter(lit, minLength) {
  if (lit.kind === "regex") {
    // A short shared regex is still drift-prone; only require a non-empty body.
    return lit.value.length > 2; // `//` at minimum
  }

  const value = lit.value;
  if (value.trim().length === 0) {
    return false;
  }
  if (value.length < minLength) {
    return false;
  }
  if (PURE_NUMBER_RE.test(value.trim())) {
    return false;
  }
  if (IMPORT_PATH_PREFIX_RE.test(value)) {
    return false;
  }
  if (TRIVIAL_LITERALS.has(value.toLowerCase())) {
    return false;
  }
  if (BARE_LOWERCASE_WORD_RE.test(value.trim())) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Canonical-source hint
// ---------------------------------------------------------------------------

/**
 * Suggest where to single-source a duplicated literal:
 *   1. a file that already `export`s it (`export const NAME = <literal>`)
 *   2. else the file that holds the most copies (most-shared)
 *   3. else the shallowest path (fewest directory segments)
 */
function suggestSource(locations) {
  const exported = locations.find((l) => l.exported);
  if (exported) {
    return { file: exported.file, line: exported.line, reason: "exported" };
  }

  const byFile = new Map();
  for (const l of locations) {
    byFile.set(l.file, (byFile.get(l.file) || 0) + 1);
  }
  const maxCount = Math.max(...byFile.values());
  const topFiles = [...byFile.keys()].filter((f) => byFile.get(f) === maxCount);
  if (maxCount > 1 && topFiles.length === 1) {
    const file = topFiles[0];
    return { file, line: firstLine(locations, file), reason: "most-shared" };
  }

  const shallow = [...byFile.keys()].sort(
    (a, b) => pathDepth(a) - pathDepth(b) || a.localeCompare(b)
  )[0];
  return {
    file: shallow,
    line: firstLine(locations, shallow),
    reason: "shallowest",
  };
}

function firstLine(locations, file) {
  return locations.find((l) => l.file === file).line;
}

function pathDepth(p) {
  return p.split("/").length;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function outputJson(result) {
  const out = {
    command: result.command,
    summary: result.summary,
    findings: result.findings.map((f) => ({
      value: f.value,
      kind: f.kind,
      occurrences: f.occurrences,
      files: f.files,
      suggestedSource: f.suggestedSource,
      locations: f.locations,
    })),
  };
  console.log(JSON.stringify(out, null, 2));
}

function outputText(result) {
  const { findings, summary } = result;

  if (findings.length === 0) {
    console.log(
      `\nNo duplicated literals found (min ${summary.minOccurrences} occurrences across >=${summary.minFiles} files).`
    );
    console.log(`Scanned ${summary.scannedFiles} JS/TS files.\n`);
    printWarnings(result);
    return;
  }

  console.log("\n=== Duplicate Literals ===");
  console.log(
    `Found ${findings.length} literal(s) duplicated across files (${summary.totalLocations} locations, ${summary.scannedFiles} files scanned)`
  );
  console.log(
    `Criteria: kind=${summary.kind}, >=${summary.minOccurrences} occurrences, >=${summary.minFiles} files, min length ${summary.minLength}\n`
  );

  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    const label = f.kind === "regex" ? "regex " : "string";
    console.log(`${i + 1}. [${label}] ${f.value}`);
    console.log(`   Occurrences: ${f.occurrences} across ${f.files} file(s)`);
    const src = f.suggestedSource;
    console.log(`   Single-source in: ${src.file}:${src.line} (${src.reason})`);
    console.log("   Locations:");
    for (const loc of f.locations) {
      const tag = loc.exported ? " [exported]" : "";
      console.log(`     ${loc.file}:${loc.line}:${loc.column}${tag}`);
    }
    console.log("");
  }

  console.log(
    "TIP: Hoist each duplicated literal into a single exported const and import it — divergent copies are how cross-file drift starts."
  );
  console.log(
    "TIP: Use --check in CI / a pre-commit hook to fail when new duplicates appear.\n"
  );
  printWarnings(result);
}

function printWarnings(result) {
  if (result.warnings.length > 0) {
    console.error(`\n${result.warnings.length} file(s) could not be parsed:`);
    for (const w of result.warnings) {
      console.error(`  ${w}`);
    }
  }
}

module.exports = { findDuplicateLiterals, outputJson, outputText };
