'use strict';

const {
  HEX_PATTERN,
  RGB_PATTERN,
  HSL_PATTERN,
  buildColorSearchPattern,
} = require('../src/color-patterns');

describe('HEX_PATTERN', () => {
  test('matches 6-digit hex', () => {
    expect('#ff0000').toMatch(HEX_PATTERN);
    expect('#10b981').toMatch(HEX_PATTERN);
    expect('#000000').toMatch(HEX_PATTERN);
  });

  test('matches 3-digit hex', () => {
    expect('#fff').toMatch(HEX_PATTERN);
    expect('#f00').toMatch(HEX_PATTERN);
  });

  test('matches 8-digit hex (with alpha)', () => {
    expect('#ff000080').toMatch(HEX_PATTERN);
  });

  test('matches 4-digit hex (with alpha)', () => {
    expect('#f008').toMatch(HEX_PATTERN);
  });

  test('does not match invalid hex', () => {
    expect('#gg0000').not.toMatch(HEX_PATTERN);
    expect('#ff').not.toMatch(HEX_PATTERN);
  });
});

describe('RGB_PATTERN', () => {
  test('matches legacy rgb()', () => {
    expect('rgb(255, 0, 0)').toMatch(RGB_PATTERN);
    expect('rgb(16, 185, 129)').toMatch(RGB_PATTERN);
  });

  test('matches legacy rgba()', () => {
    expect('rgba(255, 0, 0, 0.5)').toMatch(RGB_PATTERN);
    expect('rgba(0, 0, 0, 0.1)').toMatch(RGB_PATTERN);
  });

  test('matches modern rgb()', () => {
    expect('rgb(255 0 0)').toMatch(RGB_PATTERN);
    expect('rgb(255 0 0 / 50%)').toMatch(RGB_PATTERN);
  });
});

describe('HSL_PATTERN', () => {
  test('matches legacy hsl()', () => {
    expect('hsl(360, 100%, 50%)').toMatch(HSL_PATTERN);
    expect('hsl(0, 0%, 0%)').toMatch(HSL_PATTERN);
  });

  test('matches legacy hsla()', () => {
    expect('hsla(360, 100%, 50%, 0.5)').toMatch(HSL_PATTERN);
  });

  test('matches modern hsl()', () => {
    expect('hsl(360 100% 50%)').toMatch(HSL_PATTERN);
    expect('hsl(360 100% 50% / 50%)').toMatch(HSL_PATTERN);
  });
});

describe('buildColorSearchPattern', () => {
  test('returns a non-empty string', () => {
    const pattern = buildColorSearchPattern();
    expect(typeof pattern).toBe('string');
    expect(pattern.length).toBeGreaterThan(0);
  });

  test('pattern is valid regex', () => {
    const pattern = buildColorSearchPattern();
    expect(() => new RegExp(pattern, 'gi')).not.toThrow();
  });

  test('pattern matches hex colors', () => {
    const regex = new RegExp(buildColorSearchPattern(), 'gi');
    expect('#ff0000').toMatch(regex);
  });

  test('pattern matches rgb colors', () => {
    const regex = new RegExp(buildColorSearchPattern(), 'gi');
    expect('rgb(255, 0, 0)').toMatch(regex);
  });

  test('pattern matches hsl colors', () => {
    const regex = new RegExp(buildColorSearchPattern(), 'gi');
    expect('hsl(360, 100%, 50%)').toMatch(regex);
  });

  test('pattern matches oklch', () => {
    const regex = new RegExp(buildColorSearchPattern(), 'gi');
    expect('oklch(0.88 0.05 143)').toMatch(regex);
  });
});
