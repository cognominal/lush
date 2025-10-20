# AGENTS.md

`src/` contains the TypeScript sources for the interactive shell. The `main`
function in `src/editor.ts` is the CLI entry point configured in `package.json`;
support modules such as `history.ts`, `unparse.ts`, `secureHash.ts`, and
`yaml-serialize.ts` cover persistence and AST translation. Token shapes live in
`src/tokenLine.ts`, and job metadata types sit in `src/jobControl.ts`—update
them centrally before reusing shapes. Tests live in `tests/` and mirror source
filenames. Supporting docs and prompt variants stay in `builtins.md`,
`keybindings.md`, `prompt.md`, and the `prompts/` directory.

## Build, Test, and Development Commands

- `bun install` installs dependencies locked in `bun.lock`.
- `bun run start` executes `src/editor.ts` interactively for manual
  verification.
- `bun run test` runs the Vitest suite once.
- `bun run test:watch` re-runs tests on file changes during development.
- `bun run test:coverage` produces coverage output in `coverage/` before
  reviews.

## Coding Style & Naming Conventions

The codebase uses TypeScript with native ESM, so keep explicit `.ts` extensions
in imports. Match the prevailing two-space indentation and keep statements
compact; there is no automated formatter, so follow the surrounding style.
Prefer `const` for bindings, camelCase for functions and variables, and
PascalCase for types and enums. When adding token helpers, mirror `Token` and
`PreAstType` naming from `src/tokenLine.ts` to keep autocomplete predictable.
Markdown and ts files must have a max line length of 80 chars.
Ts code should be type error free.
Internal modules must be imported via `src/index.ts`; add re-exports there
(e.g. `export * from "./augmentedAcorn.ts";`) before using new symbols. The
bootstrap file `src/builtins.ts` is the lone exception so the registry can
initialize without circular imports.

## Testing Guidelines

Vitest powers the suite via `vitest.config.ts`. Add new cases in `tests/` using
the `*.test.ts` suffix and a `describe` block named after the module under test.
When expanding serialization logic or token behaviours, cover both success and
error paths and include regression cases for any reported bugs. Run `bun run
test` for quick validation and `bun run test:coverage` before opening a PR to
confirm coverage does not regress.

## Commit & Pull Request Guidelines

Commit history favors concise, imperative summaries (`add builtin.md`, `specing
next moves`). Keep that format and scope each commit to one cohesive change,
updating docs alongside code when behaviour shifts. Pull requests should provide
a short narrative, link related issues, and list the commands you ran (tests,
manual scenarios). Attach terminal screenshots if CLI output changed, and call
out follow-up work as TODOs when you defer it.

## Agent-Specific Tips

The editor toggles raw `stdin` state and searches the PATH; keep integrations
behind the existing helpers in `src/editor.ts` so tests remain deterministic.
Avoid hard-coding absolute paths—use `path.join` like the current code. When
spawning external commands, add guards or fakes for tests to prevent hitting the
real shell.

## Agent Communication

- Reformulate complex or ambiguous requests before executing them.
- Keep each chat line at 80 characters or fewer.
