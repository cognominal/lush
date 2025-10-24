import readline from "node:readline";

export function clearTerminal(
  stream: NodeJS.WriteStream = process.stdout,
): void {
  if (!stream.isTTY) return;
  readline.cursorTo(stream, 0, 0);
  readline.clearScreenDown(stream);
}

