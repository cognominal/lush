import chalk from "chalk";
import { getHighlighter, type TokenType } from "./tokens.ts";

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

  const firstChar = input[idx];
  if (firstChar && SIGIL_SET.has(firstChar)) {
    idx += 1;
  }

  const secondChar = input[idx];
  if (secondChar === "*") {
    idx += 1;
  }

  if (idx >= input.length) return false;

  for (; idx < input.length; idx++) {
    const ch = input[idx];
    if (!ch) return false;
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
  const first = input[idx];
  if (first && SIGIL_SET.has(first)) {
    idx += 1;
  }
  const second = input[idx];
  if (second === "*") {
    idx += 1;
  }
  return input.slice(idx);
}

export interface StatusLineParams {
  modeLabel: string;
  currentTokenType?: string | null;
  currentTokenIndex?: number | null;
  currentTokenLength?: number | null;
  currentTokenText?: string | null;
  validTypes: readonly TokenType[];
}

function formatTokenIndex(index: number | null | undefined): string {
  if (typeof index === "number" && index >= 0) return String(index);
  return "-";
}

function formatTokenLength(length: number | null | undefined): string {
  if (typeof length === "number" && length >= 0) return String(length);
  return "-";
}

function buildTypeDisplay(
  currentType: string | null | undefined,
  candidates: readonly TokenType[],
): string {
  const highlighted = candidates
    .map(entry => {
      const label = entry?.type;
      if (!label) return "";
      const hilite = getHighlighter(label);
      const styled = hilite(label);
      return label === currentType ? chalk.bold(styled) : chalk.dim(styled);
    })
    .filter(part => Boolean(part));

  if (highlighted.length) {
    return highlighted.join("  ");
  }

  const fallback = typeof currentType === "string" ? currentType : "";
  if (fallback && fallback !== "-") {
    const hilite = getHighlighter(fallback);
    return chalk.inverse(hilite(fallback));
  }
  return chalk.dim("no types");
}

const TOKEN_PREVIEW_LIMIT = 24;

function formatTokenPreview(
  tokenType: string | null | undefined,
  tokenText: string | null | undefined,
): string | null {
  if (tokenText == null) return null;
  const hilite = tokenType ? getHighlighter(tokenType) : (value: string) => value;
  const rendered = hilite(tokenText);
  return `'${rendered}'`;
}

function formatCurrentType(
  tokenType: string | null | undefined,
): string | null {
  if (!tokenType) return null;
  const hilite = getHighlighter(tokenType);
  return hilite(tokenType);
}

export function formatStatusLine({
  modeLabel,
  currentTokenType,
  currentTokenIndex,
  currentTokenLength,
  currentTokenText,
  validTypes,
}: StatusLineParams): string {
  const treepath = `${chalk.bold("treepath:")} TBD`;
  const indexLabel = formatTokenIndex(currentTokenIndex ?? null);
  const lengthLabel = formatTokenLength(currentTokenLength ?? null);
  const statusInfo = [
    `${chalk.bold("mode:")} ${modeLabel}`,
    `${chalk.bold("tokidx:")} ${indexLabel}`,
    `${chalk.bold("len:")} ${lengthLabel}`,
  ].join("    ");
  const typeDisplay = buildTypeDisplay(currentTokenType ?? null, validTypes);
  const tokenTypeLabel = formatCurrentType(currentTokenType ?? null);
  const tokenPreview = formatTokenPreview(
    currentTokenType ?? null,
    currentTokenText ?? null,
  );
  const tokenInfoParts = [tokenTypeLabel, tokenPreview]
    .filter(part => part && part.length > 0)
    .join("  ");
  const tokenInfo = tokenInfoParts
    ? `${chalk.bold("token:")} ${tokenInfoParts}`
    : `${chalk.bold("token:")} ${chalk.dim("none")}`;
  return `${treepath}    ${statusInfo}    ${tokenInfo}    ${chalk.bold("types:")} ${typeDisplay}`;
}
