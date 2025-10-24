import {
  Dirent,
  Stats,
  constants as fsConstants,
  promises as fs,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import * as ts from "typescript";
import YAML from "yaml";
import {
  tokenText,
  listBuiltins,
  getBuiltinHelp,
  tokenMap,
  getCommandSummary,
  resetCommandSummaryCache,
  type InputToken,
  type TokenMultiLine,
  type TokenTypeName,
  type CompletionTokenMetadata,
  type FolderCompletionMetadata,
  type BuiltinCompletionMetadata,
  type CommandCompletionMetadata,
  type SnippetTriggerCompletionMetadata,
  type TypeScriptSymbolCompletionMetadata,
} from "./index.ts";

const SPACE_TYPE = "Space";

export interface CompletionCandidate {
  value: string;
  tokenType: TokenTypeName;
  metadata: CompletionTokenMetadata;
}

export interface CompletionQuery {
  lines: TokenMultiLine;
  cwd?: string;
  activeModeToken?: InputToken | null;
}

type CandidateProvider = (
  prefix: string,
  cwd: string,
) => Promise<CompletionCandidate[]>;

const BUILTIN_TOKEN_TYPES = ["ShBuiltin", "Builtin"] as const;
const COMMAND_TOKEN_TYPES = ["ShCommandName", "Command"] as const;
const SNIPPET_TOKEN_TYPES = [
  "SnippetTrigger",
  "SnippetKey",
] as const;
const FOLDER_TOKEN_TYPES = ["Folder"] as const;
const TYPESCRIPT_TOKEN_TYPES = ["TypeScriptSymbol"] as const;

function resolveTokenType(
  candidates: readonly string[],
): TokenTypeName | null {
  for (const name of candidates) {
    if (tokenMap.has(name)) return name;
  }
  return null;
}

function firstNonSpaceToken(
  lines: TokenMultiLine,
): InputToken | undefined {
  for (const line of lines) {
    for (const token of line) {
      if (token.type === SPACE_TYPE) continue;
      return token;
    }
  }
  return undefined;
}

function normalizePrefix(token: InputToken | undefined): string {
  if (!token) return "";
  return tokenText(token);
}

function hasTokenType(typeNames: readonly string[]): boolean {
  return Boolean(resolveTokenType(typeNames));
}

async function gatherFolderCandidates(
  prefix: string,
  cwd: string,
): Promise<CompletionCandidate[]> {
  const tokenType = resolveTokenType(FOLDER_TOKEN_TYPES);
  if (!tokenType) return [];

  const parts = splitPathPrefix(prefix, cwd);
  if (!parts) return [];

  const entries = await safeReadDir(parts.dir);
  if (!entries.length) return [];

  const candidates: CompletionCandidate[] = [];
  for (const entry of entries) {
    if (!entry.dirent.isDirectory()) continue;
    if (!entry.dirent.name.toLowerCase().startsWith(parts.partial)) {
      continue;
    }
    const candidateValue = buildCandidatePath(parts, entry.dirent.name);
    const previewEntry = await readFirstEntry(entry.fullPath);
    const metadata: FolderCompletionMetadata = {
      kind: "Folder",
      label: entry.dirent.name,
      description: candidateValue,
      path: entry.fullPath,
      previewEntry,
    };
    candidates.push({
      value: candidateValue,
      tokenType,
      metadata,
    });
  }
  return candidates;
}

async function safeReadDir(
  dir: string,
): Promise<Array<{ dirent: Dirent; fullPath: string }>> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.map(dirent => ({
      dirent,
      fullPath: path.join(dir, dirent.name),
    }));
  } catch {
    return [];
  }
}

async function readFirstEntry(dir: string): Promise<string | undefined> {
  const entries = await safeReadDir(dir);
  const first = entries.find(entry =>
    entry.dirent.isFile() || entry.dirent.isDirectory(),
  );
  return first?.dirent.name;
}

interface PathParts {
  baseDisplay: string;
  partial: string;
  dir: string;
}

function splitPathPrefix(prefix: string, cwd: string): PathParts | null {
  const normalized = prefix.trim() === "" ? "" : prefix;
  const sep = "/";
  const idx = normalized.lastIndexOf(sep);
  const base =
    idx >= 0 ? normalized.slice(0, idx + 1) : "";
  const partial =
    idx >= 0 ? normalized.slice(idx + 1) : normalized;
  const dir = resolveDisplayPath(base, cwd);
  if (!dir) return null;
  return {
    baseDisplay: base,
    partial: partial.toLowerCase(),
    dir,
  };
}

function resolveDisplayPath(displayPath: string, cwd: string): string {
  const trimmed = displayPath.endsWith("/")
    ? displayPath.slice(0, -1)
    : displayPath;
  if (!trimmed) return cwd;
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }
  return path.resolve(cwd, trimmed);
}

function buildCandidatePath(
  parts: PathParts,
  name: string,
): string {
  const suffix = name.endsWith("/") ? name : `${name}/`;
  return `${parts.baseDisplay}${suffix}`;
}

async function gatherBuiltinCandidates(
  prefix: string,
): Promise<CompletionCandidate[]> {
  const tokenType = resolveTokenType(BUILTIN_TOKEN_TYPES);
  if (!tokenType) return [];
  const normalized = prefix.toLowerCase();
  const candidates: CompletionCandidate[] = [];
  for (const name of listBuiltins()) {
    if (!name.toLowerCase().startsWith(normalized)) continue;
    const metadata: BuiltinCompletionMetadata = {
      kind: "Builtin",
      label: name,
      description: name,
      helpText: getBuiltinHelp(name),
    };
    candidates.push({
      value: name,
      tokenType,
      metadata,
    });
  }
  return candidates;
}

async function gatherSnippetCandidates(
  prefix: string,
): Promise<CompletionCandidate[]> {
  const tokenType = resolveTokenType(SNIPPET_TOKEN_TYPES);
  if (!tokenType) return [];

  const snippetEntries = await loadSnippetEntries();
  if (!snippetEntries.length) return [];

  const normalized = prefix.toLowerCase();
  const candidates: CompletionCandidate[] = [];
  for (const entry of snippetEntries) {
    if (!entry.trigger.toLowerCase().startsWith(normalized)) continue;
    const metadata: SnippetTriggerCompletionMetadata = {
      kind: "SnippetTrigger",
      label: entry.trigger,
      description: entry.description ?? entry.trigger,
      snippetName: entry.description,
    };
    candidates.push({
      value: entry.trigger,
      tokenType,
      metadata,
    });
  }
  return candidates;
}

async function gatherCommandCandidates(
  prefix: string,
): Promise<CompletionCandidate[]> {
  const tokenType = resolveTokenType(COMMAND_TOKEN_TYPES);
  if (!tokenType) return [];

  const commands = await listExecutablesOnPath();
  if (!commands.size) return [];

  const normalized = prefix.toLowerCase();
  const matches: Array<{ name: string; fullPath: string }> = [];
  for (const [name, fullPath] of commands) {
    if (!name.toLowerCase().startsWith(normalized)) continue;
    matches.push({ name, fullPath });
  }
  if (!matches.length) return [];

  const summaries = await Promise.all(
    matches.map(entry => getCommandSummary(entry.name)),
  );

  const candidates: CompletionCandidate[] = [];
  matches.forEach((entry, index) => {
    const summary = summaries[index] ?? undefined;
    const metadata: CommandCompletionMetadata = {
      kind: "Command",
      label: entry.name,
      description: entry.fullPath,
      summary,
    };
    candidates.push({
      value: entry.name,
      tokenType,
      metadata,
    });
  });
  return candidates;
}

async function gatherTypeScriptCandidates(
  prefix: string,
  cwd: string,
): Promise<CompletionCandidate[]> {
  if (!hasTokenType(TYPESCRIPT_TOKEN_TYPES)) return [];

  const entries = await getTypeScriptSymbols(cwd);
  if (!entries.length) return [];

  const normalized = prefix.toLowerCase();
  const tokenType = resolveTokenType(TYPESCRIPT_TOKEN_TYPES);
  if (!tokenType) return [];

  const candidates: CompletionCandidate[] = [];
  for (const entry of entries) {
    if (!entry.label.toLowerCase().startsWith(normalized)) continue;
    candidates.push({
      value: entry.label,
      tokenType,
      metadata: entry,
    });
  }
  return candidates;
}

interface ProviderStage {
  provider: CandidateProvider;
  label: string;
}

export interface CompletionStageProgress {
  index: number;
  total: number;
  label: string;
}

export interface CompletionCollectionOptions {
  onStage?: (progress: CompletionStageProgress) => void;
}

const providerStages: ProviderStage[] = [
  { provider: gatherFolderCandidates, label: "scanning folders" },
  { provider: gatherBuiltinCandidates, label: "loading builtins" },
  { provider: gatherSnippetCandidates, label: "loading snippets" },
  { provider: gatherCommandCandidates, label: "finding commands" },
  {
    provider: gatherTypeScriptCandidates,
    label: "indexing TypeScript symbols",
  },
];

const FINAL_STAGE_LABEL = "finalizing results";

export async function collectFirstTokenCandidates(
  query: CompletionQuery,
  options?: CompletionCollectionOptions,
): Promise<CompletionCandidate[]> {
  const cwd = query.cwd ?? process.cwd();
  const token = query.activeModeToken ?? firstNonSpaceToken(query.lines);
  const prefix = normalizePrefix(token);

  const totalStages = providerStages.length + 1;
  const stageResults: CompletionCandidate[][] = [];

  for (let i = 0; i < providerStages.length; i++) {
    const { provider, label } = providerStages[i];
    options?.onStage?.({
      index: i + 1,
      total: totalStages,
      label,
    });
    const result = await provider(prefix, cwd);
    stageResults.push(result);
  }

  options?.onStage?.({
    index: totalStages,
    total: totalStages,
    label: FINAL_STAGE_LABEL,
  });

  const merged = stageResults.flat();
  const deduped = dedupeCandidates(merged);
  return sortCandidates(deduped);
}

function dedupeCandidates(
  candidates: CompletionCandidate[],
): CompletionCandidate[] {
  const seen = new Map<string, CompletionCandidate>();
  for (const candidate of candidates) {
    if (!seen.has(candidate.value)) {
      seen.set(candidate.value, candidate);
      continue;
    }
    const existing = seen.get(candidate.value)!;
    if (
      existing.metadata.kind === "Command" &&
      candidate.metadata.kind !== "Command"
    ) {
      seen.set(candidate.value, candidate);
    }
  }
  return Array.from(seen.values());
}

function sortCandidates(
  candidates: CompletionCandidate[],
): CompletionCandidate[] {
  return [...candidates].sort((a, b) => {
    const left = a.value.toLowerCase();
    const right = b.value.toLowerCase();
    if (left < right) return -1;
    if (left > right) return 1;
    return a.value.localeCompare(b.value);
  });
}

export function resetCompletionCaches(): void {
  executableCache.clear();
  snippetCache = null;
  snippetCacheMtime = -1;
  tsSymbolCache.clear();
  resetCommandSummaryCache();
}

/* ---------------- PATH helpers ---------------- */

type ExecutableCacheEntry = {
  mtimeMs: number;
  names: Map<string, string>;
};

const executableCache = new Map<string, ExecutableCacheEntry>();

async function listExecutablesOnPath(): Promise<Map<string, string>> {
  const pathEnv = process.env.PATH ?? "";
  const dirs = pathEnv
    .split(path.delimiter)
    .filter(Boolean)
    .map(dir => path.resolve(dir));
  const cacheKey = dirs.join(path.delimiter);
  const cached = executableCache.get(cacheKey);
  if (cached && (await cacheFresh(dirs, cached.mtimeMs))) {
    return new Map(cached.names);
  }

  const names = new Map<string, string>();
  let latestMtime = 0;

  for (const dir of dirs) {
    const stats = await safeStat(dir);
    if (!stats?.isDirectory()) continue;
    latestMtime = Math.max(latestMtime, stats.mtimeMs);
    const entries = await safeReadDir(dir);
    for (const entry of entries) {
      if (!entry.dirent.isFile() && !entry.dirent.isSymbolicLink()) {
        continue;
      }
      const name = entry.dirent.name;
      if (!await isExecutable(entry.fullPath)) continue;
      if (!names.has(name)) {
        names.set(name, entry.fullPath);
      }
    }
  }

  executableCache.set(cacheKey, { mtimeMs: latestMtime, names });
  return new Map(names);
}

async function cacheFresh(
  dirs: readonly string[],
  cachedMtime: number,
): Promise<boolean> {
  for (const dir of dirs) {
    const stats = await safeStat(dir);
    if (!stats?.isDirectory()) return false;
    if (stats.mtimeMs > cachedMtime) return false;
  }
  return true;
}

async function safeStat(target: string): Promise<Stats | null> {
  try {
    return await fs.stat(target);
  } catch {
    return null;
  }
}

async function isExecutable(target: string): Promise<boolean> {
  try {
    await fs.access(target, fsConstants.X_OK);
    const stats = await fs.stat(target);
    return stats.isFile();
  } catch {
    return false;
  }
}

/* ---------------- Snippet helpers ---------------- */

interface SnippetEntry {
  trigger: string;
  description?: string;
}

let snippetCache: SnippetEntry[] | null = null;
let snippetCacheMtime = -1;

async function loadSnippetEntries(): Promise<SnippetEntry[]> {
  const langPath = path.resolve("lang.yml");
  const stats = await safeStat(langPath);
  const mtime = stats?.mtimeMs ?? 0;
  if (snippetCache && snippetCacheMtime === mtime) {
    return snippetCache;
  }

  try {
    const raw = await fs.readFile(langPath, "utf8");
    const parsed = YAML.parse(raw);
    const entries = extractSnippets(parsed);
    snippetCache = entries;
    snippetCacheMtime = mtime;
    return entries;
  } catch {
    snippetCache = [];
    snippetCacheMtime = mtime;
    return [];
  }
}

function extractSnippets(source: unknown): SnippetEntry[] {
  if (!source || typeof source !== "object") return [];
  const record = source as Record<string, unknown>;
  const snippets = record.snippets;
  if (!snippets || typeof snippets !== "object") return [];
  const buckets = snippets as Record<string, unknown>;
  const entries: SnippetEntry[] = [];
  for (const value of Object.values(buckets)) {
    if (!value || typeof value !== "object") continue;
    const bucket = value as Record<string, unknown>;
    for (const [trigger, meta] of Object.entries(bucket)) {
      if (!trigger) continue;
      let description: string | undefined;
      if (meta && typeof meta === "object") {
        const recordMeta = meta as Record<string, unknown>;
        const what = recordMeta.what;
        if (typeof what === "string" && what.trim()) {
          description = what;
        }
      }
      entries.push({ trigger, description });
    }
  }
  return entries;
}

/* ---------------- TypeScript symbols ---------------- */

type SymbolCacheEntry = {
  mtimeMs: number;
  symbols: TypeScriptSymbolCompletionMetadata[];
};

const tsSymbolCache = new Map<string, SymbolCacheEntry>();

async function getTypeScriptSymbols(
  cwd: string,
): Promise<TypeScriptSymbolCompletionMetadata[]> {
  const configPath = ts.findConfigFile(
    cwd,
    ts.sys.fileExists,
    "tsconfig.json",
  );
  if (!configPath) return [];

  const stats = await safeStat(configPath);
  const mtime = stats?.mtimeMs ?? 0;
  const cacheKey = path.resolve(configPath);
  const cached = tsSymbolCache.get(cacheKey);
  if (cached && cached.mtimeMs === mtime) {
    return cached.symbols;
  }

  try {
    const parsed = loadTsConfig(configPath);
    if (!parsed) {
      tsSymbolCache.set(cacheKey, { mtimeMs: mtime, symbols: [] });
      return [];
    }
    const program = ts.createProgram({
      rootNames: parsed.fileNames,
      options: parsed.options,
    });
    const checker = program.getTypeChecker();

    const collected = new Map<string, TypeScriptSymbolCompletionMetadata>();
    const scopeFlags =
      ts.SymbolFlags.BlockScopedVariable |
      ts.SymbolFlags.Function |
      ts.SymbolFlags.Class |
      ts.SymbolFlags.Enum |
      ts.SymbolFlags.Interface |
      ts.SymbolFlags.TypeAlias |
      ts.SymbolFlags.ValueModule |
      ts.SymbolFlags.Namespace |
      ts.SymbolFlags.ConstEnum |
      ts.SymbolFlags.Import |
      ts.SymbolFlags.Value;

    for (const sourceFile of program.getSourceFiles()) {
      const symbols = checker.getSymbolsInScope(
        sourceFile,
        scopeFlags,
      );
      for (const symbol of symbols) {
        const name = symbol.getName();
        if (!name) continue;
        if (name.startsWith("__") && name.endsWith("__")) continue;
        const decl = symbol.valueDeclaration ?? symbol.declarations?.[0];
        const fileName = decl?.getSourceFile().fileName;
        const symbolType = decl
          ? checker.typeToString(
              checker.getTypeOfSymbolAtLocation(symbol, decl),
            )
          : undefined;
        const metadata: TypeScriptSymbolCompletionMetadata = {
          kind: "TypeScriptSymbol",
          label: name,
          description: name,
          symbolType,
          modulePath: fileName
            ? path.relative(cwd, fileName)
            : undefined,
        };
        const existing = collected.get(name);
        if (!existing || prefersNewMetadata(existing, metadata)) {
          collected.set(name, metadata);
        }
      }
    }

    for (const moduleSymbol of checker.getAmbientModules()) {
      const raw = moduleSymbol.name;
      const label =
        raw.startsWith('"') && raw.endsWith('"')
          ? raw.slice(1, -1)
          : raw;
      if (!label) continue;
      if (collected.has(label)) continue;
      const decl = moduleSymbol.declarations?.[0];
      const modulePath = decl
        ? path.relative(cwd, decl.getSourceFile().fileName)
        : undefined;
      const metadata: TypeScriptSymbolCompletionMetadata = {
        kind: "TypeScriptSymbol",
        label,
        description: label,
        symbolType: "module",
        modulePath,
      };
      collected.set(label, metadata);
    }

    const symbols = [...collected.values()];
    tsSymbolCache.set(cacheKey, { mtimeMs: mtime, symbols });
    return symbols;
  } catch {
    tsSymbolCache.set(cacheKey, { mtimeMs: mtime, symbols: [] });
    return [];
  }
}

function loadTsConfig(
  configPath: string,
): ts.ParsedCommandLine | null {
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) return null;
  const content = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
  );
  return content;
}

function prefersNewMetadata(
  current: TypeScriptSymbolCompletionMetadata,
  next: TypeScriptSymbolCompletionMetadata,
): boolean {
  const currentPath = current.modulePath ?? "";
  const nextPath = next.modulePath ?? "";
  const currentInModules = isNodeModulesPath(currentPath);
  const nextInModules = isNodeModulesPath(nextPath);
  if (currentInModules && !nextInModules) return true;
  if (!currentInModules && nextInModules) return false;
  const currentLib = isTypeScriptLibPath(currentPath);
  const nextLib = isTypeScriptLibPath(nextPath);
  if (currentLib && !nextLib) return true;
  if (!currentLib && nextLib) return false;
  return false;
}

function isNodeModulesPath(relPath: string): boolean {
  return relPath.includes("node_modules");
}

function isTypeScriptLibPath(relPath: string): boolean {
  return relPath.includes("typescript/lib");
}
