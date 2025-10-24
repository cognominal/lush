//  multi-line editor 
//
// it use raw state but does not disturb anything on top of the curosr
//  A line is composed of tokens 
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  initFromYAMLFile,
  setTokenMode,
  prompt as buildPrompt,
  shouldSubmitOnEmptyLastLine,
  collectFirstTokenCandidates,
  type CompletionCandidate,
  type CompletionTokenMetadata,
  type CompletionStageProgress,
  getCommandSummary,
  clearTerminal,
} from "./index.ts";
import {
  computeCompletionLayout,
  buildCompletionGrid,
  navigateCompletionIndex,
  type CompletionLayout,
  type CompletionGrid,
  type CompletionDirection,
} from "./index.ts";
import {
  insertTextIntoTokenLine,
  deleteRangeFromTokenLine,
  splitTokenLineAt,
  normalizeTokenLineInPlace,
} from "./index.ts";
import {
  rotateTokenType,
  sortedValidTokens,
  promoteSpaceFromNakedString,
  SPACE_TYPE,
  DEFAULT_TEXT_TYPE,
  formatStatusLine,
} from "./index.ts";

export enum Mode {
  Sh = "Sh",
  Expr = "Expr"
}

export let mode: Mode = Mode.Sh

export function setMode(m: Mode) {
  if (mode === m) return;
  mode = m;
  setTokenMode(m);
}

/* ---------------- PATH / executables ---------------- */
const PATH_DIRS = (process.env.PATH ?? "")
  .split(path.delimiter)
  .filter(Boolean);
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

const DOUBLE_SPACE_THRESHOLD_MS = 350;
let pendingSpaceCount = 0;
let lastSpaceAt = 0;

const SHELL_START_DIR = process.cwd();
const CTX_WRITE_LOG = path.join(SHELL_START_DIR, "ctx-write.log");
let ctxWriteLogPrepared = false;
const LANG_YAML_PATH = fileURLToPath(new URL("../lang.yml", import.meta.url));
let lastYamlFileMtimeMs = Number.NEGATIVE_INFINITY;
const MAX_COMPLETION_ROWS = 5;

let statusSummaryCommand: string | null = null;
let statusSummaryValue: string | null = null;
let statusSummaryLoading = false;
let statusSummaryRequestId = 0;

interface CompletionSession {
  candidates: CompletionCandidate[];
  activeIndex: number;
  originalToken: InputToken | null;
  originalText: string;
  originalType?: string;
  originalCompletion?: CompletionTokenMetadata;
  createdToken: boolean;
  lineIndex: number;
  lastAppliedIndex: number;
  showAll: boolean;
  awaitingOverflowConfirm: boolean;
  fullDisplayRows: number;
  grid: CompletionGrid;
  displayMode: "grid" | "list";
  plainOverflow: boolean;
}

let completionSession: CompletionSession | null = null;
let completionLoading = false;
let lastRenderInteractiveHeight = 0;
const COMPLETION_SPINNER_FRAMES = ["-", "\\", "|", "/"] as const;
const COMPLETION_SPINNER_INTERVAL_MS = 120;
const COMPLETION_SPINNER_COLORS = [
  (value: string) => chalk.cyanBright(value),
  (value: string) => chalk.magentaBright(value),
  (value: string) => chalk.blueBright(value),
  (value: string) => chalk.greenBright(value),
] as const;

interface CompletionGenerationState {
  active: boolean;
  label: string;
  index: number;
  total: number;
  spinner: number;
  interval: NodeJS.Timeout | null;
}

const completionGenerationState: CompletionGenerationState = {
  active: false,
  label: "initializing",
  index: 0,
  total: 0,
  spinner: 0,
  interval: null,
};

function startCompletionGeneration(): void {
  stopCompletionGeneration();
  completionGenerationState.active = true;
  completionGenerationState.label = "initializing";
  completionGenerationState.index = 0;
  completionGenerationState.total = 0;
  completionGenerationState.spinner = 0;
  completionGenerationState.interval = setInterval(() => {
    if (!completionGenerationState.active) return;
    completionGenerationState.spinner =
      (completionGenerationState.spinner + 1) %
      COMPLETION_SPINNER_FRAMES.length;
    renderMline();
  }, COMPLETION_SPINNER_INTERVAL_MS);
  renderMline();
}

function updateCompletionGenerationStage(
  progress: CompletionStageProgress,
): void {
  if (!completionGenerationState.active) return;
  completionGenerationState.label = progress.label;
  completionGenerationState.index = progress.index;
  completionGenerationState.total = progress.total;
  renderMline();
}

function stopCompletionGeneration(): void {
  const timer = completionGenerationState.interval;
  if (timer) clearInterval(timer);
  completionGenerationState.interval = null;
  completionGenerationState.active = false;
  completionGenerationState.label = "initializing";
  completionGenerationState.index = 0;
  completionGenerationState.total = 0;
  completionGenerationState.spinner = 0;
}

function completionGenerationStatusLine(): string | null {
  if (!completionGenerationState.active) return null;
  const spinnerFrame =
    COMPLETION_SPINNER_FRAMES[
      completionGenerationState.spinner %
        COMPLETION_SPINNER_FRAMES.length
    ];
  const colorFn =
    COMPLETION_SPINNER_COLORS[
      completionGenerationState.spinner %
        COMPLETION_SPINNER_COLORS.length
    ];
  const label =
    completionGenerationState.label || "initializing";
  const prefix = chalk.dim("completion output generation");
  const spinnerText = colorFn(spinnerFrame);
  const stageText = colorFn(chalk.bold(label));
  const total = completionGenerationState.total;
  const index = Math.min(
    completionGenerationState.index,
    total,
  );
  const countText =
    total > 0
      ? chalk.dim(` (${index}/${total})`)
      : "";
  return `${prefix} ${spinnerText} ${stageText}${countText}`.trim();
}

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

function initFromYAMLfileIfchanged(force = false) {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(LANG_YAML_PATH);
  } catch (error) {
    if (force) throw error;
    return;
  }
  const currentMtime = stats.mtimeMs;
  if (!force && currentMtime <= lastYamlFileMtimeMs) return;
  initFromYAMLFile();
  lastYamlFileMtimeMs = currentMtime;
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

function refreshLinePositions(line: TokenLine): void {
  let cursor = 0;
  for (let i = 0; i < line.length; i++) {
    const token = line[i];
    if (!token) continue;
    token.tokenIdx = i;
    token.x = cursor;
    cursor += tokenText(token).length;
  }
}

function firstTokenLocation(): { token: InputToken | null; lineIndex: number } {
  for (let i = 0; i < lines.length; i++) {
    const line = ensureLine(i);
    for (const token of line) {
      if (!token || token.type === SPACE_TYPE) continue;
      return { token, lineIndex: i };
    }
  }
  ensureLine(0);
  return { token: null, lineIndex: 0 };
}

function formatCompletionCandidate(
  candidate: CompletionCandidate,
  isActive: boolean,
): string {
  const highlighter = getHighlighter(candidate.tokenType);
  const rendered = highlighter(candidate.value);
  return isActive ? chalk.inverse(rendered) : rendered;
}

function estimateCompletionGridWidth(
  candidates: CompletionCandidate[],
  layout: CompletionLayout,
): number {
  if (!candidates.length) return 0;
  if (!layout.columns || layout.columns <= 0) return 0;
  const columnWidth = Math.max(
    1,
    Math.max(...candidates.map(candidate => candidate.value.length)) + 2,
  );
  return columnWidth * layout.columns;
}

function currentTerminalWidth(): number {
  return typeof process.stdout.columns === "number"
    ? Math.max(0, process.stdout.columns ?? 0)
    : 0;
}

function updateCompletionSessionLayout(session: CompletionSession): void {
  const total = session.candidates.length;
  const fullLayout = computeCompletionLayout(
    total,
    Number.POSITIVE_INFINITY,
  );
  const requiredWidth = estimateCompletionGridWidth(
    session.candidates,
    fullLayout,
  );
  const terminalWidth = currentTerminalWidth();
  const needsRowExpansion = fullLayout.rows > MAX_COMPLETION_ROWS;
  const requiresList = terminalWidth > 0 && requiredWidth > terminalWidth;
  const needsConfirmation = needsRowExpansion || requiresList;
  const shouldShowAll = session.showAll || !needsConfirmation;

  session.showAll = shouldShowAll;
  session.awaitingOverflowConfirm = needsConfirmation && !session.showAll;
  session.plainOverflow = requiresList;
  session.fullDisplayRows = requiresList ? total : fullLayout.rows;
  session.displayMode = requiresList ? "list" : "grid";

  if (session.displayMode === "grid") {
    syncCompletionGrid(session);
  } else {
    session.grid = [];
  }
}

function readAnsiSequence(
  text: string,
  start: number,
): { value: string; length: number } | null {
  if (text[start] !== "\u001b" || start >= text.length - 1) return null;
  let end = start + 1;
  const second = text[end];
  const allowedSecond =
    second === "[" ||
    second === "]" ||
    second === "(" ||
    second === ")" ||
    second === "O" ||
    second === "P";
  if (!allowedSecond) {
    return null;
  }
  end++;
  while (end < text.length) {
    const code = text.charCodeAt(end);
    if (code >= 0x40 && code <= 0x7e) {
      end++;
      return { value: text.slice(start, end), length: end - start };
    }
    end++;
  }
  return { value: text.slice(start), length: text.length - start };
}

function truncateAnsi(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  let visible = 0;
  let index = 0;
  let truncated = false;
  let output = "";

  while (index < text.length) {
    if (text[index] === "\u001b") {
      const sequence = readAnsiSequence(text, index);
      if (sequence) {
        output += sequence.value;
        index += sequence.length;
        continue;
      }
    }
    if (visible >= maxWidth) {
      truncated = true;
      break;
    }
    const code = text.codePointAt(index) ?? 0;
    const length = code > 0xffff ? 2 : 1;
    output += text.slice(index, index + length);
    visible++;
    index += length;
    if (visible >= maxWidth && index < text.length) {
      truncated = true;
      break;
    }
  }

  if (truncated) {
    output += "\u001b[0m";
  }

  return output;
}

function buildCompletionInteractiveLines(session: CompletionSession): string[] {
  if (!session.candidates.length) return [];
  if (session.awaitingOverflowConfirm && !session.showAll) {
    const firstLine =
      `lish: do you wish to see all ${session.candidates.length} ` +
      `possibilities (${session.fullDisplayRows} lines)?`;
    const secondLine =
      "Typing y (no return needed) will show the whole table.";
    return [firstLine, secondLine];
  }
  if (
    session.displayMode === "list" &&
    session.showAll &&
    !session.awaitingOverflowConfirm
  ) {
    return session.candidates.map((candidate, index) =>
      formatCompletionCandidate(
        candidate,
        index === session.activeIndex,
      ),
    );
  }
  const layout = syncCompletionGrid(session);

  const columnWidth = Math.max(
    1,
    Math.max(...session.candidates.map(c => c.value.length)) + 2,
  );
  const rows = layout.rows;
  const columns = layout.columns;
  const lines: string[] = Array.from({ length: rows }, () => "");

  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      const index = column * rows + row;
      if (index >= session.candidates.length) break;
      const candidate = session.candidates[index];
      const formatted = formatCompletionCandidate(
        candidate,
        index === session.activeIndex,
      );
      const padding = Math.max(0, columnWidth - candidate.value.length);
      const display = formatted + " ".repeat(padding);
      lines[row] = (lines[row] ?? "") + display;
    }
  }

  return lines.map(line => line.trimEnd());
}

function describeCandidateMetadata(
  candidate: CompletionCandidate | undefined,
  total: number,
  session: CompletionSession,
): string | null {
  if (!candidate) {
    if (session.awaitingOverflowConfirm && !session.showAll) {
      return `Completion: ${total} matches — press y to list all.`;
    }
    return `Completion: ${total} matches`;
  }
  const { metadata } = candidate;
  if (metadata.kind === "Command" && metadata.summary) {
    return `Command: ${metadata.summary}`;
  }
  const highlighter = getHighlighter(candidate.tokenType);
  const typeLabel = highlighter(metadata.kind);
  let detail = "";
  switch (metadata.kind) {
    case "Builtin":
      detail = metadata.helpText
        ? `${candidate.value}: ${metadata.helpText}`
        : candidate.value;
      break;
    case "Command":
      detail = metadata.summary
        ? `${candidate.value}: ${metadata.summary}`
        : metadata.description ?? candidate.value;
      break;
    case "Folder":
      detail = metadata.previewEntry
        ? `${candidate.value}/ → ${metadata.previewEntry}`
        : `${candidate.value}/`;
      break;
    case "SnippetTrigger":
      detail = metadata.description
        ? `${candidate.value}: ${metadata.description}`
        : metadata.snippetName ?? candidate.value;
      break;
    case "TypeScriptSymbol":
      detail = metadata.symbolType
        ? `${candidate.value}: ${metadata.symbolType}`
        : candidate.value;
      break;
    default:
      detail = "";
  }
  const info = detail ? `— ${detail}` : "";
  return `Completion ${typeLabel} ${info}`.trim();
}

function syncCompletionGrid(session: CompletionSession): CompletionLayout {
  const maxRows = session.showAll
    ? Number.POSITIVE_INFINITY
    : MAX_COMPLETION_ROWS;
  const layout = computeCompletionLayout(
    session.candidates.length,
    maxRows,
  );
  session.grid = buildCompletionGrid(layout, session.candidates.length);
  return layout;
}

function ensureCompletionToken(
  session: CompletionSession,
): { token: InputToken; line: TokenLine } {
  let line = ensureLine(session.lineIndex);
  let token = session.originalToken;
  if (token && !line.includes(token)) {
    const located = firstTokenLocation();
    line = ensureLine(located.lineIndex);
    token = located.token;
    session.lineIndex = located.lineIndex;
    session.originalToken = token;
    session.createdToken = !token;
  }
  if (!token) {
    const placeholder: InputToken = {
      type: DEFAULT_TEXT_TYPE,
      tokenIdx: 0,
      text: session.originalText,
      x: 0,
    };
    line.splice(0, 0, placeholder);
    refreshLinePositions(line);
    session.originalToken = placeholder;
    session.createdToken = true;
    token = placeholder;
  }
  return { token, line };
}

function applyCompletionCandidate(index: number): void {
  const session = completionSession;
  if (!session) return;
  const candidate = session.candidates[index];
  if (!candidate) return;
  const { token, line } = ensureCompletionToken(session);
  token.type = candidate.tokenType;
  token.text = candidate.value;
  delete token.subTokens;
  token.completion = candidate.metadata;
  refreshLinePositions(line);
  session.activeIndex = index;
  session.lastAppliedIndex = index;
  lineIdx = session.lineIndex;
  colIdx = tokenText(token).length;
  resetSpaceSequence();
}

function ensureTrailingSpace(
  token: InputToken,
  line: TokenLine,
  lineIndex: number,
): void {
  const tokenIndex = line.indexOf(token);
  if (tokenIndex === -1) return;
  const next = line[tokenIndex + 1];
  if (!next || next.type !== SPACE_TYPE) {
    line.splice(tokenIndex + 1, 0, {
      type: SPACE_TYPE,
      tokenIdx: 0,
      text: " ",
      x: 0,
    });
  } else if (typeof next.text === "string") {
    next.text = next.text.startsWith(" ") ? next.text : ` ${next.text}`;
  } else {
    next.text = " ";
  }
  refreshLinePositions(line);
  lineIdx = lineIndex;
  const targetCol = tokenText(token).length + 1;
  colIdx = Math.min(targetCol, lineLength(line));
}

function clearCompletionSession(
  options?: { restoreOriginal?: boolean; skipRender?: boolean },
) {
  const session = completionSession;
  if (!session) return;
  const restore = options?.restoreOriginal ?? false;
  if (restore && session.originalToken) {
    const line = ensureLine(session.lineIndex);
    if (session.createdToken) {
      const idx = line.indexOf(session.originalToken);
      if (idx !== -1) {
        line.splice(idx, 1);
        refreshLinePositions(line);
        lineIdx = session.lineIndex;
        colIdx = Math.min(colIdx, lineLength(line));
      }
    } else {
      session.originalToken.type =
        session.originalType ?? session.originalToken.type;
      session.originalToken.text = session.originalText;
      if (session.originalCompletion) {
        session.originalToken.completion = session.originalCompletion;
      } else {
        delete session.originalToken.completion;
      }
      refreshLinePositions(line);
      lineIdx = session.lineIndex;
      colIdx = Math.min(lineLength(line), session.originalText.length);
    }
  }
  completionSession = null;
  if (!options?.skipRender) {
    renderMline();
  }
}

function completionActive(): boolean {
  return Boolean(completionSession);
}

function moveCompletionSelection(
  direction: CompletionDirection,
): boolean {
  const session = completionSession;
  if (!session || !session.candidates.length) return false;
  if (session.displayMode === "list") {
    process.stdout.write("\u0007");
    return true;
  }
  if (session.awaitingOverflowConfirm && !session.showAll) {
    process.stdout.write("\u0007");
    return true;
  }
  if (!session.grid.length) {
    syncCompletionGrid(session);
  }
  if (!session.grid.length) return false;
  if (session.activeIndex === -1) {
    applyCompletionCandidate(0);
    renderMline();
    return true;
  }
  const nextIndex = navigateCompletionIndex(
    session.activeIndex,
    direction,
    session.grid,
  );
  if (nextIndex === null || nextIndex === session.activeIndex) {
    process.stdout.write("\u0007");
    return true;
  }
  applyCompletionCandidate(nextIndex);
  renderMline();
  return true;
}

function commitCompletionSelection(): boolean {
  const session = completionSession;
  if (!session || session.activeIndex < 0) return false;
  if (session.displayMode === "list") {
    process.stdout.write("\u0007");
    return true;
  }
  if (session.awaitingOverflowConfirm && !session.showAll) {
    process.stdout.write("\u0007");
    return true;
  }
  applyCompletionCandidate(session.activeIndex);
  const { token, line } = ensureCompletionToken(session);
  ensureTrailingSpace(token, line, session.lineIndex);
  completionSession = null;
  renderMline();
  return true;
}

async function handleCompletionTrigger(): Promise<void> {
  if (completionLoading) return;
  if (completionSession) {
    if (!completionSession.candidates.length) {
      process.stdout.write("\u0007");
      return;
    }
    if (
      completionSession.awaitingOverflowConfirm &&
      completionSession.showAll === false
    ) {
      process.stdout.write("\u0007");
      return;
    }
    if (completionSession.displayMode === "list") {
      process.stdout.write("\u0007");
      return;
    }
    if (completionSession.activeIndex === -1) {
      applyCompletionCandidate(0);
    } else {
      process.stdout.write("\u0007");
    }
    renderMline();
    return;
  }

  completionLoading = true;
  startCompletionGeneration();
  try {
    const candidates = await collectFirstTokenCandidates(
      {
        lines,
      },
      {
        onStage(progress: CompletionStageProgress) {
          updateCompletionGenerationStage(progress);
        },
      },
    );
    if (!candidates.length) {
      process.stdout.write("\u0007");
      return;
    }
    const location = firstTokenLocation();
    completionSession = {
      candidates,
      activeIndex: -1,
      originalToken: location.token,
      originalText: location.token ? tokenText(location.token) : "",
      originalType: location.token?.type,
      originalCompletion: location.token?.completion,
      createdToken: !location.token,
      lineIndex: location.lineIndex,
      lastAppliedIndex: -1,
      showAll: false,
      awaitingOverflowConfirm: false,
      fullDisplayRows: 0,
      grid: [],
      displayMode: "grid",
      plainOverflow: false,
    };
    updateCompletionSessionLayout(completionSession);
    if (completionSession.showAll && completionSession.candidates.length) {
      completionSession.activeIndex = 0;
      applyCompletionCandidate(0);
      completionSession.lastAppliedIndex = 0;
    } else {
      completionSession.activeIndex = -1;
      completionSession.lastAppliedIndex = -1;
    }
  } finally {
    completionLoading = false;
    stopCompletionGeneration();
    renderMline();
  }
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

function stripBackgroundIndicator(
  args: string[],
  background: boolean,
): string[] {
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
  const completionLines = completionSession
    ? buildCompletionInteractiveLines(completionSession)
    : [];
  return Math.max(1, active.length + completionLines.length + 1);
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
 *  3) For each visual line: clear the line, write content,
 *     newline (except last).
 *  4) Move the cursor up to the target row and set the column.
 */
function renderMline() {
  const currentLine = getLine(lineIdx);
  colIdx = Math.min(colIdx, lineLength(currentLine));
  const activeLines = promptActiveLines();
  const promptText = buildPrompt(history.length + 1);
  const continuationPrefix = "| ";
  const continuationLength = continuationPrefix.length;
  const prefixes: string[] = activeLines.map((_, i) =>
    i === 0 ? promptText : continuationPrefix,
  );
  const prefixLengths: number[] = activeLines.map((_, i) =>
    i === 0 ? promptText.length : continuationLength,
  );
  const visualLines: string[] = activeLines.map((ln, i) => {
    const body = i === 0 ? highlightFirstWord(ln) : renderLine(ln);
    return prefixes[i] + body;
  });
  const promptLineCount = Math.max(1, visualLines.length);

  const { token: activeToken, index: activeIndex } = currentTokenInfo();
  const currentTokenIdx = activeIndex >= 0 ? activeIndex : null;
  const currentTokenText = activeToken ? tokenText(activeToken) : null;
  const currentTokenLen =
    currentTokenText != null ? currentTokenText.length : null;
  const validTypes = sortedValidTokens(activeToken);
  const completionLines = completionSession
    ? buildCompletionInteractiveLines(completionSession)
    : [];
  const completionStatus = completionSession
    ? describeCandidateMetadata(
        completionSession.activeIndex >= 0
          ? completionSession.candidates[completionSession.activeIndex]
          : undefined,
        completionSession.candidates.length,
        completionSession,
      )
    : null;
  const summaryText = resolveStatusLineSummary(activeToken);
  const baseStatusLine = formatStatusLine({
    modeLabel: mode,
    currentTokenType: activeToken?.type,
    currentTokenIndex: currentTokenIdx,
    currentTokenLength: currentTokenLen,
    currentTokenText,
    validTypes,
  });
  const baseStatusWithSummary = summaryText
    ? `${baseStatusLine}  ${chalk.bold('tldr:')} ${summaryText}`
    : baseStatusLine;
  let statusLine = baseStatusWithSummary;
  const generationStatus = completionGenerationStatusLine();
  if (generationStatus) {
    statusLine = generationStatus;
  } else if (completionSession) {
    if (completionSession.activeIndex >= 0 && completionStatus) {
      statusLine = completionStatus;
    } else if (completionStatus) {
      statusLine = `${baseStatusWithSummary}  ${completionStatus}`;
    }
  }

  const interactiveLines: string[] = [...visualLines];
  if (completionLines.length) {
    interactiveLines.push(...completionLines);
  }
  const interactiveHeight = Math.max(1, interactiveLines.length);
  const renderInteractiveHeight = Math.max(
    interactiveHeight,
    lastRenderInteractiveHeight,
  );
  const ttyRows =
    typeof process.stdout.rows === "number" ? process.stdout.rows ?? 0 : 0;
  const ttyCols = currentTerminalWidth();
  const canPinStatus = ttyRows > 0 && interactiveHeight < ttyRows;
  const statusRow = canPinStatus ? ttyRows - 1 : interactiveHeight;
  const statusTargetRow =
    ttyRows > 0 ? Math.min(statusRow, Math.max(ttyRows - 1, 0)) : statusRow;

  readline.cursorTo(process.stdout, 0, 0);

  const maxRows =
    ttyRows > 0
      ? Math.min(renderInteractiveHeight, Math.max(ttyRows - 1, 0))
      : renderInteractiveHeight;

  for (let i = 0; i < maxRows; i++) {
    readline.clearLine(process.stdout, 0);
    const nextLine =
      i < interactiveLines.length ? interactiveLines[i] ?? "" : "";
    process.stdout.write(nextLine);
    if (i < maxRows - 1) {
      process.stdout.write("\n");
    }
  }

  if (ttyRows > 0) {
    readline.cursorTo(process.stdout, 0, maxRows);
  } else {
    readline.cursorTo(process.stdout, 0);
  }
  readline.clearScreenDown(process.stdout);

  const renderedStatus =
    ttyCols > 0 ? truncateAnsi(statusLine, ttyCols) : statusLine;
  if (ttyRows > 0) {
    readline.cursorTo(process.stdout, 0, statusTargetRow);
  } else {
    const offset = Math.max(statusTargetRow - maxRows + 1, 0);
    if (offset > 0) {
      readline.moveCursor(process.stdout, 0, offset);
    }
    readline.cursorTo(process.stdout, 0);
  }
  readline.clearLine(process.stdout, 0);
  process.stdout.write(renderedStatus);

  const cursorRow = Math.min(Math.max(0, lineIdx), promptLineCount - 1);
  const cursorLine = activeLines[cursorRow] ?? [];
  const cursorPrefixLen = prefixLengths[cursorRow] ?? promptText.length;
  const cursorCol =
    cursorPrefixLen +
    Math.min(Math.max(0, colIdx), lineLength(cursorLine));
  const cursorTargetRow =
    ttyRows > 0
      ? Math.min(cursorRow, Math.max(statusTargetRow - 1, 0))
      : cursorRow;
  readline.cursorTo(process.stdout, cursorCol, cursorTargetRow);

  lastRenderInteractiveHeight = interactiveHeight;
}

/* ---------------- History ---------------- */
function loadHistory(idx: number) {
  clearCompletionSession({ restoreOriginal: false, skipRender: true });
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

function resetStatusSummaryState(): void {
  statusSummaryCommand = null;
  statusSummaryValue = null;
  statusSummaryLoading = false;
  statusSummaryRequestId = 0;
}

function resolveStatusLineSummary(
  token: InputToken | undefined,
): string | null {
  const metadata = token?.completion;
  if (metadata?.kind === "Command" && metadata.summary) {
    const label = token ? tokenText(token) : metadata.label;
    statusSummaryCommand = label || metadata.label;
    statusSummaryValue = metadata.summary;
    statusSummaryLoading = false;
    return statusSummaryValue;
  }

  const firstWord = currentFirstWord();
  if (!firstWord) {
    resetStatusSummaryState();
    return null;
  }

  if (statusSummaryCommand === firstWord) {
    if (statusSummaryLoading) return null;
    return statusSummaryValue;
  }

  statusSummaryCommand = firstWord;
  statusSummaryValue = null;
  statusSummaryLoading = true;
  const requestId = ++statusSummaryRequestId;
  void getCommandSummary(firstWord)
    .then(summary => {
      if (statusSummaryRequestId !== requestId) return;
      statusSummaryValue = summary;
      statusSummaryLoading = false;
      renderMline();
    })
    .catch(() => {
      if (statusSummaryRequestId !== requestId) return;
      statusSummaryValue = null;
      statusSummaryLoading = false;
      renderMline();
    });
  return null;
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
function detectBackground(
  input: string,
): { command: string; background: boolean } {
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
  clearCompletionSession({ restoreOriginal: false, skipRender: true });
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
    const child = spawn(cmd, rest, {
      stdio: ["inherit", "pipe", "pipe"],
    }) as ChildProcess;
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
  clearCompletionSession({ restoreOriginal: false, skipRender: true });
  resetSpaceSequence()
  resetStatusSummaryState();
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
function beginningOfLine() {
  clearCompletionSession({ restoreOriginal: true, skipRender: true });
  colIdx = 0;
  renderMline();
}
function endOfLine() {
  clearCompletionSession({ restoreOriginal: true, skipRender: true });
  colIdx = lineLength(getLine(lineIdx));
  renderMline();
}
function backwardChar() {
  if (completionActive() && moveCompletionSelection("left")) return;
  moveLeft();
  renderMline();
}
function forwardChar() {
  if (completionActive() && moveCompletionSelection("right")) return;
  moveRight();
  renderMline();
}
function previousLineAction() {
  if (completionActive() && moveCompletionSelection("up")) return;
  previousLine();
  renderMline();
}
function nextLineAction() {
  if (completionActive() && moveCompletionSelection("down")) return;
  nextLine();
  renderMline();
}
function previousHistoryAction() {
  clearCompletionSession({ restoreOriginal: true, skipRender: true });
  previousHistory();
  renderMline();
}
function nextHistoryAction() {
  clearCompletionSession({ restoreOriginal: true, skipRender: true });
  nextHistory();
  renderMline();
}
function deleteChar() {
  clearCompletionSession({ restoreOriginal: true, skipRender: true });
  const line = ensureLine(lineIdx);
  if (colIdx < lineLength(line)) {
    deleteRangeFromTokenLine(line, colIdx, colIdx + 1);
    renderMline();
  }
}
function backwardDeleteChar() {
  clearCompletionSession({ restoreOriginal: true, skipRender: true });
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
  clearCompletionSession({ restoreOriginal: true, skipRender: true });
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
  clearCompletionSession({ restoreOriginal: true, skipRender: true });
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
function resetEnterSequence() {}
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
      ? Math.min(
          Math.max(colIdx - baseSpan.start, 0),
          baseSpan.end - baseSpan.start,
        )
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
      entry.start <= insertionColumn &&
      insertionColumn < entry.end &&
      entry.token?.type === SPACE_TYPE,
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
  clearCompletionSession({ restoreOriginal: true, skipRender: true });
  resetSpaceSequence()
  const line = getLine(lineIdx);
  const tail = splitTokenLineAt(line, colIdx);
  lines.splice(lineIdx + 1, 0, tail);
  lineIdx++;
  colIdx = 0;
  renderMline();
}
function enterAction() {
  if (commitCompletionSelection()) return;
  const currentLine = getLine(lineIdx);
  const isEmptyLine = lineLength(currentLine) === 0;
  const isLastLine = lineIdx === lines.length - 1;

  if (isEmptyLine && isLastLine) {
    if (shouldSubmitOnEmptyLastLine(lines, lineIdx)) {
      acceptLine();
    } else if (lines.length === 1) {
      insertNewline();
    } else {
      process.stdout.write('\u0007');
      renderMline();
    }
    return;
  }

  insertNewline();
}
function acceptLine() {
  if (commitCompletionSelection()) return;
  resetEnterSequence();
  submit();
}
function clearScreen() {
  // Clear screen + home, prompt will redraw at bottom next
  clearTerminal(process.stdout);
  renderMline();
}
function killLineEnd() {
  clearCompletionSession({ restoreOriginal: true, skipRender: true });
  const line = getLine(lineIdx);
  const length = lineLength(line);
  if (colIdx < length) {
    deleteRangeFromTokenLine(line, colIdx, length);
  }
  renderMline();
}
function killLineBeginning() {
  clearCompletionSession({ restoreOriginal: true, skipRender: true });
  if (colIdx > 0) {
    const line = getLine(lineIdx);
    deleteRangeFromTokenLine(line, 0, colIdx);
    colIdx = 0;
  }
  renderMline();
}
function tabComplete() {
  void handleCompletionTrigger();
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
  tabComplete,
};

/* ---------------- Escape sequences → key names ---------------- */
const SEQ_TO_NAME: Record<string, string> = {
  "\r": "enter",
  "\n": "enter",
  "\u0009": "tab",
  // Command/Super + Enter (Ghostty, iTerm2, and terminals supporting
  // CSI-u modifiers)
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

/* ---------------- Default keymap (key name → action name) --------------- */
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
  "tab": "tabComplete",
};

/* ---------------- Input event string tokenizer ---------------- */
type EventToken =
  | { kind: "key"; name: string }
  | { kind: "text"; text: string };
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
  if (
    completionSession?.awaitingOverflowConfirm &&
    completionSession.showAll === false
  ) {
    const trimmed = text.trim();
    if (trimmed.toLowerCase() === "y") {
      completionSession.showAll = true;
      completionSession.awaitingOverflowConfirm = false;
      updateCompletionSessionLayout(completionSession);
      if (completionSession.candidates.length) {
        completionSession.activeIndex = 0;
        applyCompletionCandidate(0);
      }
      renderMline();
      return;
    }
    process.stdout.write("\u0007");
    return;
  }
  if (completionSession) {
    clearCompletionSession({ restoreOriginal: true, skipRender: true });
  }
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

process.on("SIGWINCH", () => {
  if (completionSession) {
    updateCompletionSessionLayout(completionSession);
    if (completionSession.showAll && completionSession.candidates.length) {
      if (
        completionSession.activeIndex < 0 ||
        completionSession.activeIndex >= completionSession.candidates.length
      ) {
        completionSession.activeIndex = 0;
      }
      applyCompletionCandidate(completionSession.activeIndex);
    }
  }
  renderMline();
});

/* ---------------- Input loop ---------------- */
function handleInput(chunk: string) {
  initFromYAMLfileIfchanged();
  const tokens: EventToken[] = tokenize(chunk);
  for (const t of tokens) {
    if (t.kind === "key") {
      if (t.name !== "enter") resetEnterSequence();
      resetSpaceSequence();
      const actionName = DEFAULT_KEYMAP[t.name];
      if (
        inputLocked &&
        actionName &&
        actionName !== "interrupt" &&
        actionName !== "suspendCurrent"
      ) {
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
  initFromYAMLfileIfchanged(true);
  renderMline();

}

main()
