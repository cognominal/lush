import chalk from "chalk";
import type { ChildProcess } from "node:child_process";

// TBD : remove the Space token, that can be inferred from the position and
// content of other tokens but that would necessitate special code

// the enum values must be strings to be used in highlightMap
// TODO : a enum does not scale, need a registry
export enum TokenType {
  CommandName = "CommandName",
  Builtin = "Builtin",
  Function = "Function",
  NakedString = "NakedString", // will have subtypes
  Var = "var", // subtypes Sigil, Twigil, SigillessName
  Number = "Number",
  Space = "Space",
  AnyString = "AnyString",

  HTMLtag = "HTMLtag",
  TailwindClass = "TailwindClass",
  HTMLClass = "HTMLClass",
  // Acorn
  Program = "Program",
  ExpressionStatement = "ExpressionStatement",
  Literal = "Literal",
  // subtypes/
  ValidPath = "ValidPath",
  InvalidPath = "InvalidPath",
  PromptChar = "MEPromptChars", // Only for multiline editing
  Sigil = "Sigil",
  Twigil = "Twigil",
  SigillessName = "SigillessName"
}

export interface Token {
  type: TokenType
  tokenIdx: number
  text?: string // missing for types that have subtypes
  subTokens?: Token[]
  x?: number
}

export enum OprType {
  Binary,
  UnaryPrefix,
  unaryPostfix,
  circumfix,
  PostCircumfix
}

export interface OprToken extends Token {
  oprType: OprType

}
export type TokenLine = Token[]
export type TokenMultiLine = TokenLine[]

// identity function (default highlighter)
const identity = (s: string) => s;

// only define for the token type we want highligted 
const highlightMap: Partial<Record<TokenType, (s: string) => string>> = {
  CommandName: chalk.italic,
  ValidPath: chalk.green,
  InvalidPath: chalk.red,
};

// main accessor
export function getHighlighter(type: TokenType): (s: string) => string {
  return highlightMap[type] ?? identity;
}
export enum JobStatus {
  Running = "running",
  Stopped = "stopped",
  Done = "done",
}

export interface Job {
  id: number;
  pid: number | null;
  command: string;
  process: ChildProcess;
  status: JobStatus;
  background: boolean;
  startedAt: Date;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stoppedAt?: Date;
  disowned?: boolean;
}
