//  multi-line editor 
//
// it use raw state but does not disturb anything on top of the curosr
//  A line is composed of tokens 
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import chalk from 'chalk'
import { getBuiltin, type HistoryEntry, type BuiltinContext } from './builtins.ts'
import * as t from './types.ts'
process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");

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
let lines: t.TokenMultiLine = [createLineFromText('')]

// Curent cursor position
let lineIdx = 0;
let colIdx = 0;
// let currentTokenIdx = 0 // in current line
// const stdout = process.stdout

const history: HistoryEntry[] = [];
let histIdx = -1; // -1: no history selection


/* ---------- token utilities --------*/
function createLineFromText(text: string): t.TokenLine {
  if (!text) return []
  return [{
    type: t.TokenType.AnyString,
    tokenIdx: 0,
    text
  }]
}

function tokenText(token: t.Token): string {
  if (typeof token.text === 'string') return token.text
  if (token.subTokens?.length) return token.subTokens.map(tokenText).join('')
  return ''
}

function ensureLine(index: number): t.TokenLine {
  if (!lines[index]) {
    lines[index] = []
  }
  return lines[index]
}

function setLineText(index: number, text: string) {
  lines[index] = createLineFromText(text)
}

function lineText(line: t.TokenLine | undefined): string {
  if (!line || line.length === 0) return ''
  return line.map(tokenText).join('')
}

function lineLength(line: t.TokenLine | undefined): number {
  return lineText(line).length
}

type TokenSpan = { start: number; end: number; token: t.Token }

function lineTokenSpans(line: t.TokenLine | undefined): TokenSpan[] {
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


/* ---------------- Rendering (zsh-style: always at bottom) ---------------- */
function renderLine(line: t.TokenLine | undefined): string {
  if (!line || line.length === 0) return ''
  return line
    .map((tk: t.Token) => {
      const highlighter = t.getHighlighter(tk.type)
      return highlighter(tokenText(tk))
    })
    .join('')
}

function highlightFirstWord(line: t.TokenLine): string {
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
function renderPrompt() {
  ensureLine(lineIdx)
  colIdx = Math.min(colIdx, lineLength(lines[lineIdx]))
  const activeLines = lines.length ? lines : [createLineFromText('')]
  const visual = activeLines.map((ln, i) => {
    const prefix = i === 0 ? "> " : "| "
    const body = i === 0 ? highlightFirstWord(ln) : renderLine(ln)
    return prefix + body
  })
  const h = Math.max(1, visual.length)

  // 1) go to bottom
  process.stdout.write("\x1b[999B"); // clamp to last row

  // 2) go up to the first prompt row so the block occupies the bottom h rows
  if (h > 1) process.stdout.write(`\x1b[${h - 1}A`);
  readline.cursorTo(process.stdout, 0);

  // 3) draw each line, clearing to avoid leftovers
  for (let i = 0; i < h; i++) {
    readline.clearLine(process.stdout, 0) // clear entire line
    process.stdout.write(visual[i] ?? '')
    if (i < h - 1) process.stdout.write('\n')
  }

  // 4) place cursor to row/col inside the block (relative from current bottom block)
  const cursorRow = Math.min(Math.max(0, lineIdx), h - 1)
  const cursorLine = lines[cursorRow] ?? []
  const cursorCol = 2 + Math.min(Math.max(0, colIdx), lineLength(cursorLine))
  const up = (h - 1) - cursorRow
  if (up > 0) process.stdout.write(`\x1b[${up}A`)
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
function submit() {
  ensureLine(lineIdx)
  const lastLineText = lineText(lines[lineIdx]);
  if (lastLineText.endsWith('\\')) {
    setLineText(lineIdx, lastLineText.slice(0, -1));
    lines.splice(lineIdx + 1, 0, createLineFromText(''));
    lineIdx++;
    colIdx = 0;
    renderPrompt();
    return;
  }

  const full = lines.map(lineText).join('\n').trimEnd();

  // Push the prompt block up by starting a new line before output
  process.stdout.write("\n");

  if (full.length === 0) {
    resetBuffer();
    renderPrompt();
    return;
  }

  const recordHistory = (output: string) => {
    history.push({ command: full, output });
    histIdx = -1;
  };

  const tokens = full.split(/\s+/).filter(Boolean);
  const first = tokens[0] ?? "";
  const builtinHandler = getBuiltin(first);
  if (builtinHandler) {
    let outputBuffer = "";
    const historySnapshot = history.slice();
    const write = (chunk: string) => {
      const str = chunk.toString();
      outputBuffer += str;
      process.stdout.write(str);
    };
    const context: BuiltinContext = {
      argv: tokens.slice(1),
      raw: full,
      write,
      history: historySnapshot,
    };
    const finalize = () => {
      recordHistory(outputBuffer);
      resetBuffer();
      renderPrompt();
    };
    try {
      const maybe = builtinHandler(context);
      if (maybe && typeof (maybe as PromiseLike<void>).then === "function") {
        Promise.resolve(maybe)
          .catch(err => {
            const msg = err instanceof Error ? err.message : String(err);
            process.stderr.write(`builtin ${first} failed: ${msg}\n`);
            outputBuffer += `builtin ${first} failed: ${msg}\n`;
          })
          .finally(finalize);
      } else {
        finalize();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`builtin ${first} failed: ${msg}\n`);
      outputBuffer += `builtin ${first} failed: ${msg}\n`;
      finalize();
    }
    return;
  }

  const exe = isExecutableOnPath(first);

  if (exe) {
    const args = full.replace(/\n+/g, " ").trim().split(/\s+/);
    const [cmd, ...rest] = args;
    let outputBuffer = "";
    let settled = false;
    const finalize = () => {
      if (settled) return;
      settled = true;
      process.stdout.write("\n");
      recordHistory(outputBuffer);
      resetBuffer();
      renderPrompt();
    };
    const child = spawn(cmd, rest, { stdio: ["inherit", "pipe", "pipe"] });
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
      const line = `failed to execute ${cmd}: ${msg}\n`;
      process.stderr.write(line);
      outputBuffer += line;
      finalize();
    });
    child.on("exit", finalize);
  } else {
    const output = `echo: ${full}\n`;
    process.stdout.write(output);
    recordHistory(output);
    resetBuffer();
    renderPrompt();
  }
}

function resetBuffer() {
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
    renderPrompt();
  }
}
function beginningOfLine() { colIdx = 0; renderPrompt(); }
function endOfLine() { colIdx = lineLength(lines[lineIdx]); renderPrompt(); }
function backwardChar() { moveLeft(); renderPrompt(); }
function forwardChar() { moveRight(); renderPrompt(); }
function previousLineAction() { previousLine(); renderPrompt(); }
function nextLineAction() { nextLine(); renderPrompt(); }
function previousHistoryAction() { previousHistory(); renderPrompt(); }
function nextHistoryAction() { nextHistory(); renderPrompt(); }
function deleteChar() {
  ensureLine(lineIdx)
  const text = lineText(lines[lineIdx]);
  if (colIdx < text.length) {
    setLineText(lineIdx, text.slice(0, colIdx) + text.slice(colIdx + 1));
    renderPrompt();
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
  renderPrompt();
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
        renderPrompt();
        return;
      }

      if (targetCol >= span.start && targetCol < span.end) {
        for (let j = i + 1; j < spans.length; j++) {
          const nextSpan = spans[j];
          if (nextSpan.end > nextSpan.start) {
            lineIdx = targetLine;
            colIdx = nextSpan.start;
            renderPrompt();
            return;
          }
        }
        lineIdx = targetLine;
        colIdx = span.end;
        renderPrompt();
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
  renderPrompt();
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
        renderPrompt();
        return;
      }

      if (targetCol === span.start) {
        for (let j = i - 1; j >= 0; j--) {
          const prevSpan = spans[j];
          if (prevSpan.end > prevSpan.start) {
            lineIdx = targetLine;
            colIdx = prevSpan.start;
            renderPrompt();
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
  renderPrompt();
}
function acceptLine() { submit(); }
function clearScreen() {
  // Clear screen + home, prompt will redraw at bottom next
  process.stdout.write("\x1b[2J\x1b[H");
  renderPrompt();
}
function killLineEnd() {
  ensureLine(lineIdx)
  const text = lineText(lines[lineIdx]);
  setLineText(lineIdx, text.slice(0, colIdx));
  renderPrompt();
}
function killLineBeginning() {
  ensureLine(lineIdx)
  const text = lineText(lines[lineIdx]);
  setLineText(lineIdx, text.slice(colIdx));
  colIdx = 0;
  renderPrompt();
}

/* ---------------- Actions registry ---------------- */
const ACTIONS: Record<string, () => void> = {
  exitEditor,
  deleteOrEOF,
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
  acceptLine,
  clearScreen,
  killLineEnd,
  killLineBeginning,
};

/* ---------------- Escape sequences → key names ---------------- */
const SEQ_TO_NAME: Record<string, string> = {
  "\r": "enter",
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
  "ctrl-c": "exitEditor",
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
  "meta-b": "backwardToken",
  "home": "beginningOfLine",
  "end": "endOfLine",
  "delete": "deleteChar",
  "backspace": "backwardDeleteChar",
  "enter": "acceptLine",
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
  ensureLine(lineIdx)
  const current = lineText(lines[lineIdx]);
  const before = current.slice(0, colIdx);
  const after = current.slice(colIdx);
  const next = before + text + after;
  setLineText(lineIdx, next);
  colIdx += text.length;
  renderPrompt();
}

/* ---------------- Input loop ---------------- */
process.stdin.on("data", (chunk: string) => {
  const tokens: EventToken[] = tokenize(chunk);
  for (const t of tokens) {
    if (t.kind === "key") {
      const actionName = DEFAULT_KEYMAP[t.name];
      const action = actionName && ACTIONS[actionName];
      if (action) action();
    } else {
      insertText(t.text);
    }
  }
});

// Initial draw
renderPrompt();
