// Fixture A for the duplicate-literals command.
// Exports the shared endpoint string (canonical-source hint should point here).
export const ENDPOINT = "https://api.example.com/v1/users";

// A duplicated regex literal — the AST-only win. Text extraction gets this wrong.
export const patternA = /a\/b/g;

// A division expression. `x / y` must NOT be picked up as a regex literal.
export function divide(x, y) {
  return x / y;
}

// Appears in exactly two files (a.js + b.js) — 2 occurrences total.
export const twoFileOnly = "shared-two-files-only";

// Appears three times but all in this one file — spans only 1 file.
export const oneA = "thrice-in-one-file-value";
export const oneB = "thrice-in-one-file-value";
export const oneC = "thrice-in-one-file-value";
