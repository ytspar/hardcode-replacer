const {
  classifyContext,
  clearCache,
  contextLabel,
  isActionable,
} = require("../src/context-classifier");

beforeEach(() => {
  clearCache();
});

describe("classifyContext", () => {
  test("identifies CSS variable definitions", () => {
    const result = classifyContext({
      file: "src/styles.css",
      text: "  --primary-500: #10b981;",
      match: "#10b981",
    });
    expect(result).toBe("css-definition");
  });

  test("identifies meta/manifest tags", () => {
    const result = classifyContext({
      file: "src/index.html",
      text: '<meta name="theme-color" content="#10b981">',
      match: "#10b981",
    });
    expect(result).toBe("meta");
  });

  test("identifies object key mappings", () => {
    const result = classifyContext({
      file: "src/utils.js",
      text: "  '#10b981': 'success',",
      match: "#10b981",
    });
    expect(result).toBe("mapping");
  });

  test("identifies effect colors (black with alpha)", () => {
    const result = classifyContext({
      file: "src/component.tsx",
      text: "  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);",
      match: "rgba(0, 0, 0, 0.1)",
    });
    expect(result).toBe("effect");
  });

  test("identifies effect colors (white with alpha)", () => {
    const result = classifyContext({
      file: "src/component.tsx",
      text: "  background: rgba(255, 255, 255, 0.5);",
      match: "rgba(255, 255, 255, 0.5)",
    });
    expect(result).toBe("effect");
  });

  test("returns actionable for normal color usage", () => {
    const result = classifyContext({
      file: "src/component.tsx",
      text: "  color: #10b981;",
      match: "#10b981",
    });
    expect(result).toBe("actionable");
  });

  test("identifies getCssVar as canvas context", () => {
    const result = classifyContext({
      file: "src/utils.js",
      text: "  const color = getCssVar('--primary') || '#10b981';",
      match: "#10b981",
    });
    expect(result).toBe("canvas");
  });

  test("identifies fallback with || as canvas", () => {
    const result = classifyContext({
      file: "src/utils.js",
      text: "  return someVar || '#10b981';",
      match: "#10b981",
    });
    expect(result).toBe("canvas");
  });

  test("identifies theme definition files by path", () => {
    const result = classifyContext({
      file: "src/theme.ts",
      text: "  primary: '#10b981',",
      match: "#10b981",
    });
    expect(result).toBe("theme-definition");
  });

  test("identifies palette definition files", () => {
    const result = classifyContext({
      file: "src/palette.ts",
      text: "  green: '#10b981',",
      match: "#10b981",
    });
    expect(result).toBe("theme-definition");
  });

  test("identifies design-tokens directory as theme definition", () => {
    const result = classifyContext({
      file: "src/design-tokens/colors.ts",
      text: "  primary: '#10b981',",
      match: "#10b981",
    });
    expect(result).toBe("theme-definition");
  });

  test("theme definition file with var() is actionable", () => {
    const result = classifyContext({
      file: "src/theme.ts",
      text: "  primary: 'var(--color-primary) #10b981',",
      match: "#10b981",
    });
    expect(result).toBe("actionable");
  });

  test("identifies mapping files by path", () => {
    const result = classifyContext({
      file: "src/colorMapper.ts",
      text: "  red: '#ff0000',",
      match: "#ff0000",
    });
    expect(result).toBe("mapping");
  });

  test("identifies template literal generated code", () => {
    const result = classifyContext({
      file: "src/generator.ts",
      text: `  \`<div style="color: \${color}">#ff0000</div>\``,
      match: "#ff0000",
    });
    expect(result).toBe("generated");
  });

  test("identifies quoted CSS property string as mapping", () => {
    const result = classifyContext({
      file: "src/utils.ts",
      text: '  "background-color: #ff0000": "error",',
      match: "#ff0000",
    });
    expect(result).toBe("mapping");
  });

  test("identifies css: string as mapping", () => {
    const result = classifyContext({
      file: "src/styles.ts",
      text: "  css: 'border-color: rgba(0, 0, 0, 0.1)',",
      match: "rgba(0, 0, 0, 0.1)",
    });
    expect(result).toBe("mapping");
  });

  test("identifies modern rgb(0 0 0 / alpha) as effect", () => {
    const result = classifyContext({
      file: "src/component.tsx",
      text: "  box-shadow: 0 2px 4px rgb(0 0 0 / 0.1);",
      match: "rgb(0 0 0 / 0.1)",
    });
    expect(result).toBe("effect");
  });

  test("identifies modern rgb(255 255 255 / alpha) as effect", () => {
    const result = classifyContext({
      file: "src/component.tsx",
      text: "  background: rgb(255 255 255 / 0.5);",
      match: "rgb(255 255 255 / 0.5)",
    });
    expect(result).toBe("effect");
  });

  test("identifies #000 in shadow context as effect", () => {
    const result = classifyContext({
      file: "src/component.tsx",
      text: "  box-shadow: 0 2px 8px #000;",
      match: "#000",
    });
    expect(result).toBe("effect");
  });

  test("identifies #fff in gradient context as effect", () => {
    const result = classifyContext({
      file: "src/component.tsx",
      text: "  background: linear-gradient(to bottom, #fff, transparent);",
      match: "#fff",
    });
    expect(result).toBe("effect");
  });

  test("#000 outside shadow/gradient context is actionable", () => {
    const result = classifyContext({
      file: "src/component.tsx",
      text: "  color: #000;",
      match: "#000",
    });
    expect(result).toBe("actionable");
  });

  test("getComputedStyle triggers canvas classification", () => {
    const result = classifyContext({
      file: "src/utils.js",
      text: "  getComputedStyle(el).getPropertyValue('--color')",
      match: "#10b981",
    });
    expect(result).toBe("canvas");
  });
});

describe("contextLabel", () => {
  test("returns human-readable labels", () => {
    expect(contextLabel("actionable")).toBe("ACTIONABLE");
    expect(contextLabel("css-definition")).toBe("CSS VAR DEFINITION");
    expect(contextLabel("theme-definition")).toBe("THEME DEFINITION");
    expect(contextLabel("canvas")).toBe("CANVAS/WEBGL");
    expect(contextLabel("mapping")).toBe("MAPPING/LOOKUP");
    expect(contextLabel("generated")).toBe("GENERATED CODE");
    expect(contextLabel("meta")).toBe("META/MANIFEST");
    expect(contextLabel("effect")).toBe("EFFECT (black/white alpha)");
  });

  test("returns raw value for unknown contexts", () => {
    expect(contextLabel("unknown")).toBe("unknown");
  });
});

describe("isActionable", () => {
  test("returns true for actionable", () => {
    expect(isActionable("actionable")).toBe(true);
  });

  test("returns false for non-actionable", () => {
    expect(isActionable("css-definition")).toBe(false);
    expect(isActionable("canvas")).toBe(false);
    expect(isActionable("effect")).toBe(false);
  });
});
