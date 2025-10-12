import {
  registerBuiltin,
  registerBuiltinHelp,
  type BuiltinContext,
  detectHelpLevel,
} from "../index.ts";

const SINGLE_HELP = "Clear the interactive screen.";
const DETAILED_HELP = "usage: clear\nErases the visible terminal content and moves the cursor to the top-left.";
const CLEAR_SEQUENCE = "\u001b[2J\u001b[H";

registerBuiltin("clear", (ctx: BuiltinContext) => {
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
    ctx.write("clear: unexpected arguments\n");
    return;
  }

  ctx.write(CLEAR_SEQUENCE);
});

registerBuiltinHelp("clear", "Clear the screen");
