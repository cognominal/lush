import { tokenText, type InputToken } from "./tokenLine.ts";
import { tokenMap, type PreAstType } from "./tokens.ts";

export function sortedValidTokens(token: InputToken | undefined): PreAstType[] {
  if (!token) return [];
  const text = tokenText(token);
  if (!text) return [];

  const entries = Array.from(tokenMap.values());
  const matches = entries.filter(entry => {
    if (typeof entry?.validator !== "function") return false;
    try {
      return entry.validator(text);
    } catch {
      return false;
    }
  });
  return matches.sort((a, b) => b.priority - a.priority);
}

export function rotateTokenType(token: InputToken | undefined): boolean {
  if (!token) return false;
  const candidates = sortedValidTokens(token);
  if (!candidates.length) return false;

  const currentType = token.type;
  const currentIdx = candidates.findIndex(candidate => candidate.type === currentType);
  const nextIndex = currentIdx >= 0 ? (currentIdx + 1) % candidates.length : 0;
  const next = candidates[nextIndex];
  if (!next) return false;

  if (token.type === next.type) return false;
  token.type = next.type;
  return true;
}
