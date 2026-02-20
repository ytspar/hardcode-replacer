'use strict';

const {
  parseColor,
  normalizeToHex,
  colorDistance,
  findNearestColor,
  classifyColor,
  extractAlpha,
  colorMixSuggestion,
  suggestVariableName,
  extractCssProperty,
} = require('../src/color-utils');

describe('parseColor', () => {
  test('parses hex colors', () => {
    expect(parseColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
    expect(parseColor('#000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  test('parses 8-digit hex (ignores alpha)', () => {
    expect(parseColor('#ff000080')).toEqual({ r: 255, g: 0, b: 0 });
  });

  test('parses 4-digit hex (ignores alpha)', () => {
    expect(parseColor('#f008')).toEqual({ r: 255, g: 0, b: 0 });
  });

  test('parses legacy rgb()', () => {
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor('rgb(16, 185, 129)')).toEqual({ r: 16, g: 185, b: 129 });
  });

  test('parses modern rgb()', () => {
    expect(parseColor('rgb(255 0 0)')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor('rgb(255 0 0 / 50%)')).toEqual({ r: 255, g: 0, b: 0 });
  });

  test('parses legacy rgba()', () => {
    expect(parseColor('rgba(255, 0, 0, 0.5)')).toEqual({ r: 255, g: 0, b: 0 });
  });

  test('parses hsl()', () => {
    const result = parseColor('hsl(0, 100%, 50%)');
    expect(result).toEqual({ r: 255, g: 0, b: 0 });
  });

  test('parses modern hsl()', () => {
    const result = parseColor('hsl(0 100% 50%)');
    expect(result).toEqual({ r: 255, g: 0, b: 0 });
  });

  test('parses named colors', () => {
    expect(parseColor('red')).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor('blue')).toEqual({ r: 0, g: 0, b: 255 });
    expect(parseColor('cornflowerblue')).toBeTruthy();
  });

  test('returns null for invalid input', () => {
    expect(parseColor(null)).toBeNull();
    expect(parseColor('')).toBeNull();
    expect(parseColor('notacolor')).toBeNull();
    expect(parseColor('oklch(0.88 0.05 143)')).toBeNull();
  });
});

describe('normalizeToHex', () => {
  test('normalizes hex', () => {
    expect(normalizeToHex('#ff0000')).toBe('#ff0000');
    expect(normalizeToHex('#f00')).toBe('#ff0000');
  });

  test('normalizes rgb to hex', () => {
    expect(normalizeToHex('rgb(255, 0, 0)')).toBe('#ff0000');
    expect(normalizeToHex('rgb(16, 185, 129)')).toBe('#10b981');
  });

  test('normalizes hsl to hex', () => {
    expect(normalizeToHex('hsl(0, 100%, 50%)')).toBe('#ff0000');
  });

  test('normalizes named colors to hex', () => {
    expect(normalizeToHex('red')).toBe('#ff0000');
  });

  test('returns null for unparseable', () => {
    expect(normalizeToHex('oklch(0.88 0.05 143)')).toBeNull();
  });
});

describe('colorDistance', () => {
  test('identical colors have distance 0', () => {
    expect(colorDistance('#ff0000', '#ff0000')).toBe(0);
  });

  test('similar colors have small distance', () => {
    const dist = colorDistance('#10b981', '#10b982');
    expect(dist).toBeLessThan(1);
  });

  test('different colors have large distance', () => {
    const dist = colorDistance('#ff0000', '#0000ff');
    expect(dist).toBeGreaterThan(50);
  });

  test('returns Infinity for unparseable', () => {
    expect(colorDistance('notacolor', '#ff0000')).toBe(Infinity);
  });

  test('accepts RGB objects', () => {
    const dist = colorDistance({ r: 255, g: 0, b: 0 }, { r: 255, g: 0, b: 0 });
    expect(dist).toBe(0);
  });
});

describe('findNearestColor', () => {
  const palette = {
    '--primary': '#10b981',
    '--danger': '#ef4444',
    '--gray-500': '#6b7280',
  };

  test('finds exact match', () => {
    const result = findNearestColor('#10b981', palette);
    expect(result.name).toBe('--primary');
    expect(result.distance).toBe(0);
  });

  test('finds nearest match', () => {
    const result = findNearestColor('#10b982', palette);
    expect(result.name).toBe('--primary');
    expect(result.distance).toBeLessThan(1);
  });

  test('returns null for unparseable', () => {
    expect(findNearestColor('notacolor', palette)).toBeNull();
  });
});

describe('classifyColor', () => {
  test('classifies hex', () => {
    expect(classifyColor('#ff0000')).toBe('hex');
    expect(classifyColor('#fff')).toBe('hex');
  });

  test('classifies rgb/rgba', () => {
    expect(classifyColor('rgb(255, 0, 0)')).toBe('rgb');
    expect(classifyColor('rgba(255, 0, 0, 0.5)')).toBe('rgba');
  });

  test('classifies hsl/hsla', () => {
    expect(classifyColor('hsl(0, 100%, 50%)')).toBe('hsl');
    expect(classifyColor('hsla(0, 100%, 50%, 0.5)')).toBe('hsla');
  });

  test('classifies modern CSS functions', () => {
    expect(classifyColor('oklch(0.88 0.05 143)')).toBe('oklch');
    expect(classifyColor('oklab(0.88 0.05 0.02)')).toBe('oklab');
    expect(classifyColor('lch(50 30 120)')).toBe('lch');
    expect(classifyColor('lab(50 30 -20)')).toBe('lab');
    expect(classifyColor('hwb(120 10% 20%)')).toBe('hwb');
  });

  test('classifies named colors', () => {
    expect(classifyColor('red')).toBe('named');
    expect(classifyColor('cornflowerblue')).toBe('named');
  });

  test('returns unknown for unrecognized', () => {
    expect(classifyColor('notacolor')).toBe('unknown');
  });
});

describe('extractAlpha', () => {
  test('returns null for opaque hex', () => {
    expect(extractAlpha('#ff0000')).toBeNull();
    expect(extractAlpha('#fff')).toBeNull();
  });

  test('extracts alpha from 8-digit hex', () => {
    expect(extractAlpha('#ff000080')).toBeCloseTo(0.5, 1);
  });

  test('extracts alpha from 4-digit hex', () => {
    expect(extractAlpha('#f008')).toBeCloseTo(0.53, 1);
  });

  test('extracts alpha from rgba()', () => {
    expect(extractAlpha('rgba(255, 0, 0, 0.5)')).toBe(0.5);
    expect(extractAlpha('rgba(255, 0, 0, 0.25)')).toBe(0.25);
  });

  test('extracts alpha from modern rgb()', () => {
    expect(extractAlpha('rgb(255 0 0 / 50%)')).toBe(0.5);
    expect(extractAlpha('rgb(255 0 0 / 0.3)')).toBe(0.3);
  });

  test('extracts alpha from hsla()', () => {
    expect(extractAlpha('hsla(0, 100%, 50%, 0.5)')).toBe(0.5);
  });

  test('extracts alpha from modern hsl()', () => {
    expect(extractAlpha('hsl(0 100% 50% / 50%)')).toBe(0.5);
  });

  test('returns null for no alpha', () => {
    expect(extractAlpha('rgb(255, 0, 0)')).toBeNull();
    expect(extractAlpha('hsl(0, 100%, 50%)')).toBeNull();
    expect(extractAlpha(null)).toBeNull();
  });
});

describe('colorMixSuggestion', () => {
  test('generates correct color-mix()', () => {
    expect(colorMixSuggestion('--primary', 0.5))
      .toBe('color-mix(in srgb, var(--primary) 50%, transparent)');
  });

  test('rounds percentage', () => {
    expect(colorMixSuggestion('--danger', 0.333))
      .toBe('color-mix(in srgb, var(--danger) 33%, transparent)');
  });
});

describe('suggestVariableName', () => {
  test('suggests name based on color hue', () => {
    const name = suggestVariableName('#ff0000');
    expect(name).toMatch(/--color-red/);
  });

  test('uses CSS property for prefix', () => {
    const name = suggestVariableName('#ff0000', 'background-color');
    expect(name).toMatch(/--bg-red/);
  });

  test('handles gray colors', () => {
    const name = suggestVariableName('#808080');
    expect(name).toMatch(/--color-gray/);
  });

  test('returns fallback for unparseable', () => {
    expect(suggestVariableName('notacolor')).toBe('--color-custom');
  });
});

describe('extractCssProperty', () => {
  test('extracts CSS property', () => {
    expect(extractCssProperty('  background-color: #ff0000;')).toBe('background-color');
    expect(extractCssProperty('  color: rgb(255, 0, 0);')).toBe('color');
    expect(extractCssProperty('  border-color: #ccc;')).toBe('border-color');
  });

  test('extracts JS property', () => {
    expect(extractCssProperty("  backgroundColor: '#ff0000',")).toBe('backgroundColor');
  });

  test('returns null for no match', () => {
    expect(extractCssProperty(null)).toBeNull();
    expect(extractCssProperty('  // a comment')).toBeNull();
  });
});
