import {
  registerBuiltin,
  registerBuiltinHelp,
  type BuiltinContext,
  detectHelpLevel,
} from "../index.ts";

const SINGLE_HELP = "Print the current working directory.";
const DETAILED_HELP = "usage: pwd\nOutputs the shell's current working directory.";

registerBuiltin("pwd", (ctx: BuiltinContext) => {
  const helpLevel = detectHelpLevel(ctx);
  if (helpLevel === "cluster" || helpLevel === "double") {
    ctx.write(`${DETAILED_HELP}\n`);
    return;
  }
  if (helpLevel === "single") {
    ctx.write(`${SINGLE_HELP}\n`);
    return;
  }

  if (ctx.argv.length > 0) {
    ctx.write("pwd: unexpected arguments\n");
    return;
  }

  ctx.write(`${process.cwd()}\n`);
});

registerBuiltinHelp("pwd", "Print the current working directory");
