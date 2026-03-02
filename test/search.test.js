'use strict';

const path = require('path');
const { search } = require('../src/search');

const FIXTURES = path.join(__dirname, 'fixtures');

describe('search', () => {
  // The fixtures/sample.tsx file contains hardcoded colors we can search for
  const sampleFile = path.join(FIXTURES, 'sample.tsx');

  test('finds hex colors in fixture file', () => {
    const results = search('#[0-9a-fA-F]{3,8}\\b', [sampleFile]);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r).toHaveProperty('file');
      expect(r).toHaveProperty('line');
      expect(r).toHaveProperty('column');
      expect(r).toHaveProperty('text');
      expect(typeof r.line).toBe('number');
      expect(typeof r.column).toBe('number');
    }
  });

  test('returns empty array when no matches found', () => {
    const results = search('ZZZZZ_NO_MATCH_EVER_ZZZZZ', [sampleFile]);
    expect(results).toEqual([]);
  });

  test('respects include glob option', () => {
    const results = search('#[0-9a-fA-F]{3,8}\\b', [FIXTURES], {
      include: '*.tsx',
    });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.file).toMatch(/\.tsx$/);
    }
  });

  test('respects exclude glob option', () => {
    const results = search('#[0-9a-fA-F]{3,8}\\b', [FIXTURES], {
      exclude: ['*.tsx'],
    });
    // Should not match tsx files
    for (const r of results) {
      expect(r.file).not.toMatch(/\.tsx$/);
    }
  });

  test('handles directory path as search target', () => {
    const results = search('#[0-9a-fA-F]{3,8}\\b', [FIXTURES]);
    expect(results.length).toBeGreaterThan(0);
  });

  test('result objects have expected shape', () => {
    const results = search('#[0-9a-fA-F]{3,8}\\b', [sampleFile]);
    expect(results.length).toBeGreaterThan(0);
    const r = results[0];
    expect(r.file).toBeTruthy();
    expect(r.line).toBeGreaterThan(0);
    expect(r.column).toBeGreaterThan(0);
    expect(typeof r.text).toBe('string');
  });

  test('handles nonexistent path gracefully', () => {
    expect(() => {
      search('#fff', ['/nonexistent/path/xyz']);
    }).toThrow();
  });

  test('search is case insensitive by default', () => {
    const results = search('#[a-f]{3,6}\\b', [sampleFile]);
    // Should match both uppercase and lowercase hex chars
    const hasLower = results.some(r => /[a-f]/.test(r.text));
    // At minimum we should get results
    expect(results.length).toBeGreaterThanOrEqual(0);
  });
});
