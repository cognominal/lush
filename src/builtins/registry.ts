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
const helpRegistry: Map<string, string> = new Map();

export function registerBuiltin(name: string, handler: BuiltinHandler) {
  registry.set(name, handler);
}

export function registerBuiltinHelp(name: string, description: string) {
  helpRegistry.set(name, description);
}

export function getBuiltin(name: string): BuiltinHandler | undefined {
  return registry.get(name);
}

export function getBuiltinHelp(name: string): string | undefined {
  return helpRegistry.get(name);
}

export function listBuiltins(): string[] {
  return Array.from(registry.keys()).sort();
}

export function listBuiltinHelpEntries(): Array<{ name: string; description: string | undefined }> {
  return listBuiltins().map(name => ({ name, description: helpRegistry.get(name) }));
}
