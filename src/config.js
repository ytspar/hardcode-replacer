'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_FILES = [
  '.hardcode-replacerrc.json',
  '.hardcode-replacerrc',
  'hardcode-replacer.config.js',
  'hardcode-replacer.config.cjs',
];

/**
 * Load project config from the nearest config file.
 * Searches from the given directory upward to the filesystem root.
 *
 * Config file format (JSON):
 * {
 *   "exclude": ["**\/*.test.*", "**\/*.stories.*"],
 *   "include": "*.{tsx,jsx}",
 *   "vars": "src/styles/variables.css",
 *   "threshold": 10,
 *   "named": true,
 *   "minCount": 2,
 *   "minClasses": 3,
 *   "tailwindVersion": 4
 * }
 */
function loadConfig(startDir) {
  const dir = path.resolve(startDir || '.');
  const config = findConfigFile(dir);
  return config || {};
}

function findConfigFile(dir) {
  let current = dir;

  while (true) {
    for (const filename of CONFIG_FILES) {
      const filepath = path.join(current, filename);
      if (fs.existsSync(filepath)) {
        return parseConfigFile(filepath);
      }
    }

    const parent = path.dirname(current);
    if (parent === current) break; // reached root
    current = parent;
  }

  return null;
}

function parseConfigFile(filepath) {
  const ext = path.extname(filepath).toLowerCase();

  if (ext === '.js' || ext === '.cjs') {
    try {
      return require(filepath);
    } catch {
      return null;
    }
  }

  // JSON or .hardcode-replacerrc (treat as JSON)
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Merge CLI options with config file settings.
 * CLI options take precedence over config file values.
 */
function mergeOptions(cliOpts, config) {
  const merged = { ...cliOpts };

  // Only apply config values when CLI didn't set them
  if (config.exclude && (!merged.exclude || merged.exclude.length === 0)) {
    merged.exclude = Array.isArray(config.exclude) ? config.exclude : [config.exclude];
  }
  if (config.include && !merged.include) {
    merged.include = config.include;
  }
  if (config.vars && !merged.vars) {
    merged.vars = config.vars;
  }
  if (config.threshold != null && merged.threshold === '10') {
    merged.threshold = String(config.threshold);
  }
  if (config.named === false && merged.named !== false) {
    merged.named = false;
  }
  if (config.minCount && merged.minCount === '2') {
    merged.minCount = String(config.minCount);
  }
  if (config.minClasses && merged.minClasses === '2') {
    merged.minClasses = String(config.minClasses);
  }
  if (config.tailwindVersion) {
    merged.tailwindVersion = config.tailwindVersion;
  }

  return merged;
}

module.exports = { loadConfig, mergeOptions };
