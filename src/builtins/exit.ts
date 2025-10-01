import { registerBuiltin, registerBuiltinHelp, type BuiltinContext } from "./registry.ts";
import { detectHelpLevel } from "./helpFlags.ts";

registerBuiltin("exit", (ctx: BuiltinContext) => {
  const helpLevel = detectHelpLevel(ctx);
  if (helpLevel === "cluster") {
    ctx.write("exit Lush shell\n");
    return;
  }
  if (helpLevel === "double") {
    ctx.write("TBD -h -h\n");
    return;
  }
  if (helpLevel === "single") {
    ctx.write("TBD -h\n");
    return;
  }
  process.exit(0);
});

registerBuiltinHelp("exit", "exit Lush shell");
