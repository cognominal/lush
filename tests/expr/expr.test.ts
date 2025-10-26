import { describe, expect, it, vi } from "vitest";
import {
  OprType,
  oprMap,
  oprMapCircum,
  main as exprMain,
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
    } finally {
      logSpy.mockRestore();
    }
  });
});
