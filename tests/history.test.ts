import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { appendHistoryEntry, loadHistoryEntries, getHistoryFilePath } = await import("../src/history.ts");

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
    appendHistoryEntry({ command: "ls", output: "file\n" }, historyFile);

    const entries = loadHistoryEntries(historyFile);
    expect(entries).toEqual([
      { command: "echo hi", output: "hi\n" },
      { command: "ls", output: "file\n" },
    ]);
  });

  it("ignores malformed lines", () => {
    const lines = [
      "not a json line",
      JSON.stringify({ command: "ok", output: "yes\n" }),
      JSON.stringify({ command: 42, output: "nope" }),
    ];
    fs.writeFileSync(historyFile, `${lines.join("\n")}\n`, "utf8");

    const entries = loadHistoryEntries(historyFile);
    expect(entries).toEqual([{ command: "ok", output: "yes\n" }]);
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
      expect(resolved).toBe(path.join(stateDir, "lush", "history.jsonl"));
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
      expect(resolved).toBe(path.join(home, ".local", "state", "lush", "history.jsonl"));
    } finally {
      restoreEnv(prevHistory);
      restoreEnv(prevState);
    }
  });
});
