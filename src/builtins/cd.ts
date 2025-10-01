import { registerBuiltin, registerBuiltinHelp, type BuiltinContext } from "./registry.ts";
import { detectHelpLevel } from "./helpFlags.ts";
import { resolveDirectory, writeDirectoryError } from "./pathHelpers.ts";

registerBuiltin("cd", (ctx: BuiltinContext) => {
  const helpLevel = detectHelpLevel(ctx);
  if (helpLevel === "cluster" || helpLevel === "double") {
    ctx.write("TBD -h -h\n");
    return;
  }
  if (helpLevel === "single") {
    ctx.write("TBD -h\n");
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

registerBuiltinHelp("cd", "TBD");
