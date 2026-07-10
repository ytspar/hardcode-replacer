# hardcode-replacer

[![npm version](https://img.shields.io/npm/v/hardcode-replacer.svg)](https://www.npmjs.com/package/hardcode-replacer)
[![npm downloads](https://img.shields.io/npm/dm/hardcode-replacer.svg)](https://www.npmjs.com/package/hardcode-replacer)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/ytspar/hardcode-replacer/pulls)

**Find and fix hardcoded colors, Tailwind color classes, and repeated class patterns in web codebases.**

**[Website](https://ytspar.github.io/hardcode-replacer/)** · **[npm](https://www.npmjs.com/package/hardcode-replacer)** · **[GitHub](https://github.com/ytspar/hardcode-replacer)**

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
# Install globally from npm
npm install -g hardcode-replacer

# Or use npx without installing
npx hardcode-replacer colors src/

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

# Find repeated JSX structures for component extraction
hardcode-replacer jsx src/

# Find the same string/regex literal duplicated across files
hardcode-replacer duplicate-literals src/ --check
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

### `jsx` — Find repeated JSX structures

Finds repeated JSX subtrees (tag hierarchies + classNames) that can be extracted into reusable components. Unlike `patterns` (which finds repeated className strings), `jsx` detects repeated *structural* patterns — e.g., a `<button><span>...</span></button>` used in 5 places with similar classNames but different text content.

```bash
hardcode-replacer jsx [paths...] [options]
```

**Options:**

| Flag | Description |
|------|-------------|
| `--min-count <n>` | Minimum occurrences to report (default: 2) |
| `--min-depth <n>` | Minimum subtree depth (1 = parent+child) (default: 1) |
| `--similarity <n>` | Jaccard similarity threshold for "similar" clusters, 0-1 (default: 0.7) |
| `--include <glob>` | File pattern to include |
| `--exclude <glob>` | File pattern to exclude (repeatable) |
| `--format json` | Output as structured JSON |

Three cluster types:
- **Exact** — Identical tag hierarchy AND classNames
- **Structural** — Same tag hierarchy, different classNames (extract with variant props)
- **Similar** — Same root tag, 70%+ className overlap (Jaccard similarity)

**Example output:**

```
=== Repeated JSX Structures ===
Scanned 69 files. Found 89 clusters.

  Exact duplicates:     72 (identical structure + classes)
  Structural duplicates: 15 (same tags, different classes)
  Similar patterns:     2 (same root, 70%+ class overlap)

1. [EXACT] 5x across 3 file(s) — impact: 30
   Fingerprint: button(span)

   <button .bg-grey-800 .border .border-grey-700 ...>
     <span .font-retron .text-sm .text-white ...></span>
   </button>

   Shared classes: bg-grey-800, border, border-grey-700, flex, ...
   → Extract into a reusable component. 5 identical instances found.
```

### `duplicate-literals` — Find the same literal duplicated across files

Finds the **same string or regex literal** copy-pasted into two or more source files — the cross-file drift class. A regex like `\bel-git\s+(?:mr|pr)\b` pasted into a dozen files that then diverge is invisible to the other commands; this one hoists it into view so you can single-source it.

Unlike `patterns` / `jsx` (which use lightweight text/regex extraction), `duplicate-literals` parses each JS/TS/JSX/TSX file into a real **AST** (`@babel/parser`, loaded lazily so the color/CSS commands pay nothing for it). That's the whole point: an AST yields genuine `RegExpLiteral` nodes, so a regex like `/a\/b/g` is captured while a division expression `a / b` is not — a distinction text extraction gets wrong. Non-JS/TS files are out of scope and skipped; a file that fails to parse is skipped with a warning.

```bash
hardcode-replacer duplicate-literals [paths...] [options]
hardcode-replacer dupes [paths...] [options]   # alias
```

**Options:**

| Flag | Description |
|------|-------------|
| `--min-occurrences <n>` | Minimum total occurrences to report (default: 3) |
| `--min-files <n>` | Minimum distinct files a literal must span (default: 2) |
| `--min-length <n>` | Minimum string length; regex literals bypass this (default: 8) |
| `--kind <string\|regex\|all>` | Which literal kinds to report (default: all) |
| `--include <glob>` | File pattern to include |
| `--exclude <glob>` | File pattern to exclude (repeatable) |
| `--include-tests` | Include `*.test.*` / `*.spec.*` / `__tests__` files (skipped by default) |
| `--check` | Exit with code `1` if any duplicate meets the thresholds |
| `--format json` | Output as structured JSON |

**Noise filtering:** skips literals shorter than `--min-length`, pure numbers, import/require source paths (values starting with `.`, `@`, `node:`, `~`), trivial tokens (`"use strict"`, `"utf-8"`, …), and **bare all-lowercase words** (`"background"`, `"className"`) — those carry no structure and are almost never drift-dangerous domain constants, unlike URLs, id patterns, command names, env-var names, or verdict tokens like `APPROVE`, which have separators / digits / mixed case. Regex literals bypass `--min-length` and the bare-word filter (a short shared regex is still drift-prone). Test files are skipped unless `--include-tests`. To tune further, raise `--min-length` or use `--kind regex`.

A no-expression template `` `foo` `` and a plain string `"foo"` aggregate into one finding — they are the same literal *content* duplicated in different quote styles, which is exactly the drift this detects.

**Canonical-source hint:** each finding includes a `suggestedSource` — where to single-source the literal. It prefers a file that already `export`s it (`export const NAME = <literal>`), then the file holding the most copies, then the shallowest path.

**`--check` for CI / pre-commit:** unlike the other commands (which exit `1` only on errors), `duplicate-literals --check` exits `1` when any duplicate meets the thresholds, so you can fail a build or block a commit when new cross-file duplication appears:

```bash
# pre-commit hook or CI step
hardcode-replacer duplicate-literals src/ --check --min-occurrences 3
```

**Example output:**

```
=== Duplicate Literals ===
Found 2 literal(s) duplicated across files (6 locations, 48 files scanned)
Criteria: kind=all, >=3 occurrences, >=2 files, min length 8

1. [regex ] /\bel-git\s+(?:mr|pr)\b/
   Occurrences: 12 across 12 file(s)
   Single-source in: src/constants/patterns.ts:4 (exported)
   Locations:
     src/constants/patterns.ts:4:23 [exported]
     src/checks/mr-open.ts:88:19
     ...

2. [string] https://api.example.com/v1/users
   Occurrences: 3 across 3 file(s)
   Single-source in: src/config/endpoints.ts:2 (shallowest)
   Locations:
     src/config/endpoints.ts:2:20
     ...
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

# Step 7: Find repeated JSX structures for component extraction
hardcode-replacer jsx src/ --min-depth 2

# Step 8: Fail CI when the same literal is duplicated across files
hardcode-replacer duplicate-literals src/ --check
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

# Find JSX structures to extract into components
hardcode-replacer jsx src/ --min-count 3
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
    find-jsx.js             `jsx` command
    find-duplicate-literals.js  `duplicate-literals` command (AST, @babel/parser)
```

**Search**: Uses [ripgrep](https://github.com/BurntSushi/ripgrep) (`rg --json`) for fast structured search with grep fallback. All external commands use `execFileSync` (no shell) to prevent command injection.

**Classification**: File-level analysis is cached per-file. Import scanning checks the first 100 lines for canvas/WebGL library imports. Block comment ranges are computed once per file.

---

## Installation

```bash
# npm
npm install -g hardcode-replacer

# npx (no install)
npx hardcode-replacer colors src/
```

## Requirements

- **Node.js >= 18**
- **ripgrep** (`rg`) — recommended for performance, falls back to grep
- **Minimal dependencies** — `commander` for CLI parsing; `@babel/parser` (loaded lazily, only by `duplicate-literals`)

---

## Programmatic API (`hardcode-replacer/detect`)

Single-string detection for in-process callers (e.g. PreToolUse hooks blocking `Edit`/`Write` before the file is saved). The CLI scans whole trees with the broader `HEX_PATTERN` from `src/color-patterns.js`; the `/detect` subpath exposes a narrower, configurable check intended for write-time gates.

```js
const { detectHexViolations, isHexExemptPath } = require("hardcode-replacer/detect");

if (isHexExemptPath(filePath)) return;

const violations = detectHexViolations(sourceContent, { maxMatches: 5 });
if (violations.length > 0) {
  // violations: Array<{ line: number, content: string, match: string }>
  // line is 1-indexed; content has trailing whitespace trimmed
}
```

**Defaults (write-time gate semantics):**

- `pattern` — `/#[0-9a-fA-F]{6}/` (6-digit only; `#fff` shorthand passes through). Pass `HEX_PATTERN` from `hardcode-replacer/src/color-patterns` to widen.
- `filterKeywords` — `["var(--", "@theme", "primitive", "allow-hex"]`. `allow-hex` is an intentional inline-comment escape (`color: #ff0000; // allow-hex: legacy logo`).
- `skipComments` — skips `//` and `/* ... */` block comments.
- `maxMatches` — stop scanning after N matches; default unbounded.

`isHexExemptPath` skips token source files (`/design-tokens/`, `/foundation.css`, …), fixture/test/stories paths, generated registries, and `tailwind.config`. Pass `extraFragments` to widen.

**Used by:** `cli/el-hook` (verticalint/tools) write-time PreToolUse gate. The CLI `hardcode-replacer compare` remains the batch-sweep + fuzzy-match-to-vars + auto-fix path.

---

## Programmatic API (`hardcode-replacer/duplicate-literals`)

The `duplicate-literals` detector is also exposed as a pure, in-process function so a caller (e.g. a verticalint/tools el-hook check) can gate on cross-file literal duplication without shelling out. It performs the analysis and **returns** the structured result — it does not print.

```js
const { findDuplicateLiterals } = require("hardcode-replacer/duplicate-literals");

const result = findDuplicateLiterals(["src/"], {
  minOccurrences: 3, // or "3" — parsed with parseInt
  minFiles: 2,
  minLength: 8,
  kind: "all",       // "string" | "regex" | "all"
  includeTests: false,
  exclude: ["**/*.generated.*"],
});

// result.findings: Array<{ value, kind, occurrences, files, suggestedSource, locations }>
if (result.findings.length > 0) {
  // block / warn — each finding names where to single-source the literal
}
```

`@babel/parser` is `require`d lazily inside this function, so importing the subpath is cheap until you call it. The full return shape is the `DuplicateLiteralsOutput` type printed by `hardcode-replacer duplicate-literals --output-schema`.

---

## Contributing

PRs welcome! If you find false positives or missed patterns, please open an issue with:
1. The color value that was mis-classified
2. The line of code it appeared in
3. The file context (imports, file path)

## Releasing

Publishing is automated (`.github/workflows/publish.yml`): bump `version` in
`package.json` inside your PR; when it merges to `main`, CI verifies the
version is not yet on the registry, runs the test suite, and publishes with
provenance. No local npm credentials are needed. One-time repo setup: an npm
Automation token stored as the `NPM_TOKEN` Actions secret.

---

## License

[MIT](LICENSE) — use it however you want.
