import type { TokenLine, TokenMultiLine } from "./tokenLine.ts";
import { tokenText } from "./tokenLine.ts";

function tokenLineText(line: TokenLine | undefined): string {
  if (!line || line.length === 0) return "";
  return line.map(tokenText).join("");
}

function lineHasContent(line: TokenLine | undefined): boolean {
  return tokenLineText(line).trim().length > 0;
}

export function shouldSubmitOnEmptyLastLine(
  lines: TokenMultiLine,
  activeIndex: number,
): boolean {
  if (!lines.length) return false;
  if (activeIndex < 0 || activeIndex >= lines.length) return false;
  if (activeIndex !== lines.length - 1) return false;
  const current = lines[activeIndex];
  if (tokenLineText(current).length > 0) return false;
  for (let i = 0; i < lines.length; i++) {
    if (i === activeIndex) continue;
    if (lineHasContent(lines[i])) return true;
  }
  return false;
}
