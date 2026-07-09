const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const {
  findDuplicateLiterals,
} = require("../src/commands/find-duplicate-literals");

const DUPES_DIR = path.join(__dirname, "fixtures", "dupes");
const CLI = path.join(__dirname, "..", "bin", "hardcode-replacer.js");

const BASE_OPTS = {
  minOccurrences: "3",
  minFiles: "2",
  minLength: "8",
  kind: "all",
  exclude: [],
};

function run(overrides = {}) {
  return findDuplicateLiterals([DUPES_DIR], { ...BASE_OPTS, ...overrides });
}

function findValue(result, value) {
  return result.findings.find((f) => f.value === value);
}

describe("findDuplicateLiterals", () => {
  test("returns the structured result shape", () => {
    const result = run();
    expect(result.command).toBe("duplicate-literals");
    expect(result.summary).toBeTruthy();
    expect(Array.isArray(result.findings)).toBe(true);
    expect(result.summary.scannedFiles).toBe(3);
  });

  test("detects a string literal duplicated across >=2 files", () => {
    const result = run();
    const str = findValue(result, "https://api.example.com/v1/users");
    expect(str).toBeTruthy();
    expect(str.kind).toBe("string");
    expect(str.occurrences).toBe(3);
    expect(str.files).toBe(3);
    // Spans all three fixture files.
    const files = str.locations.map((l) => path.basename(l.file)).sort();
    expect(files).toEqual(["a.js", "b.js", "c.js"]);
    // Correct 1-indexed line for the a.js export.
    const aLoc = str.locations.find((l) => path.basename(l.file) === "a.js");
    expect(aLoc.line).toBe(3);
  });

  test("detects a regex literal duplicated across files", () => {
    const result = run();
    const re = findValue(result, "/a\\/b/g");
    expect(re).toBeTruthy();
    expect(re.kind).toBe("regex");
    expect(re.occurrences).toBe(3);
    expect(re.files).toBe(3);
  });

  // The headline guarantee: an AST distinguishes a RegExpLiteral from a
  // division. Text/regex extraction cannot.
  test("regex win: /a\\/b/g IS detected while division a / b is NOT", () => {
    const result = run();
    // The regex literal is reported...
    expect(findValue(result, "/a\\/b/g")).toBeTruthy();
    // ...and no finding is a spurious division-derived literal.
    for (const f of result.findings) {
      expect(f.value).not.toContain("x / y");
      // The division tokens never form a regex-shaped finding.
      expect(f.value === "/ y/" || f.value === "/x /").toBe(false);
    }
  });

  test("discovers a regex-only file with NO quotes (slash-delimited literal)", () => {
    // Regression: file discovery must include `/` in its candidate marker, or a
    // file whose only duplicated literal is a regex — with no quotes/backticks
    // anywhere — is silently skipped and the whole finding is lost.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dupelit-regex-"));
    try {
      fs.writeFileSync(path.join(dir, "one.js"), "const re = /a\\/b/g;\n");
      fs.writeFileSync(path.join(dir, "two.js"), "export const re2 = /a\\/b/g;\n");
      const result = findDuplicateLiterals([dir], {
        minOccurrences: "2",
        minFiles: "2",
        minLength: "8",
        kind: "all",
        exclude: [],
      });
      expect(result.summary.scannedFiles).toBe(2);
      const rx = findValue(result, "/a\\/b/g");
      expect(rx).toBeTruthy();
      expect(rx.kind).toBe("regex");
      expect(rx.occurrences).toBe(2);
      expect(rx.files).toBe(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a literal in only one file is NOT reported", () => {
    // Even with the occurrence floor dropped to 1, the >=2-files rule excludes
    // "only-here-unique-1234" (present only in c.js).
    const result = run({ minOccurrences: "1" });
    expect(findValue(result, "only-here-unique-1234")).toBeUndefined();
  });

  test("--min-occurrences threshold gates reporting", () => {
    const atDefault = run(); // minOccurrences 3
    expect(findValue(atDefault, "shared-two-files-only")).toBeUndefined();

    const lowered = run({ minOccurrences: "2" });
    const two = findValue(lowered, "shared-two-files-only");
    expect(two).toBeTruthy();
    expect(two.occurrences).toBe(2);
    expect(two.files).toBe(2);
  });

  test("--min-files threshold gates reporting", () => {
    // "thrice-in-one-file-value" has 3 occurrences but all in a.js.
    const atDefault = run(); // minFiles 2
    expect(findValue(atDefault, "thrice-in-one-file-value")).toBeUndefined();

    const lowered = run({ minFiles: "1" });
    const one = findValue(lowered, "thrice-in-one-file-value");
    expect(one).toBeTruthy();
    expect(one.occurrences).toBe(3);
    expect(one.files).toBe(1);
  });

  test("--kind filters to a single literal kind", () => {
    const regexOnly = run({ kind: "regex" });
    expect(regexOnly.findings.every((f) => f.kind === "regex")).toBe(true);
    expect(regexOnly.findings.length).toBeGreaterThan(0);

    const stringOnly = run({ kind: "string" });
    expect(stringOnly.findings.every((f) => f.kind === "string")).toBe(true);
    expect(stringOnly.findings.length).toBeGreaterThan(0);
  });

  test("canonical-source hint prefers an exporting file", () => {
    const result = run();
    const str = findValue(result, "https://api.example.com/v1/users");
    expect(str.suggestedSource.reason).toBe("exported");
    expect(path.basename(str.suggestedSource.file)).toBe("a.js");
  });

  test("excludes import/require source paths and short/number/trivial noise", () => {
    const result = run({ minOccurrences: "1", minFiles: "1", minLength: "1" });
    // "./util" is an import source and starts with "." — never reported.
    expect(findValue(result, "./util")).toBeUndefined();
  });

  test("filters a bare lowercase word as non-drift noise, but keeps structured literals", () => {
    const result = run();
    // "background" appears 3x across 3 files and is >= minLength, so only the
    // bare-lowercase-word heuristic can suppress it.
    expect(findValue(result, "background")).toBeUndefined();
    // Positive control: a structured literal (the endpoint URL) with the same
    // spread IS still reported — the filter is precise, not blanket.
    expect(findValue(result, "https://api.example.com/v1/users")).toBeTruthy();
  });
});

describe("duplicate-literals CLI --check", () => {
  test("exits 1 when duplicates meet thresholds", () => {
    let status = 0;
    try {
      execFileSync("node", [CLI, "duplicate-literals", DUPES_DIR, "--check"], {
        stdio: "pipe",
      });
    } catch (err) {
      status = err.status;
    }
    expect(status).toBe(1);
  });

  test("exits 0 when there are no findings", () => {
    // No literal reaches 99 occurrences, so the run is clean.
    const out = execFileSync(
      "node",
      [
        CLI,
        "duplicate-literals",
        DUPES_DIR,
        "--check",
        "--min-occurrences",
        "99",
      ],
      { stdio: "pipe", encoding: "utf-8" }
    );
    expect(out).toContain("No duplicated literals found");
  });

  test("--json produces a parseable payload with the right command", () => {
    const out = execFileSync(
      "node",
      [CLI, "duplicate-literals", DUPES_DIR, "--json"],
      { stdio: "pipe", encoding: "utf-8" }
    );
    const parsed = JSON.parse(out);
    expect(parsed.command).toBe("duplicate-literals");
    expect(parsed.findings.length).toBeGreaterThan(0);
  });
});
