// Fixture C for the duplicate-literals command.
export const url = "https://api.example.com/v1/users";

// Third occurrence of the duplicated regex literal.
export const patternC = /a\/b/g;

// A division expression — never a literal.
export function quotient(x, y) {
  return x / y;
}

// Only present in this file — must NOT be reported.
export const solo = "only-here-unique-1234";

export const bgC = "background";
