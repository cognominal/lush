import type { TokenTypeName } from "./tokens.ts";

export interface InputToken {
  type: TokenTypeName;
  tokenIdx: number;
  text?: string; // missing for types that have subtypes
  subTokens?: InputToken[];
  x?: number;
  completion?: CompletionTokenMetadata;
}

export type TokenLine = InputToken[];
export type TokenMultiLine = TokenLine[];

export type CompletionTokenKind =
  | "Folder"
  | "Builtin"
  | "Command"
  | "SnippetTrigger"
  | "TypeScriptSymbol";

export interface CompletionMetadataBase<
  Kind extends CompletionTokenKind,
> {
  kind: Kind;
  label: string;
  description?: string;
}

export interface FolderCompletionMetadata
  extends CompletionMetadataBase<"Folder"> {
  path?: string;
  previewEntry?: string;
}

export interface BuiltinCompletionMetadata
  extends CompletionMetadataBase<"Builtin"> {
  helpText?: string;
}

export interface CommandCompletionMetadata
  extends CompletionMetadataBase<"Command"> {
  summary?: string;
}

export interface SnippetTriggerCompletionMetadata
  extends CompletionMetadataBase<"SnippetTrigger"> {
  snippetName?: string;
}

export interface TypeScriptSymbolCompletionMetadata
  extends CompletionMetadataBase<"TypeScriptSymbol"> {
  symbolType?: string;
  modulePath?: string;
}

export type CompletionTokenMetadata =
  | FolderCompletionMetadata
  | BuiltinCompletionMetadata
  | CommandCompletionMetadata
  | SnippetTriggerCompletionMetadata
  | TypeScriptSymbolCompletionMetadata;

const SPACE_TYPE = "Space";
const NAKED_STRING_TYPE = "NakedString";

export function tokenText(token: InputToken): string {
  if (typeof token.text === "string") return token.text;
  if (token.subTokens?.length) return token.subTokens.map(tokenText).join("");
  return "";
}

export function tokenizeLine(text: string): TokenLine {
  if (!text) return [];
  const tokens: TokenLine = [];
  let idx = 0;
  while (idx < text.length) {
    const start = idx;
    const isSpace = text[start] === " ";
    while (idx < text.length && (text[idx] === " ") === isSpace) idx++;
    const segment = text.slice(start, idx);
    tokens.push({
      type: isSpace ? SPACE_TYPE : NAKED_STRING_TYPE,
      tokenIdx: tokens.length,
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

export function collectArgumentTexts(lines: TokenMultiLine): string[] {
  const out: string[] = [];
  for (const line of lines) {
    for (const token of line) {
      if (token.type === SPACE_TYPE) continue;
      const text = tokenText(token);
      if (!text) continue;
      out.push(text);
    }
  }
  return out;
}
