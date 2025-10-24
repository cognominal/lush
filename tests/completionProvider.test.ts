import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import {
  chmod,
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  collectFirstTokenCandidates,
  tokenizeLine,
  resetCompletionCaches,
  initFromYAMLFile,
  setTokenMode,
} from "../src/index.ts";

const TMP_PREFIX = "rdln-lush-test-";

describe("completionProvider", () => {
  const originalPath = process.env.PATH;
  const tempPaths: string[] = [];

  beforeAll(async () => {
    initFromYAMLFile();
    setTokenMode("Sh");
  });

  afterAll(async () => {
    process.env.PATH = originalPath;
    for (const dir of tempPaths) {
      await rm(dir, { recursive: true, force: true });
    }
    resetCompletionCaches();
  });

  beforeEach(() => {
    resetCompletionCaches();
    process.env.PATH = "";
  });

  it("returns builtins matching the supplied prefix", async () => {
    const lines = [tokenizeLine("mk")];
    const candidates = await collectFirstTokenCandidates({ lines });
    const builtin = candidates.find(
      entry => entry.metadata.kind === "Builtin" && entry.value === "mkcd",
    );
    expect(builtin?.tokenType).toBeDefined();
    expect(builtin?.metadata).toMatchObject({
      kind: "Builtin",
      label: "mkcd",
    });
  });

  it("discovers executable commands on PATH", async () => {
    const tmpDir = await mkTmpDir("path");
    tempPaths.push(tmpDir);
    const execPath = path.join(tmpDir, "mycmd");
    await writeFile(execPath, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(execPath, 0o755);

    process.env.PATH = tmpDir;
    const lines = [tokenizeLine("my")];
    const candidates = await collectFirstTokenCandidates({ lines });
    const command = candidates.find(
      entry => entry.metadata.kind === "Command" && entry.value === "mycmd",
    );
    expect(command?.metadata).toMatchObject({
      kind: "Command",
      label: "mycmd",
    });
  });

  it("collects TypeScript symbols from the nearest tsconfig", async () => {
    const projectDir = await mkTmpDir("ts");
    tempPaths.push(projectDir);
    await mkdir(path.join(projectDir, "src"));
    await writeFile(
      path.join(projectDir, "src", "sample.ts"),
      "export function SampleThing() { return 42; }\n",
      "utf8",
    );
    await writeFile(
      path.join(projectDir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            lib: ["ESNext"],
            target: "ESNext",
            module: "Preserve",
            moduleResolution: "Bundler",
            allowImportingTsExtensions: true,
            strict: true,
            noEmit: true,
          },
          include: ["src/**/*.ts"],
        },
        null,
        2,
      ),
      "utf8",
    );

    const lines = [tokenizeLine("Sam")];
    const candidates = await collectFirstTokenCandidates({
      lines,
      cwd: projectDir,
    });
    const tsSymbol = candidates.find(
      entry =>
        entry.metadata.kind === "TypeScriptSymbol" &&
        entry.value === "SampleThing",
    );
    expect(tsSymbol?.metadata).toMatchObject({
      kind: "TypeScriptSymbol",
      label: "SampleThing",
    });
    expect(tsSymbol?.metadata.symbolType).toContain("number");
  });
});

async function mkTmpDir(tag: string): Promise<string> {
  const prefix = path.join(os.tmpdir(), `${TMP_PREFIX}${tag}-`);
  return mkdtemp(prefix);
}
