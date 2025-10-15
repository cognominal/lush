import { describe, it, expect, beforeAll } from "vitest";
import { typeInit } from "../src/tokens.ts";
import { rotateTokenType } from "../src/tokenType.ts";
import { insertTextIntoTokenLine, normalizeTokenLineInPlace } from "../src/tokenEdit.ts";
import type { InputToken, TokenLine } from "../src/tokenLine.ts";

beforeAll(async () => {
  await typeInit();
});

describe("rotateTokenType", () => {
  it("rotates NakedString 42 to Number", () => {
    const token: InputToken = {
      type: "NakedString",
      tokenIdx: 0,
      text: "42",
      x: 0,
    };

    const changed = rotateTokenType(token);
    expect(changed).toBe(true);
    expect(token.type).toBe("Number");
  });

  it("rotates the token before a space inserted via editor helpers", () => {
    const line: TokenLine = [];
    insertTextIntoTokenLine(line, 0, "4");
    insertTextIntoTokenLine(line, 1, "2");
    insertTextIntoTokenLine(line, 2, " ");
    normalizeTokenLineInPlace(line);

    const spaceIndex = line.findIndex(token => token?.type === "Space");
    expect(spaceIndex).toBeGreaterThan(0);
    const previous = line[spaceIndex - 1];
    expect(previous).toBeDefined();
    const rotated = rotateTokenType(previous);
    expect(rotated).toBe(true);
    expect(previous?.type).toBe("Number");
  });

  it("returns false when no validators match", () => {
    const token: InputToken = {
      type: "NakedString",
      tokenIdx: 0,
      text: "??",
      x: 0,
    };

    const changed = rotateTokenType(token);
    expect(changed).toBe(false);
    expect(token.type).toBe("NakedString");
  });
});
