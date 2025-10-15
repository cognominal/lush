import type { InputToken, TokenLine } from "./tokenLine.ts";
import { tokenText } from "./tokenLine.ts";

const SPACE_TYPE = "Space";
const DEFAULT_TEXT_TYPE = "NakedString";

interface LeafLocation {
  container: InputToken[];
  index: number;
  token: InputToken | null;
  offset: number;
}

function tokenLength(token: InputToken): number {
  return tokenText(token).length;
}

function cloneTokenMetadata(token: InputToken): InputToken {
  const clone: InputToken = { ...token };
  delete clone.subTokens;
  delete clone.text;
  return clone;
}

function cloneLeafToken(token: InputToken, text: string): InputToken {
  const clone = cloneTokenMetadata(token);
  clone.text = text;
  return clone;
}

function createSpaceToken(text: string): InputToken {
  return { type: SPACE_TYPE, tokenIdx: 0, text, x: 0 };
}

function createDefaultTextToken(text: string): InputToken {
  return { type: DEFAULT_TEXT_TYPE, tokenIdx: 0, text, x: 0 };
}

function isSpaceToken(token: InputToken | null | undefined): boolean {
  return !!token && token.type === SPACE_TYPE;
}

function locateLeaf(tokens: InputToken[], column: number, preferPreviousOnBoundary = false): LeafLocation {
  let cursor = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    const length = tokenLength(token);
    const start = cursor;
    const end = cursor + length;
    if (column < end || (column === end && (preferPreviousOnBoundary || i === tokens.length - 1))) {
      if (token.subTokens && token.subTokens.length > 0) {
        return locateLeaf(token.subTokens, column - start, preferPreviousOnBoundary);
      }
      const boundedOffset = Math.min(Math.max(column - start, 0), length);
      return { container: tokens, index: i, token, offset: boundedOffset };
    }
    cursor = end;
    if (column === cursor) continue;
  }
  return { container: tokens, index: tokens.length, token: null, offset: 0 };
}

function mergeAdjacentTokens(tokens: InputToken[]): void {
  for (const token of tokens) {
    if (token.subTokens && token.subTokens.length > 0) {
      mergeAdjacentTokens(token.subTokens);
      delete token.text;
    }
  }
  for (let i = 0; i < tokens.length - 1;) {
    const current = tokens[i];
    const next = tokens[i + 1];
    if (!current || !next) {
      i++;
      continue;
    }
    if (current.subTokens && current.subTokens.length > 0) {
      i++;
      continue;
    }
    if (next.subTokens && next.subTokens.length > 0) {
      i++;
      continue;
    }
    if (current.type === next.type) {
      const currentText = typeof current.text === "string" ? current.text : "";
      const nextText = typeof next.text === "string" ? next.text : "";
      current.text = currentText + nextText;
      tokens.splice(i + 1, 1);
      continue;
    }
    i++;
  }
}

function pruneEmptyTokens(tokens: InputToken[]): void {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    if (!token) continue;
    if (token.subTokens && token.subTokens.length > 0) {
      pruneEmptyTokens(token.subTokens);
      if (token.subTokens.length === 0) {
        delete token.subTokens;
        const text = typeof token.text === "string" ? token.text : "";
        if (!text.length) {
          tokens.splice(i, 1);
        }
      } else {
        delete token.text;
      }
      continue;
    }
    const text = typeof token.text === "string" ? token.text : "";
    if (!text.length) {
      tokens.splice(i, 1);
    }
  }
}

function updateTokenPositions(tokens: InputToken[], offset = 0): number {
  let cursor = offset;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    token.tokenIdx = i;
    token.x = cursor;
    if (token.subTokens && token.subTokens.length > 0) {
      delete token.text;
      cursor = updateTokenPositions(token.subTokens, cursor);
    } else {
      const text = typeof token.text === "string" ? token.text : "";
      token.text = text;
      cursor += text.length;
    }
  }
  return cursor;
}

function normalizeTokenLine(line: TokenLine): void {
  pruneEmptyTokens(line);
  mergeAdjacentTokens(line);
  pruneEmptyTokens(line);
  updateTokenPositions(line, 0);
}

function insertSpace(location: LeafLocation): void {
  const { container, token, index, offset } = location;
  if (token && isSpaceToken(token)) {
    const existing = typeof token.text === "string" ? token.text : "";
    token.text = existing.slice(0, offset) + " " + existing.slice(offset);
    return;
  }
  const spaceToken = createSpaceToken(" ");
  if (!token) {
    container.splice(index, 0, spaceToken);
    return;
  }
  const existing = typeof token.text === "string" ? token.text : "";
  const before = existing.slice(0, offset);
  const after = existing.slice(offset);
  if (!before.length) {
    container.splice(index, 0, spaceToken);
  } else if (!after.length) {
    container.splice(index + 1, 0, spaceToken);
  } else {
    const rightToken = cloneLeafToken(token, after);
    token.text = before;
    container.splice(index + 1, 0, spaceToken, rightToken);
  }
}

function insertNonSpace(location: LeafLocation, ch: string): void {
  const { container, token, index, offset } = location;
  if (!token) {
    container.splice(index, 0, createDefaultTextToken(ch));
    return;
  }
  if (isSpaceToken(token)) {
    const text = typeof token.text === "string" ? token.text : "";
    const before = text.slice(0, offset);
    const after = text.slice(offset);
    const newToken = createDefaultTextToken(ch);
    if (!before.length) {
      token.text = after;
      container.splice(index, 0, newToken);
    } else {
      token.text = before;
      container.splice(index + 1, 0, newToken);
    }
    if (after.length && before.length) {
      container.splice(index + 2, 0, createSpaceToken(after));
    } else if (after.length && !before.length) {
      // token already holds after portion
      token.text = after;
    }
    return;
  }
  const text = typeof token.text === "string" ? token.text : "";
  token.text = text.slice(0, offset) + ch + text.slice(offset);
}

function insertCharacter(line: TokenLine, column: number, ch: string): void {
  const location = locateLeaf(line, column, true);
  if (ch === " ") {
    insertSpace(location);
  } else {
    insertNonSpace(location, ch);
  }
  normalizeTokenLine(line);
}

function deleteCharacter(line: TokenLine, column: number): boolean {
  const location = locateLeaf(line, column);
  const { token } = location;
  if (!token) return false;
  if (token.subTokens && token.subTokens.length > 0) return false;
  const text = typeof token.text === "string" ? token.text : "";
  if (location.offset >= text.length) return false;
  token.text = text.slice(0, location.offset) + text.slice(location.offset + 1);
  normalizeTokenLine(line);
  return true;
}

function deleteRange(line: TokenLine, start: number, end: number): void {
  if (end <= start) return;
  let remaining = end - start;
  while (remaining > 0) {
    const deleted = deleteCharacter(line, start);
    if (!deleted) break;
    remaining--;
  }
}

function splitToken(token: InputToken, offset: number): InputToken | null {
  const length = tokenLength(token);
  if (offset <= 0) {
    return cloneTokenMetadata(token);
  }
  if (offset >= length) {
    return null;
  }
  if (token.subTokens && token.subTokens.length > 0) {
    const leftSubs: InputToken[] = [];
    const rightSubs: InputToken[] = [];
    let cursor = 0;
    for (const sub of token.subTokens) {
      const subLength = tokenLength(sub);
      if (offset <= cursor) {
        rightSubs.push(sub);
      } else if (offset >= cursor + subLength) {
        leftSubs.push(sub);
      } else {
        const right = splitToken(sub, offset - cursor);
        leftSubs.push(sub);
        if (right) rightSubs.push(right);
      }
      cursor += subLength;
    }
    token.subTokens = leftSubs;
    const newToken = cloneTokenMetadata(token);
    if (rightSubs.length) {
      newToken.subTokens = rightSubs;
    }
    delete newToken.text;
    return newToken.subTokens && newToken.subTokens.length ? newToken : null;
  }
  const text = typeof token.text === "string" ? token.text : "";
  const left = text.slice(0, offset);
  const right = text.slice(offset);
  token.text = left;
  if (!right.length) return null;
  return cloneLeafToken(token, right);
}

function splitTokenLine(line: TokenLine, column: number): TokenLine {
  const right: TokenLine = [];
  let offset = 0;
  for (let i = 0; i < line.length;) {
    const token = line[i];
    if (!token) {
      i++;
      continue;
    }
    const length = tokenLength(token);
    const start = offset;
    const end = offset + length;
    if (column <= start) {
      right.push(token);
      line.splice(i, 1);
      continue;
    }
    if (column >= end) {
      offset = end;
      i++;
      continue;
    }
    const splitOffset = column - start;
    const newToken = splitToken(token, splitOffset);
    if (!tokenLength(token)) {
      line.splice(i, 1);
    } else {
      i++;
    }
    if (newToken && tokenLength(newToken)) {
      right.push(newToken);
    }
    while (i < line.length) {
      const following = line[i];
      if (!following) {
        i++;
        continue;
      }
      right.push(following);
      line.splice(i, 1);
    }
    break;
  }
  normalizeTokenLine(line);
  normalizeTokenLine(right);
  return right;
}

export function insertTextIntoTokenLine(line: TokenLine, column: number, text: string): void {
  let cursor = column;
  for (const ch of text) {
    insertCharacter(line, cursor, ch);
    cursor += ch.length;
  }
}

export function deleteRangeFromTokenLine(line: TokenLine, start: number, end: number): void {
  deleteRange(line, start, end);
}

export function splitTokenLineAt(line: TokenLine, column: number): TokenLine {
  return splitTokenLine(line, column);
}

export function normalizeTokenLineInPlace(line: TokenLine): void {
  normalizeTokenLine(line);
}
