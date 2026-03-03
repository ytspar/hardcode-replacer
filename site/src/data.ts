/** Static demo data derived from test/fixtures/sample.tsx and test/fixtures/variables.css */

export interface Variable {
  name: string;
  value: string;
}

export interface ColorMatch {
  /** The original color string in source */
  original: string;
  /** Display color for the swatch */
  displayColor: string;
  /** Match type */
  match: 'exact' | 'close' | 'unmatched' | 'effect';
  /** Replacement text (if matched) */
  replacement?: string;
  /** Variable name (if matched) */
  varName?: string;
  /** Line number in sample file */
  line: number;
}

export const variables: Variable[] = [
  { name: '--color-primary', value: '#667eea' },
  { name: '--color-secondary', value: '#764ba2' },
  { name: '--color-danger', value: '#ff0000' },
  { name: '--color-white', value: '#ffffff' },
  { name: '--color-dark', value: '#1a1a2e' },
  { name: '--color-gray-200', value: '#e5e7eb' },
  { name: '--color-blue-100', value: '#dbeafe' },
  { name: '--color-blue-800', value: '#1e40af' },
  { name: '--color-text', value: '#333333' },
];

export const sampleLines: string[] = [
  `import React from 'react';`,
  ``,
  `export function Button({ children }) {`,
  `  return (`,
  `    <button`,
  `      style={{ borderColor: '{{#ff0000}}', boxShadow: '0 2px 4px {{rgba(0,0,0,0.1)}}' }}`,
  `    >`,
  `      {children}`,
  `    </button>`,
  `  );`,
  `}`,
  ``,
  `export function Card({ title, children }) {`,
  `  return (`,
  `    <div>`,
  `      <h2 style={{ color: '{{coral}}' }}>{title}</h2>`,
  `      <div>{children}</div>`,
  `    </div>`,
  `  );`,
  `}`,
  ``,
  `export function Badge() {`,
  `  return (`,
  `    <span`,
  `      style={{ backgroundColor: '{{#dbeafe}}' }}`,
  `    >`,
  `      New`,
  `    </span>`,
  `  );`,
  `}`,
  ``,
  `const styles = {`,
  `  header: {`,
  `    background: 'linear-gradient(135deg, {{#667eea}} 0%, {{#764ba2}} 100%)',`,
  `  },`,
  `  footer: {`,
  `    backgroundColor: '{{#1a1a2e}}',`,
  `    color: '{{rgb(200,200,210)}}',`,
  `  },`,
  `};`,
];

export const colorMatches: ColorMatch[] = [
  {
    original: '#ff0000',
    displayColor: '#ff0000',
    match: 'exact',
    replacement: 'var(--color-danger)',
    varName: '--color-danger',
    line: 6,
  },
  {
    original: 'rgba(0,0,0,0.1)',
    displayColor: 'rgba(0,0,0,0.1)',
    match: 'effect',
    line: 6,
  },
  {
    original: 'coral',
    displayColor: '#ff7f50',
    match: 'unmatched',
    line: 16,
  },
  {
    original: '#dbeafe',
    displayColor: '#dbeafe',
    match: 'exact',
    replacement: 'var(--color-blue-100)',
    varName: '--color-blue-100',
    line: 25,
  },
  {
    original: '#667eea',
    displayColor: '#667eea',
    match: 'exact',
    replacement: 'var(--color-primary)',
    varName: '--color-primary',
    line: 33,
  },
  {
    original: '#764ba2',
    displayColor: '#764ba2',
    match: 'exact',
    replacement: 'var(--color-secondary)',
    varName: '--color-secondary',
    line: 33,
  },
  {
    original: '#1a1a2e',
    displayColor: '#1a1a2e',
    match: 'exact',
    replacement: 'var(--color-dark)',
    varName: '--color-dark',
    line: 36,
  },
  {
    original: 'rgb(200,200,210)',
    displayColor: 'rgb(200,200,210)',
    match: 'close',
    replacement: 'var(--color-gray-200)',
    varName: '--color-gray-200',
    line: 37,
  },
];

export interface HeroColor {
  hex: string;
  displayColor: string;
  varName: string;
  varRef: string;
}

export const heroColors: HeroColor[] = [
  { hex: '#ff0000', displayColor: '#ff0000', varName: '--color-danger', varRef: 'var(--color-danger)' },
  { hex: '#667eea', displayColor: '#667eea', varName: '--color-primary', varRef: 'var(--color-primary)' },
  { hex: '#764ba2', displayColor: '#764ba2', varName: '--color-secondary', varRef: 'var(--color-secondary)' },
  { hex: '#dbeafe', displayColor: '#dbeafe', varName: '--color-blue-100', varRef: 'var(--color-blue-100)' },
  { hex: '#1a1a2e', displayColor: '#1a1a2e', varName: '--color-dark', varRef: 'var(--color-dark)' },
];

export const featureCards = [
  {
    command: 'colors',
    color: '#667eea',
    title: 'Find Colors',
    desc: 'Detect hex, rgb, hsl, oklch, named colors, and modern CSS color functions across your codebase.',
    cli: 'hardcode-replacer colors src/',
  },
  {
    command: 'compare',
    color: '#22c55e',
    title: 'Compare & Fix',
    desc: 'Match discovered colors against your theme variables. Auto-fix exact matches with var() references.',
    cli: 'hardcode-replacer compare src/ --vars theme.css --fix',
  },
  {
    command: 'tailwind',
    color: '#38bdf8',
    title: 'Tailwind Classes',
    desc: 'Find Tailwind color utility classes and arbitrary values. Supports v3 and v4 with @theme detection.',
    cli: 'hardcode-replacer tailwind src/ --vars theme.css',
  },
  {
    command: 'patterns',
    color: '#a78bfa',
    title: 'Class Patterns',
    desc: 'Detect repeated className patterns suitable for extraction into CVA variants or @apply directives.',
    cli: 'hardcode-replacer patterns src/ --min-count 3',
  },
];

export const workflowSteps = [
  {
    label: 'Step 1',
    title: 'Scan for hardcoded colors',
    cli: 'hardcode-replacer colors src/',
  },
  {
    label: 'Step 2',
    title: 'Compare against your theme',
    cli: 'hardcode-replacer compare src/ --vars theme.css',
  },
  {
    label: 'Step 3',
    title: 'Auto-fix exact matches',
    cli: 'hardcode-replacer compare src/ --vars theme.css --fix',
  },
  {
    label: 'Step 4',
    title: 'Verify no regressions',
    cli: 'hardcode-replacer compare src/ --vars theme.css --diff .baseline.json',
  },
];
