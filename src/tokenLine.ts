import * as t from "./types.ts";

function tokenText(token: t.Token): string {
  if (typeof token.text === "string") return token.text;
  if (token.subTokens?.length) return token.subTokens.map(tokenText).join("");
  return "";
}

export function tokenizeLine(text: string): t.TokenLine {
  if (!text) return [];
  const tokens: t.Token[] = [];
  let idx = 0;
  let tokenIdx = 0;
  while (idx < text.length) {
    const start = idx;
    const isSpace = text[start] === " ";
    while (idx < text.length && (text[idx] === " ") === isSpace) idx++;
    const segment = text.slice(start, idx);
    tokens.push({
      type: isSpace ? t.TokenType.Space : t.TokenType.AnyString,
      tokenIdx: tokenIdx++,
      text: segment,
      x: start,
    });
  }
  return tokens;
}

export function handleDoubleSpace(text: string, cursor: number): { text: string; cursor: number } {
  const safeCursor = Math.max(0, cursor);
  let nextText = text;
  let nextCursor = safeCursor;

  if (safeCursor === 0 || nextText[safeCursor - 1] !== " ") {
    nextText = nextText.slice(0, safeCursor) + " " + nextText.slice(safeCursor);
    nextCursor = safeCursor + 1;
  }

  const whitespaceIndex = Math.max(0, nextCursor - 1);
  let start = whitespaceIndex;
  while (start > 0 && nextText[start - 1] === " ") start--;

  return { text: nextText, cursor: start };
}

export function collectArgumentTexts(lines: t.TokenMultiLine): string[] {
  const out: string[] = [];
  for (const line of lines) {
    for (const token of line) {
      if (token.type === t.TokenType.Space) continue;
      const text = tokenText(token);
      if (!text) continue;
      out.push(text);
    }
  }
  return out;
}
