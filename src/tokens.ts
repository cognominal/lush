import chalk from "chalk";
import * as YAML from 'js-yaml';
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Mode } from './index.ts'


export enum OprType {
  Binary,
  UnaryPrefix,
  UnaryPostfix,
  Circumfix,
  PostCircumfix,
  Meta,
}


export interface TokenType {
  priority: number // type of higher priority are chosen before lower
  type: string   // type of the token
  validator?: (s: string) => boolean // true if string `s` can be token `type`
  hilite?: (s: string) => string
  secable?: boolean
  instances?: string[]
}

export interface SnippetField extends TokenType {
  mode?: Mode
  placeholder?: string
}

export interface Hiliter extends TokenType {
  doesHilite?: boolean
}

interface Opr {
  type: OprType,
  s: string
  s1?: string // for multitoken operators
}

export type TokenTypeName = string
export type ModeName = string
//  + for example can be both prefix or infix so the `[Opr]`
export type OprMapType = Map<string, Opr | [Opr]>
// 2 separate maptypes for the same keytype cuz hiliting is 
// more a user thing and tokens a language thing
export type TokenMapType = Map<TokenTypeName, TokenType>
export type TokenMapsType = Map<ModeName, TokenMapType>
export type HiliteMapType = Map<TokenTypeName, TokenType>
export type HiliterType = (s: string) => string
// export type hiliteMapType = Map<PreAstType, HiliterType>

export const oprMap: OprMapType = new Map()
export const tokenMap: TokenMapType = new Map()
export const TokenMaps: TokenMapsType = new Map()

let runtimeModeName: ModeName = "Sh";
let cachedHiliteFns: Map<TokenTypeName, (s: string) => string> = new Map();

// export const hiliteMap: HiliteMapType = new Map()

const NAKED_STRING_TYPE = "NakedString";
const DECIMAL_DIGITS = "(?:[0-9](?:_?[0-9])*)";
const DECIMAL_INTEGER = "(?:0|[1-9](?:_?[0-9])*)";
const DECIMAL_EXPONENT = `(?:[eE][+-]?${DECIMAL_DIGITS})`;
const DECIMAL_LITERAL = `(?:${DECIMAL_INTEGER}\\.(?:${DECIMAL_DIGITS})?${DECIMAL_EXPONENT}?|\\.${DECIMAL_DIGITS}${DECIMAL_EXPONENT}?|${DECIMAL_INTEGER}${DECIMAL_EXPONENT}?)`;
const HEX_DIGITS = "(?:[0-9a-fA-F](?:_?[0-9a-fA-F])*)";
const HEX_LITERAL = `0[xX]${HEX_DIGITS}`;
const OCT_DIGITS = "(?:[0-7](?:_?[0-7])*)";
const OCT_LITERAL = `0[oO]${OCT_DIGITS}`;
const BIN_DIGITS = "(?:[01](?:_?[01])*)";
const BIN_LITERAL = `0[bB]${BIN_DIGITS}`;
const DECIMAL_BIGINT = `(?:0|[1-9](?:_?[0-9])*)n`;
const HEX_BIGINT = `${HEX_LITERAL}n`;
const OCT_BIGINT = `${OCT_LITERAL}n`;
const BIN_BIGINT = `${BIN_LITERAL}n`;
const NUMBER_LITERAL_PATTERN = new RegExp(
  `^(?:${DECIMAL_LITERAL}|${HEX_LITERAL}|${OCT_LITERAL}|${BIN_LITERAL}|${DECIMAL_BIGINT}|${HEX_BIGINT}|${OCT_BIGINT}|${BIN_BIGINT})$`
);

type TokenYamlSpec = Record<string, unknown> & {
  priority?: unknown
  secable?: unknown
  instances?: unknown
  validator?: unknown
}

function isValidJsNumberLiteral(value: string): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  return NUMBER_LITERAL_PATTERN.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  return value as Record<string, unknown>;
}

function populateTokenMap(
  target: TokenMapType,
  specEntries: Record<string, unknown>,
): void {
  for (const [typeName, spec] of Object.entries(specEntries)) {
    if (typeof typeName !== 'string' || !typeName) continue;
    const entry = asRecord(spec) as TokenYamlSpec | undefined;
    const priorityValue = entry?.priority;
    const priority = typeof priorityValue === 'number' ? priorityValue : 0;
    const existing: TokenType =
      target.get(typeName) ?? { type: typeName, priority };
    existing.priority = priority;
    if (entry && 'secable' in entry) {
      existing.secable = Boolean(entry.secable);
    } else if (existing.secable === undefined) {
      existing.secable = false;
    }
    const instanceSpec = entry?.instances;
    let parsedInstances: string[] | undefined;
    if (typeof instanceSpec === 'string') {
      parsedInstances = instanceSpec
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (Array.isArray(instanceSpec)) {
      parsedInstances = instanceSpec
        .map((s) => (typeof s === 'string' ? s.trim() : ''))
        .filter(Boolean);
    }
    if (parsedInstances && parsedInstances.length) {
      existing.instances = parsedInstances;
    }
    if (entry && typeof entry.validator === 'function') {
      existing.validator = entry.validator as (s: string) => boolean;
    }
    if (!existing.validator && existing.instances?.length) {
      const allowed = new Set(existing.instances);
      existing.validator = (value: string) => allowed.has(value);
    }
    target.set(typeName, existing);
  }
}

function buildHiliteFn(spec: unknown): ((s: string) => string) | undefined {
  if (typeof spec !== 'string') return;
  const steps = spec
    .split('.')
    .map((step) => step.trim())
    .filter(Boolean);
  if (!steps.length) return;
  let current: any = chalk;
  for (const step of steps) {
    if (current == null) return;
    current = current[step];
  }
  if (typeof current !== 'function') return;
  return (s: string) => current(s);
}

function applyDefaultValidators(target: TokenMapType): void {
  const numberToken =
    target.get("Number") ?? { type: "Number", priority: 0 };
  numberToken.validator = isValidJsNumberLiteral;
  target.set("Number", numberToken);

  const nakedStringToken = target.get(NAKED_STRING_TYPE);
  if (nakedStringToken) {
    nakedStringToken.validator = () => true;
    target.set(NAKED_STRING_TYPE, nakedStringToken);
  }
}

function applyHilites(
  target: TokenMapType,
  hiliteFns: Map<string, (s: string) => string>,
): void {
  for (const [typeName, hiliteFn] of hiliteFns.entries()) {
    const token = target.get(typeName);
    if (!token) continue;
    token.hilite = hiliteFn;
    target.set(typeName, token);
  }
}

export function registerOpr(s: string, type: OprType, s1?: string) {
  oprMap.set(s, s1 ? { type, s } : { type, s, s1 })
}

export function registerToken(t: TokenType): void {
  tokenMap.set(t.type, t)
}

export let YAMLdata: unknown; // set when reading file

function cloneTokenMap(
  source: TokenMapType | undefined,
  target: TokenMapType,
): void {
  target.clear();
  if (!source) return;
  for (const [typeName, tokenType] of source.entries()) {
    target.set(typeName, tokenType);
  }
}

function applyActiveModeFromCache(): void {
  const selected = TokenMaps.get(runtimeModeName);
  cloneTokenMap(selected, tokenMap);
  applyDefaultValidators(tokenMap);
  if (cachedHiliteFns.size) {
    applyHilites(tokenMap, cachedHiliteFns);
  }
}

export function setTokenMode(modeName: ModeName): void {
  runtimeModeName = modeName;
  applyActiveModeFromCache();
}

// called when changing mode to set maps
function initFromYAMLdata() {
  TokenMaps.clear();
  tokenMap.clear();

  const root = asRecord(YAMLdata);
  if (!root) return;

  const modeSection = asRecord(root.mode);

  const hiliteEntries = asRecord(root.hilite);
  const hiliteFns = new Map<TokenTypeName, (s: string) => string>();
  if (hiliteEntries) {
    for (const [typeName, spec] of Object.entries(hiliteEntries)) {
      if (typeof typeName !== 'string' || !typeName) continue;
      const fn = buildHiliteFn(spec);
      if (!fn) continue;
      hiliteFns.set(typeName, fn);
    }
  }
  cachedHiliteFns = hiliteFns;

  const yamlModeValue = modeSection?.curMode;
  const yamlModeName =
    typeof yamlModeValue === 'string' && yamlModeValue.length > 0
      ? yamlModeValue
      : undefined;
  const activeMode: ModeName = yamlModeName ?? runtimeModeName;
  runtimeModeName = activeMode;

  if (modeSection) {
    for (const [modeName, value] of Object.entries(modeSection)) {
      const modeRecord = asRecord(value);
      if (!modeRecord) continue;
      const tokensSpec = asRecord(modeRecord.tokens);
      if (!tokensSpec) continue;
      let target = TokenMaps.get(modeName);
      if (!target) {
        target = new Map<TokenTypeName, TokenType>();
        TokenMaps.set(modeName, target);
      }
      populateTokenMap(target, tokensSpec);
    }
  }

  for (const map of TokenMaps.values()) {
    applyDefaultValidators(map);
    if (hiliteFns.size) applyHilites(map, hiliteFns);
  }

  applyActiveModeFromCache();
}

export function initFromYAMLFile(): void {
  const langPath = fileURLToPath(new URL('../lang.yml', import.meta.url))
  const yaml = readFileSync(langPath, 'utf-8')
  YAMLdata = YAML.load(yaml)
  initFromYAMLdata()
}

export const InitFromYAMLFile = initFromYAMLFile;

export function getHighlighter(type: TokenTypeName): (s: string) => string {
  return tokenMap.get(type)?.hilite ?? String;
}

export function isTypeSecable(typeName: TokenTypeName | undefined): boolean {
  if (!typeName) return false;
  const entry = tokenMap.get(typeName);
  if (!entry) return false;
  return entry.secable === true;
}
