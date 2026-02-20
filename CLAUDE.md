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
Supports both legacy `rgba(255, 0, 0, 0.5)` and modern `rgb(255 0 0 / 50%)` syntax.

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
Detects Tailwind v4 `@theme` and `@utility` directives.
Can compare arbitrary values (e.g., `bg-[#10b981]`) against a theme palette.

**Options:**
- `--vars <file>` — compare arbitrary values against a palette file
- `--threshold <n>` — delta-E distance for arbitrary value matching (default: 10)

**Examples:**
```bash
hardcode-replacer tailwind src/
hardcode-replacer tailwind src/ --vars styles/variables.css
hardcode-replacer tailwind src/components/ --format json
```

### 3. Compare colors against variables file
```bash
hardcode-replacer compare [paths...] --vars <file> [options]
```
Compares discovered colors against a global theme/variables file. Reports exact matches (replace with variable), close matches (likely deviations), and unmatched colors (need new variables or are off-spec).

Features:
- **Semantic matching**: Prefers variables whose names match the CSS property context (e.g., `--border-*` for border-color)
- **color-mix() suggestions**: For rgba/hsla values with alpha, suggests `color-mix(in srgb, var(--name) X%, transparent)`
- **Variable name suggestions**: For unmatched colors, suggests descriptive variable names based on hue and context
- **Auto-fix mode**: `--fix` applies exact matches automatically
- **Baseline/diff mode**: Save results and compare against baselines to find regressions

Supports CSS custom properties, JSON, and JS/TS theme files.

**Options:**
- `--vars <file>` — **(required)** path to variables file
- `--threshold <n>` — delta-E distance for "close" match (default: 10)
- `--fix` — auto-replace exact matches with `var()` or `color-mix()` references
- `--baseline <file>` — save results to a baseline JSON file
- `--diff <file>` — compare against a baseline, show only new issues
- `--format json` — output as JSON

**Examples:**
```bash
hardcode-replacer compare src/ --vars styles/variables.css
hardcode-replacer compare src/ --vars theme.json --threshold 5 --format json
hardcode-replacer compare src/ --vars theme.css --fix
hardcode-replacer compare src/ --vars theme.css --baseline .hardcode-baseline.json
hardcode-replacer compare src/ --vars theme.css --diff .hardcode-baseline.json
```

### 4. Find repeated class patterns
```bash
hardcode-replacer patterns [paths...] [options]
```
Finds repeated `className` / `class` string patterns that could be extracted into CVA variants, `@apply` directives, or shared components.

Now also detects patterns inside `cn()`, `clsx()`, `twMerge()`, and `cva()` function calls.
Finds subset relationships between patterns (e.g., pattern A is a subset of pattern B).

**Options:**
- `--min-count <n>` — minimum occurrences to report (default: 2)
- `--min-classes <n>` — minimum classes in a pattern (default: 2)

**Examples:**
```bash
hardcode-replacer patterns src/
hardcode-replacer patterns src/ --min-count 3 --min-classes 3 --format json
```

## Config File

Create `.hardcode-replacerrc.json` in your project root for default settings:

```json
{
  "exclude": ["**/*.test.*", "**/*.stories.*"],
  "include": "*.{tsx,jsx}",
  "vars": "src/styles/variables.css",
  "threshold": 10,
  "named": true,
  "minCount": 2,
  "minClasses": 3,
  "tailwindVersion": 4
}
```

Also supports `.hardcode-replacerrc` (JSON) and `hardcode-replacer.config.js` (CommonJS).

CLI options override config file values.

## Output Formats

- **text** (default): Human/Claude-readable format with file paths, line numbers, and context
- **json**: Structured JSON output for programmatic consumption

## Context Classification

The tool automatically classifies each found color to separate actionable from non-actionable results:

| Context | Label | Meaning |
|---------|-------|---------|
| `actionable` | ACTIONABLE | Can be replaced with var() |
| `css-definition` | CSS VAR DEFINITION | This IS a CSS variable definition |
| `theme-definition` | THEME DEFINITION | In a theme/token definition file |
| `canvas` | CANVAS/WEBGL | In a canvas/WebGL context (can't use var()) |
| `mapping` | MAPPING/LOOKUP | Used as a lookup key or mapping value |
| `generated` | GENERATED CODE | In generated/template code |
| `meta` | META/MANIFEST | Meta tags, manifest, OG images (browser-level) |
| `effect` | EFFECT | Pure black/white with alpha in effects |

## Usage with Claude

This tool is designed for Claude to invoke via bash to efficiently scan codebases. Typical workflow:

1. Run `hardcode-replacer colors src/` to find all hardcoded colors
2. Run `hardcode-replacer compare src/ --vars path/to/theme.css` to check against known variables
3. Use `--fix` to auto-replace exact matches, or use the output to manually replace
4. Run `hardcode-replacer tailwind src/ --vars path/to/theme.css` to find Tailwind color classes and arbitrary values matching the theme
5. Run `hardcode-replacer patterns src/` to find repeated class patterns for extraction

The `--format json` flag produces structured output suitable for further processing.

## Architecture

- `src/cli.js` — Commander setup with all commands and options
- `src/config.js` — Config file loader (.hardcode-replacerrc)
- `src/search.js` — ripgrep/grep wrapper (uses `execFileSync`, no shell injection risk)
- `src/color-patterns.js` — regex patterns for all color formats (legacy + modern syntax)
- `src/css-named-colors.js` — all 148 CSS named colors
- `src/color-utils.js` — color parsing, conversion, CIE76 delta-E distance, alpha extraction, color-mix suggestions, variable name suggestions
- `src/tailwind-colors.js` — Tailwind color names, prefixes, pattern builders, v4 detection
- `src/context-classifier.js` — context classification (actionable vs non-actionable), multi-line comment detection
- `src/commands/` — individual command handlers
