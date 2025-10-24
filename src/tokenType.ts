import { tokenText, type InputToken, type TokenLine } from "./tokenLine.ts";
import { tokenMap, type TokenType } from "./tokens.ts";

export const SPACE_TYPE = "Space";
export const DEFAULT_TEXT_TYPE = "NakedString";

export function sortedValidTokens(token: InputToken | undefined): TokenType[] {
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

export function bestMatchingType(token: InputToken | undefined): string {
  if (!token) return DEFAULT_TEXT_TYPE;
  if (token.type === SPACE_TYPE) return SPACE_TYPE;
  if (token.type === DEFAULT_TEXT_TYPE) return DEFAULT_TEXT_TYPE;
  const candidates = sortedValidTokens(token);
  return candidates[0]?.type ?? DEFAULT_TEXT_TYPE;
}

export function retargetTokenType(token: InputToken | undefined): void {
  if (!token) return;
  if (token.type === SPACE_TYPE) return;
  if (token.subTokens && token.subTokens.length) return;
  const nextType = bestMatchingType(token);
  token.type = nextType;
}

export function retargetTokenLine(tokens: TokenLine): void {
  for (const token of tokens) {
    if (!token) continue;
    if (token.type === SPACE_TYPE) continue;
    if (token.subTokens && token.subTokens.length) {
      retargetTokenLine(token.subTokens);
      continue;
    }
    retargetTokenType(token);
  }
}

function repeatSpace(count: number): string {
  return " ".repeat(Math.max(0, count));
}

function appendToSpaceToken(target: InputToken, addition: string): void {
  const existing = typeof target.text === "string" ? target.text : "";
  target.text = existing + addition;
}

export function promoteSpaceFromNakedString(
  line: TokenLine,
  token: InputToken,
  offset: number,
  extraSpaces = 1,
): InputToken | null {
  if (!line.length) return null;
  if (token.type !== DEFAULT_TEXT_TYPE) return null;

  const tokenIndex = line.indexOf(token);
  if (tokenIndex === -1) return null;

  const text = tokenText(token);
  const clampedOffset = Math.min(Math.max(offset, 0), text.length);
  const left = text.slice(0, clampedOffset);
  const right = text.slice(clampedOffset);

  const leftMatch = left.match(/^(.*?)(\s*)$/);
  const leftCore = leftMatch ? leftMatch[1] ?? "" : left;
  const leftSpaces = leftMatch ? leftMatch[2] ?? "" : "";

  const rightMatch = right.match(/^(\s*)(.*)$/);
  const rightSpaces = rightMatch ? rightMatch[1] ?? "" : "";
  const remainingRight = rightMatch ? rightMatch[2] ?? "" : "";

  const baseSpaces = leftSpaces + rightSpaces;
  const additionalSpaces = repeatSpace(extraSpaces);
  const spacesToInsert = (baseSpaces || " ") + additionalSpaces;

  if (!token.subTokens || token.subTokens.length === 0) {
    token.text = leftCore;
  }

  if (typeof token.text === "string" && token.text.length === 0 && !token.subTokens?.length) {
    line.splice(tokenIndex, 1);
  }

  const insertionIndex = Math.min(tokenIndex + 1, line.length);
  const existingNext = line[insertionIndex];

  let spaceToken: InputToken;
  if (existingNext && existingNext.type === SPACE_TYPE) {
    spaceToken = existingNext;
    appendToSpaceToken(spaceToken, spacesToInsert);
  } else {
    spaceToken = { type: SPACE_TYPE, tokenIdx: 0, text: spacesToInsert, x: 0 };
    line.splice(insertionIndex, 0, spaceToken);
  }

  if (remainingRight.length) {
    const newRightToken: InputToken = {
      type: DEFAULT_TEXT_TYPE,
      tokenIdx: 0,
      text: remainingRight,
      x: 0,
    };
    const spaceIndex = line.indexOf(spaceToken);
    line.splice(spaceIndex + 1, 0, newRightToken);
  }

  return spaceToken;
}
