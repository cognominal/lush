import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const commandSummaryCache = new Map<string, string | null>();

export async function getCommandSummary(name: string): Promise<string | null> {
  const key = typeof name === "string" ? name.trim() : "";
  if (!key) return null;
  if (commandSummaryCache.has(key)) {
    return commandSummaryCache.get(key)!;
  }
  try {
    const { stdout } = await execFileAsync("tldr", [key], {
      env: {
        ...process.env,
        TLDR_COLOR: "never",
      },
    });
    const lines = stdout.split(/\r?\n/);
    let summary: string | null = null;
    const normalizedCommand = key.toLowerCase();
    const cleaned: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.toLowerCase().startsWith("warning:")) continue;
      cleaned.push(trimmed);
      if (summary) continue;
      if (trimmed.startsWith(">")) {
        summary = trimmed.replace(/^>\s*/, "");
        if (summary) {
          summary = summary.replace(/\s+/g, " ");
        }
      }
    }
    if (!summary) {
      for (const entry of cleaned) {
        const lower = entry.toLowerCase();
        if (!entry) continue;
        if (lower === normalizedCommand) continue;
        if (lower.startsWith("more information")) continue;
        summary = entry.replace(/\s+/g, " ");
        break;
      }
    }
    commandSummaryCache.set(key, summary);
    return summary;
  } catch {
    commandSummaryCache.set(key, null);
    return null;
  }
}

export function resetCommandSummaryCache(): void {
  commandSummaryCache.clear();
}
