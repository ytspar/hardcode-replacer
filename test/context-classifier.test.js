'use strict';

const {
  classifyContext,
  clearCache,
  contextLabel,
  isActionable,
} = require('../src/context-classifier');

beforeEach(() => {
  clearCache();
});

describe('classifyContext', () => {
  test('identifies CSS variable definitions', () => {
    const result = classifyContext({
      file: 'src/styles.css',
      text: '  --primary-500: #10b981;',
      match: '#10b981',
    });
    expect(result).toBe('css-definition');
  });

  test('identifies meta/manifest tags', () => {
    const result = classifyContext({
      file: 'src/index.html',
      text: '<meta name="theme-color" content="#10b981">',
      match: '#10b981',
    });
    expect(result).toBe('meta');
  });

  test('identifies object key mappings', () => {
    const result = classifyContext({
      file: 'src/utils.js',
      text: "  '#10b981': 'success',",
      match: '#10b981',
    });
    expect(result).toBe('mapping');
  });

  test('identifies effect colors (black with alpha)', () => {
    const result = classifyContext({
      file: 'src/component.tsx',
      text: '  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);',
      match: 'rgba(0, 0, 0, 0.1)',
    });
    expect(result).toBe('effect');
  });

  test('identifies effect colors (white with alpha)', () => {
    const result = classifyContext({
      file: 'src/component.tsx',
      text: '  background: rgba(255, 255, 255, 0.5);',
      match: 'rgba(255, 255, 255, 0.5)',
    });
    expect(result).toBe('effect');
  });

  test('returns actionable for normal color usage', () => {
    const result = classifyContext({
      file: 'src/component.tsx',
      text: '  color: #10b981;',
      match: '#10b981',
    });
    expect(result).toBe('actionable');
  });

  test('identifies getCssVar as canvas context', () => {
    const result = classifyContext({
      file: 'src/utils.js',
      text: "  const color = getCssVar('--primary') || '#10b981';",
      match: '#10b981',
    });
    expect(result).toBe('canvas');
  });

  test('identifies fallback with || as canvas', () => {
    const result = classifyContext({
      file: 'src/utils.js',
      text: "  return someVar || '#10b981';",
      match: '#10b981',
    });
    expect(result).toBe('canvas');
  });
});

describe('contextLabel', () => {
  test('returns human-readable labels', () => {
    expect(contextLabel('actionable')).toBe('ACTIONABLE');
    expect(contextLabel('css-definition')).toBe('CSS VAR DEFINITION');
    expect(contextLabel('theme-definition')).toBe('THEME DEFINITION');
    expect(contextLabel('canvas')).toBe('CANVAS/WEBGL');
    expect(contextLabel('mapping')).toBe('MAPPING/LOOKUP');
    expect(contextLabel('generated')).toBe('GENERATED CODE');
    expect(contextLabel('meta')).toBe('META/MANIFEST');
    expect(contextLabel('effect')).toBe('EFFECT (black/white alpha)');
  });

  test('returns raw value for unknown contexts', () => {
    expect(contextLabel('unknown')).toBe('unknown');
  });
});

describe('isActionable', () => {
  test('returns true for actionable', () => {
    expect(isActionable('actionable')).toBe(true);
  });

  test('returns false for non-actionable', () => {
    expect(isActionable('css-definition')).toBe(false);
    expect(isActionable('canvas')).toBe(false);
    expect(isActionable('effect')).toBe(false);
  });
});
