// Programmatic detection API for hex color violations in source content.
//
// Designed for callers that need a fast, in-process check (e.g. PreToolUse
// hooks blocking Edit/Write before the file is saved). The CLI's batch
// commands (`hardcode-replacer compare`, `find-colors`, etc.) use ripgrep
// and the broader HEX_PATTERN in src/color-patterns.js for scanning entire
// trees. This module is the single-string, write-time counterpart.
//
// Contract for the verticalint/tools `cli/el-hook/src/checks/design-tokens.ts`
// PreToolUse hook (see DEV-4144):
//   const { detectHexViolations, isHexExemptPath } = require("hardcode-replacer/detect");
//   if (isHexExemptPath(filePath)) return;
//   const violations = detectHexViolations(content, { maxMatches: 5 });
//   if (violations.length > 0) { /* block */ }
//
// Defaults match the el-hook write-time gate: narrow 6-digit hex only,
// filter common token-pattern keywords, skip comments, stop at first 5.
// Pass `pattern: HEX_PATTERN` (from src/color-patterns.js) to widen to the
// 3/4/6/8-digit batch-sweep variant.

const DEFAULT_HEX_PATTERN = /#[0-9a-fA-F]{6}/;

const DEFAULT_FILTER_KEYWORDS = ["var(--", "@theme", "primitive", "allow-hex"];

const DEFAULT_EXEMPT_PATH_FRAGMENTS = [
  "/design-tokens/",
  "/foundation.css",
  "/semantic.css",
  "/component.css",
  "/theme.css",
  ".test.",
  ".spec.",
  ".stories.",
  ".gallery.",
  "registry.generated",
  "tailwind.config",
];

/**
 * Detect hex color violations in source content.
 *
 * @param {string} content - Source file content (line-separated text).
 * @param {Object} [options]
 * @param {RegExp} [options.pattern=/#[0-9a-fA-F]{6}/] - Hex regex. Default matches
 *   6-digit hex only (the conservative write-time-gate default). Pass `HEX_PATTERN`
 *   from `hardcode-replacer/src/color-patterns` for the broader 3/4/6/8-digit batch
 *   variant.
 * @param {string[]} [options.filterKeywords=["var(--", "@theme", "primitive", "allow-hex"]]
 *   - If any of these substrings appear on a line containing a hex match, skip that
 *   line. The "allow-hex" entry is an intentional inline-comment escape hatch for
 *   author-acknowledged exceptions.
 * @param {boolean} [options.skipComments=true] - Skip lines starting with `//`, and
 *   contents of `/* ... *\/` blocks.
 * @param {number} [options.maxMatches=Infinity] - Stop scanning after N matches. The
 *   el-hook write-time gate uses 5 to avoid noisy block messages.
 * @returns {Array<{ line: number, content: string, match: string }>}
 *   `line` is 1-indexed; `content` is the line's text with trailing whitespace trimmed;
 *   `match` is the matched hex substring.
 */
function detectHexViolations(content, options = {}) {
  const pattern = options.pattern ?? DEFAULT_HEX_PATTERN;
  const filterKeywords = options.filterKeywords ?? DEFAULT_FILTER_KEYWORDS;
  const skipComments = options.skipComments ?? true;
  const maxMatches = options.maxMatches ?? Number.POSITIVE_INFINITY;

  const lines = String(content).split("\n");
  const matches = [];
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    if (matches.length >= maxMatches) break;

    const line = lines[i];
    const trimmed = line.trim();

    if (skipComments) {
      if (inBlockComment) {
        if (trimmed.includes("*/")) inBlockComment = false;
        continue;
      }
      if (trimmed.startsWith("/*") && !trimmed.includes("*/")) {
        inBlockComment = true;
        continue;
      }
      // Same-line /* ... */ block — skip the whole line. The rare case where
      // code follows the closing */ on the same line (`/* x */ color: #fff;`)
      // is accepted as a false negative; tightening it would mean re-scanning
      // the post-`*/` substring with the same comment/keyword rules.
      if (trimmed.startsWith("/*") && trimmed.includes("*/")) continue;
      if (trimmed.startsWith("//")) continue;
    }

    const hexMatch = line.match(pattern);
    if (!hexMatch) continue;

    if (filterKeywords.some((kw) => line.includes(kw))) continue;

    matches.push({
      line: i + 1,
      content: line.trimEnd(),
      match: hexMatch[0],
    });
  }

  return matches;
}

/**
 * Default exemption check for paths that legitimately contain raw hex
 * (token source files, fixture/test files, generated registries, tailwind config).
 * Callers may extend with their own path patterns; this is the conservative baseline.
 *
 * @param {string} filePath
 * @param {Object} [options]
 * @param {string[]} [options.extraFragments=[]] - Additional substrings to treat as
 *   exempt-on-match.
 * @returns {boolean}
 */
function isHexExemptPath(filePath, options = {}) {
  const extra = options.extraFragments ?? [];
  const path = String(filePath);
  if (DEFAULT_EXEMPT_PATH_FRAGMENTS.some((f) => path.includes(f))) return true;
  if (extra.some((f) => path.includes(f))) return true;
  return false;
}

module.exports = {
  detectHexViolations,
  isHexExemptPath,
  DEFAULT_HEX_PATTERN,
  DEFAULT_FILTER_KEYWORDS,
  DEFAULT_EXEMPT_PATH_FRAGMENTS,
};
