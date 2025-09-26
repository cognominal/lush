
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";

process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");

const RED = "\x1b[31m";
const RESET = "\x1b[0m";

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
    } catch {}
  }
  return null;
}

/* ---------------- Editor state ---------------- */
let lines: string[] = [""];
let lineIdx = 0;
let colIdx = 0;

const history: string[] = [];
let histIdx = -1; // -1: no history selection

/* ---------------- Rendering (zsh-style: always at bottom) ---------------- */
function highlightFirstWord(line: string): string {
  const m = line.match(/^(\S+)(.*)$/);
  if (!m) return line;
  const [_, first, rest] = m;
  return isExecutableOnPath(first) ? `${RED}${first}${RESET}${rest}` : line;
}

/**
 * Repaint only the prompt block at the bottom.
 * Strategy:
 *  1) Jump to bottom (CSI 999B).
 *  2) Move up (promptHeight-1) lines to the first prompt line.
 *  3) For each visual line: clear the line, write content, newline (except last).
 *  4) Move the cursor up to the target row and set the column.
 */
function renderPrompt() {
  const visual = lines.map((ln, i) => {
    const prefix = i === 0 ? "> " : "| ";
    const body = i === 0 ? highlightFirstWord(ln) : ln;
    return prefix + body;
  });
  const h = Math.max(1, visual.length);

  // 1) go to bottom
  process.stdout.write("\x1b[999B"); // clamp to last row

  // 2) go up to the first prompt row so the block occupies the bottom h rows
  if (h > 1) process.stdout.write(`\x1b[${h - 1}A`);
  readline.cursorTo(process.stdout, 0);

  // 3) draw each line, clearing to avoid leftovers
  for (let i = 0; i < h; i++) {
    readline.clearLine(process.stdout, 0); // clear entire line
    process.stdout.write(visual[i] ?? "");
    if (i < h - 1) process.stdout.write("\n");
  }

  // 4) place cursor to row/col inside the block (relative from current bottom block)
  const cursorRow = Math.min(Math.max(0, lineIdx), h - 1);
  const cursorCol = 2 + Math.min(Math.max(0, colIdx), (lines[cursorRow] ?? "").length);
  const up = (h - 1) - cursorRow;
  if (up > 0) process.stdout.write(`\x1b[${up}A`);
  readline.cursorTo(process.stdout, cursorCol);
}

/* ---------------- History ---------------- */
function loadHistory(idx: number) {
  if (idx < 0 || idx >= history.length) {
    resetBuffer();
    return;
  }
  const entry = history[idx];
  lines = entry.split("\n");
  lineIdx = Math.min(lineIdx, lines.length - 1);
  colIdx = Math.min(colIdx, lines[lineIdx].length);
  histIdx = idx;
}

function currentFirstWord(): string {
  const m = lines[0].match(/^(\S+)/);
  return m ? m[1] : "";
}

/* ---------------- Movement helpers ---------------- */
function moveLeft() {
  if (colIdx > 0) { colIdx--; return; }
  if (lineIdx > 0) {
    lineIdx--;
    colIdx = lines[lineIdx].length;
  }
}
function moveRight() {
  if (colIdx < lines[lineIdx].length) { colIdx++; return; }
  if (lineIdx < lines.length - 1) {
    lineIdx++;
    colIdx = 0;
  }
}
function previousLine() {
  if (lineIdx > 0) {
    lineIdx--;
    colIdx = Math.min(colIdx, lines[lineIdx].length);
  }
}
function nextLine() {
  if (lineIdx < lines.length - 1) {
    lineIdx++;
    colIdx = Math.min(colIdx, lines[lineIdx].length);
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
  const lastLine = lines[lineIdx];
  if (lastLine.endsWith("\\")) {
    lines[lineIdx] = lastLine.slice(0, -1);
    lines.splice(lineIdx + 1, 0, "");
    lineIdx++;
    colIdx = 0;
    renderPrompt();
    return;
  }

  const full = lines.join("\n").trimEnd();

  // Push the prompt block up by starting a new line before output
  process.stdout.write("\n");

  if (full.length > 0) {
    history.push(full);
    histIdx = -1;
  }

  const first = currentFirstWord();
  const exe = isExecutableOnPath(first);

  if (exe) {
    const args = full.replace(/\n+/g, " ").trim().split(/\s+/);
    const [cmd, ...rest] = args;
    const child = spawn(cmd, rest, { stdio: "inherit" });
    child.on("exit", () => {
      process.stdout.write("\n");
      resetBuffer();
      renderPrompt();
    });
  } else {
    process.stdout.write(`echo: ${full}\n`);
    resetBuffer();
    renderPrompt();
  }
}

function resetBuffer() {
  lines = [""];
  lineIdx = 0;
  colIdx = 0;
}

/* ---------------- Actions ---------------- */
function exitEditor() {
  process.stdout.write("\n");
  process.exit(130); // typical for SIGINT
}
function deleteOrEOF() {
  if (lines.length === 1 && lines[0].length === 0) {
    process.stdout.write("\n");
    process.exit(0);
  } else {
    const ln = lines[lineIdx];
    if (colIdx < ln.length) {
      lines[lineIdx] = ln.slice(0, colIdx) + ln.slice(colIdx + 1);
    }
    renderPrompt();
  }
}
function beginningOfLine() { colIdx = 0; renderPrompt(); }
function endOfLine() { colIdx = lines[lineIdx].length; renderPrompt(); }
function backwardChar() { moveLeft(); renderPrompt(); }
function forwardChar() { moveRight(); renderPrompt(); }
function previousLineAction() { previousLine(); renderPrompt(); }
function nextLineAction() { nextLine(); renderPrompt(); }
function previousHistoryAction() { previousHistory(); renderPrompt(); }
function nextHistoryAction() { nextHistory(); renderPrompt(); }
function deleteChar() {
  const ln = lines[lineIdx];
  if (colIdx < ln.length) {
    lines[lineIdx] = ln.slice(0, colIdx) + ln.slice(colIdx + 1);
    renderPrompt();
  }
}
function backwardDeleteChar() {
  const ln = lines[lineIdx];
  if (colIdx > 0) {
    lines[lineIdx] = ln.slice(0, colIdx - 1) + ln.slice(colIdx);
    colIdx--;
  } else if (lineIdx > 0) {
    const prevLen = lines[lineIdx - 1].length;
    lines[lineIdx - 1] += ln;
    lines.splice(lineIdx, 1);
    lineIdx--;
    colIdx = prevLen;
  }
  renderPrompt();
}
function acceptLine() { submit(); }
function clearScreen() {
  // Clear screen + home, prompt will redraw at bottom next
  process.stdout.write("\x1b[2J\x1b[H");
  renderPrompt();
}
function killLineEnd() {
  lines[lineIdx] = lines[lineIdx].slice(0, colIdx);
  renderPrompt();
}
function killLineBeginning() {
  lines[lineIdx] = lines[lineIdx].slice(colIdx);
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
  previousLineAction,
  nextLineAction,
  previousHistoryAction,
  nextHistoryAction,
  deleteChar,
  backwardDeleteChar,
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
  "ctrl-l": "clearScreen",
  "ctrl-k": "killLineEnd",
  "ctrl-u": "killLineBeginning",
  "left": "backwardChar",
  "right": "forwardChar",
  "up": "previousLineAction",   // arrows move within buffer
  "down": "nextLineAction",
  "ctrl-p": "previousHistoryAction", // history on C-p/C-n
  "ctrl-n": "nextHistoryAction",
  "home": "beginningOfLine",
  "end": "endOfLine",
  "delete": "deleteChar",
  "backspace": "backwardDeleteChar",
  "enter": "acceptLine",
};

/* ---------------- Tokenizer ---------------- */
type Token = { kind: "key"; name: string } | { kind: "text"; text: string };
function tokenize(input: string): Token[] {
  const out: Token[] = [];
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
  const ln = lines[lineIdx];
  lines[lineIdx] = ln.slice(0, colIdx) + text + ln.slice(colIdx);
  colIdx += text.length;
  renderPrompt();
}

/* ---------------- Input loop ---------------- */
process.stdin.on("data", (chunk: string) => {
  const tokens = tokenize(chunk);
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
