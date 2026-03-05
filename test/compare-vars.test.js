

const path = require('node:path');
const fs = require('node:fs');
const { parseVariablesFile } = require('../src/commands/compare-vars');

const FIXTURES = path.join(__dirname, 'fixtures');

describe('parseVariablesFile', () => {
  test('parses CSS custom properties', () => {
    const palette = parseVariablesFile(path.join(FIXTURES, 'variables.css'));
    expect(palette).toBeTruthy();
    expect(palette['--color-primary']).toBe('#667eea');
    expect(palette['--color-danger']).toBe('#ff0000');
    expect(palette['--color-white']).toBe('#ffffff');
    expect(palette['--color-text']).toBe('#333333');
    expect(Object.keys(palette).length).toBe(9);
  });

  test('parses JSON color files', () => {
    const tmpJson = path.join(FIXTURES, '_test_colors.json');
    fs.writeFileSync(tmpJson, JSON.stringify({
      primary: '#3b82f6',
      danger: '#ef4444',
      nested: {
        background: '#f8fafc',
        text: '#0f172a',
      },
    }));

    try {
      const palette = parseVariablesFile(tmpJson);
      expect(palette).toBeTruthy();
      expect(palette.primary).toBe('#3b82f6');
      expect(palette.danger).toBe('#ef4444');
      expect(palette['nested.background']).toBe('#f8fafc');
      expect(palette['nested.text']).toBe('#0f172a');
    } finally {
      fs.unlinkSync(tmpJson);
    }
  });

  test('parses JS/TS color export files', () => {
    const tmpJs = path.join(FIXTURES, '_test_colors.js');
    fs.writeFileSync(tmpJs, `
      module.exports = {
        'primary': '#10b981',
        'secondary': '#6366f1',
        border: '#e2e8f0',
      };
    `);

    try {
      const palette = parseVariablesFile(tmpJs);
      expect(palette).toBeTruthy();
      expect(palette.primary).toBe('#10b981');
      expect(palette.secondary).toBe('#6366f1');
      expect(palette.border).toBe('#e2e8f0');
    } finally {
      fs.unlinkSync(tmpJs);
    }
  });

  test('returns null for nonexistent file', () => {
    const palette = parseVariablesFile('/nonexistent/file.css');
    expect(palette).toBeNull();
  });

  test('parses CSS with rgb values', () => {
    const tmpCss = path.join(FIXTURES, '_test_rgb.css');
    fs.writeFileSync(tmpCss, `
      :root {
        --bg-primary: rgb(59, 130, 246);
        --text-main: #1e293b;
      }
    `);

    try {
      const palette = parseVariablesFile(tmpCss);
      expect(palette).toBeTruthy();
      expect(palette['--bg-primary']).toBeTruthy();
      expect(palette['--text-main']).toBe('#1e293b');
    } finally {
      fs.unlinkSync(tmpCss);
    }
  });

  test('handles empty variables file', () => {
    const tmpCss = path.join(FIXTURES, '_test_empty.css');
    fs.writeFileSync(tmpCss, '/* empty */\n');

    try {
      const palette = parseVariablesFile(tmpCss);
      expect(palette).toBeTruthy();
      expect(Object.keys(palette).length).toBe(0);
    } finally {
      fs.unlinkSync(tmpCss);
    }
  });

  test('parses nested JSON with multiple levels', () => {
    const tmpJson = path.join(FIXTURES, '_test_nested.json');
    fs.writeFileSync(tmpJson, JSON.stringify({
      colors: {
        brand: {
          primary: '#0ea5e9',
          secondary: '#8b5cf6',
        },
        neutral: {
          50: '#fafafa',
          900: '#171717',
        },
      },
    }));

    try {
      const palette = parseVariablesFile(tmpJson);
      expect(palette).toBeTruthy();
      expect(palette['colors.brand.primary']).toBe('#0ea5e9');
      expect(palette['colors.brand.secondary']).toBe('#8b5cf6');
      expect(palette['colors.neutral.50']).toBe('#fafafa');
      expect(palette['colors.neutral.900']).toBe('#171717');
    } finally {
      fs.unlinkSync(tmpJson);
    }
  });
});
