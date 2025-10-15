// History helpers cover token serialization and the YAML-based command history
// that backs the interactive shell between sessions.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as YAML from "js-yaml";
import { tokenizeLine, type TokenLine, type TokenMultiLine } from "./tokenLine.ts";
import { serializeTokenMultiLine, deserializeTokenMultiLine } from "./yaml-serialize.ts";
import type { HistoryEntry } from "./builtins/registry.ts";

type PersistedHistoryEntry = {
  input: string;
  output: string;
  cwd: string;
};

type ExtendedHistoryEntry = HistoryEntry & {
  input?: string | TokenMultiLine;
  tokens?: TokenMultiLine;
  cwd?: string;
};

function tokenText(token: TokenLine[number]): string {
  if (typeof token.text === "string") return token.text;
  if (Array.isArray(token.subTokens)) {
    return token.subTokens.map(tokenText).join("");
  }
  return "";
}

function tokenLineToString(line: TokenLine): string {
  return line.map(tokenText).join("");
}

export function tokenMultiLineToCommand(history: TokenMultiLine): string {
  if (!Array.isArray(history) || history.length === 0) return "";
  const segments = history.map(tokenLineToString).filter(Boolean);
  if (!segments.length) return "";
  return segments.join(" ").trimEnd();
}

export function historyLineAsString(entry: TokenLine): string {
  return `${tokenLineToString(entry)}\n`;
}

export function historyAsString(history: TokenMultiLine): string {
  if (!history.length) return "\n";
  return history.map(tokenLineToString).join("\n") + "\n";
}

export function serializeHistory(history: TokenMultiLine): string {
  return serializeTokenMultiLine(history);
}

export function deserializeHistory(input: string): TokenMultiLine {
  try {
    return deserializeTokenMultiLine(input);
  } catch {
    return [];
  }
}

function stringToTokenMultiLine(command: string): TokenMultiLine {
  if (!isNonEmptyString(command)) return [];
  const lines = command.split(/\r?\n/);
  return lines.map(tokenizeLine);
}

function deriveTokensFromEntry(entry: ExtendedHistoryEntry): TokenMultiLine {
  const maybeTokens = entry.tokens;
  if (Array.isArray(maybeTokens)) {
    return maybeTokens;
  }

  const maybeInput = entry.input;
  if (typeof maybeInput === "string") {
    const parsed = deserializeHistory(maybeInput);
    if (parsed.length) return parsed;
  } else if (Array.isArray(maybeInput)) {
    return maybeInput;
  }

  return stringToTokenMultiLine(entry.command);
}

function deriveInputYaml(entry: ExtendedHistoryEntry): string {
  const tokens = deriveTokensFromEntry(entry);
  return serializeHistory(tokens);
}

function parseYamlHistory(raw: string): PersistedHistoryEntry[] {
  if (!isNonEmptyString(raw)) return [];
  const doc = YAML.load(raw);
  if (doc === null || doc === undefined) return [];
  if (!Array.isArray(doc)) {
    throw new Error("history: expected YAML array");
  }

  const entries: PersistedHistoryEntry[] = [];
  for (const candidate of doc) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const { input, output, cwd } = candidate as { input?: unknown; output?: unknown; cwd?: unknown };
    if (typeof input !== "string") continue;
    entries.push({
      input,
      output: typeof output === "string" ? output : "",
      cwd: typeof cwd === "string" ? cwd : "",
    });
  }
  return entries;
}

function mapPersistedEntryToHistory(entry: PersistedHistoryEntry): HistoryEntry {
  const tokens = deserializeHistory(entry.input);
  const command = tokens.length ? tokenMultiLineToCommand(tokens) : "";
  const historyEntry: HistoryEntry = { command, output: entry.output ?? "" };
  const extended = historyEntry as ExtendedHistoryEntry;
  extended.input = entry.input;
  extended.tokens = tokens;
  extended.cwd = entry.cwd;
  return historyEntry;
}

const HISTORY_ENV_VAR = "LUSH_HISTORY";
const XDG_STATE_ENV = "XDG_STATE_HOME";
const DEFAULT_STATE_SUBDIR = path.join(".local", "state");
const HISTORY_SUBPATH = path.join("lush", "history.yaml");

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

function readPersistedEntries(filePath: string): PersistedHistoryEntry[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw) return [];
  try {
    return parseYamlHistory(raw);
  } catch {
    return [];
  }
}

function limitEntries<T>(entries: T[], maxEntries?: number): T[] {
  if (typeof maxEntries !== "number" || !Number.isFinite(maxEntries) || maxEntries < 0) {
    return entries;
  }
  if (entries.length <= maxEntries) return entries;
  return entries.slice(entries.length - maxEntries);
}

export function loadHistoryEntries(filePath: string = getHistoryFilePath(), maxEntries?: number): HistoryEntry[] {
  try {
    const resolved = path.resolve(filePath);
    const persisted = readPersistedEntries(resolved);
    if (!persisted.length) return [];
    const limited = limitEntries(persisted, maxEntries);
    return limited.map(mapPersistedEntryToHistory);
  } catch {
    return [];
  }
}

function resolveEntryCwd(entry: ExtendedHistoryEntry): string {
  if (typeof entry.cwd === "string" && entry.cwd.trim().length > 0) {
    return entry.cwd;
  }
  return process.cwd();
}

export function appendHistoryEntry(entry: HistoryEntry, filePath: string = getHistoryFilePath()): void {
  try {
    const resolved = path.resolve(filePath);
    const dir = path.dirname(resolved);
    if (dir && dir !== "." && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const persisted = readPersistedEntries(resolved);
    const extended = entry as ExtendedHistoryEntry;
    const nextEntry: PersistedHistoryEntry = {
      input: deriveInputYaml(extended),
      output: entry.output ?? "",
      cwd: resolveEntryCwd(extended),
    };
    persisted.push(nextEntry);

    const yaml = YAML.dump(persisted, { indent: 2, noRefs: true, lineWidth: 80 });
    fs.writeFileSync(resolved, yaml, "utf8");
  } catch {
    // Swallow persistence errors; history remains in-memory.
  }
}
