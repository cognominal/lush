import type {
  BinaryExpression,
  Identifier,
  Literal,
  UnaryExpression,
} from "acorn";

export type SupportedExpression =
  | Identifier
  | Literal
  | BinaryExpression
  | UnaryExpression;

export interface ParseLine {
  readonly indentation: number;
  readonly raw: string;
  readonly operator: string | null;
  readonly operand: string;
}

export interface ParseResult {
  readonly node: SupportedExpression;
  readonly nextIndex: number;
}

export interface SerializeOptions {
  readonly maxWidth?: number;
}

export interface FormatState {
  readonly lines: string[];
}
