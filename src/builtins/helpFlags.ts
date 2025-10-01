import type { BuiltinContext } from "./registry.ts";

export type HelpLevel = "none" | "single" | "double" | "cluster";

function rawHasSeparatedDouble(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const pattern = /(^|\s)-h\s+-h(\s|$)/;
  return pattern.test(trimmed);
}

export function detectHelpLevel(ctx: BuiltinContext): HelpLevel {
  let singleCount = 0;
  let hasCluster = false;

  for (const arg of ctx.argv) {
    if (arg === "-h") {
      singleCount++;
      continue;
    }
    if (arg === "-hh") {
      hasCluster = true;
    }
  }

  if (hasCluster) return "cluster";
  if (singleCount >= 2 || rawHasSeparatedDouble(ctx.raw)) return "double";
  if (singleCount === 1) return "single";
  return "none";
}

export function isSingleHelp(level: HelpLevel): boolean {
  return level === "single";
}

export function isDoubleHelp(level: HelpLevel): boolean {
  return level === "double" || level === "cluster";
}
