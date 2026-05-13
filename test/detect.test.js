const {
  detectHexViolations,
  isHexExemptPath,
  DEFAULT_HEX_PATTERN,
  DEFAULT_FILTER_KEYWORDS,
  DEFAULT_EXEMPT_PATH_FRAGMENTS,
} = require("../src/detect");
const { HEX_PATTERN } = require("../src/color-patterns");

describe("detectHexViolations", () => {
  test("finds bare 6-digit hex", () => {
    const result = detectHexViolations("color: #FF0000;");
    expect(result).toHaveLength(1);
    expect(result[0].match).toBe("#FF0000");
    expect(result[0].line).toBe(1);
    expect(result[0].content).toBe("color: #FF0000;");
  });

  test("finds lowercase hex", () => {
    const result = detectHexViolations("background: #aabbcc;");
    expect(result).toHaveLength(1);
    expect(result[0].match).toBe("#aabbcc");
  });

  test("default pattern ignores 3-digit hex shorthand", () => {
    // The narrow write-time default is deliberate — 3-digit shorthand is common
    // outside design tokens and would generate noisy blocks. Callers wanting
    // batch-sweep semantics pass HEX_PATTERN explicitly.
    const result = detectHexViolations("color: #fff;");
    expect(result).toEqual([]);
  });

  test("respects caller-supplied pattern (HEX_PATTERN catches 3-digit)", () => {
    const result = detectHexViolations("color: #fff;", { pattern: HEX_PATTERN });
    expect(result).toHaveLength(1);
    expect(result[0].match).toBe("#fff");
  });

  test("skips single-line // comment", () => {
    const result = detectHexViolations("  // old color was #FF0000");
    expect(result).toEqual([]);
  });

  test("skips single-line /* */ block comment", () => {
    const result = detectHexViolations("/* #FF0000 */");
    expect(result).toEqual([]);
  });

  test("skips multi-line block comment body", () => {
    const content = [
      "/*",
      "  palette:",
      "  #FF0000",
      "  #00FF00",
      "*/",
      ".real { color: var(--c); }",
    ].join("\n");
    const result = detectHexViolations(content);
    expect(result).toEqual([]);
  });

  test("skips lines with var(--", () => {
    const result = detectHexViolations("color: var(--main, #ff0000);");
    expect(result).toEqual([]);
  });

  test("skips lines with @theme", () => {
    const result = detectHexViolations("@theme { --c: #ff0000; }");
    expect(result).toEqual([]);
  });

  test("skips lines with primitive", () => {
    const result = detectHexViolations("--primitive-brand: #ff0000;");
    expect(result).toEqual([]);
  });

  test("skips lines with allow-hex escape", () => {
    const result = detectHexViolations("color: #ff0000; // allow-hex: legacy logo");
    expect(result).toEqual([]);
  });

  test("respects maxMatches", () => {
    const content = ["#ff0001", "#ff0002", "#ff0003", "#ff0004", "#ff0005"].join("\n");
    const result = detectHexViolations(content, { maxMatches: 3 });
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.match)).toEqual(["#ff0001", "#ff0002", "#ff0003"]);
  });

  test("caller-supplied filterKeywords replaces defaults", () => {
    const result = detectHexViolations("color: #ff0000; // CUSTOM_ESCAPE", {
      filterKeywords: ["CUSTOM_ESCAPE"],
    });
    expect(result).toEqual([]);
  });

  test("skipComments=false includes hex in comments", () => {
    const result = detectHexViolations("// fallback #FF0000", { skipComments: false });
    expect(result).toHaveLength(1);
    expect(result[0].match).toBe("#FF0000");
  });

  test("reports correct 1-indexed line numbers", () => {
    const content = "first line\nsecond line\ncolor: #abcdef;";
    const result = detectHexViolations(content);
    expect(result).toHaveLength(1);
    expect(result[0].line).toBe(3);
  });

  test("trims trailing whitespace from content", () => {
    const result = detectHexViolations("color: #ff0000;   \t");
    expect(result[0].content).toBe("color: #ff0000;");
  });

  test("empty input returns empty array", () => {
    expect(detectHexViolations("")).toEqual([]);
  });

  test("no hex matches returns empty array", () => {
    expect(detectHexViolations("color: var(--main);")).toEqual([]);
  });
});

describe("isHexExemptPath", () => {
  test("exempts design-tokens directory", () => {
    expect(isHexExemptPath("/foo/design-tokens/main.css")).toBe(true);
  });

  test("exempts foundation.css", () => {
    expect(isHexExemptPath("/foo/styles/foundation.css")).toBe(true);
  });

  test("exempts semantic.css", () => {
    expect(isHexExemptPath("/foo/styles/semantic.css")).toBe(true);
  });

  test("exempts component.css", () => {
    expect(isHexExemptPath("/foo/styles/component.css")).toBe(true);
  });

  test("exempts theme.css", () => {
    expect(isHexExemptPath("/foo/styles/theme.css")).toBe(true);
  });

  test("exempts tailwind.config.ts", () => {
    expect(isHexExemptPath("/foo/tailwind.config.ts")).toBe(true);
  });

  test("exempts *.test.* files", () => {
    expect(isHexExemptPath("/foo/component.test.tsx")).toBe(true);
  });

  test("exempts *.spec.* files", () => {
    expect(isHexExemptPath("/foo/component.spec.ts")).toBe(true);
  });

  test("exempts *.stories.* files", () => {
    expect(isHexExemptPath("/foo/Button.stories.tsx")).toBe(true);
  });

  test("exempts *.gallery.* files", () => {
    expect(isHexExemptPath("/foo/Button.gallery.tsx")).toBe(true);
  });

  test("exempts registry.generated", () => {
    expect(isHexExemptPath("/foo/registry.generated.ts")).toBe(true);
  });

  test("does not exempt regular component file", () => {
    expect(isHexExemptPath("/foo/Button.tsx")).toBe(false);
  });

  test("accepts caller-supplied extra fragments", () => {
    expect(
      isHexExemptPath("/foo/legacy/colors.ts", {
        extraFragments: ["/legacy/"],
      })
    ).toBe(true);
  });

  test("returns false for paths with no matching fragment", () => {
    expect(isHexExemptPath("/foo/Button.tsx", { extraFragments: ["/legacy/"] })).toBe(false);
  });
});

describe("DEFAULT_* constants", () => {
  test("DEFAULT_HEX_PATTERN matches 6-digit only", () => {
    expect("#ff0000").toMatch(DEFAULT_HEX_PATTERN);
    expect("#ffffff").toMatch(DEFAULT_HEX_PATTERN);
    expect("#fff").not.toMatch(DEFAULT_HEX_PATTERN);
    expect("#ff0000ff").toMatch(DEFAULT_HEX_PATTERN); // still matches 6-digit prefix
  });

  test("DEFAULT_FILTER_KEYWORDS contains expected entries", () => {
    expect(DEFAULT_FILTER_KEYWORDS).toEqual(
      expect.arrayContaining(["var(--", "@theme", "primitive", "allow-hex"])
    );
  });

  test("DEFAULT_EXEMPT_PATH_FRAGMENTS contains expected entries", () => {
    expect(DEFAULT_EXEMPT_PATH_FRAGMENTS).toEqual(
      expect.arrayContaining([
        "/design-tokens/",
        "/foundation.css",
        ".test.",
        ".spec.",
        ".stories.",
        "tailwind.config",
      ])
    );
  });
});
