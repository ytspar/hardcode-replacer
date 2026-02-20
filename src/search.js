'use strict';

const { execFileSync } = require('child_process');
const { DEFAULT_FILE_TYPES } = require('./color-patterns');

// Check if ripgrep is available
function hasRipgrep() {
  try {
    execFileSync('rg', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Search files using ripgrep for a given regex pattern.
 * Returns array of { file, line, column, text, match } objects.
 *
 * Uses execFileSync (no shell) to avoid command injection.
 */
function searchWithRipgrep(pattern, paths, options = {}) {
  const args = [];

  // Output format: JSON for structured parsing
  args.push('--json');

  // Case insensitive by default for color matching
  if (options.caseSensitive !== true) {
    args.push('-i');
  }

  // File type filtering
  if (options.include) {
    args.push('--glob', options.include);
  } else if (options.fileTypes) {
    for (const ext of options.fileTypes) {
      args.push('--glob', `**/*.${ext}`);
    }
  } else {
    // Default to web file types
    for (const ext of DEFAULT_FILE_TYPES) {
      args.push('--glob', `**/*.${ext}`);
    }
  }

  if (options.exclude) {
    const excludes = Array.isArray(options.exclude) ? options.exclude : [options.exclude];
    for (const exc of excludes) {
      args.push('--glob', `!${exc}`);
    }
  }

  // Always exclude common non-source directories
  args.push('--glob', '!node_modules/**');
  args.push('--glob', '!.git/**');
  args.push('--glob', '!dist/**');
  args.push('--glob', '!build/**');
  args.push('--glob', '!coverage/**');
  args.push('--glob', '!.next/**');
  args.push('--glob', '!*.min.js');
  args.push('--glob', '!*.min.css');
  args.push('--glob', '!*.map');
  args.push('--glob', '!package-lock.json');
  args.push('--glob', '!yarn.lock');
  args.push('--glob', '!pnpm-lock.yaml');
  args.push('--glob', '!bun.lockb');

  // Add the pattern
  args.push('-e', pattern);

  // Add search paths
  const searchPaths = paths.length > 0 ? paths : ['.'];
  args.push(...searchPaths);

  try {
    const result = execFileSync('rg', args, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return parseRipgrepJson(result);
  } catch (err) {
    // ripgrep exits with code 1 when no matches found
    if (err.status === 1) {
      return [];
    }
    // Exit code 2 means error
    if (err.status === 2) {
      throw new Error(`ripgrep error: ${err.stderr || err.message}`);
    }
    return [];
  }
}

/**
 * Parse ripgrep JSON output into structured results.
 */
function parseRipgrepJson(output) {
  const results = [];
  const lines = output.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    try {
      const data = JSON.parse(line);
      if (data.type === 'match') {
        const d = data.data;
        const file = d.path?.text || '';
        const lineNum = d.line_number;
        const text = d.lines?.text?.trimEnd() || '';

        // Extract each submatch
        for (const sub of d.submatches || []) {
          results.push({
            file,
            line: lineNum,
            column: sub.start + 1, // 1-indexed
            match: sub.match?.text || '',
            text,
          });
        }
      }
    } catch {
      // Skip malformed JSON lines
    }
  }

  return results;
}

/**
 * Search using grep as a fallback when ripgrep is not available.
 * Uses execFileSync (no shell) to avoid command injection.
 */
function searchWithGrep(pattern, paths, options = {}) {
  const searchPaths = paths.length > 0 ? paths : ['.'];
  const args = ['-rn', '-E'];

  if (options.caseSensitive !== true) {
    args.push('-i');
  }

  // Build include patterns
  const fileTypes = options.fileTypes || DEFAULT_FILE_TYPES;
  for (const ext of fileTypes) {
    args.push('--include', `*.${ext}`);
  }

  args.push(
    '--exclude-dir=node_modules',
    '--exclude-dir=.git',
    '--exclude-dir=dist',
    '--exclude-dir=build',
    '--exclude-dir=coverage',
    '--exclude-dir=.next',
  );

  args.push(pattern);
  args.push(...searchPaths);

  try {
    const result = execFileSync('grep', args, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return parseGrepOutput(result);
  } catch (err) {
    if (err.status === 1) return [];
    throw new Error(`grep error: ${err.stderr || err.message}`);
  }
}

/**
 * Parse grep output (file:line:text) into structured results.
 */
function parseGrepOutput(output) {
  const results = [];
  const lines = output.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(.+?):(\d+):(.*)$/);
    if (match) {
      results.push({
        file: match[1],
        line: parseInt(match[2], 10),
        column: 1,
        match: '',
        text: match[3],
      });
    }
  }

  return results;
}

/**
 * Main search function - uses ripgrep if available, falls back to grep.
 */
function search(pattern, paths = [], options = {}) {
  if (hasRipgrep()) {
    return searchWithRipgrep(pattern, paths, options);
  }
  return searchWithGrep(pattern, paths, options);
}

module.exports = { search };
