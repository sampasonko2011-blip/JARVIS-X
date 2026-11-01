export function identityMatches(observed, requested) {
  if (typeof observed !== "string" || !observed.trim() || typeof requested !== "string" || !requested.trim()) return false;
  const actual = observed.toLowerCase();
  const expected = requested.toLowerCase();
  return actual === expected || actual.startsWith(expected + "-");
}

export function hasExpectedArithmeticResult(output) {
  return typeof output === "string" && /(^|\\D)323(\\D|$)/.test(output);
}
