import fs from "node:fs/promises";
import path from "node:path";
import { Parser } from "acorn";
import type { Options as AcornOptions } from "acorn";
import tsPlugin from "acorn-typescript";
import { parse as parseSvelte } from "svelte/compiler";
import {
  registerBuiltin,
  registerBuiltinHelp,
  type BuiltinContext,
  detectHelpLevel,
} from "../index.ts";

const TypeScriptParser = Parser.extend(tsPlugin());

registerBuiltin("ts", async (ctx: BuiltinContext) => {
  const helpLevel = detectHelpLevel(ctx);
  if (helpLevel === "cluster") {
    ctx.write("Parse JS/TS/Svelte file\n");
    return;
  }
  if (helpLevel === "double") {
    ctx.write("TBD -h -h\n");
    return;
  }
  if (helpLevel === "single") {
    ctx.write("TBD -h\n");
    return;
  }

  const target = ctx.argv[0];
  if (!target) {
    ctx.write("ts: missing file path\n");
    return;
  }

  const resolved = path.resolve(process.cwd(), target);
  const ext = path.extname(resolved);
  if (ext !== ".ts" && ext !== ".js" && ext !== ".svelte") {
    ctx.write(`ts: unsupported file type ${ext || ""}\n`);
    return;
  }

  let source: string;
  try {
    source = await fs.readFile(resolved, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.write(`ts: unable to read file: ${message}\n`);
    return;
  }

  const acornOptions: AcornOptions = {
    ecmaVersion: "latest",
    sourceType: "module",
    locations: true,
    allowHashBang: true,
  };

  try {
    let ast: unknown;
    if (ext === ".svelte") {
      ast = parseSvelte(source, { filename: resolved });
    } else {
      ast = TypeScriptParser.parse(source, acornOptions);
    }
    ctx.write(`${JSON.stringify(ast, null, 2)}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.write(`ts: parse failed: ${message}\n`);
  }
});

registerBuiltinHelp("ts", "Parse JS/TS/Svelte file");
