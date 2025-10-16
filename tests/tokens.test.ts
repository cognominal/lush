import { describe, it, expect, beforeAll } from "vitest";
import { typeInit, tokenMap } from "../src/tokens.ts";

let numberValidator: ((value: string) => boolean) | undefined;
let nakedStringValidator: ((value: string) => boolean) | undefined;
let keywordValidator: ((value: string) => boolean) | undefined;

beforeAll(() => {
  typeInit();
  numberValidator = tokenMap.get("Number")?.validator;
  if (!numberValidator) {
    throw new Error("Number token validator is not registered");
  }
  nakedStringValidator = tokenMap.get("NakedString")?.validator;
  if (!nakedStringValidator) {
    throw new Error("NakedString token validator is not registered");
  }
  keywordValidator = tokenMap.get("Sh.Keyword")?.validator;
});

function ensureValidator(): (value: string) => boolean {
  if (!numberValidator) {
    throw new Error("Number token validator is not registered");
  }
  return numberValidator;
}

function ensureNakedString(): (value: string) => boolean {
  if (!nakedStringValidator) {
    throw new Error("NakedString token validator is not registered");
  }
  return nakedStringValidator;
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

describe("NakedString token validator", () => {
  it("accepts arbitrary text", () => {
    const validate = ensureNakedString();
    expect(validate("")).toBe(true);
    expect(validate("42")).toBe(true);
    expect(validate("with spaces")).toBe(true);
    expect(validate("symbols!@#")).toBe(true);
  });
});

describe("Instance-derived validators", () => {
  it("accepts only exact matches from instance list", () => {
    expect(keywordValidator).toBeTypeOf("function");
    if (!keywordValidator) return;
    expect(keywordValidator("if")).toBe(true);
    expect(keywordValidator("else")).toBe(true);
    expect(keywordValidator("while")).toBe(true);
    expect(keywordValidator("for")).toBe(true);
    expect(keywordValidator("elif")).toBe(false);
    expect(keywordValidator("If")).toBe(false);
    expect(keywordValidator("for ")).toBe(false);
  });
});
