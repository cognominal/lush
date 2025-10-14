import { registerBuiltin, registerBuiltinHelp, type BuiltinContext } from "./registry.ts";
import { detectHelpLevel } from "./helpFlags.ts";
import { pushDirectory, popDirectory, formatDirectoryStack } from "./directoryStack.ts";
import { resolveDirectory, writeDirectoryError, writeCommandError } from "./pathHelpers.ts";

const PUSHD_HELP = "Push the current directory, then change to DIR.";
const PUSHD_HELP_LONG = "usage: pushd DIR\nPushes the current directory, changes to DIR, then prints the updated stack.";

registerBuiltin("pushd", (ctx: BuiltinContext) => {
  const helpLevel = detectHelpLevel(ctx);
  if (helpLevel === "cluster" || helpLevel === "double") {
    ctx.write(`${PUSHD_HELP_LONG}\n`);
    return;
  }
  if (helpLevel === "single") {
    ctx.write(`${PUSHD_HELP}\n`);
    return;
  }

  if (ctx.argv.length === 0) {
    ctx.write("pushd: missing directory\n");
    return;
  }

  try {
    const target = resolveDirectory("pushd", ctx.argv[0]);
    const current = process.cwd();
    pushDirectory(current);
    try {
      process.chdir(target);
    } catch (err) {
      popDirectory();
      writeCommandError(ctx, "pushd", err);
      return;
    }
    ctx.write(`${formatDirectoryStack()}\n`);
  } catch (err) {
    writeDirectoryError(ctx, err);
  }
});

registerBuiltinHelp("pushd", "Push the current directory then cd");
