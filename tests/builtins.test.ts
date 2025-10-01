import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { HistoryEntry } from "../src/builtins.ts";

process.env.FORCE_COLOR = process.env.FORCE_COLOR ?? "1";

const { default: chalk } = await import("chalk");
const { chalkHtml, getBuiltin } = await import("../src/builtins.ts");
const { clearDirectoryStack, getDirectoryStack } = await import("../src/builtins/directoryStack.ts");

const realCwd = process.cwd();
let currentDir = realCwd;

const cwdSpy = vi.spyOn(process, "cwd").mockImplementation(() => currentDir);
const chdirSpy = vi.spyOn(process, "chdir").mockImplementation((dir: string) => {
  currentDir = path.resolve(currentDir, dir);
});

afterAll(() => {
  currentDir = realCwd;
  cwdSpy.mockRestore();
  chdirSpy.mockRestore();
});

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

describe("cd builtin", () => {
  const cdBuiltin = getBuiltin("cd");
  if (!cdBuiltin) throw new Error("cd builtin not registered");

  const startCwd = process.cwd();
  const originalHome = process.env.HOME;
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lush-cd-"));
  const homeDir = path.join(tmpRoot, "home");
  fs.mkdirSync(homeDir);

  beforeEach(() => {
    clearDirectoryStack();
    currentDir = startCwd;
    process.env.HOME = originalHome ?? homeDir;
  });

  afterAll(() => {
    currentDir = startCwd;
    process.env.HOME = originalHome;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("changes to provided directory and prints its path", () => {
    const target = fs.mkdtempSync(path.join(tmpRoot, "dir-"));
    const chunks: string[] = [];
    cdBuiltin({
      argv: [target],
      raw: `cd ${target}`,
      write: chunk => { chunks.push(chunk); },
      history: [],
    });
    expect(process.cwd()).toBe(target);
    expect(chunks.join("")).toBe(`${target}\n`);
  });

  it("falls back to HOME when no argument is provided", () => {
    process.env.HOME = homeDir;
    const chunks: string[] = [];
    cdBuiltin({
      argv: [],
      raw: "cd",
      write: chunk => { chunks.push(chunk); },
      history: [],
    });
    expect(process.cwd()).toBe(homeDir);
    expect(chunks.join("")).toBe(`${homeDir}\n`);
  });

  it("errors when too many arguments are supplied", () => {
    const chunks: string[] = [];
    cdBuiltin({
      argv: ["one", "two"],
      raw: "cd one two",
      write: chunk => { chunks.push(chunk); },
      history: [],
    });
    expect(process.cwd()).toBe(startCwd);
    expect(chunks.join("")).toBe("cd: too many arguments\n");
  });
});

describe("pushd/popd builtins", () => {
  const pushdBuiltin = getBuiltin("pushd");
  const popdBuiltin = getBuiltin("popd");
  if (!pushdBuiltin) throw new Error("pushd builtin not registered");
  if (!popdBuiltin) throw new Error("popd builtin not registered");

  const startCwd = process.cwd();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lush-pushd-"));

  beforeEach(() => {
    clearDirectoryStack();
    currentDir = startCwd;
  });

  afterAll(() => {
    currentDir = startCwd;
    clearDirectoryStack();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("pushes current directory, changes to target, and records stack", () => {
    const target = fs.mkdtempSync(path.join(tmpRoot, "dir-"));
    const chunks: string[] = [];
    pushdBuiltin({
      argv: [target],
      raw: `pushd ${target}`,
      write: chunk => { chunks.push(chunk); },
      history: [],
    });
    expect(process.cwd()).toBe(target);
    expect(chunks.join("")).toBe(`${target}\n`);
    expect(getDirectoryStack()).toEqual([startCwd]);
  });

  it("returns to previous directory with popd", () => {
    const target = fs.mkdtempSync(path.join(tmpRoot, "dir-"));
    pushdBuiltin({
      argv: [target],
      raw: `pushd ${target}`,
      write: () => {},
      history: [],
    });
    const chunks: string[] = [];
    popdBuiltin({
      argv: [],
      raw: "popd",
      write: chunk => { chunks.push(chunk); },
      history: [],
    });
    expect(process.cwd()).toBe(startCwd);
    expect(chunks.join("")).toBe(`${startCwd}\n`);
    expect(getDirectoryStack()).toEqual([]);
  });

  it("warns when popd stack is empty", () => {
    const chunks: string[] = [];
    popdBuiltin({
      argv: [],
      raw: "popd",
      write: chunk => { chunks.push(chunk); },
      history: [],
    });
    expect(chunks.join("")).toBe("popd: directory stack empty\n");
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
