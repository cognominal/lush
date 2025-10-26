import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export enum OprType {
  Infix = "Infix",
  Prefix = "Prefix",
  Postfix = "Postfix",
  Circumfix = "Circumfix",
  PostCircumfix = "PostCircumfix",
  Meta = "Meta",
}

interface Opr {
  type: OprType;
  s: string;
  s1?: string;
}

type OprKey = string;

export type OprMapType = Map<OprKey, Opr | Opr[]>;
export type OprMapCircumType = Map<OprKey, Opr>;

export const oprMap: OprMapType = new Map();
export const oprMapCircum: OprMapCircumType = new Map();

function buildPrimaryKey(type: OprType, s: string): OprKey {
  return `${type}:${s}`;
}

function buildOprKey(s: string, type: OprType, s1?: string): OprKey {
  const body = s1 ? `${s}:${s1}` : s;
  return `${type}:${body}`;
}

function isCircumfixType(type: OprType): boolean {
  return type === OprType.Circumfix || type === OprType.PostCircumfix;
}

export function registerOpr(s: string, type: OprType, s1?: string): void {
  const next: Opr = { type, s, s1 };
  const primaryKey = buildPrimaryKey(type, s);
  const existing = oprMap.get(primaryKey);
  if (!existing) {
    oprMap.set(primaryKey, next);
  } else if (Array.isArray(existing)) {
    existing.push(next);
  } else {
    oprMap.set(primaryKey, [existing, next]);
  }
  if (isCircumfixType(type)) {
    if (!s1) {
      throw new Error(
        `Circumfix operators must provide a secondary token for "${primaryKey}"`,
      );
    }
    const detailKey = buildOprKey(s, type, s1);
    if (oprMapCircum.has(detailKey)) {
      throw new Error(`Duplicate circumfix operator "${detailKey}" detected`);
    }
    oprMapCircum.set(detailKey, next);
  }
}

type RawOperatorEntry = {
  type: string;
  s?: string;
  s1?: string;
};

type RawOperatorConfig = Record<
  string,
  RawOperatorEntry | RawOperatorEntry[]
>;

function resolveOperatorPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "../../data/oprs.yml");
}

function normalizeEntries(
  raw: RawOperatorEntry | RawOperatorEntry[] | undefined,
): RawOperatorEntry[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function assertOprType(value: string): OprType {
  if (value in OprType) {
    return OprType[value as keyof typeof OprType];
  }
  throw new Error(`Unknown operator type "${value}" in data/oprs.yml`);
}

function splitSymbol(symbol: string): { s: string; s1?: string } {
  const parts = symbol.split(" ").filter(Boolean);
  if (parts.length === 0) {
    throw new Error("Operator key must contain at least one symbol token");
  }
  if (parts.length === 1) return { s: parts[0] };
  return { s: parts[0], s1: parts.slice(1).join(" ") };
}

function registerOperatorsFromFile(filePath: string): number {
  oprMap.clear();
  oprMapCircum.clear();
  const rawText = readFileSync(filePath, "utf8");
  const parsed = YAML.parse(rawText) as RawOperatorConfig | null;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Expected operator definitions in data/oprs.yml");
  }
  let count = 0;
  for (const [symbol, rawEntry] of Object.entries(parsed)) {
    const defaults = splitSymbol(symbol);
    for (const entry of normalizeEntries(rawEntry)) {
      const type = assertOprType(entry.type);
      const s = entry.s ?? defaults.s;
      const s1 = entry.s1 ?? defaults.s1;
      registerOpr(s, type, s1);
      count += 1;
    }
  }
  return count;
}

export function main(): void {
  const filePath = resolveOperatorPath();
  const count = registerOperatorsFromFile(filePath);
  console.log(count);
}

if (import.meta.main) {
  main();
}
