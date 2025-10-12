import {
  registerBuiltin,
  registerBuiltinHelp,
  type BuiltinContext,
  detectHelpLevel,
  formatDirectoryStack,
} from "../index.ts";

registerBuiltin("dirs", (ctx: BuiltinContext) => {
  const helpLevel = detectHelpLevel(ctx);
  if (helpLevel === "cluster" || helpLevel === "double") {
    ctx.write("TBD -h -h\n");
    return;
  }
  if (helpLevel === "single") {
    ctx.write("TBD -h\n");
    return;
  }

  ctx.write(`${formatDirectoryStack()}\n`);
});

registerBuiltinHelp("dirs", "TBD");
