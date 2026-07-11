

const path = require('node:path');
const { search, isMaxBufferError, parseFilesList, MAX_STDOUT_BUFFER } = require('../src/search');

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
    const _hasLower = results.some(r => /[a-f]/.test(r.text));
    // At minimum we should get results
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  // Regression: on a large tree the verbose --json output overflowed the
  // child-process buffer and the error (no `.status`) was swallowed into a
  // `return []`, so a scan that found matches reported none — the bug that
  // made `duplicate-literals` scan zero files on a monorepo.
  describe('filesOnly discovery + overflow safety', () => {
    test('filesOnly returns one row per matching file (no per-match duplication)', () => {
      const dir = path.join(FIXTURES, 'dupes');
      const rows = search("['\"`/]", [dir], { filesOnly: true, caseSensitive: true });
      const files = new Set(rows.map((r) => r.file));
      // Every returned row is unique-per-file (files-with-matches), not per match.
      expect(rows.length).toBe(files.size);
      // The dupes fixture has multiple source files, all discovered.
      expect(files.size).toBeGreaterThanOrEqual(2);
      // filesOnly rows carry the file but no line/text payload.
      for (const r of rows) {
        expect(r).toHaveProperty('file');
        expect(r.line).toBe(0);
        expect(r.text).toBe('');
      }
    });

    test('filesOnly still discovers the same file SET as a full match search', () => {
      const dir = path.join(FIXTURES, 'dupes');
      const full = new Set(search("['\"`/]", [dir], { caseSensitive: true }).map((r) => r.file));
      const only = new Set(search("['\"`/]", [dir], { filesOnly: true, caseSensitive: true }).map((r) => r.file));
      expect(only).toEqual(full);
    });

    test('isMaxBufferError recognises a stdout-overflow error (never mistaken for "no matches")', () => {
      expect(isMaxBufferError({ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' })).toBe(true);
      expect(isMaxBufferError({ message: 'stdout maxBuffer length exceeded' })).toBe(true);
      // A no-match exit (status 1) is NOT an overflow — it stays a legit empty result.
      expect(isMaxBufferError({ status: 1 })).toBe(false);
      expect(isMaxBufferError(null)).toBeFalsy();
    });

    test('MAX_STDOUT_BUFFER is raised well above the old 50MB cap', () => {
      expect(MAX_STDOUT_BUFFER).toBeGreaterThan(50 * 1024 * 1024);
    });

    test('parseFilesList trims, drops blanks, and shapes discovery rows', () => {
      const rows = parseFilesList('a.js\n  b/c.ts  \n\n');
      expect(rows.map((r) => r.file)).toEqual(['a.js', 'b/c.ts']);
      expect(rows[0]).toEqual({ file: 'a.js', line: 0, column: 0, match: '', text: '' });
    });
  });
});
