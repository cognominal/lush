// Handling history serialization helpers. The implementation is intentionally
// limited for now; the CLI relies on in-memory history while on-disk support
// is fleshed out.

import type { TokenLine, TokenMultiLine } from "./index.ts";

export function historyLineAsString(entry: TokenLine): string {
  const segments = entry.map(token => {
    const text = typeof token.text === "string" ? token.text : "";
    return `${token.type}:${JSON.stringify(text)}`;
  });
  return `${segments.join(" ")}\n`;
}

export function historyAsString(history: TokenMultiLine): string {
  return history.map(historyLineAsString).join("") + "\n";
}

export function serializeHistory(history: TokenMultiLine): string {
  return historyAsString(history);
}

export function deserializeHistory(_input: string): TokenMultiLine {
  // Placeholder until serialization format is finalized.
  return [];
}
