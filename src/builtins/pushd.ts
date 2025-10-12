import {
  registerBuiltin,
  registerBuiltinHelp,
  type BuiltinContext,
  pushDirectory,
  popDirectory,
  formatDirectoryStack,
  resolveDirectory,
  writeDirectoryError,
  writeCommandError,
  detectHelpLevel,
} from "../index.ts";

registerBuiltin("pushd", (ctx: BuiltinContext) => {
  const helpLevel = detectHelpLevel(ctx);
  if (helpLevel === "cluster" || helpLevel === "double") {
    ctx.write("TBD -h -h\n");
    return;
  }
  if (helpLevel === "single") {
    ctx.write("TBD -h\n");
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

registerBuiltinHelp("pushd", "TBD");
