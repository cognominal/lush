import { describe, it, expect } from "vitest";
import type { HistoryEntry } from "../src/builtins.ts";

process.env.FORCE_COLOR = process.env.FORCE_COLOR ?? "1";

const { default: chalk } = await import("chalk");
const { chalkHtml, getBuiltin } = await import("../src/builtins.ts");

describe("chalkHtml", () => {
  it("converts italic formatting", () => {
    expect(chalkHtml(chalk.italic("cmd"))).toBe("<i>cmd</i>");
  });

  it("converts colors and resets", () => {
    const colored = chalk.green("ok");
    expect(chalkHtml(colored)).toBe('<span style="color:#00aa00">ok</span>');
  });

  it("escapes HTML special characters and newlines", () => {
    const input = "<&>\nand";
    expect(chalkHtml(input)).toBe("&lt;&amp;&gt;<br>\nand");
  });
});

describe("html builtin", () => {
  const htmlBuiltin = getBuiltin("html");
  if (!htmlBuiltin) throw new Error("html builtin not registered");

  const invokeHtml = async (history: HistoryEntry[], argv: string[] = []) => {
    const chunks: string[] = [];
    await htmlBuiltin({
      argv,
      raw: `html ${argv.join(" ")}`.trim(),
      write: chunk => { chunks.push(chunk); },
      history,
    });
    return chunks.join("");
  };

  it("renders the latest command and output as HTML", async () => {
    const history: HistoryEntry[] = [
      { command: "echo hi", output: "hi\n" },
      { command: "ls stuff", output: "file1\nfile2\n" },
    ];
    const html = await invokeHtml(history);
    expect(html).toContain("&gt; <i>ls</i> stuff");
    expect(html).toContain("file1<br>");
    expect(html).not.toContain("<i>echo</i>");
  });

  it("respects count argument to include multiple entries", async () => {
    const history: HistoryEntry[] = [
      { command: "cmd1", output: "out1\n" },
      { command: "cmd2", output: "out2\n" },
      { command: "cmd3", output: "out3\n" },
    ];
    const html = await invokeHtml(history, ["2"]);
    expect(html).toContain("&gt; <i>cmd2</i>");
    expect(html).toContain("&gt; <i>cmd3</i>");
    expect(html).not.toContain("&gt; <i>cmd1</i>");
  });
});
