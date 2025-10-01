import { registerBuiltin, registerBuiltinHelp, type BuiltinContext } from "./registry.ts";
import { popDirectory, pushDirectory } from "./directoryStack.ts";
import { writeCommandError } from "./pathHelpers.ts";
import { detectHelpLevel } from "./helpFlags.ts";

registerBuiltin("popd", (ctx: BuiltinContext) => {
  const helpLevel = detectHelpLevel(ctx);
  if (helpLevel === "cluster" || helpLevel === "double") {
    ctx.write("TBD -h -h\n");
    return;
  }
  if (helpLevel === "single") {
    ctx.write("TBD -h\n");
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

registerBuiltinHelp("popd", "TBD");
