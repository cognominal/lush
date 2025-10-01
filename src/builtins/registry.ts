export interface HistoryEntry {
  command: string;
  output: string;
}

export interface BuiltinContext {
  argv: string[];
  raw: string;
  write: (chunk: string) => void;
  history: readonly HistoryEntry[];
}

export type BuiltinHandler = (context: BuiltinContext) => void | Promise<void>;

const registry: Map<string, BuiltinHandler> = new Map();

export function registerBuiltin(name: string, handler: BuiltinHandler) {
  registry.set(name, handler);
}

export function getBuiltin(name: string): BuiltinHandler | undefined {
  return registry.get(name);
}

export function listBuiltins(): string[] {
  return Array.from(registry.keys()).sort();
}
