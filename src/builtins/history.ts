import {
  registerBuiltin,
  registerBuiltinHelp,
  type BuiltinContext,
  type HistoryEntry,
  detectHelpLevel,
} from "../index.ts";

const SINGLE_HELP = "Show recent commands; optionally pass a count.";
const DETAILED_HELP = "usage: history [count]\nDisplays the most recent commands recorded by the shell.";

function formatHistory(entries: readonly HistoryEntry[], count: number): string {
  const slice = entries.slice(-count);
  const startIndex = entries.length - slice.length;
  return slice
    .map((entry, idx) => {
      const number = startIndex + idx + 1;
      return `${String(number).padStart(5, " ")}  ${entry.command}`;
    })
    .join("\n");
}

registerBuiltin("history", (ctx: BuiltinContext) => {
  const helpLevel = detectHelpLevel(ctx);
  if (helpLevel === "cluster" || helpLevel === "double") {
    ctx.write(`${DETAILED_HELP}\n`);
    return;
  }
  if (helpLevel === "single") {
    ctx.write(`${SINGLE_HELP}\n`);
    return;
  }

  if (ctx.argv.length > 1) {
    ctx.write("history: expected at most one argument\n");
    return;
  }

  const entries = ctx.history;
  if (!entries.length) {
    ctx.write("history: no recorded commands\n");
    return;
  }

  let count = entries.length;
  const arg = ctx.argv[0];
  if (arg !== undefined) {
    const parsed = Number.parseInt(arg, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      ctx.write(`history: invalid count '${arg}'\n`);
      return;
    }
    count = Math.min(parsed, entries.length);
  }

  ctx.write(`${formatHistory(entries, count)}\n`);
});

registerBuiltinHelp("history", "Show recent command history");
