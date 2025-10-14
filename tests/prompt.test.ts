import { describe, it, expect } from "vitest";
import { prompt } from "../src/prompt.ts";

describe("prompt", () => {
  it("pads the history number to four characters", () => {
    const expected = `0012 ${process.cwd()}> `;
    expect(prompt(12)).toBe(expected);
  });

  it("defaults to zero history number", () => {
    const expected = `0000 ${process.cwd()}> `;
    expect(prompt()).toBe(expected);
  });
});
