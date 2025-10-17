import { describe, it, expect } from "vitest";
import chalk from "chalk";

const { formatStatusLine } = await import("../src/index.ts");

describe("formatStatusLine", () => {
  it("renders the treepath, mode, and token index with candidates", () => {
    const candidates = [
      { type: "Number", priority: 10 },
      { type: "Word", priority: 5 },
    ];
    const rendered = formatStatusLine({
      modeLabel: "sh",
      currentTokenType: "Number",
      currentTokenIndex: 0,
      validTypes: candidates,
    });

    expect(rendered.startsWith(`${chalk.bold("treepath:")} TBD`)).toBe(true);
    expect(rendered).toContain(`${chalk.bold("mode:")} sh`);
    expect(rendered).toContain(`${chalk.bold("tokidx:")}  0`);
    expect(rendered).toContain("Number");
    expect(rendered).toContain(chalk.gray("Word"));
    expect(rendered).toContain(chalk.bold("types:"));
  });

  it("uses fallback highlighting when no candidates exist", () => {
    const rendered = formatStatusLine({
      modeLabel: "expr",
      currentTokenType: "Identifier",
      currentTokenIndex: null,
      validTypes: [],
    });

    expect(rendered).toContain(`${chalk.bold("mode:")} expr`);
    expect(rendered).toContain(`${chalk.bold("tokidx:")}  -`);
    expect(rendered).toContain(chalk.inverse("Identifier"));
    expect(rendered).toContain(chalk.bold("types:"));
  });

  it("shows no types when nothing is available", () => {
    const rendered = formatStatusLine({
      modeLabel: "sh",
      currentTokenType: null,
      currentTokenIndex: -1,
      validTypes: [],
    });

    expect(rendered).toContain(chalk.dim("no types"));
    expect(rendered).toContain(`${chalk.bold("tokidx:")}  -`);
  });
});
