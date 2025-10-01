import { registerBuiltin, type BuiltinContext } from "./registry.ts";
import { popDirectory, pushDirectory } from "./directoryStack.ts";
import { writeCommandError } from "./pathHelpers.ts";
import { detectHelpVariant } from "./helpFlags.ts";

registerBuiltin("popd", (ctx: BuiltinContext) => {
  const help = detectHelpVariant(ctx, "popd");
  if (help === "single") {
    ctx.write("TBD -h\n");
    return;
  }
  if (help === "double") {
    ctx.write("Remove the top directory from the stack and cd to it\n");
    return;
  }

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
