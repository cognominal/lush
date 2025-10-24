# Implementation Overview

## Root Files

- `README.md` — High level summary of lush, how to run it, and a roadmap of
  planned shell features.
- `AGENTS.md` — Working notes for contributors and agents, including build and
  testing commands plus style guidance.
- `Acorn-augmentations.md` — Captures how Acorn is extended for TypeScript and
  Svelte parsing to inform future AST work.
- `builtins.md` — Describes the builtin command set, their goals, and current
  implementation status.
- `builtins.ts` — Placeholder module kept at the project root; no runtime logic
  lives here yet (functions will be added when the root exports real helpers).
- `bun.lock` — Bun lockfile pinning dependency versions.
- `ctx-write.log` — Runtime log that records buffer output written by the shell
  for debugging.
- `Dockerfile` — Builds a container image that installs Bun, locks deps, and
  exposes a `lush` entrypoint.
- `err.txt` — Captured stderr from a sample `bun run src/editor.ts` session.
- `expr.md` — Reserved for expression language design; currently blank.
- `keybindings.md` — Human oriented list of editor keybindings mapped to action
  names.
- `lang.yml` — Declares token types, highlighting mappings, and special token
  rules used by `typeInit`.
- `out.txt` — Sample terminal transcript showing how the prompt is rendered.
- `package.json` — Bun/Node package manifest and script runners for the shell.
- `package.json.sv` — Secondary manifest snapshot without Bun-specific dev
  dependency pins.
- `plan.md` — Long form design plan covering lush language concepts and future
  milestones.
- `prompt.md` — Elevator pitch plus capability overview for the interactive
  editor.
- `tokens.md` — Narrative doc on the role of tokens and styling in lush.
- `tsconfig.json` — TypeScript compiler options (ESM mode, module resolution).
- `unparsing.md` — Notes on converting ASTs back into token lines.
- `vitest.config.ts` — Vitest setup.
  - Key settings: `defineConfig()` enables Node globals for tests; the coverage
    block exports v8 reporters; `resolve.alias` maps `@/` to `src/` for imports.

## lang.yml Data Flow

- `src/tokens.ts:initFromYAMLFile()` loads `lang.yml`, stores the parsed document
  in `YAMLdata`, and calls `initFromYAMLdata()` whenever the editor notices a
  file timestamp change.
- `initFromYAMLdata()` hydrates two core registries: `TokenMaps` (per-mode
  `TokenMapType`) and the active `tokenMap`. It also assembles `cachedHiliteFns`
  so new highlight functions can be swapped in alongside token metadata.
- `populateTokenMap()` iterates the YAML token specs, updating `TokenType`
  entries with `priority`, `secable`, `instances`, and derived validators. These
  entries populate `TokenMaps` before `applyActiveModeFromCache()` copies the
  data into the runtime `tokenMap`.
- `applyDefaultValidators()` and `applyHilites()` finalize the `tokenMap`
  entries. Any module that imports `tokenMap` (for example,
  `src/completionProvider.ts`) reads the same in-memory structure seeded from
  `lang.yml`.
- `src/completionProvider.ts:loadSnippetEntries()` re-parses `lang.yml` on demand
  to project snippet triggers into `snippetCache`. Completion metadata for
  `SnippetTrigger` tokens mirrors the YAML `what` field, while
  `resolveTokenType()` relies on the shared `tokenMap` to decide if a token type
  defined in YAML should surface as a completion candidate.

## Source Files (`src/`)

- `src/editor.ts` — CLI entry point and multiline editor managing input, prompt
  rendering, job control, and history.
  - Key functions: `renderMline()` repaints the prompt block with highlighted
    tokens; `submit()` executes builtins or spawns external commands while
    recording history; `handleInput()` tokenizes raw stdin bytes and dispatches
    mapped editing actions.
- `src/index.ts` — Barrel that re-exports helpers, tokens, job control, and
  builtin registries while importing `src/builtins.ts` for side effects.
  - Key exports: `tokenizeLine()` for tokenizing user input; `registerBuiltin()`
    to extend builtin commands; `typeInit()` to load token metadata on startup.
- `src/augmentedAcorn.ts` — Stub for future Acorn augmentation work.
  - Key function: `augmentAcorn()` currently throws because the augmentation
    layer is not implemented yet.
- `src/unparse.ts` — Placeholder for converting ASTs into token lines.
  - Key function: `unparse()` throws until unparsing logic lands.
- `src/builtins.ts` — Registers shared builtin helpers and exposes HTML
  formatting utilities.
  - Key functions: `escapeHtml()` escapes shell output for HTML; `chalkHtml()`
    converts Chalk ANSI sequences into styled HTML spans; `htmlHistoryCommand()`
    renders recent history as HTML via the `html` builtin.
- `src/yaml-serialize.ts` — Serializes token buffers for fixture exchange.
  - Key functions: `serializeTokenMultiLine()` emits YAML for token buffers;
    `deserializeTokenMultiLine()` loads YAML back into token shapes while
    validating structure; `mapToken()` normalizes plain objects into typed
    tokens.
- `src/jobControl.ts` — Manages background jobs spawned by the editor.
  - Key functions: `registerJob()` tracks child processes and wires lifecycle
    hooks; `findJob()` resolves user job specs like `%+` or numeric IDs;
    `resumeJobInForeground()` brings stopped jobs forward and waits on them.
- `src/tokenLine.ts` — Token utilities for converting text to typed segments.
  - Key functions: `tokenizeLine()` groups runs into tokens; `handleDoubleSpace`
    rewrites buffers when the user double-taps space; `collectArgumentTexts()`
    extracts arguments while skipping whitespace tokens.
- `src/tokens.ts` — Token registry and highlighting bootstrap.
  - Key functions: `registerToken()` stores token metadata; `typeInit()` reads
    `lang.yml` to seed priorities and highlighters; `getHighlighter()` resolves
    Chalk stylers for a token type.
- `src/helpers.ts` — String helpers for numeric and sigiled variable parsing.
  - Key functions: `isStrNumber()` validates numeric strings; `isStrVariable()`
    checks identifier + sigil patterns; `stripSigils()` removes sigil prefixes
    after validation.
- `src/history.ts` — History serialization and persistence helpers.
  - Key functions: `historyLineAsString()` flattens token history entries;
    `getHistoryFilePath()` resolves the JSONL path using env overrides;
    `loadHistoryEntries()` reads persisted history and filters malformed lines.
- `src/secureHash.ts` — Placeholder for hashing utilities.
  - Key function: `secureHash()` currently throws pending a secure hash
    implementation.
- `src/prompt.ts` — Builds the shell prompt string.
  - Key function: `prompt()` zero-pads the history counter and appends the CWD.

### Builtin Modules (`src/builtins/`)

- `src/builtins/registry.ts` — Stores builtin handlers and descriptions.
  - Key functions: `registerBuiltin()` adds handlers; `getBuiltin()` fetches a
    handler by name; `listBuiltins()` returns a sorted builtin name list.
- `src/builtins/helpFlags.ts` — Determines help verbosity flags.
  - Key functions: `detectHelpLevel()` inspects argv/raw strings for -h flags;
    `isSingleHelp()` convenience wrapper for single-level help; `isDoubleHelp()`
    treats -hh or separated flags as detailed help.
- `src/builtins/pathHelpers.ts` — Directory validation utilities for path
  aware builtins.
  - Key functions: `resolveDirectory()` expands ~ and verifies directories;
    `writeDirectoryError()` prints friendly directory errors;
    `writeCommandError()` prefixes unexpected failures with the command name.
- `src/builtins/directoryStack.ts` — In-memory directory stack used by pushd.
  - Key functions: `pushDirectory()` records the current working directory;
    `popDirectory()` restores the previous entry; `formatDirectoryStack()`
    prints the stack with the active directory first.
- `src/builtins/jobControl.ts` — Registers job-management builtins.
  - Key functions: `respondHelp()` centralizes help responses; the `jobs`
    handler lists tracked jobs; the `fg` handler resumes a job in the
    foreground.
- `src/builtins/dirs.ts` — Registers the `dirs` builtin that prints the stack.
  - Key handlers: `registerBuiltin("dirs", ...)` formats the stack or help;
    `registerBuiltinHelp("dirs", ...)` publishes summary text; help logic hinges
    on `detectHelpLevel()`.
- `src/builtins/pushd.ts` — Implements `pushd`.
  - Key functions: `resolveDirectory()` reuse verifies targets; the registered
    handler pushes the current directory then `chdir`s; error paths call
    `writeDirectoryError()` to report failures.
- `src/builtins/popd.ts` — Implements `popd`.
  - Key functions: The registered handler pops the stack and changes
    directories; it falls back with `pushDirectory()` when `chdir` fails;
    help responses reuse `detectHelpLevel()`.
- `src/builtins/clear.ts` — Implements `clear`.
  - Key functions: Handler emits ANSI clear sequence; help handling uses
    `detectHelpLevel()`; `registerBuiltinHelp()` describes the command.
- `src/builtins/mkdir.ts` — Implements `mkdir` and `mkcd`.
  - Key functions: `expandPath()` handles HOME expansion; `ensureDirectory()`
    wraps `fs.mkdirSync` with friendly errors; the `mkcd` handler changes into
    the new directory after creation.
- `src/builtins/cd.ts` — Implements `cd`.
  - Key functions: Handler validates argument count; `resolveDirectory()` picks
    the target path; help output is gated by `detectHelpLevel()`.
- `src/builtins/history.ts` — Implements the `history` builtin.
  - Key functions: `formatHistory()` numbers recent commands; the handler
    parses count arguments and prints summary help; `registerBuiltinHelp()` sets
    the catalogue description.
- `src/builtins/exit.ts` — Implements `exit`.
  - Key functions: Handler invokes `process.exit(0)` when no flags are given;
    help output handles single, double, and cluster levels;
    `registerBuiltinHelp()` adds catalog metadata.
- `src/builtins/lush.ts` — Legacy version of the `ts` builtin using plain
  Acorn.
  - Key functions: Handler reads and parses `.js`/`.ts` files; help levels map
    to summary versus usage text; file extension validation rejects unsupported
    inputs.
- `src/builtins/ts.ts` — Current `ts` builtin with TypeScript and Svelte
  support.
  - Key functions: `typeScriptExtender` adapts `acorn-typescript`; handler reads
    files and parses via Acorn or Svelte based on extension; help dispatch works
    through `detectHelpLevel()`.

## Tests (`tests/`)

- `tests/tokenLine.test.ts` — Verifies token utilities.
  - Key cases: Ensures `tokenizeLine()` preserves offsets; validates the double
    space handler rewinds correctly; checks `collectArgumentTexts()` skips space
    tokens.
- `tests/helpers.test.ts` — Exercises string helper utilities.
  - Key cases: `isStrNumber` accepts numeric strings; `isStrVariable` enforces
    identifier rules; `stripSigils` removes sigils only when valid.
- `tests/index-builtin-registration.test.ts` — Confirms importing `src/index`
  auto-registers builtins.
  - Key cases: Imports `index.ts` and asserts `getBuiltin("cd")` is defined; the
    suite documents the expectation that registration runs on import; failure
    modes help catch regressions when refactoring exports.
- `tests/jobs.test.ts` — Smoke tests for job-control builtins.
  - Key cases: Verifies `jobs` reports when no jobs exist; checks `fg` warns
    when no job matches `%+`; reusable `invoke` helper wraps builtin execution.
- `tests/tokenMultiLineSerialization.test.ts` — YAML round-trip tests.
  - Key cases: `serializeTokenMultiLine` emits expected YAML; round-trip keeps
    tokens intact; invalid YAML shapes throw helpful errors.
- `tests/history.test.ts` — Persists history to disk in isolated temp dirs.
  - Key cases: Loading absent files yields an empty array; append/read back
    preserves order; malformed JSON lines are skipped while valid rows load.
- `tests/prompt.test.ts` — Ensures prompt formatting is stable.
  - Key cases: History numbers pad to four digits; default history position is
    zero; prompt prepends the current working directory.
- `tests/builtins.test.ts` — Comprehensive builtin behaviour coverage.
  - Key cases: `builtins` lists commands and handles help flags; directory
    stack builtins manipulate `pushd`/`popd` correctly; `ts` parses JS, TS, and
    Svelte files while validating arguments.

## Sample Programs (`sample-js/`)

- `sample-js/README.md` — Notes that the directory hosts simple parsing
  fixtures.
- `sample-js/42.js` — Minimal JS literal used for parsing demos.
- `sample-js/42.ast` — Saved AST output for `42.js`; currently mostly empty.
- `sample-js/s42.js` — String literal variant of the number sample.
- `sample-js/s42.ast` — Captured AST output for `s42.js` (includes stray shell
  transcript markers at the end).
- `sample-js/add.js` — Expression sample covering addition.
- `sample-js/addmul.js` — Demonstrates precedence in `42 + 666 * 0`.
- `sample-js/log.js` — Simple `console.log` call for AST inspection.

## Prompt Variants (`prompts/`)

- `prompts/gen-prompt.md` — Reserved for generated prompt text; currently
  empty.
- `prompts/update-render-prompt` — Scratchpad describing the shell with a
  multiline editor; used when iterating on prompt copy.

## Miscellaneous Assets

- `lua/types.lua` — Lua definitions mirroring token and operator types for
  tooling that integrates with lush.
- `native/` — Placeholder directory for future native integrations; empty at
  present.
- `src/various/README.md` — Documents personal tooling files stored in the
  repository.
- `src/various/config.yml` — LazyGit configuration with custom worktree
  commands.
