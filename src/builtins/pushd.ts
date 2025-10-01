import { registerBuiltin, type BuiltinContext } from "./registry.ts";
import { pushDirectory, popDirectory } from "./directoryStack.ts";
import { resolveDirectory, writeDirectoryError, writeCommandError } from "./pathHelpers.ts";

registerBuiltin("pushd", (ctx: BuiltinContext) => {
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
    ctx.write(`${process.cwd()}\n`);
  } catch (err) {
    writeDirectoryError(ctx, err);
  }
});
