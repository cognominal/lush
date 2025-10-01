import type { BuiltinContext } from "./registry.ts";

export type HelpVariant = "none" | "single" | "double";

export function detectHelpVariant(ctx: BuiltinContext, command: string): HelpVariant {
  const raw = ctx.raw.trim();
  if (!raw.startsWith(command)) return "none";
  const rest = raw.slice(command.length).trim();
  if (!rest) return "none";
  const tokens = rest.split(/\s+/).filter(Boolean);

  let count = 0;
  for (const token of tokens) {
    if (token === "-h") {
      count += 1;
      continue;
    }
    if (token === "-hh") {
      count += 2;
      continue;
    }
  }

  if (count >= 2) return "double";
  if (count === 1) return "single";
  return "none";
}
