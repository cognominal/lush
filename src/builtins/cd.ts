import {
  registerBuiltin,
  registerBuiltinHelp,
  type BuiltinContext,
  detectHelpLevel,
  resolveDirectory,
  writeDirectoryError,
} from "../index.ts";

const SINGLE_HELP = "Change the current working directory (defaults to HOME).";
const DETAILED_HELP =
  "usage: cd [dir]\nChanges to DIR. Without DIR uses HOME; supports ~ and relative paths.";

registerBuiltin("cd", (ctx: BuiltinContext) => {
  const helpLevel = detectHelpLevel(ctx);
  if (helpLevel === "cluster" || helpLevel === "double") {
    ctx.write(`${DETAILED_HELP}\n`);
    return;
  }
  if (helpLevel === "single") {
    ctx.write(`${SINGLE_HELP}\n`);
    return;
  }

  if (ctx.argv.length > 1) {
    ctx.write("cd: too many arguments\n");
    return;
  }

  try {
    const target = resolveDirectory("cd", ctx.argv[0]);
    process.chdir(target);
    ctx.write(`${process.cwd()}\n`);
  } catch (err) {
    writeDirectoryError(ctx, err);
  }
});

registerBuiltinHelp("cd", "Change directory");
