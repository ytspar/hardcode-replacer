'use strict';

const { Command } = require('commander');
const { findColors } = require('./commands/find-colors');
const { findTailwind } = require('./commands/find-tailwind');
const { compareVars } = require('./commands/compare-vars');
const { findPatterns } = require('./commands/find-patterns');

// Helper for repeatable options (--exclude can be used multiple times)
function collect(val, arr) {
  arr.push(val);
  return arr;
}

const program = new Command();

program
  .name('hardcode-replacer')
  .description('Find hardcoded colors, Tailwind classes, and extractable patterns in codebases.\nDesigned for efficient use by Claude and other AI coding assistants.')
  .version('1.0.0');

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
    findColors(paths, opts);
  });

// === tailwind command ===
program
  .command('tailwind')
  .description('Find Tailwind CSS color utility classes (bg-red-500, text-blue-300, etc.)')
  .argument('[paths...]', 'Paths to search (files or directories)', ['.'])
  .option('--include <glob>', 'File glob pattern to include')
  .option('--exclude <glob...>', 'File glob patterns to exclude (repeatable)', collect, [])
  .option('--format <format>', 'Output format: text or json', 'text')
  .action((paths, opts) => {
    findTailwind(paths, opts);
  });

// === compare command ===
program
  .command('compare')
  .description('Compare found colors against a global variables/theme file')
  .argument('[paths...]', 'Paths to search for hardcoded colors', ['.'])
  .requiredOption('--vars <file>', 'Path to variables file (CSS, JSON, JS, or TS)')
  .option('--threshold <number>', 'Color distance threshold for close matches (delta-E)', '10')
  .option('--include <glob>', 'File glob pattern to include')
  .option('--exclude <glob...>', 'File glob patterns to exclude (repeatable)', collect, [])
  .option('--format <format>', 'Output format: text or json', 'text')
  .action((paths, opts) => {
    compareVars(paths, opts);
  });

// === patterns command ===
program
  .command('patterns')
  .description('Find repeated className patterns that could be extracted into shared variables')
  .argument('[paths...]', 'Paths to search (files or directories)', ['.'])
  .option('--min-count <number>', 'Minimum occurrences to report', '2')
  .option('--min-classes <number>', 'Minimum classes in a pattern to report', '2')
  .option('--include <glob>', 'File glob pattern to include')
  .option('--exclude <glob...>', 'File glob patterns to exclude (repeatable)', collect, [])
  .option('--format <format>', 'Output format: text or json', 'text')
  .action((paths, opts) => {
    findPatterns(paths, opts);
  });

program.parse();
