import { registerBuiltin, type BuiltinContext } from "./registry.ts";
import { popDirectory, pushDirectory } from "./directoryStack.ts";
import { writeCommandError } from "./pathHelpers.ts";

registerBuiltin("popd", (ctx: BuiltinContext) => {
  const next = popDirectory();
  if (!next) {
    ctx.write("popd: directory stack empty\n");
    return;
  }

  try {
    process.chdir(next);
    ctx.write(`${process.cwd()}\n`);
  } catch (err) {
    pushDirectory(next);
    writeCommandError(ctx, "popd", err);
  }
});
