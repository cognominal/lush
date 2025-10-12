const directoryStack: string[] = [];

export function pushDirectory(path: string) {
  directoryStack.push(path);
}

export function popDirectory(): string | undefined {
  return directoryStack.pop();
}

export function peekDirectory(): string | undefined {
  return directoryStack[directoryStack.length - 1];
}

export function clearDirectoryStack() {
  directoryStack.length = 0;
}

export function getDirectoryStack(): readonly string[] {
  return directoryStack.slice();
}

export function hasDirectoryStack(): boolean {
  return directoryStack.length > 0;
}

export function formatDirectoryStack(currentDir: string = process.cwd()): string {
  const entries = [currentDir, ...directoryStack.slice().reverse()];
  return entries.join(" ");
}
