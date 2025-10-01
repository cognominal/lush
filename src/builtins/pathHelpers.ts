import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BuiltinContext } from "./registry.ts";

export class DirectoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirectoryError";
  }
}

function expandTilde(input: string, home: string): string {
  if (input === "~") return home;
  if (input.startsWith("~/")) return path.join(home, input.slice(2));
  return input;
}

export function resolveDirectory(command: string, input?: string): string {
  const home = process.env.HOME || os.homedir();
  if ((!input || input.startsWith("~")) && !home) {
    throw new DirectoryError(`${command}: HOME not set`);
  }

  let target = input;
  if (!target || target === "~" || target.startsWith("~/")) {
    target = expandTilde(target ?? "~", home);
  }

  if (!target) {
    throw new DirectoryError(`${command}: HOME not set`);
  }

  const resolved = path.resolve(process.cwd(), target);
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch (err) {
    const { message } = err instanceof Error ? err : { message: String(err) };
    const code = (err as NodeJS.ErrnoException)?.code;
    const display = input ?? target;
    if (code === "ENOENT") {
      throw new DirectoryError(`${command}: no such directory: ${display}`);
    }
    throw new DirectoryError(`${command}: unable to access ${display}: ${message}`);
  }
  if (!stat.isDirectory()) {
    const display = input ?? target;
    throw new DirectoryError(`${command}: not a directory: ${display}`);
  }
  return resolved;
}

export function writeDirectoryError(ctx: BuiltinContext, err: unknown) {
  if (err instanceof DirectoryError) {
    ctx.write(`${err.message}\n`);
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  ctx.write(`${message}\n`);
}

export function writeCommandError(ctx: BuiltinContext, command: string, err: unknown) {
  if (err instanceof DirectoryError) {
    ctx.write(`${err.message}\n`);
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  ctx.write(`${command}: ${message}\n`);
}
