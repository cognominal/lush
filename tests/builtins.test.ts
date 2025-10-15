import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
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

describe("builtins builtin", () => {
  const builtinCommand = getBuiltin("builtins");
  if (!builtinCommand) throw new Error("builtins builtin not registered");

  const invoke = (argv: string[], raw: string) => {
    const chunks: string[] = [];
    builtinCommand({
      argv,
      raw,
      write: chunk => { chunks.push(chunk); },
      history: [],
    });
    return chunks.join("");
  };

  it("lists builtins alphabetically by default", () => {
    const output = invoke([], "builtins");
    expect(output).toBe("bg\nbuiltins\ncd\nclear\ndirs\ndisown\nexit\nfg\nhistory\nhtml\njobs\nkill\nmkcd\nmkdir\npopd\npushd\npwd\nsuspend\nsuspend-job\nts\nwait\n");
  });

  it("prints summary help for -h", () => {
    const output = invoke(["-h"], "builtins -h");
    expect(output).toBe("List builtin commands; use -hh to include descriptions.\n");
  });

  it("prints detailed help for repeated -h flags", () => {
    const output = invoke(["-h", "-h"], "builtins -h -h");
    expect(output).toBe([
      "usage: builtins [-h|-hh]",
      "Lists builtin commands alphabetically. With -hh also prints each description.",
      "",
    ].join("\n"));
  });

  it("shows descriptions for -hh", () => {
    const output = invoke(["-hh"], "builtins -hh");
    expect(output).toBe([
      "bg         Continue a stopped job in the background",
      "builtins   List builtin commands",
      "cd         Change directory",
      "clear      Clear the screen",
      "dirs       Show the directory stack",
      "disown     Remove jobs from tracking",
      "exit       Exit the shell",
      "fg         Resume a job in the foreground",
      "history    Show recent command history",
      "html       Render history as HTML",
      "jobs       List tracked jobs",
      "kill       Send a signal to a job or pid",
      "mkcd       Create a directory then cd into it",
      "mkdir      Create directories recursively",
      "popd       Pop the directory stack",
      "pushd      Push the current directory then cd",
      "pwd        Print the current working directory",
      "suspend    Suspend the shell",
      "suspend-job Suspend the foreground job",
      "ts         Parse JS/TS/Svelte file",
      "wait       Wait on the last job or provided IDs",
      "",
    ].join("\n"));
  });
});

describe("history builtin", () => {
  const historyBuiltin = getBuiltin("history");
  if (!historyBuiltin) throw new Error("history builtin not registered");

  const invoke = (history: HistoryEntry[], argv: string[] = []) => {
    const chunks: string[] = [];
    const raw = ["history", ...argv].join(" ").trim();
    historyBuiltin({
      argv,
      raw,
      write: chunk => { chunks.push(chunk); },
      history,
    });
    return chunks.join("");
  };

  it("reports when no history is available", () => {
    const output = invoke([]);
    expect(output).toBe("history: no recorded commands\n");
  });

  it("prints numbered history entries", () => {
    const history: HistoryEntry[] = [
      { command: "echo hi", output: "hi\n" },
      { command: "ls -la", output: "files\n" },
    ];
    const output = invoke(history);
    expect(output).toBe("    1  echo hi\n    2  ls -la\n");
  });

  it("respects the count argument", () => {
    const history: HistoryEntry[] = [
      { command: "one", output: "1\n" },
      { command: "two", output: "2\n" },
      { command: "three", output: "3\n" },
    ];
    const output = invoke(history, ["2"]);
    expect(output).toBe("    2  two\n    3  three\n");
  });

  it("validates numeric arguments", () => {
    const output = invoke([{ command: "one", output: "1\n" }], ["nope"]);
    expect(output).toBe("history: invalid count 'nope'\n");
  });

  it("prints help for -h", () => {
    const output = invoke([], ["-h"]);
    expect(output).toBe("Show recent commands; optionally pass a count.\n");
  });
});

describe("clear builtin", () => {
  const clearBuiltin = getBuiltin("clear");
  if (!clearBuiltin) throw new Error("clear builtin not registered");

  const invoke = (argv: string[] = []) => {
    const chunks: string[] = [];
    const raw = ["clear", ...argv].join(" ").trim();
    clearBuiltin({
      argv,
      raw,
      write: chunk => { chunks.push(chunk); },
      history: [],
    });
    return chunks.join("");
  };

  it("emits ANSI clear sequence with no arguments", () => {
    const output = invoke();
    expect(output).toBe("\u001b[2J\u001b[H");
  });

  it("rejects unexpected arguments", () => {
    const output = invoke(["extra"]);
    expect(output).toBe("clear: unexpected arguments\n");
  });

  it("prints help for -h", () => {
    const output = invoke(["-h"]);
    expect(output).toBe("Clear the interactive screen.\n");
  });

  it("prints detailed help for -hh", () => {
    const output = invoke(["-hh"]);
    expect(output).toBe("usage: clear\nErases the visible terminal content and moves the cursor to the top-left.\n");
  });
});

describe("mkdir and mkcd builtins", () => {
  const mkdirBuiltin = getBuiltin("mkdir");
  const mkcdBuiltin = getBuiltin("mkcd");
  if (!mkdirBuiltin || !mkcdBuiltin) throw new Error("mkdir/mkcd builtins not registered");

  let tmpRoot: string;
  let previousHome: string | undefined;

  const invokeMkdir = (argv: string[] = []) => {
    const chunks: string[] = [];
    const raw = ["mkdir", ...argv].join(" ").trim();
    mkdirBuiltin({
      argv,
      raw,
      write: chunk => { chunks.push(chunk); },
      history: [],
    });
    return chunks.join("");
  };

  const invokeMkcd = (argv: string[] = []) => {
    const chunks: string[] = [];
    const raw = ["mkcd", ...argv].join(" ").trim();
    mkcdBuiltin({
      argv,
      raw,
      write: chunk => { chunks.push(chunk); },
      history: [],
    });
    return chunks.join("");
  };

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lush-mkdir-"));
    currentDir = tmpRoot;
    previousHome = process.env.HOME;
  });

  afterEach(() => {
    currentDir = realCwd;
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("prints help for mkdir -h and -hh", () => {
    expect(invokeMkdir(["-h"])).toBe("Create directories, creating parents as needed.\n");
    expect(invokeMkdir(["-hh"])).toBe("usage: mkdir DIR...\nCreate the directories (and parents) if they do not already exist.\n");
  });

  it("requires at least one operand", () => {
    expect(invokeMkdir([])).toBe("mkdir: missing directory operand\n");
  });

  it("creates nested directories recursively", () => {
    const output = invokeMkdir(["foo/bar/baz"]);
    expect(output).toBe("");
    expect(fs.existsSync(path.join(tmpRoot, "foo", "bar", "baz"))).toBe(true);
  });

  it("creates multiple directories when provided", () => {
    invokeMkdir(["one", "two/three"]);
    expect(fs.existsSync(path.join(tmpRoot, "one"))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, "two", "three"))).toBe(true);
  });

  it("prints help for mkcd -h and -hh", () => {
    expect(invokeMkcd(["-h"])).toBe("Create a directory then change into it.\n");
    expect(invokeMkcd(["-hh"])).toBe("usage: mkcd DIR\nCreate the directory (including parents) and change into it.\n");
  });

  it("validates argument count for mkcd", () => {
    expect(invokeMkcd([])).toBe("mkcd: missing directory operand\n");
    expect(invokeMkcd(["one", "two"])).toBe("mkcd: too many arguments\n");
  });

  it("creates the directory and changes into it", () => {
    const target = path.join("project", "src");
    const output = invokeMkcd([target]);
    const expectedPath = path.join(tmpRoot, target);
    expect(fs.existsSync(expectedPath)).toBe(true);
    expect(process.cwd()).toBe(expectedPath);
    expect(output).toBe(`${expectedPath}\n`);
  });

  it("expands tilde when HOME is set", () => {
    const homeDir = path.join(tmpRoot, "home");
    process.env.HOME = homeDir;
    const output = invokeMkcd(["~/demo"]);
    const expectedPath = path.join(homeDir, "demo");
    expect(fs.existsSync(expectedPath)).toBe(true);
    expect(process.cwd()).toBe(expectedPath);
    expect(output).toBe(`${expectedPath}\n`);
  });
});

describe("exit builtin", () => {
  const exitBuiltin = getBuiltin("exit");
  if (!exitBuiltin) throw new Error("exit builtin not registered");

  const exitCalls: Array<number | undefined> = [];
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    exitCalls.push(code);
    return undefined as never;
  }) as unknown as never);

  afterEach(() => {
    exitSpy.mockClear();
    exitCalls.length = 0;
  });

  afterAll(() => {
    exitSpy.mockRestore();
  });

  it("prints summary help for -h", () => {
    const chunks: string[] = [];
    exitBuiltin({
      argv: ["-h"],
      raw: "exit -h",
      write: chunk => { chunks.push(chunk); },
      history: [],
    });
    expect(chunks.join("")).toBe("Exit the shell immediately.\n");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("prints detailed help for repeated -h", () => {
    const chunks: string[] = [];
    exitBuiltin({
      argv: ["-h", "-h"],
      raw: "exit -h -h",
      write: chunk => { chunks.push(chunk); },
      history: [],
    });
    expect(chunks.join("")).toBe([
      "usage: exit",
      "Terminates the shell with exit code 0.",
      "",
    ].join("\n"));
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("describes exit for -hh", () => {
    const chunks: string[] = [];
    exitBuiltin({
      argv: ["-hh"],
      raw: "exit -hh",
      write: chunk => { chunks.push(chunk); },
      history: [],
    });
    expect(chunks.join("")).toBe("Exit the shell\n");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("exits the process when invoked without flags", () => {
    const chunks: string[] = [];
    exitBuiltin({
      argv: [],
      raw: "exit",
      write: chunk => { chunks.push(chunk); },
      history: [],
    });
    expect(chunks).toEqual([]);
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

describe("ts builtin", () => {
  const tsBuiltin = getBuiltin("ts");
  if (!tsBuiltin) throw new Error("ts builtin not registered");

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lush-ts-"));

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  const invoke = async (argv: string[], raw: string) => {
    const chunks: string[] = [];
    await tsBuiltin({
      argv,
      raw,
      write: chunk => { chunks.push(chunk); },
      history: [],
    });
    return chunks.join("");
  };

  it("prints summary help for -h", async () => {
    const output = await invoke(["-h"], "ts -h");
    expect(output).toBe("Parse a JS, TS, or Svelte file and print the AST.\n");
  });

  it("describes builtin for -hh", async () => {
    const output = await invoke(["-hh"], "ts -hh");
    expect(output).toBe("Parse JS/TS/Svelte file\n");
  });

  it("parses a JavaScript file", async () => {
    const filePath = path.join(tmpRoot, "sample.js");
    fs.writeFileSync(filePath, "const answer = 42;\n");
    const output = await invoke([filePath], `ts ${filePath}`);
    const parsed = JSON.parse(output);
    expect(parsed.type).toBe("Program");
    expect(parsed.body[0].type).toBe("VariableDeclaration");
  });

  it("parses a TypeScript file", async () => {
    const filePath = path.join(tmpRoot, "sample.ts");
    fs.writeFileSync(filePath, "const answer: number = 42;\n");
    const output = await invoke([filePath], `ts ${filePath}`);
    const parsed = JSON.parse(output);
    expect(parsed.type).toBe("Program");
    expect(parsed.body[0].type).toBe("VariableDeclaration");
  });

  it("errors on unsupported extension", async () => {
    const badPath = path.join(tmpRoot, "sample.txt");
    fs.writeFileSync(badPath, "text");
    const output = await invoke([badPath], `ts ${badPath}`);
    expect(output).toContain("ts: unsupported file type");
  });

  it("parses a Svelte file", async () => {
    const filePath = path.join(tmpRoot, "sample.svelte");
    fs.writeFileSync(
      filePath,
      `<script>export let name = "world";</script>\n<h1>Hello {name}</h1>\n`
    );
    const output = await invoke([filePath], `ts ${filePath}`);
    const parsed = JSON.parse(output);
    expect(parsed.html.type).toBe("Fragment");
    const element = parsed.html.children.find((child: { type?: string }) => child?.type === "Element");
    expect(element?.name).toBe("h1");
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

  it("prints summary help for -h", () => {
    const chunks: string[] = [];
    cdBuiltin({
      argv: ["-h"],
      raw: "cd -h",
      write: chunk => { chunks.push(chunk); },
      history: [],
    });
    expect(chunks.join("")).toBe("Change the current working directory (defaults to HOME).\n");
    expect(process.cwd()).toBe(startCwd);
  });

  it("prints detailed help for repeated -h", () => {
    const chunks: string[] = [];
    cdBuiltin({
      argv: ["-h", "-h"],
      raw: "cd -h -h",
      write: chunk => { chunks.push(chunk); },
      history: [],
    });
    expect(chunks.join("")).toBe([
      "usage: cd [dir]",
      "Changes to DIR. Without DIR uses HOME; supports ~ and relative paths.",
      "",
    ].join("\n"));
    expect(process.cwd()).toBe(startCwd);
  });

  it("treats -hh as double help", () => {
    const chunks: string[] = [];
    cdBuiltin({
      argv: ["-hh"],
      raw: "cd -hh",
      write: chunk => { chunks.push(chunk); },
      history: [],
    });
    expect(chunks.join("")).toBe([
      "usage: cd [dir]",
      "Changes to DIR. Without DIR uses HOME; supports ~ and relative paths.",
      "",
    ].join("\n"));
    expect(process.cwd()).toBe(startCwd);
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
  const dirsBuiltin = getBuiltin("dirs");
  if (!pushdBuiltin) throw new Error("pushd builtin not registered");
  if (!popdBuiltin) throw new Error("popd builtin not registered");
  if (!dirsBuiltin) throw new Error("dirs builtin not registered");

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

  it("prints help for pushd -h and popd -h", () => {
    const pushChunks: string[] = [];
    pushdBuiltin({
      argv: ["-h"],
      raw: "pushd -h",
      write: chunk => { pushChunks.push(chunk); },
      history: [],
    });
    expect(pushChunks.join("")).toBe("Push the current directory, then change to DIR.\n");
    expect(process.cwd()).toBe(startCwd);

    const popChunks: string[] = [];
    popdBuiltin({
      argv: ["-h"],
      raw: "popd -h",
      write: chunk => { popChunks.push(chunk); },
      history: [],
    });
    expect(popChunks.join("")).toBe("Pop the directory stack and change back.\n");
    expect(process.cwd()).toBe(startCwd);
  });

  it("prints detailed help for repeated help flags", () => {
    const pushChunks: string[] = [];
    pushdBuiltin({
      argv: ["-h", "-h"],
      raw: "pushd -h -h",
      write: chunk => { pushChunks.push(chunk); },
      history: [],
    });
    expect(pushChunks.join("")).toBe("usage: pushd DIR\nPushes the current directory, changes to DIR, then prints the updated stack.\n");

    const popChunks: string[] = [];
    popdBuiltin({
      argv: ["-hh"],
      raw: "popd -hh",
      write: chunk => { popChunks.push(chunk); },
      history: [],
    });
    expect(popChunks.join("")).toBe("usage: popd\nRemoves newest pushd entry, changes into it, then prints remaining stack.\n");
  });

  it("prints help for dirs", () => {
    const single: string[] = [];
    dirsBuiltin({
      argv: ["-h"],
      raw: "dirs -h",
      write: chunk => { single.push(chunk); },
      history: [],
    });
    expect(single.join("")).toBe("Show the directory stack.\n");

    const detailed: string[] = [];
    dirsBuiltin({
      argv: ["-hh"],
      raw: "dirs -hh",
      write: chunk => { detailed.push(chunk); },
      history: [],
    });
    expect(detailed.join("")).toBe("usage: dirs\nPrints the current directory followed by saved stack entries (if any).\n");
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
    expect(chunks.join("")).toBe(`${target} ${startCwd}\n`);
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

  it("lists stack with dirs builtin", () => {
    const chunks: string[] = [];
    dirsBuiltin({
      argv: [],
      raw: "dirs",
      write: chunk => { chunks.push(chunk); },
      history: [],
    });
    expect(chunks.join("")).toBe(`${startCwd}\n`);

    const target = fs.mkdtempSync(path.join(tmpRoot, "dir-"));
    pushdBuiltin({
      argv: [target],
      raw: `pushd ${target}`,
      write: () => {},
      history: [],
    });

    const afterPush: string[] = [];
    dirsBuiltin({
      argv: [],
      raw: "dirs",
      write: chunk => { afterPush.push(chunk); },
      history: [],
    });
    expect(afterPush.join("")).toBe(`${target} ${startCwd}\n`);
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

  it("prints summary help for -h", async () => {
    const output = await invokeHtml([], ["-h"]);
    expect(output).toBe("Render recent history as escaped HTML; pass a count for more entries.\n");
  });

  it("prints detailed help for -hh", async () => {
    const output = await invokeHtml([], ["-hh"]);
    expect(output).toBe([
      "usage: html [count]",
      "Emits the latest history entry (or count entries) as escaped HTML blocks.",
      "",
    ].join("\n"));
  });

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
