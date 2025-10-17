import { describe, it, expect } from "vitest";

const { getBuiltin } = await import("../src/index.ts");

describe("job control builtins", () => {
  const jobsBuiltin = getBuiltin("jobs");
  const fgBuiltin = getBuiltin("fg");
  if (!jobsBuiltin || !fgBuiltin) throw new Error("job control builtins not registered");

  type Handler = NonNullable<ReturnType<typeof getBuiltin>>;
  const invoke = async (handler: Handler, argv: string[] = [], raw = "") => {
    const chunks: string[] = [];
    const result = handler({
      argv,
      raw,
      write: chunk => {
        chunks.push(chunk);
      },
      history: [],
    });
    if (result && typeof (result as PromiseLike<void>).then === "function") {
      await result;
    }
    return chunks.join("");
  };

  it("reports absence of jobs", async () => {
    const output = await invoke(jobsBuiltin);
    expect(output).toBe("jobs: no active jobs\n");
  });

  it("notifies when fg has no job", async () => {
    const output = await invoke(fgBuiltin);
    expect(output).toBe("fg: no such job %+\n");
  });
});
