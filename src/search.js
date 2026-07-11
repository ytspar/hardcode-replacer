const { execFileSync } = require("node:child_process");
const { DEFAULT_FILE_TYPES } = require("./color-patterns");

const GREP_LINE_RE = /^(.+?):(\d+):(.*)$/;

// Child-process stdout buffer cap. ripgrep's `--json` output is verbose (one
// JSON object per submatch), so a whole-monorepo scan of a common marker can
// run to hundreds of MB. The old 50MB cap silently overflowed on large trees:
// execFileSync throws ERR_CHILD_PROCESS_STDIO_MAXBUFFER, whose error carries
// no `.status`, so it fell through the `err.status` checks to a `return []` —
// a scan that found everything reported as finding NOTHING (a hollow result;
// the exact trap that made `duplicate-literals` scan zero files on a large
// repo). Raised here as defense, and — crucially — overflow now THROWS loudly
// (see the catch blocks) instead of returning []. For pure file discovery,
// prefer `filesOnly` (below), which emits only filenames and never overflows.
const MAX_STDOUT_BUFFER = 256 * 1024 * 1024;

/**
 * True when `err` is the Node child-process stdout-overflow error. Such an
 * error has no `.status` (it's not a non-zero exit), so it must be recognised
 * explicitly — otherwise it masquerades as "no matches" and silently zeroes a
 * scan.
 */
function isMaxBufferError(err) {
  return err && (err.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" || /maxBuffer/i.test(err.message || ""));
}

/** Newline-separated `rg -l` / `grep -rl` output → discovery rows (file only). */
function parseFilesList(output) {
  return output
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .map((file) => ({ file, line: 0, column: 0, match: "", text: "" }));
}

// Check if ripgrep is available (memoized)
let _hasRipgrep = null;
function hasRipgrep() {
  if (_hasRipgrep !== null) {
    return _hasRipgrep;
  }
  try {
    execFileSync("rg", ["--version"], { stdio: "pipe" });
    _hasRipgrep = true;
  } catch {
    _hasRipgrep = false;
  }
  return _hasRipgrep;
}

/**
 * Search files using ripgrep for a given regex pattern.
 * Returns array of { file, line, column, text, match } objects.
 *
 * Uses execFileSync (no shell) to avoid command injection.
 */
function searchWithRipgrep(pattern, paths, options = {}) {
  const args = [];

  // filesOnly: emit only the names of files that contain a match (`-l`), not
  // per-match JSON. Discovery callers (which only need the file set) use this
  // to stay bounded on huge trees; the output is one path per line.
  const filesOnly = options.filesOnly === true;
  if (filesOnly) {
    args.push("-l");
  } else {
    // Output format: JSON for structured parsing
    args.push("--json");
  }

  // Case insensitive by default for color matching
  if (options.caseSensitive !== true) {
    args.push("-i");
  }

  // File type filtering
  if (options.include) {
    args.push("--glob", options.include);
  } else {
    // Default to web file types
    for (const ext of DEFAULT_FILE_TYPES) {
      args.push("--glob", `**/*.${ext}`);
    }
  }

  if (options.exclude) {
    const excludes = Array.isArray(options.exclude)
      ? options.exclude
      : [options.exclude];
    for (const exc of excludes) {
      args.push("--glob", `!${exc}`);
    }
  }

  // Always exclude common non-source directories
  args.push("--glob", "!node_modules/**");
  args.push("--glob", "!.git/**");
  args.push("--glob", "!dist/**");
  args.push("--glob", "!build/**");
  args.push("--glob", "!coverage/**");
  args.push("--glob", "!.next/**");
  args.push("--glob", "!*.min.js");
  args.push("--glob", "!*.min.css");
  args.push("--glob", "!*.map");
  args.push("--glob", "!package-lock.json");
  args.push("--glob", "!yarn.lock");
  args.push("--glob", "!pnpm-lock.yaml");
  args.push("--glob", "!bun.lockb");

  // Add the pattern
  args.push("-e", pattern);

  // Add search paths
  const searchPaths = paths.length > 0 ? paths : ["."];
  args.push(...searchPaths);

  try {
    const result = execFileSync("rg", args, {
      encoding: "utf-8",
      maxBuffer: MAX_STDOUT_BUFFER,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return filesOnly ? parseFilesList(result) : parseRipgrepJson(result);
  } catch (err) {
    // ripgrep exits with code 1 when no matches found — a real empty result.
    if (err.status === 1) {
      return [];
    }
    // Exit code 2 means a ripgrep error (bad glob, unreadable path, …).
    if (err.status === 2) {
      throw new Error(`ripgrep error: ${err.stderr || err.message}`);
    }
    // Output overflowed the buffer: DO NOT silently return [] (that would
    // report a scan that found matches as finding none). Fail loudly with an
    // actionable hint.
    if (isMaxBufferError(err)) {
      throw new Error(
        `ripgrep output exceeded the ${Math.round(MAX_STDOUT_BUFFER / (1024 * 1024))}MB buffer for pattern ${JSON.stringify(
          pattern,
        )}. Narrow the search paths, or pass { filesOnly: true } for discovery.`,
      );
    }
    // Any other unexpected failure is surfaced, never swallowed.
    throw new Error(`ripgrep failed: ${err.stderr || err.message}`);
  }
}

/**
 * Parse ripgrep JSON output into structured results.
 */
function parseRipgrepJson(output) {
  const results = [];
  const lines = output.trim().split("\n").filter(Boolean);

  for (const line of lines) {
    try {
      const data = JSON.parse(line);
      if (data.type === "match") {
        const d = data.data;
        const file = d.path?.text || "";
        const lineNum = d.line_number;
        const text = d.lines?.text?.trimEnd() || "";

        // Extract each submatch
        for (const sub of d.submatches || []) {
          results.push({
            file,
            line: lineNum,
            column: sub.start + 1, // 1-indexed
            match: sub.match?.text || "",
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
  const searchPaths = paths.length > 0 ? paths : ["."];
  // filesOnly → `-rl` (recurse, list files only); otherwise `-rn` (with line
  // numbers) for full match rows.
  const filesOnly = options.filesOnly === true;
  const args = filesOnly ? ["-rlE"] : ["-rnE"];

  if (options.caseSensitive !== true) {
    args.push("-i");
  }

  // Build include patterns
  const fileTypes = options.fileTypes || DEFAULT_FILE_TYPES;
  for (const ext of fileTypes) {
    args.push("--include", `*.${ext}`);
  }

  args.push(
    "--exclude-dir=node_modules",
    "--exclude-dir=.git",
    "--exclude-dir=dist",
    "--exclude-dir=build",
    "--exclude-dir=coverage",
    "--exclude-dir=.next"
  );

  args.push(pattern);
  args.push(...searchPaths);

  try {
    const result = execFileSync("grep", args, {
      encoding: "utf-8",
      maxBuffer: MAX_STDOUT_BUFFER,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return filesOnly ? parseFilesList(result) : parseGrepOutput(result);
  } catch (err) {
    // grep exits 1 when there are no matches — a real empty result.
    if (err.status === 1) {
      return [];
    }
    if (isMaxBufferError(err)) {
      throw new Error(
        `grep output exceeded the ${Math.round(MAX_STDOUT_BUFFER / (1024 * 1024))}MB buffer for pattern ${JSON.stringify(
          pattern,
        )}. Narrow the search paths, or pass { filesOnly: true } for discovery.`,
      );
    }
    throw new Error(`grep error: ${err.stderr || err.message}`);
  }
}

/**
 * Parse grep output (file:line:text) into structured results.
 */
function parseGrepOutput(output) {
  const results = [];
  const lines = output.trim().split("\n").filter(Boolean);

  for (const line of lines) {
    const match = line.match(GREP_LINE_RE);
    if (match) {
      results.push({
        file: match[1],
        line: Number.parseInt(match[2], 10),
        column: 1,
        match: "",
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

module.exports = { search, isMaxBufferError, parseFilesList, MAX_STDOUT_BUFFER };
