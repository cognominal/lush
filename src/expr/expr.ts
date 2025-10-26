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
        `Circumfix operators require a secondary token for "${primaryKey}"`,
      );
    }
    const detailKey = buildOprKey(s, type, s1);
    if (oprMapCircum.has(detailKey)) {
      throw new Error(`Duplicate circumfix operator "${detailKey}" detected`);
    }
    oprMapCircum.set(detailKey, next);
  }
}

type RawOperatorConfig = Record<string, unknown>;

function resolveOperatorPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "../../data/oprs.yml");
}

function normalizeEntries(raw: unknown): Record<string, unknown>[] {
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) {
    return raw.map((entry) => {
      if (!entry || typeof entry !== "object") {
        throw new Error("Operator entry must be an object");
      }
      return entry as Record<string, unknown>;
    });
  }
  if (typeof raw === "object") {
    return [raw as Record<string, unknown>];
  }
  throw new Error("Operator entry must be an object or array of objects");
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

function parseOperator(
  entry: Record<string, unknown>,
  defaults: { s: string; s1?: string },
): Opr {
  const typeValue = entry.type;
  if (typeof typeValue !== "string") {
    throw new Error("Operator entry must define a string type");
  }
  const type = assertOprType(typeValue);
  const sValue = entry.s;
  const s1Value = entry.s1;
  const s = typeof sValue === "string" ? sValue : defaults.s;
  const s1 = typeof s1Value === "string" ? s1Value : defaults.s1;
  if (!s) {
    throw new Error("Operator entry must resolve to a primary token");
  }
  return {
    type,
    s,
    s1,
  };
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
    const entries = normalizeEntries(rawEntry);
    for (const entry of entries) {
      const next = parseOperator(entry, defaults);
      registerOpr(next.s, next.type, next.s1);
      count += 1;
    }
  }
  return count;
}

type IdentifierNode = {
  type: "Identifier";
  name: string;
};

type LiteralNode = {
  type: "Literal";
  raw?: string;
  value: unknown;
};

type BinaryExpressionNode = {
  type: "BinaryExpression";
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
};

type ExpressionNode = IdentifierNode | LiteralNode | BinaryExpressionNode;

function assertExpressionNode(value: unknown): ExpressionNode {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid expression node in data/bin.yaml");
  }
  const node = value as Record<string, unknown>;
  const type = node.type;
  if (type === "Identifier") {
    const name = node.name;
    if (typeof name !== "string") {
      throw new Error("Identifier nodes require a string name");
    }
    return { type: "Identifier", name };
  }
  if (type === "Literal") {
    const raw = node.raw;
    const literalValue = node.value;
    if (typeof raw !== "string" && typeof literalValue === "undefined") {
      throw new Error("Literal nodes require a raw or value field");
    }
    return {
      type: "Literal",
      raw: typeof raw === "string" ? raw : undefined,
      value: literalValue,
    };
  }
  if (type === "BinaryExpression") {
    const operator = node.operator;
    if (typeof operator !== "string") {
      throw new Error("BinaryExpression nodes require an operator string");
    }
    const left = assertExpressionNode(node.left);
    const right = assertExpressionNode(node.right);
    return {
      type: "BinaryExpression",
      operator,
      left,
      right,
    };
  }
  throw new Error(`Unsupported node type "${String(type)}"`);
}

function resolveBinaryPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "../../data/bin.yaml");
}

function computeMaxDepth(node: ExpressionNode): number {
  if (node.type !== "BinaryExpression") return 0;
  const leftDepth = computeMaxDepth(node.left);
  const rightDepth = computeMaxDepth(node.right);
  return 1 + Math.max(leftDepth, rightDepth);
}

function serializeInOrder(
  node: ExpressionNode,
  depth: number,
  maxDepth: number,
): string {
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal") {
    if (typeof node.raw === "string") return node.raw;
    if (node.value === null) return "null";
    return String(node.value ?? "");
  }
  const left = serializeInOrder(node.left, depth + 1, maxDepth);
  const right = serializeInOrder(node.right, depth + 1, maxDepth);
  const pad = " ".repeat(Math.max(maxDepth - depth, 0));
  return `${left}${pad}${node.operator}${pad}${right}`;
}

export function serializeExpression(node: ExpressionNode): string {
  const depth = computeMaxDepth(node);
  return serializeInOrder(node, 0, depth);
}

export function serializeExpressionFromFile(filePath: string): string {
  const tree = assertExpressionNode(YAML.parse(readFileSync(filePath, "utf8")));
  return serializeExpression(tree);
}

function toLeafNode(token: string): ExpressionNode {
  if (/^-?\d+(\.\d+)?$/.test(token)) {
    return {
      type: "Literal",
      value: Number(token),
      raw: token,
    };
  }
  return {
    type: "Identifier",
    name: token,
  };
}

interface OperatorToken {
  symbol: string;
  leftPad: number;
  rightPad: number;
  position: number;
}

function tokenizeExpression(value: string): {
  operands: ExpressionNode[];
  operators: OperatorToken[];
} {
  const operands: ExpressionNode[] = [];
  const operators: OperatorToken[] = [];
  const trimmed = value.trim();
  const length = trimmed.length;
  let i = 0;
  while (i < length) {
    let start = i;
    while (i < length && trimmed[i] !== " ") {
      i += 1;
    }
    if (start === i) {
      throw new Error("Expected operand but found empty segment");
    }
    operands.push(toLeafNode(trimmed.slice(start, i)));
    let leftPad = 0;
    while (i < length && trimmed[i] === " ") {
      leftPad += 1;
      i += 1;
    }
    if (i >= length) break;
    const symbol = trimmed[i];
    i += 1;
    let rightPad = 0;
    while (i < length && trimmed[i] === " ") {
      rightPad += 1;
      i += 1;
    }
    if (leftPad !== rightPad) {
      throw new Error(
        `Operator "${symbol}" must have symmetric spacing (${leftPad} vs ${rightPad})`,
      );
    }
    operators.push({
      symbol,
      leftPad,
      rightPad,
      position: operands.length - 1,
    });
  }
  if (operands.length === 0) {
    throw new Error("Expression string is empty");
  }
  if (operators.length !== operands.length - 1) {
    throw new Error("Malformed expression string");
  }
  return { operands, operators };
}

function buildExpressionTree(
  operands: ExpressionNode[],
  operators: OperatorToken[],
  start: number,
  end: number,
): ExpressionNode {
  if (start === end) return operands[start];
  let maxPad = -1;
  let opIndex = -1;
  for (let i = 0; i < operators.length; i += 1) {
    const op = operators[i];
    if (op.position < start || op.position >= end) continue;
    if (op.leftPad > maxPad) {
      maxPad = op.leftPad;
      opIndex = i;
    }
  }
  if (opIndex === -1) {
    throw new Error("Unable to determine operator hierarchy");
  }
  const op = operators[opIndex];
  const left = buildExpressionTree(operands, operators, start, op.position);
  const right = buildExpressionTree(operands, operators, op.position + 1, end);
  return {
    type: "BinaryExpression",
    operator: op.symbol,
    left,
    right,
  };
}

export function parseExpressionString(value: string): ExpressionNode {
  const { operands, operators } = tokenizeExpression(value);
  if (operators.length === 0) return operands[0];
  return buildExpressionTree(operands, operators, 0, operands.length - 1);
}

export function main(): void {
  const filePath = resolveOperatorPath();
  const count = registerOperatorsFromFile(filePath);
  const binaryPath = resolveBinaryPath();
  const serialized = serializeExpressionFromFile(binaryPath);
  console.log(count);
  console.log(serialized);
}

if (import.meta.main) {
  main();
}
