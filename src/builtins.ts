import chalk from "chalk";
import {
  registerBuiltin,
  listBuiltins,
  registerBuiltinHelp,
  listBuiltinHelpEntries,
  type BuiltinContext,
} from "./builtins/registry.ts";
import { detectHelpLevel } from "./builtins/helpFlags.ts";

export {
  registerBuiltin,
  getBuiltin,
  listBuiltins,
  registerBuiltinHelp,
  getBuiltinHelp,
  listBuiltinHelpEntries,
} from "./builtins/registry.ts";
export type { BuiltinContext, BuiltinHandler, HistoryEntry } from "./builtins/registry.ts";

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const COLOR_MAP: Record<number, string> = {
  31: "#cc0000",
  32: "#00aa00",
};

export function chalkHtml(input: string): string {
  let result = "";
  const colorStack: string[] = [];
  let italicOpen = false;

  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === "\u001b" && input[i + 1] === "[") {
      const end = input.indexOf("m", i);
      if (end === -1) {
        break;
      }
      const sequence = input.slice(i + 2, end);
      const codes = sequence.split(";").map(code => Number.parseInt(code, 10)).filter(Number.isFinite);
      for (const code of codes) {
        if (code === 0) {
          if (italicOpen) {
            result += "</i>";
            italicOpen = false;
          }
          while (colorStack.length) {
            result += "</span>";
            colorStack.pop();
          }
          continue;
        }
        if (code === 3) {
          if (!italicOpen) {
            result += "<i>";
            italicOpen = true;
          }
          continue;
        }
        if (code === 23) {
          if (italicOpen) {
            result += "</i>";
            italicOpen = false;
          }
          continue;
        }
        if (code === 39) {
          if (colorStack.length) {
            result += "</span>";
            colorStack.pop();
          }
          continue;
        }
        const color = COLOR_MAP[code];
        if (color) {
          if (colorStack.length) {
            result += "</span>";
            colorStack.pop();
          }
          colorStack.push(color);
          result += `<span style="color:${color}">`;
        }
      }
      i = end + 1;
      continue;
    }
    if (ch === "\n") {
      result += "<br>\n";
    } else if (ch !== "\r") {
      result += escapeHtml(ch);
    }
    i++;
  }

  if (italicOpen) {
    result += "</i>";
  }
  while (colorStack.length) {
    result += "</span>";
    colorStack.pop();
  }
  return result;
}

function builtinListCommand(ctx: BuiltinContext) {
  const helpLevel = detectHelpLevel(ctx);
  if (helpLevel === "cluster") {
    const entries = listBuiltinHelpEntries();
    const lines = entries.map(({ name, description }) => {
      const column = 11;
      const padded = name.length >= column ? `${name} ` : name.padEnd(column, " ");
      const desc = description ?? "";
      return `${padded}${desc}`;
    });
    ctx.write(`${lines.join("\n")}\n`);
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
  const names = listBuiltins();
  const output = names.length ? names.join("\n") : "<no builtins registered>";
  ctx.write(`${output}\n`);
}

registerBuiltin("builtins", ctx => builtinListCommand(ctx));
registerBuiltinHelp("builtins", "TBD");

function formatCommandHtml(command: string): string {
  const lines = command.split("\n");
  const htmlLines = lines.map((line, idx) => {
    if (idx === 0) {
      const match = line.match(/^(\S+)(.*)$/);
      if (match) {
        const [, first, rest] = match;
        return chalkHtml(chalk.italic(first)) + escapeHtml(rest);
      }
    }
    return escapeHtml(line);
  });
  return htmlLines.join("<br>\n");
}

function formatOutputHtml(output: string): string {
  if (!output) return "<em>No output</em>";
  return chalkHtml(output);
}

function htmlHistoryCommand(ctx: BuiltinContext) {
  const helpLevel = detectHelpLevel(ctx);
  if (helpLevel === "cluster" || helpLevel === "double") {
    ctx.write("TBD -h -h\n");
    return;
  }
  if (helpLevel === "single") {
    ctx.write("TBD -h\n");
    return;
  }
  const history = ctx.history;
  if (!history.length) {
    ctx.write('<p><em>No history available</em></p>\n');
    return;
  }

  const countArg = ctx.argv[0];
  let count = 1;
  if (countArg) {
    const parsed = Number.parseInt(countArg, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      count = parsed;
    }
  }

  const entries = history.slice(-count);
  const sections = entries.map(entry => {
    const commandHtml = formatCommandHtml(entry.command);
    const outputHtml = formatOutputHtml(entry.output);
    return `<section><pre class="command">&gt; ${commandHtml}</pre><pre class="output">${outputHtml}</pre></section>`;
  });
  ctx.write(`${sections.join("\n")}\n`);
}

registerBuiltin("html", ctx => htmlHistoryCommand(ctx));
registerBuiltinHelp("html", "TBD");

// ensure builtin modules register themselves on import
import "./builtins/cd.ts";
import "./builtins/pushd.ts";
import "./builtins/popd.ts";
import "./builtins/exit.ts";
import "./builtins/ts.ts";
