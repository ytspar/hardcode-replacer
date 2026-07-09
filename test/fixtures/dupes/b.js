// Fixture B for the duplicate-literals command.
import { helper } from "./util";

// Same endpoint string as a.js and c.js (import source "./util" is excluded).
export function callApi() {
  fetch("https://api.example.com/v1/users");
  return helper();
}

// Same duplicated regex literal.
export const patternB = /a\/b/g;

// A division expression — never a literal.
export function ratio(x, y) {
  return x / y;
}

// Second occurrence of the two-file-only string.
export const twoFileOnlyB = "shared-two-files-only";

export const bgB = "background";
