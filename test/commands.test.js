

const path = require('node:path');
const { findColors } = require('../src/commands/find-colors');
const { findTailwind } = require('../src/commands/find-tailwind');
const { findPatterns } = require('../src/commands/find-patterns');
const { findJsx } = require('../src/commands/find-jsx');

const FIXTURES = path.join(__dirname, 'fixtures');
const SAMPLE = path.join(FIXTURES, 'sample.tsx');
const JSX_FIXTURE = path.join(FIXTURES, 'jsx-structures.tsx');

// Helper to capture console.log output
function captureOutput(fn) {
  const logs = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args) => logs.push(args.join(' '));
  console.error = (...args) => logs.push(args.join(' '));
  try {
    fn();
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
  return logs.join('\n');
}

describe('findColors command', () => {
  test('finds hex colors in fixture in text mode', () => {
    const output = captureOutput(() => {
      findColors([SAMPLE], { format: 'text', exclude: [], named: true });
    });
    expect(output).toContain('#ff0000');
    expect(output).toContain('sample.tsx');
  });

  test('produces valid JSON in json mode', () => {
    const output = captureOutput(() => {
      findColors([SAMPLE], { format: 'json', exclude: [], named: true });
    });
    const parsed = JSON.parse(output);
    expect(parsed.command).toBe('colors');
    expect(parsed.summary).toBeTruthy();
    expect(parsed.summary.totalColors).toBeGreaterThan(0);
    expect(parsed.actionable).toBeTruthy();
  });

  test('json output has correct structure', () => {
    const output = captureOutput(() => {
      findColors([SAMPLE], { format: 'json', exclude: [], named: true });
    });
    const parsed = JSON.parse(output);
    expect(parsed.summary).toHaveProperty('totalColors');
    expect(parsed.summary).toHaveProperty('actionable');
    expect(parsed.summary).toHaveProperty('skipped');
    expect(parsed.summary).toHaveProperty('totalFiles');
    expect(parsed.summary).toHaveProperty('byType');
    expect(parsed.summary).toHaveProperty('skippedByContext');
  });

  test('--no-named skips named colors', () => {
    const withNamed = captureOutput(() => {
      findColors([SAMPLE], { format: 'json', exclude: [], named: true });
    });
    const withoutNamed = captureOutput(() => {
      findColors([SAMPLE], { format: 'json', exclude: [], named: false });
    });
    const a = JSON.parse(withNamed);
    const b = JSON.parse(withoutNamed);
    // With named should have more or equal results
    expect(a.summary.totalColors).toBeGreaterThanOrEqual(b.summary.totalColors);
  });
});

describe('findTailwind command', () => {
  test('finds Tailwind classes in fixture', () => {
    const output = captureOutput(() => {
      findTailwind([SAMPLE], { format: 'text', exclude: [] });
    });
    expect(output).toContain('bg-red-500');
    expect(output).toContain('text-white');
  });

  test('produces valid JSON in json mode', () => {
    const output = captureOutput(() => {
      findTailwind([SAMPLE], { format: 'json', exclude: [] });
    });
    const parsed = JSON.parse(output);
    expect(parsed.command).toBe('tailwind');
    expect(parsed.summary).toBeTruthy();
    expect(parsed.summary.totalClasses).toBeGreaterThan(0);
    expect(parsed.results).toBeTruthy();
  });

  test('json output has correct structure', () => {
    const output = captureOutput(() => {
      findTailwind([SAMPLE], { format: 'json', exclude: [] });
    });
    const parsed = JSON.parse(output);
    expect(parsed.summary).toHaveProperty('totalClasses');
    expect(parsed.summary).toHaveProperty('totalFiles');
    expect(parsed.summary).toHaveProperty('byPrefix');
    expect(parsed.summary).toHaveProperty('byColor');
  });
});

describe('findPatterns command', () => {
  test('finds repeated class patterns in fixture', () => {
    const output = captureOutput(() => {
      findPatterns([SAMPLE], {
        format: 'text',
        exclude: [],
        minCount: '2',
        minClasses: '2',
      });
    });
    // sample.tsx has "bg-white border border-gray-200 rounded-xl p-6 shadow-sm" repeated twice
    expect(output).toContain('bg-white');
  });

  test('produces valid JSON in json mode', () => {
    const output = captureOutput(() => {
      findPatterns([SAMPLE], {
        format: 'json',
        exclude: [],
        minCount: '2',
        minClasses: '2',
      });
    });
    const parsed = JSON.parse(output);
    expect(parsed.command).toBe('patterns');
    expect(parsed.summary).toBeTruthy();
    expect(parsed.patterns).toBeTruthy();
    expect(Array.isArray(parsed.patterns)).toBe(true);
  });

  test('json output has correct structure', () => {
    const output = captureOutput(() => {
      findPatterns([SAMPLE], {
        format: 'json',
        exclude: [],
        minCount: '2',
        minClasses: '2',
      });
    });
    const parsed = JSON.parse(output);
    expect(parsed.summary).toHaveProperty('totalPatterns');
    expect(parsed.summary).toHaveProperty('minCount');
    expect(parsed.summary).toHaveProperty('minClasses');
    if (parsed.patterns.length > 0) {
      const p = parsed.patterns[0];
      expect(p).toHaveProperty('normalized');
      expect(p).toHaveProperty('classCount');
      expect(p).toHaveProperty('occurrences');
      expect(p).toHaveProperty('locations');
    }
  });
});

describe('findJsx command', () => {
  test('finds repeated JSX structures in text mode', () => {
    const output = captureOutput(() => {
      findJsx([JSX_FIXTURE], {
        format: 'text',
        exclude: [],
        minCount: '2',
        minDepth: '1',
        similarity: '0.7',
      });
    });
    expect(output).toContain('Repeated JSX Structures');
    expect(output).toContain('EXACT');
    expect(output).toContain('button(span)');
    expect(output).toContain('jsx-structures.tsx');
  });

  test('produces valid JSON in json mode', () => {
    const output = captureOutput(() => {
      findJsx([JSX_FIXTURE], {
        format: 'json',
        exclude: [],
        minCount: '2',
        minDepth: '1',
        similarity: '0.7',
      });
    });
    const parsed = JSON.parse(output);
    expect(parsed.command).toBe('jsx');
    expect(parsed.summary).toBeTruthy();
    expect(parsed.summary.totalClusters).toBeGreaterThan(0);
    expect(parsed.clusters).toBeTruthy();
    expect(Array.isArray(parsed.clusters)).toBe(true);
  });

  test('json output has correct structure', () => {
    const output = captureOutput(() => {
      findJsx([JSX_FIXTURE], {
        format: 'json',
        exclude: [],
        minCount: '2',
        minDepth: '1',
        similarity: '0.7',
      });
    });
    const parsed = JSON.parse(output);
    expect(parsed.summary).toHaveProperty('totalFiles');
    expect(parsed.summary).toHaveProperty('totalClusters');
    expect(parsed.summary).toHaveProperty('exactDuplicates');
    expect(parsed.summary).toHaveProperty('structuralDuplicates');
    expect(parsed.summary).toHaveProperty('similarPatterns');
    expect(parsed.summary).toHaveProperty('minCount');
    expect(parsed.summary).toHaveProperty('minDepth');
    expect(parsed.summary).toHaveProperty('similarityThreshold');

    if (parsed.clusters.length > 0) {
      const c = parsed.clusters[0];
      expect(c).toHaveProperty('type');
      expect(c).toHaveProperty('fingerprint');
      expect(c).toHaveProperty('structure');
      expect(c).toHaveProperty('occurrences');
      expect(c).toHaveProperty('files');
      expect(c).toHaveProperty('depth');
      expect(c).toHaveProperty('nodeCount');
      expect(c).toHaveProperty('impactScore');
      expect(c).toHaveProperty('sharedClasses');
      expect(c).toHaveProperty('classVariants');
      expect(c).toHaveProperty('suggestion');
      expect(c).toHaveProperty('locations');
      expect(['exact', 'structural', 'similar']).toContain(c.type);
    }
  });

  test('detects exact button+span duplicates', () => {
    const output = captureOutput(() => {
      findJsx([JSX_FIXTURE], {
        format: 'json',
        exclude: [],
        minCount: '2',
        minDepth: '1',
        similarity: '0.7',
      });
    });
    const parsed = JSON.parse(output);
    const buttonSpan = parsed.clusters.find(
      (c) => c.fingerprint === 'button(span)' && c.type === 'exact'
    );
    expect(buttonSpan).toBeTruthy();
    expect(buttonSpan.occurrences).toBe(3);
  });

  test('detects structural section duplicates', () => {
    const output = captureOutput(() => {
      findJsx([JSX_FIXTURE], {
        format: 'json',
        exclude: [],
        minCount: '2',
        minDepth: '1',
        similarity: '0.7',
      });
    });
    const parsed = JSON.parse(output);
    const section = parsed.clusters.find(
      (c) => c.fingerprint === 'section(div(h2))' && c.type === 'structural'
    );
    expect(section).toBeTruthy();
    expect(section.occurrences).toBe(2);
    expect(section.classVariants).toBeGreaterThan(1);
  });

  test('detects input wrapper duplicates', () => {
    const output = captureOutput(() => {
      findJsx([JSX_FIXTURE], {
        format: 'json',
        exclude: [],
        minCount: '2',
        minDepth: '1',
        similarity: '0.7',
      });
    });
    const parsed = JSON.parse(output);
    const input = parsed.clusters.find(
      (c) => c.fingerprint === 'div(div,div(input))' && c.type === 'exact'
    );
    expect(input).toBeTruthy();
    expect(input.occurrences).toBe(2);
  });

  test('does not report leaf-only components', () => {
    const output = captureOutput(() => {
      findJsx([JSX_FIXTURE], {
        format: 'json',
        exclude: [],
        minCount: '2',
        minDepth: '1',
        similarity: '0.7',
      });
    });
    const parsed = JSON.parse(output);
    // No cluster should have a single-node leaf fingerprint with no children
    for (const c of parsed.clusters) {
      expect(c.nodeCount).toBeGreaterThan(1);
    }
  });
});
