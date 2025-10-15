import { describe, it, expect, beforeAll } from "vitest";
import { typeInit, tokenMap } from "../src/tokens.ts";

let numberValidator: ((value: string) => boolean) | undefined;

beforeAll(() => {
  typeInit();
  numberValidator = tokenMap.get("Number")?.validator;
  if (!numberValidator) {
    throw new Error("Number token validator is not registered");
  }
});

function ensureValidator(): (value: string) => boolean {
  if (!numberValidator) {
    throw new Error("Number token validator is not registered");
  }
  return numberValidator;
}

describe("Number token validator", () => {
  it("accepts valid JavaScript numeric literals", () => {
    const validate = ensureValidator();
    const samples = [
      "0",
      "123",
      "1_234",
      "1.",
      ".5",
      "0.5",
      "1.23e+10",
      "1e-3",
      "0xFF",
      "0xA_B",
      "0b10_01",
      "0o7_1",
      "123n",
      "0n",
      "0x1Fn",
      "0b101n",
      "0o77n",
    ];
    for (const sample of samples) {
      expect(validate(sample)).toBe(true);
    }
  });

  it("rejects invalid JavaScript numeric literals", () => {
    const validate = ensureValidator();
    const samples = [
      "",
      " ",
      "_1",
      "1__0",
      "01",
      "-1",
      "+1",
      "1e",
      "1e+",
      "1e-",
      "1._0",
      ".",
      "0x",
      "0xG",
      "0b2",
      "0o8",
      "1.2n",
      "1e2n",
      "123n0",
      "0xFn0",
    ];
    for (const sample of samples) {
      expect(validate(sample)).toBe(false);
    }
  });
});
