import chalk from "chalk";
import type { ChildProcess } from "node:child_process";
import { type TokenTypename } from './index.ts'
// TBD : remove the Space token, that can be inferred from the position and
// content of other tokens but that would necessitate special code

export interface InputToken {
  type: TokenTypename
  tokenIdx: number
  text?: string // missing for types that have subtypes
  subTokens?: InputToken[]
  x?: number
}

export type TokenLine = InputToken[]
export type TokenMultiLine = TokenLine[]



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
