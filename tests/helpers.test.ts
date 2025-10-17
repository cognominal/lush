import { describe, it, expect } from "vitest";

const { isStrNumber, isStrVariable, stripSigils } = await import("../src/index.ts");

describe("isStrNumber", () => {
  it("accepts decimal numbers", () => {
    expect(isStrNumber("42")).toBe(true);
    expect(isStrNumber(" 3.14 ")).toBe(true);
  });

  it("rejects non-numeric strings", () => {
    expect(isStrNumber("not-a-number")).toBe(false);
    expect(isStrNumber("42px")).toBe(false);
  });

  it("rejects infinities", () => {
    expect(isStrNumber("Infinity")).toBe(false);
    expect(isStrNumber("-Infinity")).toBe(false);
  });
});

describe("isStrVariable", () => {
  it("accepts plain identifiers", () => {
    expect(isStrVariable("foo")).toBe(true);
    expect(isStrVariable("foo_bar")).toBe(true);
    expect(isStrVariable("foo123")).toBe(true);
  });

  it("accepts sigils and twigil", () => {
    expect(isStrVariable("$foo")).toBe(true);
    expect(isStrVariable("$*foo")).toBe(true);
    expect(isStrVariable("*foo")).toBe(true);
  });

  it("rejects invalid characters", () => {
    expect(isStrVariable("$foo-")).toBe(false);
    expect(isStrVariable("")).toBe(false);
    expect(isStrVariable("$")).toBe(false);
  });
});

describe("stripSigils", () => {
  it("removes sigil and twigil when present", () => {
    expect(stripSigils("$*foo")).toBe("foo");
  });

  it("removes only sigil when twigil missing", () => {
    expect(stripSigils("@bar")).toBe("bar");
  });

  it("removes only twigil when no sigil", () => {
    expect(stripSigils("*baz")).toBe("baz");
  });

  it("returns original string when not a variable", () => {
    expect(stripSigils("not-var!")).toBe("not-var!");
  });
});
