'use strict';

const { Command } = require('commander');
const { findColors } = require('./commands/find-colors');
const { findTailwind } = require('./commands/find-tailwind');
const { compareVars } = require('./commands/compare-vars');
const { findPatterns } = require('./commands/find-patterns');
const { loadConfig, mergeOptions } = require('./config');

// Helper for repeatable options (--exclude can be used multiple times)
function collect(val, arr) {
  arr.push(val);
  return arr;
}

const program = new Command();

program
  .name('hardcode-replacer')
  .description(
    'Find and fix hardcoded colors, Tailwind color classes, and repeated class patterns.\n\n'
    + 'Scans web codebases for hardcoded color values, compares them against your\n'
    + 'design token palette, classifies each result by context (actionable vs theme\n'
    + 'definition vs canvas fallback), and generates exact replacement code.\n\n'
    + 'Commands:\n'
    + '  colors    Find all hardcoded color values (hex, rgb, hsl, oklch, named)\n'
    + '  compare   Compare found colors against a variables file, get replacements\n'
    + '  tailwind  Find Tailwind color utility classes and arbitrary values\n'
    + '  patterns  Find repeated className/cn()/clsx() patterns for extraction\n\n'
    + 'Quick start:\n'
    + '  $ hardcode-replacer colors src/\n'
    + '  $ hardcode-replacer compare src/ --vars styles/variables.css\n'
    + '  $ hardcode-replacer compare src/ --vars styles/variables.css --fix\n\n'
    + 'Config: Place .hardcode-replacerrc.json in your project root for defaults.\n'
    + 'Docs:   https://github.com/ytspar/hardcode-replacer'
  )
  .version('2.0.0');

// === guide command ===
program
  .command('guide')
  .description('Show a detailed usage guide for humans and AI assistants')
  .action(() => {
    console.log(`
HARDCODE-REPLACER — Usage Guide
================================

PURPOSE
  Scan web codebases for hardcoded color values, compare them against your
  design token / CSS variable palette, and generate exact replacement code.
  Built for humans and AI coding assistants (Claude, Copilot, Cursor).

TYPICAL WORKFLOW
  1. Scan:      hardcode-replacer colors src/
  2. Compare:   hardcode-replacer compare src/ --vars styles/theme.css
  3. Auto-fix:  hardcode-replacer compare src/ --vars styles/theme.css --fix
  4. Baseline:  hardcode-replacer compare src/ --vars styles/theme.css --baseline .hcr-baseline.json
  5. Diff:      hardcode-replacer compare src/ --vars styles/theme.css --diff .hcr-baseline.json
  6. Tailwind:  hardcode-replacer tailwind src/ --vars styles/theme.css
  7. Patterns:  hardcode-replacer patterns src/ --min-count 3

CONTEXT CLASSIFICATION
  Every found color is classified into one of these categories:

  ACTIONABLE          — Can be replaced with var() or color-mix()
  CSS VAR DEFINITION  — This IS a CSS variable definition (skip)
  THEME DEFINITION    — In a theme/token file like theme.ts, palette.js
  CANVAS/WEBGL        — In a canvas context (three.js, d3, sharp, etc.)
  MAPPING/LOOKUP      — Used as an object key or lookup value
  GENERATED           — Template-generated code
  META/MANIFEST       — Browser-level meta tags (no CSS var support)
  EFFECT              — Pure black/white with alpha (intentional)

  Detection is automatic based on file imports, file paths, and line content.

COLOR MATCHING
  Colors are matched using CIE76 Delta-E perceptual distance:
    0      — Identical
    < 1    — Imperceptible
    1-2    — Close (same intended color)
    2-10   — Noticeable deviation
    > 10   — Different color

  Default threshold: 10. Use --threshold 5 for stricter matching.

REPLACEMENT SYNTAX
  Exact match (opaque):   var(--primary-500)
  Exact match (with alpha): color-mix(in srgb, var(--primary-500) 40%, transparent)
  Close match: Same as exact, but review the delta-E distance first
  Unmatched: A suggested variable name is provided (e.g., --color-red-700)

SUPPORTED FORMATS
  Color values:    hex, rgb, rgba, hsl, hsla, oklch, oklab, lch, lab, hwb, color(), named
  Modern syntax:   rgb(255 0 0 / 50%), hsl(360 100% 50% / 0.5)
  Variable files:  CSS custom properties, JSON (nested), JS/TS exports
  Class patterns:  className="...", class="...", cn(), clsx(), twMerge(), cva()

CONFIG FILE
  Create .hardcode-replacerrc.json in your project root:
  {
    "exclude": ["**/*.test.*"],
    "vars": "src/styles/variables.css",
    "threshold": 10
  }

FOR AI ASSISTANTS
  Use --format json for structured output. The JSON includes:
  - summary with counts by status and context
  - actionable results grouped by exact/close/unmatched
  - skipped results grouped by context
  - suggestion field with exact replacement code
  - nameSuggestion field for unmatched colors

  Example: hardcode-replacer compare src/ --vars theme.css --format json
`);
  });

// === colors command ===
program
  .command('colors')
  .description('Find hardcoded color values (hex, rgb, hsl, oklch, named, etc.)')
  .argument('[paths...]', 'Paths to search (files or directories)', ['.'])
  .option('--include <glob>', 'File glob pattern to include (e.g., "*.tsx")')
  .option('--exclude <glob...>', 'File glob patterns to exclude (repeatable)', collect, [])
  .option('--format <format>', 'Output format: text or json', 'text')
  .option('--no-named', 'Skip named CSS color detection (red, blue, etc.)')
  .action((paths, opts) => {
    const config = loadConfig(paths[0] || '.');
    findColors(paths, mergeOptions(opts, config));
  });

// === tailwind command ===
program
  .command('tailwind')
  .description('Find Tailwind CSS color classes and arbitrary color values')
  .argument('[paths...]', 'Paths to search (files or directories)', ['.'])
  .option('--include <glob>', 'File glob pattern to include')
  .option('--exclude <glob...>', 'File glob patterns to exclude (repeatable)', collect, [])
  .option('--format <format>', 'Output format: text or json', 'text')
  .option('--vars <file>', 'Compare arbitrary values (bg-[#hex]) against a palette')
  .option('--threshold <number>', 'Delta-E threshold for arbitrary value matching', '10')
  .action((paths, opts) => {
    const config = loadConfig(paths[0] || '.');
    findTailwind(paths, mergeOptions(opts, config));
  });

// === compare command ===
program
  .command('compare')
  .description('Compare colors against a variables file — get exact replacement code')
  .argument('[paths...]', 'Paths to search for hardcoded colors', ['.'])
  .requiredOption('--vars <file>', 'Path to variables file (CSS, JSON, JS, or TS)')
  .option('--threshold <number>', 'Delta-E threshold for "close" match (default: 10)', '10')
  .option('--include <glob>', 'File glob pattern to include')
  .option('--exclude <glob...>', 'File glob patterns to exclude (repeatable)', collect, [])
  .option('--format <format>', 'Output format: text or json', 'text')
  .option('--fix', 'Auto-replace exact matches with var() / color-mix()')
  .option('--baseline <file>', 'Save results to a baseline JSON file')
  .option('--diff <file>', 'Show only new issues vs a previous baseline')
  .action((paths, opts) => {
    const config = loadConfig(paths[0] || '.');
    compareVars(paths, mergeOptions(opts, config));
  });

// === patterns command ===
program
  .command('patterns')
  .description('Find repeated className/cn()/clsx() patterns for extraction')
  .argument('[paths...]', 'Paths to search (files or directories)', ['.'])
  .option('--min-count <number>', 'Minimum occurrences to report', '2')
  .option('--min-classes <number>', 'Minimum classes in a pattern to report', '2')
  .option('--include <glob>', 'File glob pattern to include')
  .option('--exclude <glob...>', 'File glob patterns to exclude (repeatable)', collect, [])
  .option('--format <format>', 'Output format: text or json', 'text')
  .action((paths, opts) => {
    const config = loadConfig(paths[0] || '.');
    findPatterns(paths, mergeOptions(opts, config));
  });

program.parse();
