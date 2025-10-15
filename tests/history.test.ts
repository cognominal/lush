import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as YAML from "js-yaml";

const {
  appendHistoryEntry,
  loadHistoryEntries,
  getHistoryFilePath,
  deserializeHistory,
  serializeHistory,
  tokenMultiLineToCommand,
} = await import("../src/history.ts");
const { tokenizeLine } = await import("../src/tokenLine.ts");
const { getBuiltin } = await import("../src/index.ts");

describe("history persistence", () => {
  const tmpPrefix = path.join(os.tmpdir(), "lush-history-");
  let tmpDir: string;
  let historyFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(tmpPrefix);
    historyFile = path.join(tmpDir, "history.log");
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns an empty array when the history file is absent", () => {
    expect(loadHistoryEntries(historyFile)).toEqual([]);
  });

  it("appends entries and reads them back in order", () => {
    appendHistoryEntry({ command: "echo hi", output: "hi\n" }, historyFile);
    appendHistoryEntry({ command: "pwd", output: `${process.cwd()}\n` }, historyFile);

    const entries = loadHistoryEntries(historyFile);
    expect(entries).toHaveLength(2);
    expect(entries).toMatchObject([
      { command: "echo hi", output: "hi\n" },
      { command: "pwd", output: `${process.cwd()}\n` },
    ]);

    const raw = fs.readFileSync(historyFile, "utf8");
    const parsed = YAML.load(raw);
    expect(Array.isArray(parsed)).toBe(true);
    const docs = parsed as Array<Record<string, unknown>>;
    expect(docs).toHaveLength(2);
    const first = docs[0];
    const second = docs[1];
    if (!first || !second) {
      throw new Error("expected two history documents");
    }
    expect(typeof first.input).toBe("string");
    expect(first.output).toBe("hi\n");
    expect(first.cwd).toBe(process.cwd());
    expect(typeof second.input).toBe("string");
    const firstTokens = deserializeHistory(String(first.input));
    const secondTokens = deserializeHistory(String(second.input));
    expect(tokenMultiLineToCommand(firstTokens)).toBe("echo hi");
    expect(tokenMultiLineToCommand(secondTokens)).toBe("pwd");
  });

  it("skips malformed YAML entries", () => {
    const tokens = [tokenizeLine("ok")];
    const validEntry = {
      input: serializeHistory(tokens),
      output: "yes\n",
      cwd: process.cwd(),
    };
    const malformedDoc = [
      { output: "missing input", cwd: "/tmp" },
      validEntry,
    ];
    const yaml = YAML.dump(malformedDoc, { indent: 2, noRefs: true, lineWidth: 80 });
    fs.writeFileSync(historyFile, yaml, "utf8");

    const entries = loadHistoryEntries(historyFile);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ command: "ok", output: "yes\n" });
  });

  it("invokes the pwd builtin to capture the current directory", async () => {
    const handler = getBuiltin("pwd");
    if (!handler) throw new Error("pwd builtin not registered");

    const writes: string[] = [];
    await handler({
      argv: [],
      raw: "pwd",
      history: [],
      write: chunk => writes.push(chunk),
    });

    expect(writes.join("")).toBe(`${process.cwd()}\n`);
  });
});

describe("custom history path resolution", () => {
  const captureEnv = (key: string) => ({
    key,
    value: process.env[key],
  });

  const restoreEnv = ({ key, value }: { key: string; value: string | undefined }) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  it("expands leading tilde from the LUSH_HISTORY variable", () => {
    const prevHistory = captureEnv("LUSH_HISTORY");
    const prevState = captureEnv("XDG_STATE_HOME");
    const home = os.homedir();
    if (!home) throw new Error("Expected os.homedir() to be defined for the test");

    try {
      delete process.env.XDG_STATE_HOME;
      process.env.LUSH_HISTORY = "~/.lush-history-test";
      const resolved = getHistoryFilePath();
      expect(resolved).toBe(path.join(home, ".lush-history-test"));
    } finally {
      restoreEnv(prevHistory);
      restoreEnv(prevState);
    }
  });

  it("derives the path from XDG_STATE_HOME when set", () => {
    const prevHistory = captureEnv("LUSH_HISTORY");
    const prevState = captureEnv("XDG_STATE_HOME");
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lush-state-"));
    const stateDir = path.join(tmpRoot, "state-dir");

    try {
      delete process.env.LUSH_HISTORY;
      process.env.XDG_STATE_HOME = stateDir;
      const resolved = getHistoryFilePath();
      expect(resolved).toBe(path.join(stateDir, "lush", "history.yaml"));
    } finally {
      restoreEnv(prevHistory);
      restoreEnv(prevState);
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("falls back to the default state directory when no env vars are set", () => {
    const prevHistory = captureEnv("LUSH_HISTORY");
    const prevState = captureEnv("XDG_STATE_HOME");
    const home = os.homedir();
    if (!home) throw new Error("Expected os.homedir() to be defined for the test");

    try {
      delete process.env.LUSH_HISTORY;
      delete process.env.XDG_STATE_HOME;
      const resolved = getHistoryFilePath();
      expect(resolved).toBe(path.join(home, ".local", "state", "lush", "history.yaml"));
    } finally {
      restoreEnv(prevHistory);
      restoreEnv(prevState);
    }
  });
});
