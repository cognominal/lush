import { registerBuiltin, registerBuiltinHelp, type BuiltinContext } from "./registry.ts";
import { detectHelpLevel } from "./helpFlags.ts";
import { popDirectory, pushDirectory, formatDirectoryStack } from "./directoryStack.ts";
import { writeCommandError } from "./pathHelpers.ts";

const POPD_HELP = "Pop the directory stack and change back.";
const POPD_HELP_LONG = "usage: popd\nRemoves newest pushd entry, changes into it, then prints remaining stack.";

registerBuiltin("popd", (ctx: BuiltinContext) => {
  const helpLevel = detectHelpLevel(ctx);
  if (helpLevel === "cluster" || helpLevel === "double") {
    ctx.write(`${POPD_HELP_LONG}\n`);
    return;
  }
  if (helpLevel === "single") {
    ctx.write(`${POPD_HELP}\n`);
    return;
  }

  const next = popDirectory();
  if (!next) {
    ctx.write("popd: directory stack empty\n");
    return;
  }

  try {
    process.chdir(next);
    ctx.write(`${formatDirectoryStack()}\n`);
  } catch (err) {
    pushDirectory(next);
    writeCommandError(ctx, "popd", err);
  }
});

registerBuiltinHelp("popd", "Pop the directory stack");
