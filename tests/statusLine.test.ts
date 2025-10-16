import { describe, it, expect } from "vitest";
import chalk from "chalk";

const { formatStatusLine } = await import("../src/helpers.ts");

describe("formatStatusLine", () => {
  it("highlights the active token type among candidates", () => {
    const candidates = [
      { type: "Number", priority: 10 },
      { type: "Word", priority: 5 },
    ];
    const rendered = formatStatusLine({
      modeLabel: "sh",
      currentTokenType: "Number",
      currentTokenIndex: 0,
      currentTokenLength: 3,
      validTypes: candidates,
    });

    expect(rendered.startsWith(chalk.dim("mode: sh curtok 0 3"))).toBe(true);
    expect(rendered).toContain(chalk.inverse("Number"));
    expect(rendered).toContain(chalk.gray("Word"));
    expect(rendered).toContain(chalk.dim("types:"));
  });

  it("uses fallback highlighting when no candidates exist", () => {
    const rendered = formatStatusLine({
      modeLabel: "expr",
      currentTokenType: "Identifier",
      currentTokenIndex: null,
      currentTokenLength: null,
      validTypes: [],
    });

    expect(rendered.startsWith(chalk.dim("mode: expr curtok - -"))).toBe(true);
    expect(rendered).toContain(chalk.inverse("Identifier"));
  });

  it("shows no types when nothing is available", () => {
    const rendered = formatStatusLine({
      modeLabel: "sh",
      currentTokenType: null,
      currentTokenIndex: -1,
      currentTokenLength: -1,
      validTypes: [],
    });

    expect(rendered).toContain(chalk.dim("no types"));
  });
});
