import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  OprType,
  oprMap,
  oprMapCircum,
  main as exprMain,
  serializeExpressionFromFile,
  parseExpressionString,
  serializeExpression,
} from "../../src/index.ts";

const PRIMARY_KEY = "Circumfix:[";
const DETAIL_KEY_OPEN_CLOSE = "Circumfix:[:]";
const DETAIL_KEY_OPEN_OPEN = "Circumfix:[:[";

describe("expr main", () => {
  it("registers multi-token operators from split keys", () => {
    oprMap.clear();
    oprMapCircum.clear();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      exprMain();
      const entry = oprMap.get(PRIMARY_KEY);
      expect(entry).toBeDefined();
      const entries = Array.isArray(entry) ? entry : [entry];
      expect(entries).toHaveLength(2);
      const suffixes = entries.map((item) => item.s1);
      expect(suffixes).toEqual(expect.arrayContaining(["]", "["]));
      const openClose = oprMapCircum.get(DETAIL_KEY_OPEN_CLOSE);
      expect(openClose?.s).toBe("[");
      expect(openClose?.s1).toBe("]");
      const openOpen = oprMapCircum.get(DETAIL_KEY_OPEN_OPEN);
      expect(openOpen?.s).toBe("[");
      expect(openOpen?.s1).toBe("[");
      expect(logSpy).toHaveBeenCalledWith(5);
      expect(logSpy).toHaveBeenCalledWith("a + b  *  c");
      expect(logSpy.mock.calls[0][0]).toBe(5);
      expect(logSpy.mock.calls[1][0]).toBe("a + b  *  c");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("serializes literal trees from bin1.yaml", () => {
    const filePath = path.resolve(process.cwd(), "data/bin1.yaml");
    const result = serializeExpressionFromFile(filePath);
    expect(result).toBe("42 + a  *  666");
  });

  it("parses expression strings back into ASTs", () => {
    const parsed = parseExpressionString("a + b  *  c");
    expect(parsed).toEqual({
      type: "BinaryExpression",
      operator: "*",
      left: {
        type: "BinaryExpression",
        operator: "+",
        left: { type: "Identifier", name: "a" },
        right: { type: "Identifier", name: "b" },
      },
      right: { type: "Identifier", name: "c" },
    });
    expect(serializeExpression(parsed)).toBe("a + b  *  c");
    const parsedLiteral = parseExpressionString("42 + a  *  666");
    expect(parsedLiteral).toEqual({
      type: "BinaryExpression",
      operator: "*",
      left: {
        type: "BinaryExpression",
        operator: "+",
        left: {
          type: "Literal",
          value: 42,
          raw: "42",
        },
        right: { type: "Identifier", name: "a" },
      },
      right: {
        type: "Literal",
        value: 666,
        raw: "666",
      },
    });
    expect(serializeExpression(parsedLiteral)).toBe("42 + a  *  666");
  });
});
