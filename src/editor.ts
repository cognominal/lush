//  multi-line editor 
//
// it use raw state but does not disturb anything on top of the curosr
//  A line is composed of tokens 
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import chalk from 'chalk'
import {
  getBuiltin,
  type HistoryEntry,
  type BuiltinContext,
  type InputToken,
  type TokenLine,
  type TokenMultiLine,
  getHighlighter,
  tokenizeLine,
  handleDoubleSpace as computeDoubleSpace,
  collectArgumentTexts,
  appendHistoryEntry,
  getHistoryFilePath,
  loadHistoryEntries,
  registerJob,
  configureJobControl,
  getForegroundJob,
  killJob,
  suspendForegroundJob,
  suspendShell,
  resumeShell,
  typeInit,
  prompt as buildPrompt,
} from './index.ts'

enum  Mode {
   Sh = 'sh',
   expr = 'expr'
}

let mode: Mode = Mode.Sh

/* ---------------- PATH / executables ---------------- */
const PATH_DIRS = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
function isExecutableOnPath(cmd: string): string | null {
  if (!cmd) return null;
  for (const dir of PATH_DIRS) {
    const full = path.join(dir, cmd);
    try {
      fs.accessSync(full, fs.constants.X_OK);
      const st = fs.statSync(full);
      if (st.isFile()) return full;
    } catch { }
  }
  return null;
}

/* ---------------- Editor state ---------------- */
let lines: TokenMultiLine = [createLineFromText('')]

// Curent cursor position
let lineIdx = 0;
let colIdx = 0;
// let currentTokenIdx = 0 // in current line
// const stdout = process.stdout

const HISTORY_FILE = getHistoryFilePath();
const history: HistoryEntry[] = loadHistoryEntries(HISTORY_FILE);
let histIdx = -1; // -1: no history selection
let inputLocked = false;

const DOUBLE_ENTER_THRESHOLD_MS = 350;
let pendingEnterCount = 0;
let lastEnterAt = 0;

const DOUBLE_SPACE_THRESHOLD_MS = 350;
let pendingSpaceCount = 0;
let lastSpaceAt = 0;


/* ---------- token utilities --------*/
function createLineFromText(text: string): TokenLine {
  return tokenizeLine(text)
}

function tokenText(token: InputToken): string {
  if (typeof token.text === 'string') return token.text
  if (token.subTokens?.length) return token.subTokens.map(tokenText).join('')
  return ''
}

function ensureLine(index: number): TokenLine {
  if (!lines[index]) {
    lines[index] = []
  }
  return lines[index]
}

function setLineText(index: number, text: string) {
  lines[index] = createLineFromText(text)
}

function lineText(line: TokenLine | undefined): string {
  if (!line || line.length === 0) return ''
  return line.map(tokenText).join('')
}

function lineLength(line: TokenLine | undefined): number {
  return lineText(line).length
}

type TokenSpan = { start: number; end: number; token: InputToken }

function lineTokenSpans(line: TokenLine | undefined): TokenSpan[] {
  if (!line || line.length === 0) return []
  const spans: TokenSpan[] = []
  let offset = 0
  for (const token of line) {
    const text = tokenText(token)
    const length = text.length
    spans.push({ start: offset, end: offset + length, token })
    offset += length
  }
  return spans
}

function currentTokenAtCursor(): InputToken | undefined {
  const line = lines[lineIdx]
  if (!line || line.length === 0) return undefined
  const spans = lineTokenSpans(line)
  if (!spans.length) return undefined

  for (const span of spans) {
    if (colIdx >= span.start && colIdx < span.end) return span.token
  }

  if (colIdx > 0) {
    for (let i = spans.length - 1; i >= 0; i--) {
      if (colIdx >= spans[i].end) return spans[i].token
    }
  }

  return spans[0]?.token
}

function stripBackgroundIndicator(args: string[], background: boolean): string[] {
  if (!background) return args;
  if (!args.length) return args;
  const last = args[args.length - 1];
  if (last === '&') {
    return args.slice(0, -1);
  }
  return args;
}


/* ---------------- Rendering (zsh-style: always at bottom) ---------------- */
function renderLine(line: TokenLine | undefined): string {
  if (!line || line.length === 0) return ''
  return line
    .map((tk: InputToken) => {
      const highlighter = getHighlighter(tk.type)
      return highlighter(tokenText(tk))
    })
    .join('')
}

function highlightFirstWord(line: TokenLine): string {
  const rendered = renderLine(line)
  const m = lineText(line).match(/^(\S+)(.*)$/)
  if (!m) return rendered
  const [, first, rest] = m
  return isExecutableOnPath(first) ? `${chalk.red(first)}${rest}` : rendered
}

/**
 * The prompt block is the multiline editor
 * Repaint only the prompt block at the bottom.
 * Strategy:
 *  1) Jump to bottom (CSI 999B).
 *  2) Move up (promptHeight-1) lines to the first prompt line.
 *  3) For each visual line: clear the line, write content, newline (except last).
 *  4) Move the cursor up to the target row and set the column.
 */
function renderMline() {
  ensureLine(lineIdx)
  colIdx = Math.min(colIdx, lineLength(lines[lineIdx]))
  const activeLines = lines.length ? lines : [createLineFromText('')]
  const promptText = buildPrompt()
  const continuationLength = Math.max(promptText.length, 2)
  const continuationPrefix = `${' '.repeat(Math.max(continuationLength - 2, 0))}| `
  const prefixes = activeLines.map((_, i) => i === 0 ? promptText : continuationPrefix)
  const prefixLengths = activeLines.map((_, i) => i === 0 ? promptText.length : continuationLength)
  const visualLines = activeLines.map((ln, i) => {
    const body = i === 0 ? highlightFirstWord(ln) : renderLine(ln)
    return prefixes[i] + body
  })
  const h = Math.max(1, visualLines.length)

  const currentTokenType = currentTokenAtCursor()?.type ?? '-'
  const statusLine = chalk.dim(`mode: ${mode} curtok ${currentTokenType}`)
  const displayLines = [...visualLines, statusLine]

  const totalHeight = Math.max(1, displayLines.length)

  // 1) go to bottom
  readline.moveCursor(process.stdout, 0, 999); // clamp to last row

  // 2) go up to the first prompt row so the block occupies the bottom h rows
  if (totalHeight > 1) readline.moveCursor(process.stdout, 0, -(totalHeight - 1));
  readline.cursorTo(process.stdout, 0);

  // 3) draw each line, clearing to avoid leftovers
  for (let i = 0; i < totalHeight; i++) {
    readline.clearLine(process.stdout, 0) // clear entire line
    process.stdout.write(displayLines[i] ?? '')
    if (i < totalHeight - 1) process.stdout.write('\n')
  }

  // 4) place cursor to row/col inside the block (relative from current bottom block)
  const cursorRow = Math.min(Math.max(0, lineIdx), h - 1)
  const cursorLine = lines[cursorRow] ?? []
  const cursorPrefixLen = prefixLengths[cursorRow] ?? promptText.length
  const cursorCol = cursorPrefixLen + Math.min(Math.max(0, colIdx), lineLength(cursorLine))
  const up = (totalHeight - 1) - cursorRow
  if (up > 0) readline.moveCursor(process.stdout, 0, -up)
  readline.cursorTo(process.stdout, cursorCol)
}

/* ---------------- History ---------------- */
function loadHistory(idx: number) {
  if (idx < 0 || idx >= history.length) {
    resetBuffer();
    return;
  }
  const entry = history[idx];
  const parts = entry.command.split('\n');
  lines = parts.map(createLineFromText);
  if (!lines.length) {
    lines = [createLineFromText('')]
  }
  lineIdx = Math.min(lineIdx, lines.length - 1);
  colIdx = Math.min(colIdx, lineLength(lines[lineIdx]));
  histIdx = idx;
}

function currentFirstWord(): string {
  const m = lineText(lines[0]).match(/^(\S+)/);
  return m ? m[1] : "";
}

/* ---------------- Movement helpers ---------------- */
function moveLeft() {
  if (colIdx > 0) { colIdx--; return }
  if (lineIdx > 0) {
    lineIdx--
    colIdx = lineLength(lines[lineIdx])
  }
}
function moveRight() {
  if (colIdx < lineLength(lines[lineIdx])) { colIdx++; return }
  if (lineIdx < lines.length - 1) {
    lineIdx++
    colIdx = 0
  }
}
function previousLine() {
  if (lineIdx > 0) {
    lineIdx--
    colIdx = Math.min(colIdx, lineLength(lines[lineIdx]))
  }
}
function nextLine() {
  if (lineIdx < lines.length - 1) {
    lineIdx++
    colIdx = Math.min(colIdx, lineLength(lines[lineIdx]))
  }
}
function previousHistory() {
  if (!history.length) return;
  histIdx = (histIdx === -1) ? history.length - 1 : Math.max(0, histIdx - 1);
  loadHistory(histIdx);
}
function nextHistory() {
  if (!history.length) return;
  if (histIdx === -1) return;
  if (histIdx < history.length - 1) {
    histIdx++;
    loadHistory(histIdx);
  } else {
    histIdx = -1;
    resetBuffer();
  }
}

/* ---------------- Submit / execute ---------------- */
function detectBackground(input: string): { command: string; background: boolean } {
  const trimmed = input.trimEnd();
  if (!trimmed) {
    return { command: "", background: false };
  }
  if (trimmed.endsWith("&")) {
    return { command: trimmed.slice(0, -1).trimEnd(), background: true };
  }
  return { command: trimmed, background: false };
}

function submit() {
  ensureLine(lineIdx)
  const joined = lines.map(lineText).join(' ');
  const rawArgs = collectArgumentTexts(lines);
  const { command, background } = detectBackground(joined);

  // Push the prompt block up by starting a new line before output
  process.stdout.write("\n");

  if (!command) {
    resetBuffer();
    renderMline();
    return;
  }

  const args = stripBackgroundIndicator(rawArgs, background);
  const first = args[0] ?? "";

  const recordHistory = (output: string) => {
    const entry: HistoryEntry = { command, output };
    history.push(entry);
    histIdx = -1;
    appendHistoryEntry(entry, HISTORY_FILE);
  };

  const builtinHandler = getBuiltin(first);
  if (builtinHandler) {
    if (background) {
      const line = `${first}: cannot run builtin in background
`;
      process.stderr.write(line);
      recordHistory(line);
      resetBuffer();
      renderMline();
      return;
    }
    let outputBuffer = "";
    const historySnapshot = history.slice();
    const write = (chunk: string) => {
      const str = chunk.toString();
      outputBuffer += str;
      process.stdout.write(str);
    };
    const context: BuiltinContext = {
      argv: args.slice(1),
      raw: command,
      write,
      history: historySnapshot,
    };
    const finalize = () => {
      recordHistory(outputBuffer);
      resetBuffer();
      renderMline();
    };
    try {
      const maybe = builtinHandler(context);
      if (maybe && typeof (maybe as PromiseLike<void>).then === "function") {
        Promise.resolve(maybe)
          .catch(err => {
            const msg = err instanceof Error ? err.message : String(err);
            process.stderr.write(`builtin ${first} failed: ${msg}
`);
            outputBuffer += `builtin ${first} failed: ${msg}
`;
          })
          .finally(finalize);
      } else {
        finalize();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`builtin ${first} failed: ${msg}
`);
      outputBuffer += `builtin ${first} failed: ${msg}
`;
      finalize();
    }
    return;
  }

  const exe = isExecutableOnPath(first);

  if (exe) {
    const [cmd, ...rest] = args;
    let outputBuffer = "";
    let finalized = false;
    const finalize = (cause: "exit" | "error") => {
      if (finalized) return;
      finalized = true;
      recordHistory(outputBuffer);
      if (!background) {
        process.stdout.write(" ");
        resetBuffer();
        renderMline();
      }
    };
    const child = spawn(cmd, rest, { stdio: ["inherit", "pipe", "pipe"] });
    registerJob(command, child, background);
    child.stdout?.on("data", chunk => {
      const str = chunk.toString();
      process.stdout.write(str);
      outputBuffer += str;
    });
    child.stderr?.on("data", chunk => {
      const str = chunk.toString();
      process.stderr.write(str);
      outputBuffer += str;
    });
    child.on("error", err => {
      const msg = err instanceof Error ? err.message : String(err);
      const line = `failed to execute ${cmd}: ${msg}
`;
      process.stderr.write(line);
      outputBuffer += line;
      finalize("error");
    });
    child.on("exit", () => finalize("exit"));
    if (background) {
      resetBuffer();
      renderMline();
    }
    return;
  }

  const output = `echo: ${command}
`;
  process.stdout.write(output);
  recordHistory(output);
  resetBuffer();
  renderMline();
}

function resetBuffer() {
  resetSpaceSequence()
  lines = [createLineFromText('')]
  lineIdx = 0;
  colIdx = 0;
}

/* ---------------- Actions ---------------- */
function exitEditor() {
  process.stdout.write("\n");
  process.exit(130); // typical for SIGINT
}
function deleteOrEOF() {
  if (lines.length === 1 && lineLength(lines[0]) === 0) {
    process.stdout.write("\n");
    process.exit(0);
  } else {
    ensureLine(lineIdx)
    const text = lineText(lines[lineIdx]);
    if (colIdx < text.length) {
      setLineText(lineIdx, text.slice(0, colIdx) + text.slice(colIdx + 1));
    }
    renderMline();
  }
}
function beginningOfLine() { colIdx = 0; renderMline(); }
function endOfLine() { colIdx = lineLength(lines[lineIdx]); renderMline(); }
function backwardChar() { moveLeft(); renderMline(); }
function forwardChar() { moveRight(); renderMline(); }
function previousLineAction() { previousLine(); renderMline(); }
function nextLineAction() { nextLine(); renderMline(); }
function previousHistoryAction() { previousHistory(); renderMline(); }
function nextHistoryAction() { nextHistory(); renderMline(); }
function deleteChar() {
  ensureLine(lineIdx)
  const text = lineText(lines[lineIdx]);
  if (colIdx < text.length) {
    setLineText(lineIdx, text.slice(0, colIdx) + text.slice(colIdx + 1));
    renderMline();
  }
}
function backwardDeleteChar() {
  ensureLine(lineIdx)
  const ln = lineText(lines[lineIdx]);
  if (colIdx > 0) {
    setLineText(lineIdx, ln.slice(0, colIdx - 1) + ln.slice(colIdx));
    colIdx--;
  } else if (lineIdx > 0) {
    const prevLineIdx = lineIdx - 1;
    const prevText = lineText(lines[prevLineIdx]);
    const merged = prevText + ln;
    setLineText(prevLineIdx, merged);
    lines.splice(lineIdx, 1);
    lineIdx--;
    colIdx = prevText.length;
  }
  renderMline();
}
function forwardToken() {
  let targetLine = lineIdx;
  let targetCol = colIdx;
  const totalLines = lines.length;
  while (targetLine < totalLines) {
    const spans = lineTokenSpans(lines[targetLine]);
    if (!spans.length) {
      targetLine++;
      targetCol = -1;
      continue;
    }

    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      const spanLength = span.end - span.start;
      if (spanLength === 0) continue;

      if (targetCol < span.start) {
        lineIdx = targetLine;
        colIdx = span.start;
        renderMline();
        return;
      }

      if (targetCol >= span.start && targetCol < span.end) {
        for (let j = i + 1; j < spans.length; j++) {
          const nextSpan = spans[j];
          if (nextSpan.end > nextSpan.start) {
            lineIdx = targetLine;
            colIdx = nextSpan.start;
            renderMline();
            return;
          }
        }
        lineIdx = targetLine;
        colIdx = span.end;
        renderMline();
        return;
      }
    }

    if (targetCol !== -1) {
      targetLine++;
      targetCol = -1;
    }
  }

  const lastLine = Math.max(0, totalLines - 1);
  lineIdx = lastLine;
  colIdx = lineLength(lines[lastLine]);
  renderMline();
}
function backwardToken() {
  let targetLine = Math.min(lineIdx, lines.length - 1);
  let targetCol = colIdx;
  while (targetLine >= 0) {
    const spans = lineTokenSpans(lines[targetLine]);
    if (!spans.length) {
      targetLine--;
      targetCol = targetLine >= 0 ? lineLength(lines[targetLine]) + 1 : 0;
      continue;
    }
    const lastSpan = spans[spans.length - 1];
    const lineLen = lastSpan.end;
    if (targetCol > lineLen) targetCol = lineLen;

    for (let i = spans.length - 1; i >= 0; i--) {
      const span = spans[i];
      if (span.end === span.start) continue;

      if (targetCol > span.start) {
        lineIdx = targetLine;
        colIdx = span.start;
        renderMline();
        return;
      }

      if (targetCol === span.start) {
        for (let j = i - 1; j >= 0; j--) {
          const prevSpan = spans[j];
          if (prevSpan.end > prevSpan.start) {
            lineIdx = targetLine;
            colIdx = prevSpan.start;
            renderMline();
            return;
          }
        }
        break;
      }
    }

    targetLine--;
    targetCol = targetLine >= 0 ? lineLength(lines[targetLine]) + 1 : 0;
  }

  lineIdx = 0;
  colIdx = 0;
  renderMline();
}
function resetEnterSequence() {
  pendingEnterCount = 0;
  lastEnterAt = 0;
}
function resetSpaceSequence() {
  pendingSpaceCount = 0;
  lastSpaceAt = 0;
}
function insertCharacter(ch: string) {
  ensureLine(lineIdx)
  const current = lineText(lines[lineIdx]);
  const before = current.slice(0, colIdx);
  const after = current.slice(colIdx);
  const next = before + ch + after;
  setLineText(lineIdx, next);
  colIdx += ch.length;
}
function handleDoubleSpaceEvent() {
  ensureLine(lineIdx)
  const current = lineText(lines[lineIdx]);
  const { text, cursor } = computeDoubleSpace(current, colIdx);
  setLineText(lineIdx, text);
  colIdx = cursor;
  resetSpaceSequence();
}
function insertNewline() {
  resetSpaceSequence()
  ensureLine(lineIdx)
  const current = lineText(lines[lineIdx]);
  const before = current.slice(0, colIdx);
  const after = current.slice(colIdx);
  setLineText(lineIdx, before);
  lines.splice(lineIdx + 1, 0, createLineFromText(after));
  lineIdx++;
  colIdx = 0;
  renderMline();
}
function enterAction() {
  const now = Date.now();
  if (now - lastEnterAt <= DOUBLE_ENTER_THRESHOLD_MS) {
    pendingEnterCount++;
  } else {
    pendingEnterCount = 1;
  }
  lastEnterAt = now;

  if (pendingEnterCount >= 2) {
    resetEnterSequence();
    acceptLine();
    return;
  }

  insertNewline();
}
function acceptLine() {
  resetEnterSequence();
  submit();
}
function clearScreen() {
  // Clear screen + home, prompt will redraw at bottom next
  readline.cursorTo(process.stdout, 0, 0);
  readline.clearScreenDown(process.stdout);
  renderMline();
}
function killLineEnd() {
  ensureLine(lineIdx)
  const text = lineText(lines[lineIdx]);
  setLineText(lineIdx, text.slice(0, colIdx));
  renderMline();
}
function killLineBeginning() {
  ensureLine(lineIdx)
  const text = lineText(lines[lineIdx]);
  setLineText(lineIdx, text.slice(colIdx));
  colIdx = 0;
  renderMline();
}

function interrupt() {
  const job = getForegroundJob();
  if (job) {
    killJob(job, "SIGINT");
    return;
  }
  exitEditor();
}

function suspendCurrent() {
  const job = getForegroundJob();
  if (job) {
    suspendForegroundJob();
    return;
  }
  suspendShell();
}

/* ---------------- Actions registry ---------------- */
const ACTIONS: Record<string, () => void> = {
  exitEditor,
  deleteOrEOF,
  interrupt,
  suspendCurrent,
  beginningOfLine,
  endOfLine,
  backwardChar,
  forwardChar,
  forwardToken,
  previousLineAction,
  nextLineAction,
  previousHistoryAction,
  nextHistoryAction,
  deleteChar,
  backwardDeleteChar,
  backwardToken,
  enterAction,
  insertNewline,
  acceptLine,
  clearScreen,
  killLineEnd,
  killLineBeginning,
};

/* ---------------- Escape sequences → key names ---------------- */
const SEQ_TO_NAME: Record<string, string> = {
  "\r": "enter",
  "\n": "enter",
  // Command/Super + Enter (Ghostty, iTerm2, and terminals supporting CSI-u modifiers)
  "\u001b[13;9~": "cmd-enter",
  "\u001b[13;9u": "cmd-enter",
  "\u001bO9M": "cmd-enter",
  "\u001b[13;13~": "cmd-enter",
  "\u001b[13;13u": "cmd-enter",
  "\u001bO13M": "cmd-enter",
  "\u001b[13;17~": "cmd-enter",
  "\u001b[13;17u": "cmd-enter",
  "\u001bO17M": "cmd-enter",
  "\u001b\r": "cmd-enter",
  "\u001b\n": "cmd-enter",
  "\u007F": "backspace",
  "\u0003": "ctrl-c",
  "\u0004": "ctrl-d",
  "\u0001": "ctrl-a",
  "\u0002": "ctrl-b",
  "\u0005": "ctrl-e",
  "\u0006": "ctrl-f",
  "\u000b": "ctrl-k",
  "\u0015": "ctrl-u",
  "\u000c": "ctrl-l",
  "\u0010": "ctrl-p",
  "\u000E": "ctrl-n",
  "\u001a": "ctrl-z",
  "\u001bf": "meta-f",
  "\u001bF": "meta-f",
  "\u001bb": "meta-b",
  "\u001bB": "meta-b",
  "\u001b[A": "up",
  "\u001b[B": "down",
  "\u001b[C": "right",
  "\u001b[D": "left",
  "\u001b[H": "home",
  "\u001b[F": "end",
  "\u001bOH": "home",
  "\u001bOF": "end",
  "\u001b[3~": "delete",
};
const SEQS_DESC = Object.keys(SEQ_TO_NAME).sort((a, b) => b.length - a.length);

/* ---------------- Default keymap (key name → action name) ---------------- */
const DEFAULT_KEYMAP: Record<string, string> = {
  "ctrl-c": "interrupt",
  "ctrl-d": "deleteOrEOF",
  "ctrl-a": "beginningOfLine",
  "ctrl-b": "backwardChar",
  "ctrl-e": "endOfLine",
  "ctrl-f": "forwardChar",
  "meta-f": "forwardToken",
  "ctrl-l": "clearScreen",
  "ctrl-k": "killLineEnd",
  "ctrl-u": "killLineBeginning",
  "left": "backwardChar",
  "right": "forwardChar",
  "up": "previousLineAction",   // arrows move within buffer
  "down": "nextLineAction",
  "ctrl-p": "previousHistoryAction", // history on C-p/C-n
  "ctrl-n": "nextHistoryAction",
  "ctrl-z": "suspendCurrent",
  "meta-b": "backwardToken",
  "home": "beginningOfLine",
  "end": "endOfLine",
  "delete": "deleteChar",
  "backspace": "backwardDeleteChar",
  "enter": "enterAction",
  "cmd-enter": "acceptLine",
};

/* ---------------- Input event string tokenizer ---------------- */
type EventToken = { kind: "key"; name: string } | { kind: "text"; text: string };
function tokenize(input: string): EventToken[] {
  const out: EventToken[] = [];
  let i = 0;
  while (i < input.length) {
    let matched = false;
    for (const seq of SEQS_DESC) {
      if (input.startsWith(seq, i)) {
        out.push({ kind: "key", name: SEQ_TO_NAME[seq] });
        i += seq.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    // Accumulate printable run until next known sequence starts
    let j = i + 1;
    for (; j <= input.length; j++) {
      if (SEQS_DESC.some(seq => input.startsWith(seq, j))) break;
    }
    const text = input.slice(i, j);
    out.push({ kind: "text", text });
    i = j;
  }
  return out;
}

/* ---------------- Insert text ---------------- */
function insertText(text: string) {
  if (!text) return;
  let mutated = false;
  for (const ch of text) {
    if (ch === ' ') {
      const now = Date.now();
      if (now - lastSpaceAt <= DOUBLE_SPACE_THRESHOLD_MS) {
        pendingSpaceCount++;
      } else {
        pendingSpaceCount = 1;
      }
      lastSpaceAt = now;
      if (pendingSpaceCount === 1) {
        insertCharacter(ch);
      } else {
        handleDoubleSpaceEvent();
      }
      mutated = true;
      continue;
    }
    resetSpaceSequence();
    insertCharacter(ch);
    mutated = true;
  }
  if (mutated) renderMline();
}

configureJobControl({
  pauseInput: () => {
    inputLocked = true;
  },
  resumeInput: () => {
    if (!inputLocked) return;
    inputLocked = false;
    renderMline();
  },
  renderPrompt: renderMline,
  writeOut: chunk => {
    process.stdout.write(chunk);
  },
});

/* ---------------- Input loop ---------------- */
function handleInput(chunk: string) {
  const tokens: EventToken[] = tokenize(chunk);
  for (const t of tokens) {
    if (t.kind === "key") {
      if (t.name !== "enter") resetEnterSequence();
      resetSpaceSequence();
      const actionName = DEFAULT_KEYMAP[t.name];
      if (inputLocked && actionName && actionName !== "interrupt" && actionName !== "suspendCurrent") {
        continue;
      }
      const action = actionName && ACTIONS[actionName];
      if (action) action();
    } else {
      if (inputLocked) continue;
      resetEnterSequence();
      insertText(t.text);
    }
  }
}

process.stdin.on("data", handleInput);
process.on("SIGCONT", () => {
  resumeShell();
});


// Initial draw

function main() {

  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  typeInit()
  renderMline();

}

main()
