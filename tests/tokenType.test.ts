import { describe, it, expect, beforeAll } from "vitest";
import {
  typeInit,
  rotateTokenType,
  promoteSpaceFromNakedString,
  insertTextIntoTokenLine,
  normalizeTokenLineInPlace,
  tokenText,
  type InputToken,
  type TokenLine,
} from "../src/index.ts";

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

  it("promotes trailing space to a space token after double space", () => {
    const line: TokenLine = [];
    insertTextIntoTokenLine(line, 0, "4");
    insertTextIntoTokenLine(line, 1, "2");
    insertTextIntoTokenLine(line, 2, " ");
    normalizeTokenLineInPlace(line);

    const spaceIndex = line.findIndex(token => token?.type === "Space");
    expect(spaceIndex).toBe(-1);

    const token = line[0];
    if (!token) throw new Error("expected naked string token");
    const spaceToken = promoteSpaceFromNakedString(line, token, tokenText(token).length, 1);
    expect(spaceToken?.type).toBe("Space");
    normalizeTokenLineInPlace(line);
    const postSpaceIndex = line.findIndex(entry => entry?.type === "Space");
    expect(postSpaceIndex).toBe(1);
    const promotedSpace = line[postSpaceIndex];
    expect(promotedSpace?.text).toBe("  ");
    const previous = line[postSpaceIndex - 1];
    expect(previous?.type).toBe("NakedString");
  });

  it("promotes trailing space without duplication when no extra spaces requested", () => {
    const line: TokenLine = [];
    insertTextIntoTokenLine(line, 0, "f");
    insertTextIntoTokenLine(line, 1, "o");
    insertTextIntoTokenLine(line, 2, "o");
    insertTextIntoTokenLine(line, 3, " ");
    normalizeTokenLineInPlace(line);

    const token = line[0];
    if (!token) throw new Error("expected naked string token");
    const spaceToken = promoteSpaceFromNakedString(line, token, tokenText(token).length, 0);
    expect(spaceToken?.type).toBe("Space");
    normalizeTokenLineInPlace(line);
    const promotedSpace = line.find(entry => entry?.type === "Space");
    expect(promotedSpace?.text).toBe(" ");
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
