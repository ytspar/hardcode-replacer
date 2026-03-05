/** Shared animation utilities */

const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

/** Wait ms (respects reduced motion) */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, reducedMotion ? 0 : ms));
}

/** Is reduced motion preferred? */
export function isReducedMotion(): boolean {
  return reducedMotion;
}
