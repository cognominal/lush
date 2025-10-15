import * as YAML from "js-yaml";
import type { InputToken, TokenLine, TokenMultiLine } from "./tokenLine.ts";

type RawToken = {
  type?: string;
  tokenIdx?: number;
  text?: unknown;
  subTokens?: unknown;
  x?: number;
};

function sanitizeToken(raw: RawToken | null | undefined): InputToken {
  const type = typeof raw?.type === "string" ? raw.type : "AnyString";
  const tokenIdx = typeof raw?.tokenIdx === "number" && Number.isFinite(raw.tokenIdx) ? raw.tokenIdx : 0;
  const x = typeof raw?.x === "number" && Number.isFinite(raw.x) ? raw.x : 0;

  const base: InputToken = {
    type,
    tokenIdx,
    x,
  };

  if (Array.isArray(raw?.subTokens)) {
    base.subTokens = raw.subTokens.map(entry => sanitizeToken(entry as RawToken));
  } else if (typeof raw?.text === "string") {
    base.text = raw.text;
  }

  return base;
}

function sanitizeLine(raw: unknown): TokenLine {
  if (!Array.isArray(raw)) {
    throw new Error("Invalid YAML: each line must be an array of tokens");
  }
  return raw.map(item => sanitizeToken(item as RawToken));
}

export function serializeTokenMultiLine(tokens: TokenMultiLine): string {
  return YAML.dump(tokens, { indent: 2, noRefs: true });
}

export function deserializeTokenMultiLine(yaml: string): TokenMultiLine {
  const plain = YAML.load(yaml);
  if (!Array.isArray(plain)) {
    throw new Error("Invalid YAML: expected array of token lines");
  }
  return plain.map(sanitizeLine);
}
