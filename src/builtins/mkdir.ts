import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  registerBuiltin,
  registerBuiltinHelp,
  type BuiltinContext,
  detectHelpLevel,
  writeCommandError,
  DirectoryError,
} from "../index.ts";

const MKDIR_HELP = "Create directories, creating parents as needed.";
const MKDIR_HELP_LONG = "usage: mkdir DIR...\nCreate the directories (and parents) if they do not already exist.";
const MKCD_HELP = "Create a directory then change into it.";
const MKCD_HELP_LONG = "usage: mkcd DIR\nCreate the directory (including parents) and change into it.";

function expandPath(input: string, command: string): string {
  if (!input) {
    throw new DirectoryError(`${command}: missing directory operand`);
  }
  if (input === "~") {
    const home = process.env.HOME || os.homedir();
    if (!home) throw new DirectoryError(`${command}: HOME not set`);
    return home;
  }
  if (input.startsWith("~/")) {
    const home = process.env.HOME || os.homedir();
    if (!home) throw new DirectoryError(`${command}: HOME not set`);
    return path.join(home, input.slice(2));
  }
  return input;
}

function resolveTarget(input: string, command: string): string {
  const expanded = expandPath(input, command);
  return path.resolve(process.cwd(), expanded);
}

function ensureDirectory(command: string, target: string) {
  try {
    fs.mkdirSync(target, { recursive: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new DirectoryError(`${command}: unable to create ${target}: ${message}`);
  }
}

registerBuiltin("mkdir", (ctx: BuiltinContext) => {
  const helpLevel = detectHelpLevel(ctx);
  if (helpLevel === "cluster" || helpLevel === "double") {
    ctx.write(`${MKDIR_HELP_LONG}\n`);
    return;
  }
  if (helpLevel === "single") {
    ctx.write(`${MKDIR_HELP}\n`);
    return;
  }

  if (ctx.argv.length === 0) {
    ctx.write("mkdir: missing directory operand\n");
    return;
  }

  for (const arg of ctx.argv) {
    try {
      const target = resolveTarget(arg, "mkdir");
      ensureDirectory("mkdir", target);
    } catch (err) {
      writeCommandError(ctx, "mkdir", err);
      return;
    }
  }
});

registerBuiltinHelp("mkdir", "Create directories recursively");

registerBuiltin("mkcd", (ctx: BuiltinContext) => {
  const helpLevel = detectHelpLevel(ctx);
  if (helpLevel === "cluster" || helpLevel === "double") {
    ctx.write(`${MKCD_HELP_LONG}\n`);
    return;
  }
  if (helpLevel === "single") {
    ctx.write(`${MKCD_HELP}\n`);
    return;
  }

  if (ctx.argv.length !== 1) {
    ctx.write(ctx.argv.length === 0 ? "mkcd: missing directory operand\n" : "mkcd: too many arguments\n");
    return;
  }

  const arg = ctx.argv[0];

  try {
    const target = resolveTarget(arg, "mkcd");
    ensureDirectory("mkcd", target);
    process.chdir(target);
    ctx.write(`${process.cwd()}\n`);
  } catch (err) {
    writeCommandError(ctx, "mkcd", err);
  }
});

registerBuiltinHelp("mkcd", "Create a directory then cd into it");
