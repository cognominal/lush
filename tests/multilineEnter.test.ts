import { describe, it, expect } from "vitest";

const {
  tokenizeLine,
  shouldSubmitOnEmptyLastLine,
} = await import("../src/index.ts");

describe("shouldSubmitOnEmptyLastLine", () => {
  it("returns false when the buffer has no lines", () => {
    expect(shouldSubmitOnEmptyLastLine([], 0)).toBe(false);
  });

  it("returns false when the active line is not the last line", () => {
    const lines = [tokenizeLine("echo hi"), tokenizeLine("")];
    expect(shouldSubmitOnEmptyLastLine(lines, 0)).toBe(false);
  });

  it("returns false when the active line still has content", () => {
    const lines = [tokenizeLine("echo hi")];
    expect(shouldSubmitOnEmptyLastLine(lines, 0)).toBe(false);
  });

  it("returns false when all lines are empty or whitespace only", () => {
    const lines = [tokenizeLine("  "), tokenizeLine("")];
    expect(shouldSubmitOnEmptyLastLine(lines, 1)).toBe(false);
  });

  it("returns true when a previous line contains content", () => {
    const lines = [tokenizeLine("echo hi"), tokenizeLine("")];
    expect(shouldSubmitOnEmptyLastLine(lines, 1)).toBe(true);
  });
});
