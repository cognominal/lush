import { registerBuiltin, registerBuiltinHelp, type BuiltinContext } from "./registry.ts";
import { detectHelpLevel } from "./helpFlags.ts";
import { formatDirectoryStack } from "./directoryStack.ts";

const DIRS_HELP = "Show the directory stack.";
const DIRS_HELP_LONG = "usage: dirs\nPrints the current directory followed by saved stack entries (if any).";

registerBuiltin("dirs", (ctx: BuiltinContext) => {
  const helpLevel = detectHelpLevel(ctx);
  if (helpLevel === "cluster" || helpLevel === "double") {
    ctx.write(`${DIRS_HELP_LONG}\n`);
    return;
  }
  if (helpLevel === "single") {
    ctx.write(`${DIRS_HELP}\n`);
    return;
  }

  ctx.write(`${formatDirectoryStack()}\n`);
});

registerBuiltinHelp("dirs", "Show the directory stack");
