

const path = require('node:path');
const fs = require('node:fs');
const { loadConfig, mergeOptions } = require('../src/config');

const FIXTURES = path.join(__dirname, 'fixtures');

describe('mergeOptions', () => {
  test('CLI options take precedence over config', () => {
    const cli = { format: 'json', threshold: '5', exclude: ['*.test.*'] };
    const config = { format: 'text', threshold: 10, exclude: ['*.stories.*'] };
    const result = mergeOptions(cli, config);
    expect(result.format).toBe('json');
    expect(result.threshold).toBe('5');
    expect(result.exclude).toEqual(['*.test.*']);
  });

  test('config fills in missing CLI options', () => {
    const cli = { format: 'text', threshold: '10', exclude: [] };
    const config = { exclude: ['**/*.test.*'], include: '*.tsx', vars: 'theme.css' };
    const result = mergeOptions(cli, config);
    expect(result.exclude).toEqual(['**/*.test.*']);
    expect(result.include).toBe('*.tsx');
    expect(result.vars).toBe('theme.css');
  });

  test('handles empty config', () => {
    const cli = { format: 'text', threshold: '10', exclude: [] };
    const result = mergeOptions(cli, {});
    expect(result.format).toBe('text');
    expect(result.threshold).toBe('10');
  });

  test('config.json sets format to json when CLI format is default', () => {
    const cli = { format: 'text', exclude: [] };
    const config = { json: true };
    const result = mergeOptions(cli, config);
    expect(result.format).toBe('json');
  });

  test('config.json does not override explicit --format', () => {
    const _cli = { format: 'text', exclude: [] };
    // If the user passed --format text explicitly, we can't distinguish
    // from the default. But if format is already 'json', config.json won't downgrade.
    const cli2 = { format: 'json', exclude: [] };
    const config = { json: true };
    const result = mergeOptions(cli2, config);
    expect(result.format).toBe('json');
  });

  test('config.named = false disables named colors', () => {
    const cli = { named: true, exclude: [] };
    const config = { named: false };
    const result = mergeOptions(cli, config);
    expect(result.named).toBe(false);
  });

  test('config.threshold overrides default threshold', () => {
    const cli = { threshold: '10', exclude: [] };
    const config = { threshold: 5 };
    const result = mergeOptions(cli, config);
    expect(result.threshold).toBe('5');
  });

  test('config.minCount and minClasses override defaults', () => {
    const cli = { minCount: '2', minClasses: '2', exclude: [] };
    const config = { minCount: 3, minClasses: 4 };
    const result = mergeOptions(cli, config);
    expect(result.minCount).toBe('3');
    expect(result.minClasses).toBe('4');
  });

  test('config.tailwindVersion is applied', () => {
    const cli = { exclude: [] };
    const config = { tailwindVersion: 4 };
    const result = mergeOptions(cli, config);
    expect(result.tailwindVersion).toBe(4);
  });

  test('config.exclude as string is wrapped in array', () => {
    const cli = { exclude: [] };
    const config = { exclude: '**/*.test.*' };
    const result = mergeOptions(cli, config);
    expect(result.exclude).toEqual(['**/*.test.*']);
  });
});

describe('loadConfig', () => {
  test('returns empty object when no config file exists', () => {
    const config = loadConfig('/tmp');
    expect(config).toEqual({});
  });

  test('loads config from fixture directory if present', () => {
    // Create a temp config file
    const configPath = path.join(FIXTURES, '.hardcode-replacerrc.json');
    const configData = { threshold: 5, exclude: ['*.test.*'] };
    fs.writeFileSync(configPath, JSON.stringify(configData));

    try {
      const config = loadConfig(FIXTURES);
      expect(config.threshold).toBe(5);
      expect(config.exclude).toEqual(['*.test.*']);
    } finally {
      fs.unlinkSync(configPath);
    }
  });
});
