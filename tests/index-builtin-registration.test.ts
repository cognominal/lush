import { describe, it, expect } from "vitest";

describe("src/index builtin registration", () => {
  it("registers builtins when importing index", async () => {
    const { getBuiltin } = await import("../src/index.ts");
    expect(getBuiltin("cd")).toBeDefined();
  });
});
