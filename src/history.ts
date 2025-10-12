// History helpers cover both legacy token serialization and the JSON-line based
// command history that backs the interactive shell between sessions.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TokenLine, TokenMultiLine } from "./types.ts";
import type { HistoryEntry } from "./builtins/registry.ts";

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

const HISTORY_ENV_VAR = "LUSH_HISTORY";
const XDG_STATE_ENV = "XDG_STATE_HOME";
const DEFAULT_STATE_SUBDIR = path.join(".local", "state");
const HISTORY_SUBPATH = path.join("lush", "history.jsonl");

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function expandTilde(filepath: string, homeDir: string | undefined): string {
  if (filepath.startsWith("~/") && isNonEmptyString(homeDir)) {
    return path.join(homeDir, filepath.slice(2));
  }
  return filepath;
}

export function getHistoryFilePath(): string {
  const custom = process.env[HISTORY_ENV_VAR];
  if (isNonEmptyString(custom)) {
    const homeDir = os.homedir?.();
    return path.resolve(expandTilde(custom, homeDir));
  }

  const xdgStateHome = process.env[XDG_STATE_ENV];
  if (isNonEmptyString(xdgStateHome)) {
    const homeDir = os.homedir?.();
    const expanded = expandTilde(xdgStateHome, homeDir);
    return path.resolve(expanded, HISTORY_SUBPATH);
  }

  const homeDir = os.homedir?.();
  if (isNonEmptyString(homeDir)) {
    return path.join(homeDir, DEFAULT_STATE_SUBDIR, HISTORY_SUBPATH);
  }

  return path.resolve(HISTORY_SUBPATH);
}

function safeParseHistoryLine(line: string): HistoryEntry | null {
  try {
    const parsed = JSON.parse(line);
    if (typeof parsed === "object" && parsed !== null) {
      const command = (parsed as { command?: unknown }).command;
      const output = (parsed as { output?: unknown }).output;
      if (typeof command === "string") {
        if (typeof output === "string") {
          return { command, output };
        }
        if (output === undefined) {
          return { command, output: "" };
        }
      }
    }
  } catch { /* ignore malformed lines */ }
  return null;
}

export function loadHistoryEntries(filePath: string = getHistoryFilePath(), maxEntries?: number): HistoryEntry[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw) return [];
    const lines = raw.split(/\r?\n/);
    const entries: HistoryEntry[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const entry = safeParseHistoryLine(line);
      if (entry) entries.push(entry);
    }
    if (typeof maxEntries === "number" && Number.isFinite(maxEntries) && maxEntries >= 0 && entries.length > maxEntries) {
      return entries.slice(entries.length - maxEntries);
    }
    return entries;
  } catch {
    return [];
  }
}

export function appendHistoryEntry(entry: HistoryEntry, filePath: string = getHistoryFilePath()): void {
  try {
    const resolved = path.resolve(filePath);
    const dir = path.dirname(resolved);
    if (dir && dir !== "." && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const payload = JSON.stringify({ command: entry.command, output: entry.output ?? "" });
    fs.appendFileSync(resolved, `${payload}\n`, "utf8");
  } catch {
    // Swallow persistence errors; history remains in-memory.
  }
}
