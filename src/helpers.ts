export function isStrNumber(input: string): boolean {
  if (typeof input !== "string") return false;
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (trimmed === "Infinity" || trimmed === "+Infinity" || trimmed === "-Infinity") {
    return false;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed);
}

const SIGIL_SET = new Set(["$", "@", "%"]);

export function isStrVariable(input: string): boolean {
  if (typeof input !== "string" || input.length === 0) return false;
  let idx = 0;

  if (SIGIL_SET.has(input[idx])) {
    idx += 1;
  }

  if (input[idx] === "*") {
    idx += 1;
  }

  if (idx >= input.length) return false;

  for (; idx < input.length; idx++) {
    const ch = input[idx];
    const code = ch.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    const isUnderscore = ch === "_";
    if (!(isDigit || isUpper || isLower || isUnderscore)) {
      return false;
    }
  }
  return true;
}

export function stripSigils(input: string): string {
  if (!isStrVariable(input)) return input;
  let idx = 0;
  if (SIGIL_SET.has(input[idx])) {
    idx += 1;
  }
  if (input[idx] === "*") {
    idx += 1;
  }
  return input.slice(idx);
}
