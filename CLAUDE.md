# hardcode-replacer

CLI tool for finding hardcoded colors, Tailwind color classes, and extractable class patterns in Node.js/web codebases.

## Installation

```bash
npm install
npm link  # makes 'hardcode-replacer' available globally
```

Requires: Node.js >= 18, ripgrep (`rg`) recommended for best performance (falls back to grep).

## Commands

### 1. Find hardcoded colors
```bash
hardcode-replacer colors [paths...] [options]
```
Finds hex, rgb, rgba, hsl, hsla, oklch, oklab, lch, lab, hwb, color(), and CSS named colors.

**Options:**
- `--include <glob>` — file pattern to include (e.g., `"*.tsx"`)
- `--exclude <glob>` — file pattern to exclude (e.g., `"**/*.test.*"`)
- `--format json` — output as JSON instead of text
- `--no-named` — skip named color detection

**Examples:**
```bash
hardcode-replacer colors src/
hardcode-replacer colors src/components/ --format json
hardcode-replacer colors src/ --exclude "**/*.test.*" --no-named
```

### 2. Find Tailwind color classes
```bash
hardcode-replacer tailwind [paths...] [options]
```
Finds Tailwind color utility classes like `bg-red-500`, `text-blue-300/50`, `border-[#ff0000]`.

**Examples:**
```bash
hardcode-replacer tailwind src/
hardcode-replacer tailwind src/components/ --format json
```

### 3. Compare colors against variables file
```bash
hardcode-replacer compare [paths...] --vars <file> [options]
```
Compares discovered colors against a global theme/variables file. Reports exact matches (replace with variable), close matches (likely deviations), and unmatched colors (need new variables or are off-spec).

Supports CSS custom properties, JSON, and JS/TS theme files.

**Options:**
- `--vars <file>` — **(required)** path to variables file
- `--threshold <n>` — delta-E distance for "close" match (default: 10)

**Examples:**
```bash
hardcode-replacer compare src/ --vars styles/variables.css
hardcode-replacer compare src/ --vars theme.json --threshold 5 --format json
```

### 4. Find repeated class patterns
```bash
hardcode-replacer patterns [paths...] [options]
```
Finds repeated `className` / `class` string patterns that could be extracted into CVA variants, `@apply` directives, or shared components.

**Options:**
- `--min-count <n>` — minimum occurrences to report (default: 2)
- `--min-classes <n>` — minimum classes in a pattern (default: 2)

**Examples:**
```bash
hardcode-replacer patterns src/
hardcode-replacer patterns src/ --min-count 3 --min-classes 3 --format json
```

## Output Formats

- **text** (default): Human/Claude-readable format with file paths, line numbers, and context
- **json**: Structured JSON output for programmatic consumption

## Usage with Claude

This tool is designed for Claude to invoke via bash to efficiently scan codebases. Typical workflow:

1. Run `hardcode-replacer colors src/` to find all hardcoded colors
2. Run `hardcode-replacer compare src/ --vars path/to/theme.css` to check against known variables
3. Use the output to systematically replace hardcoded values with variable references
4. Run `hardcode-replacer patterns src/` to find repeated class patterns for extraction

The `--format json` flag produces structured output suitable for further processing.

## Architecture

- `src/search.js` — ripgrep/grep wrapper (uses `execFileSync`, no shell injection risk)
- `src/color-patterns.js` — regex patterns for all color formats
- `src/css-named-colors.js` — all 148 CSS named colors
- `src/color-utils.js` — color parsing, conversion (hex/rgb/hsl), CIE76 delta-E distance
- `src/tailwind-colors.js` — Tailwind color names, prefixes, and pattern builders
- `src/commands/` — individual command handlers
