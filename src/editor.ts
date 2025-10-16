//  multi-line editor 
//
// it use raw state but does not disturb anything on top of the curosr
//  A line is composed of tokens 
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn, type ChildProcess } from "node:child_process";
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
import {
  insertTextIntoTokenLine,
  deleteRangeFromTokenLine,
  splitTokenLineAt,
  normalizeTokenLineInPlace,
} from './tokenEdit.ts'
import { rotateTokenType, sortedValidTokens, promoteSpaceFromNakedString, SPACE_TYPE, DEFAULT_TEXT_TYPE } from "./tokenType.ts";

enum Mode {
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

const SHELL_START_DIR = process.cwd();
const CTX_WRITE_LOG = path.join(SHELL_START_DIR, "ctx-write.log");
let ctxWriteLogPrepared = false;

function appendCtxWriteLog(chunk: string) {
  try {
    if (!ctxWriteLogPrepared) {
      const dir = path.dirname(CTX_WRITE_LOG);
      if (dir && dir !== "." && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      ctxWriteLogPrepared = true;
    }
    fs.appendFileSync(CTX_WRITE_LOG, chunk, "utf8");
  } catch {
    ctxWriteLogPrepared = false;
  }
}


/* ---------- token utilities --------*/
function createLineFromText(text: string): TokenLine {
  return tokenizeLine(text)
}

function tokenText(token: InputToken): string {
  if (typeof token.text === 'string') return token.text
  if (token.subTokens?.length) {
    const pieces: string[] = token.subTokens.map(tokenText)
    return pieces.join('')
  }
  return ''
}

function ensureLine(index: number): TokenLine {
  if (!lines[index]) {
    lines[index] = []
  }
  return lines[index]
}

function getLine(index: number): TokenLine {
  return ensureLine(index);
}

function lineText(line: TokenLine | undefined): string {
  if (!line || line.length === 0) return ''
  const segments: string[] = line.map(tokenText)
  return segments.join('')
}

function lineLength(line: TokenLine | undefined): number {
  return lineText(line).length
}

function bufferHasContent(): boolean {
  for (const line of lines) {
    if (lineText(line).trim().length > 0) return true
  }
  return false
}

type TokenSpan = { start: number; end: number; token: InputToken }

function lineTokenSpans(line: TokenLine): TokenSpan[] {
  if (line.length === 0) return []
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

function currentTokenInfo(): { token: InputToken | undefined; index: number } {
  const line = ensureLine(lineIdx)
  if (line.length === 0) return { token: undefined, index: -1 }
  const spans = lineTokenSpans(line)
  if (!spans.length) return { token: undefined, index: -1 }

  for (const span of spans) {
    if (colIdx >= span.start && colIdx < span.end) {
      const token = span.token
      const index = token ? line.indexOf(token) : -1
      return { token, index }
    }
  }

  if (colIdx > 0) {
    for (let i = spans.length - 1; i >= 0; i--) {
      const span = spans[i];
      if (!span) continue;
      if (colIdx >= span.end) {
        const token = span.token;
        const index = token ? line.indexOf(token) : -1;
        return { token, index };
      }
    }
  }

  const firstSpan = spans[0]
  const token = firstSpan ? firstSpan.token : undefined
  const index = token ? line.indexOf(token) : -1
  return { token, index }
}

function currentTokenAtCursor(): InputToken | undefined {
  return currentTokenInfo().token;
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

function promptActiveLines(): TokenMultiLine {
  return lines.length ? lines : [createLineFromText("")];
}

function computePromptHeight(): number {
  const active = promptActiveLines();
  return Math.max(1, active.length + 1); // +1 for status line
}

function renderPromptAfterOutput() {
  const height = computePromptHeight();
  if (height > 1) {
    process.stdout.write("\n".repeat(height - 1));
  }
  renderMline();
}

function clearPromptBlock() {
  const height = computePromptHeight();
  readline.moveCursor(process.stdout, 0, 999);
  if (height > 1) readline.moveCursor(process.stdout, 0, -(height - 1));
  readline.cursorTo(process.stdout, 0);
  for (let i = 0; i < height; i++) {
    readline.clearLine(process.stdout, 0);
    if (i < height - 1) {
      readline.moveCursor(process.stdout, 0, 1);
      readline.cursorTo(process.stdout, 0);
    }
  }
}

function renderLine(line: TokenLine | undefined): string {
  if (!line || line.length === 0) return ''
  const renderedTokens: string[] = line.map((tk: InputToken) => {
    const tokenType = tk.type ?? "NakedString";
    const highlighter = getHighlighter(tokenType);
    return highlighter(tokenText(tk))
  })
  return renderedTokens.join('')
}

function highlightFirstWord(line: TokenLine): string {
  const rendered = renderLine(line)
  const m = lineText(line).match(/^(\S+)(.*)$/)
  if (!m) return rendered
  const [, first = "", rest = ""] = m
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
  const currentLine = getLine(lineIdx);
  colIdx = Math.min(colIdx, lineLength(currentLine))
  const activeLines = promptActiveLines()
  const promptText = buildPrompt(history.length + 1)
  const continuationLength = Math.max(promptText.length, 2)
  const continuationPrefix = `${' '.repeat(Math.max(continuationLength - 2, 0))}| `
  const prefixes: string[] = activeLines.map((_, i) => i === 0 ? promptText : continuationPrefix)
  const prefixLengths: number[] = activeLines.map((_, i) => i === 0 ? promptText.length : continuationLength)
  const visualLines: string[] = activeLines.map((ln, i) => {
    const body = i === 0 ? highlightFirstWord(ln) : renderLine(ln)
    return prefixes[i] + body
  })
  const h = Math.max(1, visualLines.length)

  const { token: activeToken, index: activeIndex } = currentTokenInfo();
  const currentTokenType = activeToken?.type ?? '-';
  const currentTokenIdx = activeIndex >= 0 ? activeIndex : '-';
  const currentTokenLen = activeToken ? tokenText(activeToken).length : '-';
  const validTypes = sortedValidTokens(activeToken);
  const highlightedTypes = validTypes.map(candidate => {
    const label = candidate.type;
    if (!label) return "";
    return label === currentTokenType ? chalk.inverse(label) : chalk.gray(label);
  }).filter(Boolean);
  const fallbackType = typeof currentTokenType === "string" ? currentTokenType : "";
  const typeDisplay = highlightedTypes.length
    ? highlightedTypes.join("     ")
    : fallbackType && fallbackType !== "-"
      ? chalk.inverse(fallbackType)
      : chalk.dim("no types");
  const statusInfo = chalk.dim(`mode: ${mode} curtok ${currentTokenIdx} ${currentTokenLen}`)
  const statusLine = `${statusInfo}          ${chalk.dim("types:")} ${typeDisplay}`
  const displayLines: string[] = [...visualLines, statusLine]

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
  const cursorLine = activeLines[cursorRow] ?? []
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
  if (!entry) {
    resetBuffer();
    return;
  }
  const parts = entry.command.split('\n');
  const mappedLines: TokenMultiLine = parts.map(createLineFromText);
  lines = mappedLines;
  if (!lines.length) {
    lines = [createLineFromText('')]
  }
  lineIdx = Math.min(lineIdx, lines.length - 1);
  colIdx = Math.min(colIdx, lineLength(getLine(lineIdx)));
  histIdx = idx;
}

function currentFirstWord(): string {
  const firstLine = lines[0] ?? createLineFromText('');
  const m = lineText(firstLine).match(/^(\S+)/);
  if (!m) return "";
  return m[1] ?? "";
}

/* ---------------- Movement helpers ---------------- */
function moveLeft() {
  if (colIdx > 0) { colIdx--; return }
  if (lineIdx > 0) {
    lineIdx--
    colIdx = lineLength(getLine(lineIdx))
  }
}
function moveRight() {
  if (colIdx < lineLength(getLine(lineIdx))) { colIdx++; return }
  if (lineIdx < lines.length - 1) {
    lineIdx++
    colIdx = 0
  }
}
function previousLine() {
  if (lineIdx > 0) {
    lineIdx--
    colIdx = Math.min(colIdx, lineLength(getLine(lineIdx)))
  }
}
function nextLine() {
  if (lineIdx < lines.length - 1) {
    lineIdx++
    colIdx = Math.min(colIdx, lineLength(getLine(lineIdx)))
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
  const lineSegments: string[] = lines.map(lineText);
  const joined = lineSegments.join(' ');
  const rawArgs = collectArgumentTexts(lines);
  const { command, background } = detectBackground(joined);

  // Push the prompt block up by starting a new line before output
  clearPromptBlock();
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
      renderPromptAfterOutput();
      return;
    }
    let outputBuffer = "";
    const historySnapshot = history.slice();
    const write = (chunk: string) => {
      const str = chunk.toString();
      outputBuffer += str;
      process.stdout.write(str);
      appendCtxWriteLog(str);
    };
    const context: BuiltinContext = {
      argv: args.slice(1),
      raw: command,
      write,
      history: historySnapshot,
    };
    const finalize = () => {
      recordHistory(outputBuffer);
      if (outputBuffer && !outputBuffer.endsWith("\n")) {
        process.stdout.write("\n");
      }
      resetBuffer();
      renderPromptAfterOutput();
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
    if (typeof cmd !== "string" || cmd.length === 0) {
      recordHistory("failed to execute: empty command\n");
      resetBuffer();
      renderPromptAfterOutput();
      return;
    }
    let outputBuffer = "";
    let finalized = false;
    const finalize = (cause: "exit" | "error") => {
      if (finalized) return;
      finalized = true;
      recordHistory(outputBuffer);
      if (!background) {
        if (outputBuffer && !outputBuffer.endsWith("\n")) {
          process.stdout.write("\n");
        }
        resetBuffer();
        renderPromptAfterOutput();
      }
    };
    const child = spawn(cmd, rest, { stdio: ["inherit", "pipe", "pipe"] }) as ChildProcess;
    registerJob(command, child, background);
    child.stdout?.on("data", (chunk: Buffer) => {
      const str = chunk.toString();
      process.stdout.write(str);
      outputBuffer += str;
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const str = chunk.toString();
      process.stderr.write(str);
      outputBuffer += str;
    });
    child.on("error", (err: unknown) => {
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
  if (output && !output.endsWith("\n")) {
    process.stdout.write("\n");
  }
  resetBuffer();
  renderPromptAfterOutput();
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
  if (lines.length === 1) {
    const onlyLine = getLine(0);
    if (lineLength(onlyLine) === 0) {
      process.stdout.write("\n");
      process.exit(0);
      return;
    }
  }

  const line = getLine(lineIdx);
  if (colIdx < lineLength(line)) {
    deleteRangeFromTokenLine(line, colIdx, colIdx + 1);
  }
  renderMline();
}
function beginningOfLine() { colIdx = 0; renderMline(); }
function endOfLine() { colIdx = lineLength(getLine(lineIdx)); renderMline(); }
function backwardChar() { moveLeft(); renderMline(); }
function forwardChar() { moveRight(); renderMline(); }
function previousLineAction() { previousLine(); renderMline(); }
function nextLineAction() { nextLine(); renderMline(); }
function previousHistoryAction() { previousHistory(); renderMline(); }
function nextHistoryAction() { nextHistory(); renderMline(); }
function deleteChar() {
  const line = ensureLine(lineIdx);
  if (colIdx < lineLength(line)) {
    deleteRangeFromTokenLine(line, colIdx, colIdx + 1);
    renderMline();
  }
}
function backwardDeleteChar() {
  ensureLine(lineIdx)
  if (colIdx > 0) {
    const line = ensureLine(lineIdx);
    deleteRangeFromTokenLine(line, colIdx - 1, colIdx);
    colIdx--;
  } else if (lineIdx > 0) {
    const prevLineIdx = lineIdx - 1;
    const prevLine = ensureLine(prevLineIdx);
    const currentLine = ensureLine(lineIdx);
    const prevLength = lineLength(prevLine);
    prevLine.push(...currentLine);
    lines.splice(lineIdx, 1);
    normalizeTokenLineInPlace(prevLine);
    lineIdx = prevLineIdx;
    colIdx = prevLength;
  }
  renderMline();
}
function forwardToken() {
  let targetLine = lineIdx;
  let targetCol = colIdx;
  const totalLines = lines.length;
  while (targetLine < totalLines) {
    const spans = lineTokenSpans(ensureLine(targetLine));
    if (!spans.length) {
      targetLine++;
      targetCol = -1;
      continue;
    }

    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      if (!span) continue;
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
          if (!nextSpan) continue;
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
  colIdx = lineLength(getLine(lastLine));
  renderMline();
}
function backwardToken() {
  let targetLine = Math.min(lineIdx, lines.length - 1);
  let targetCol = colIdx;
  while (targetLine >= 0) {
    const spans = lineTokenSpans(getLine(targetLine));
    if (!spans.length) {
      targetLine--;
      targetCol = targetLine >= 0 ? lineLength(getLine(targetLine)) + 1 : 0;
      continue;
    }
    const lastSpan = spans[spans.length - 1];
    if (!lastSpan) break;
    const lineLen = lastSpan.end;
    if (targetCol > lineLen) targetCol = lineLen;

    for (let i = spans.length - 1; i >= 0; i--) {
      const span = spans[i];
      if (!span) continue;
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
          if (!prevSpan) continue;
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
    targetCol = targetLine >= 0 ? lineLength(getLine(targetLine)) + 1 : 0;
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
  const line = getLine(lineIdx);
  insertTextIntoTokenLine(line, colIdx, ch);
  colIdx += ch.length;
}
function handleDoubleSpaceEvent() {
  const line = ensureLine(lineIdx);
  const spans = lineTokenSpans(line);
  if (!spans.length) {
    resetSpaceSequence();
    return;
  }

  let spanAtCursor: TokenSpan | undefined;
  for (const span of spans) {
    if (colIdx < span.start) break;
    spanAtCursor = span;
    if (colIdx < span.end) break;
  }

  const tokenAtCursor = spanAtCursor?.token ?? currentTokenAtCursor();

  const findPreviousNonSpace = (fromIndex: number): InputToken | undefined => {
    for (let i = fromIndex; i >= 0; i--) {
      const candidate = line[i];
      if (!candidate) continue;
      if (candidate.type !== SPACE_TYPE) return candidate;
    }
    return undefined;
  };

  if (tokenAtCursor && tokenAtCursor.type === SPACE_TYPE) {
    const index = line.indexOf(tokenAtCursor);
    if (index !== -1) {
      const previous = findPreviousNonSpace(index - 1);
      if (previous && rotateTokenType(previous)) {
        normalizeTokenLineInPlace(line);
      }
    }
    const refreshed = lineTokenSpans(line);
    const spaceSpan = refreshed.find(entry => entry.token === tokenAtCursor);
    if (spaceSpan) {
      colIdx = spaceSpan.start;
    }
    resetSpaceSequence();
    return;
  }

  let initialIndex = tokenAtCursor ? line.indexOf(tokenAtCursor) : -1;
  if (initialIndex === -1 || line[initialIndex]?.type === SPACE_TYPE) {
    for (let i = spans.length - 1; i >= 0; i--) {
      const span = spans[i];
      const candidate = span?.token;
      if (!candidate || candidate.type === SPACE_TYPE) continue;
      if (colIdx >= span.start) {
        initialIndex = line.indexOf(candidate);
        if (initialIndex !== -1) break;
      }
    }
  }
  if (initialIndex === -1) {
    for (let i = spans.length - 1; i >= 0; i--) {
      const span = spans[i];
      const candidate = span?.token;
      if (!candidate || candidate.type === SPACE_TYPE) continue;
      initialIndex = line.indexOf(candidate);
      if (initialIndex !== -1) break;
    }
  }

  let initialToken = initialIndex !== -1 ? line[initialIndex] : undefined;
  if (initialToken?.type === SPACE_TYPE && initialIndex !== -1) {
    initialToken = findPreviousNonSpace(initialIndex - 1);
  }
  if (!initialToken) {
    resetSpaceSequence();
    return;
  }

  let spaceToken: InputToken | undefined;
  let needsNormalize = false;

  if (initialToken.type === DEFAULT_TEXT_TYPE) {
    const baseSpan = spanAtCursor && spanAtCursor.token === initialToken
      ? spanAtCursor
      : spans.find(entry => entry.token === initialToken);
    const offset = baseSpan
      ? Math.min(Math.max(colIdx - baseSpan.start, 0), baseSpan.end - baseSpan.start)
      : tokenText(initialToken).length;
    const promoted = promoteSpaceFromNakedString(line, initialToken, offset, 0);
    if (promoted) {
      spaceToken = promoted;
      needsNormalize = true;
    }
  }

  if (!spaceToken && initialIndex !== -1) {
    const tokenIndex = line.indexOf(initialToken);
    if (tokenIndex !== -1) {
      const next = line[tokenIndex + 1];
      if (next?.type === SPACE_TYPE) {
        spaceToken = next;
      }
    }
  }

  if (!spaceToken) {
    const initialSpan = spans.find(entry => entry.token === initialToken);
    const insertionColumn = initialSpan ? initialSpan.end : colIdx;
    insertTextIntoTokenLine(line, insertionColumn, " ");
    needsNormalize = true;
    const refreshed = lineTokenSpans(line);
    const candidate = refreshed.find(entry =>
      entry.start <= insertionColumn && insertionColumn < entry.end && entry.token?.type === SPACE_TYPE,
    );
    if (candidate?.token) {
      spaceToken = candidate.token;
    }
  }

  if (spaceToken) {
    if (needsNormalize) {
      normalizeTokenLineInPlace(line);
    }
    const refreshed = lineTokenSpans(line);
    const spaceSpan = refreshed.find(entry => entry.token === spaceToken);
    if (spaceSpan) {
      colIdx = Math.min(spaceSpan.start, lineLength(line));
    }
  } else if (needsNormalize) {
    normalizeTokenLineInPlace(line);
  }

  resetSpaceSequence();
}
function insertNewline() {
  resetSpaceSequence()
  const line = getLine(lineIdx);
  const tail = splitTokenLineAt(line, colIdx);
  lines.splice(lineIdx + 1, 0, tail);
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
    const hasContent = bufferHasContent();
    resetEnterSequence();
    if (!hasContent) {
      process.stdout.write('\u0007');
      renderMline();
      return;
    }
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
  const line = getLine(lineIdx);
  const length = lineLength(line);
  if (colIdx < length) {
    deleteRangeFromTokenLine(line, colIdx, length);
  }
  renderMline();
}
function killLineBeginning() {
  if (colIdx > 0) {
    const line = getLine(lineIdx);
    deleteRangeFromTokenLine(line, 0, colIdx);
    colIdx = 0;
  }
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
        const name = SEQ_TO_NAME[seq];
        if (!name) continue;
        out.push({ kind: "key", name });
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
