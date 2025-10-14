import {
  registerBuiltin,
  registerBuiltinHelp,
  type BuiltinContext,
  detectHelpLevel,
} from "../index.ts";

const SINGLE_HELP = "Exit the shell immediately.";
const DETAILED_HELP = "usage: exit\nTerminates the shell with exit code 0.";

registerBuiltin("exit", (ctx: BuiltinContext) => {
  const helpLevel = detectHelpLevel(ctx);
  if (helpLevel === "cluster") {
    ctx.write("Exit the shell\n");
    return;
  }
  if (helpLevel === "double") {
    ctx.write(`${DETAILED_HELP}\n`);
    return;
  }
  if (helpLevel === "single") {
    ctx.write(`${SINGLE_HELP}\n`);
    return;
  }
  process.exit(0);
});

registerBuiltinHelp("exit", "Exit the shell");
