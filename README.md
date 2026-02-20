# hardcode-replacer

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![npm version](https://img.shields.io/badge/npm-v2.0.0-red.svg)](https://www.npmjs.com/package/hardcode-replacer)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/ytspar/hardcode-replacer/pulls)

**Find and fix hardcoded colors, Tailwind color classes, and repeated class patterns in web codebases.**

hardcode-replacer scans your project for hardcoded color values, compares them against your design token / CSS variable palette, and gives you exact replacement code. It understands context — it knows the difference between a color that needs replacing and one that's a theme definition, a canvas fallback, or an effect overlay.

Built for humans and AI coding assistants (Claude, Copilot, Cursor) to use together. Designed to save context window space with pre-classified, actionable output.

---

## Why?

Large web projects accumulate hardcoded colors everywhere — inline styles, CSS files, Tailwind arbitrary values, theme files. Replacing them manually means:

1. **Finding** every `#10b981`, `rgba(16, 185, 129, 0.4)`, and `bg-[#10b981]` across hundreds of files
2. **Knowing** which ones are actually replaceable (not canvas code, not theme definitions, not black/white effects)
3. **Matching** each color to the right CSS variable from your design system
4. **Writing** the correct replacement syntax (`var()`, `color-mix()`, etc.)

hardcode-replacer does all four in a single command.

---

## Quick Start

```bash
# Install
git clone https://github.com/ytspar/hardcode-replacer.git
cd hardcode-replacer
npm install
npm link

# Find all hardcoded colors
hardcode-replacer colors src/

# Compare against your design tokens
hardcode-replacer compare src/ --vars styles/variables.css

# Auto-fix exact matches
hardcode-replacer compare src/ --vars styles/variables.css --fix

# Find Tailwind color classes
hardcode-replacer tailwind src/

# Find repeated class patterns
hardcode-replacer patterns src/
```

---

## Commands

### `colors` — Find hardcoded color values

Scans for hex, rgb, rgba, hsl, hsla, oklch, oklab, lch, lab, hwb, `color()`, and CSS named colors. Supports both legacy (`rgba(255, 0, 0, 0.5)`) and modern (`rgb(255 0 0 / 50%)`) syntax.

```bash
hardcode-replacer colors [paths...] [options]
```

**Options:**

| Flag | Description |
|------|-------------|
| `--include <glob>` | File pattern to include (e.g., `"*.tsx"`) |
| `--exclude <glob>` | File pattern to exclude (repeatable) |
| `--format json` | Output as structured JSON |
| `--no-named` | Skip CSS named color detection |

**Example output:**

```
=== Hardcoded Colors ===
Found 669 hardcoded color values in 16 files
Actionable: 275 | Skipped: 394
Types: hex(493), rgba(162), rgb(11), named(1), oklch(2)

FILE: src/styles/theme-variables.css
  L504:17  rgba(128, 255, 192, 0.15)  (rgba -> #80ffc0)
    0px 0px 1px rgba(128, 255, 192, 0.15),

--- Skipped 394 non-actionable colors ---
  [CANVAS/WEBGL] 50 colors in 4 files
  [THEME DEFINITION] 75 colors in 4 files
  [CSS VAR DEFINITION] 207 colors in 3 files
  [EFFECT (black/white alpha)] 21 colors in 2 files
```

### `compare` — Compare colors against your palette

The core command. Compares every discovered color against a variables file and produces exact replacement code.

```bash
hardcode-replacer compare [paths...] --vars <file> [options]
```

**Options:**

| Flag | Description |
|------|-------------|
| `--vars <file>` | **(Required)** Path to CSS, JSON, JS, or TS variables file |
| `--threshold <n>` | Delta-E distance for "close" match (default: 10) |
| `--fix` | Auto-replace exact matches with `var()` / `color-mix()` |
| `--baseline <file>` | Save results to a baseline JSON file |
| `--diff <file>` | Compare against baseline, show only new issues |
| `--include <glob>` | File pattern to include |
| `--exclude <glob>` | File pattern to exclude (repeatable) |
| `--format json` | Output as structured JSON |

**Features:**

- **Semantic matching** — When multiple variables match the same hex value, prefers variables whose name matches the CSS property context (e.g., `border-color: #10b981` prefers `--border-accent-strong` over `--bg-success`)
- **color-mix() suggestions** — For rgba/hsla values with alpha, suggests `color-mix(in srgb, var(--name) X%, transparent)`
- **Variable name suggestions** — For unmatched colors, suggests descriptive names based on hue and context (e.g., `[suggest: --color-red-700]`)
- **Auto-fix** — `--fix` writes the replacements directly to files
- **Baseline/diff** — Track progress across refactoring sessions

**Example output:**

```
=== Color Variable Comparison ===
Palette: 124 variables from theme-variables.css
Actionable: 42 exact | 83 close | 150 unmatched

--- ACTIONABLE EXACT MATCHES (42) ---
  src/utils/colors.ts:34:11  #6b7280 -> --gray-500 (#6b7280) | replace: var(--gray-500)
  src/utils/colors.ts:37:11  #1f2937 -> --bg-nav (#1f2937) | replace: var(--bg-nav)

--- ACTIONABLE CLOSE MATCHES (83) ---
  src/utils/colors.ts:22:11  #475569 -> use --variant-muted-border (#4b5563, dE=3.9) | replace: var(--variant-muted-border)

--- ACTIONABLE UNMATCHED (150) ---
  src/tailwind.css:170:54  rgb(199 14 14 / 49%) -> #c70e0e (nearest: --status-negative dE=17.78) [suggest: --color-red-500]
```

**Supported variable file formats:**

| Format | Example |
|--------|---------|
| CSS custom properties | `--primary-500: #10b981;` |
| JSON (flat or nested) | `{ "primary": { "500": "#10b981" } }` |
| JS/TS exports | `primary500: '#10b981'` |

### `tailwind` — Find Tailwind color classes

Finds Tailwind color utility classes and optionally checks arbitrary values against your theme.

```bash
hardcode-replacer tailwind [paths...] [options]
```

**Options:**

| Flag | Description |
|------|-------------|
| `--vars <file>` | Compare arbitrary values (e.g., `bg-[#10b981]`) against a palette |
| `--threshold <n>` | Delta-E distance for arbitrary value matching (default: 10) |
| `--include <glob>` | File pattern to include |
| `--exclude <glob>` | File pattern to exclude (repeatable) |
| `--format json` | Output as structured JSON |

Detects Tailwind v4 `@theme` and `@utility` directives automatically.

**Example output:**

```
=== Tailwind Color Classes ===
Found 964 Tailwind color classes in 75 files
Arbitrary values: 791

--- ARBITRARY VALUES MATCHING THEME (3) ---
  src/Button.tsx:12:5  bg-[#10b981] -> EXACT: --border-accent-strong (#10b981)
    Use var(--border-accent-strong) or a Tailwind theme color instead of #10b981
```

### `patterns` — Find repeated class patterns

Finds repeated `className` / `class` strings and `cn()` / `clsx()` / `twMerge()` / `cva()` calls that could be extracted.

```bash
hardcode-replacer patterns [paths...] [options]
```

**Options:**

| Flag | Description |
|------|-------------|
| `--min-count <n>` | Minimum occurrences to report (default: 2) |
| `--min-classes <n>` | Minimum classes in a pattern (default: 2) |
| `--include <glob>` | File pattern to include |
| `--exclude <glob>` | File pattern to exclude (repeatable) |
| `--format json` | Output as structured JSON |

**Example output:**

```
=== Repeated Class Patterns ===
Found 9 repeated patterns across 36 locations

1. "font-bold leading-none ml-2 px-2 text-[10px] tracking-widest uppercase"
   Classes: 9 | Occurrences: 4 | Impact score: 36
   Sources: className, cn/clsx
   Consider: CVA variant, @apply directive, or component extraction

--- Frequently Co-occurring Class Pairs ---
  "flex items-center" (53 co-occurrences)
  "font-mono text-xs" (25 co-occurrences)
```

---

## Context Classification

The tool classifies every found color to separate actionable results from noise. This is what makes it practical for large codebases.

| Context | What it means | Example |
|---------|--------------|---------|
| **ACTIONABLE** | Can be replaced with `var()` | `color: #10b981;` in a component |
| **CSS VAR DEFINITION** | This IS a variable definition | `--primary: #10b981;` |
| **THEME DEFINITION** | In a theme/token file | `colors.ts`, `theme.tsx`, `palette.js` |
| **CANVAS/WEBGL** | In a canvas context (no CSS vars) | Files importing `three`, `d3`, `sharp` |
| **MAPPING/LOOKUP** | Used as a lookup key | `'#10b981': 'success'` |
| **GENERATED** | Template-generated code | `` `<div style="${color}">` `` |
| **META/MANIFEST** | Browser-level (no CSS) | `<meta name="theme-color" content="#10b981">` |
| **EFFECT** | Intentional black/white + alpha | `rgba(0,0,0,0.4)` in shadows/overlays |

Detection is automatic based on:
- **File-level analysis**: Imports (three.js, d3, sharp), file path patterns (theme/, colors.ts), content patterns (createTheme, getCssVar)
- **Line-level heuristics**: CSS variable definitions, object key positions, template literals, meta tags
- **Multi-line comment detection**: Tracks `/* ... */` block comment ranges

---

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

CLI options always override config file values.

---

## Workflow: Using with AI Coding Assistants

hardcode-replacer is designed to be called by Claude, Copilot, or Cursor via bash. A typical refactoring session:

```bash
# Step 1: Scan the codebase
hardcode-replacer compare src/ --vars styles/variables.css --format json

# Step 2: Auto-fix the easy wins (exact matches)
hardcode-replacer compare src/ --vars styles/variables.css --fix

# Step 3: Save a baseline for tracking progress
hardcode-replacer compare src/ --vars styles/variables.css --baseline .hardcode-baseline.json

# Step 4: After manual fixes, check what's left
hardcode-replacer compare src/ --vars styles/variables.css --diff .hardcode-baseline.json

# Step 5: Find Tailwind classes using hardcoded colors
hardcode-replacer tailwind src/ --vars styles/variables.css

# Step 6: Find class patterns to extract into components
hardcode-replacer patterns src/ --min-count 3 --min-classes 3
```

The `--format json` flag produces structured output suitable for programmatic consumption by AI tools. The text format is optimized for humans and for pasting into chat.

---

## Workflow: Using as a Human Developer

```bash
# Quick scan: what's the damage?
hardcode-replacer colors src/

# How many match our theme?
hardcode-replacer compare src/ --vars styles/theme.css

# Fix all exact matches automatically
hardcode-replacer compare src/ --vars styles/theme.css --fix

# Review the close matches (might need design decisions)
hardcode-replacer compare src/ --vars styles/theme.css --threshold 5

# Find repeated Tailwind patterns for extraction
hardcode-replacer patterns src/ --min-count 3
```

---

## Color Matching

Colors are matched using **CIE76 Delta-E** perceptual distance:

| Delta-E | Perception |
|---------|-----------|
| 0 | Identical |
| < 1 | Imperceptible difference |
| 1-2 | Close — probably the same intended color |
| 2-10 | Noticeable — likely a deviation from the palette |
| > 10 | Different color |

The default threshold of `10` catches colors that are "in the neighborhood" of a palette color but clearly deviant. Lower it to `5` for stricter matching.

---

## Supported Color Formats

| Format | Example | Parsed? |
|--------|---------|---------|
| Hex (3/4/6/8 digit) | `#fff`, `#10b981`, `#10b98180` | Yes |
| RGB (legacy) | `rgb(16, 185, 129)` | Yes |
| RGBA (legacy) | `rgba(16, 185, 129, 0.5)` | Yes |
| RGB (modern) | `rgb(16 185 129)` | Yes |
| RGB (modern + alpha) | `rgb(16 185 129 / 50%)` | Yes |
| HSL (legacy) | `hsl(160, 84%, 39%)` | Yes |
| HSLA (legacy) | `hsla(160, 84%, 39%, 0.5)` | Yes |
| HSL (modern) | `hsl(160 84% 39%)` | Yes |
| HSL (modern + alpha) | `hsl(160 84% 39% / 50%)` | Yes |
| OKLCH | `oklch(0.88 0.05 143)` | Detected |
| OKLAB | `oklab(0.88 0.05 0.02)` | Detected |
| LCH / LAB / HWB | `lch(...)`, `lab(...)`, `hwb(...)` | Detected |
| CSS `color()` | `color(srgb 0.1 0.7 0.5)` | Detected |
| CSS named colors | `red`, `cornflowerblue` | Yes (148 colors) |

"Detected" means the value is found and reported but not yet converted to hex for palette matching. Hex/RGB/HSL/named are fully parsed and matched.

---

## Architecture

```
src/
  cli.js                    Commander setup, all commands and options
  config.js                 Config file loader (.hardcode-replacerrc)
  search.js                 Ripgrep/grep wrapper (execFileSync, no shell)
  color-patterns.js         Regex patterns for all color formats
  color-utils.js            Parsing, conversion, Delta-E, alpha, suggestions
  css-named-colors.js       All 148 CSS named colors
  tailwind-colors.js        Tailwind names, prefixes, v4 detection
  context-classifier.js     Context classification engine
  commands/
    find-colors.js          `colors` command
    find-tailwind.js        `tailwind` command
    compare-vars.js         `compare` command (+ fix, baseline, diff)
    find-patterns.js        `patterns` command
```

**Search**: Uses [ripgrep](https://github.com/BurntSushi/ripgrep) (`rg --json`) for fast structured search with grep fallback. All external commands use `execFileSync` (no shell) to prevent command injection.

**Classification**: File-level analysis is cached per-file. Import scanning checks the first 100 lines for canvas/WebGL library imports. Block comment ranges are computed once per file.

---

## Requirements

- **Node.js >= 18**
- **ripgrep** (`rg`) — recommended for performance, falls back to grep
- **No other dependencies** — only `commander` for CLI parsing

---

## Contributing

PRs welcome! If you find false positives or missed patterns, please open an issue with:
1. The color value that was mis-classified
2. The line of code it appeared in
3. The file context (imports, file path)

---

## License

[MIT](LICENSE) — use it however you want.
