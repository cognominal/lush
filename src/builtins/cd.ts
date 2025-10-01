import { registerBuiltin, type BuiltinContext } from "./registry.ts";
import { detectHelpVariant } from "./helpFlags.ts";
import { resolveDirectory, writeDirectoryError } from "./pathHelpers.ts";

registerBuiltin("cd", (ctx: BuiltinContext) => {
  const help = detectHelpVariant(ctx, "cd");
  if (help === "single") {
    ctx.write("TBD -h\n");
    return;
  }
  if (help === "double") {
    ctx.write("Go to the specified directory\n");
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
