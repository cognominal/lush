# Completion System

Implement a zsh-style completion flow for the first token of each
`TokenMultiLine`.

## Interaction Flow

- Treat any string whose prefix matches the current token value as a completion
  candidate.
- When the user presses Tab, surface every candidate in the interactive zone
  and highlight each option according to its token type.
- The first Tab now immediately highlights the top candidate, applies it to the
  prompt, and enables navigation through the list with the arrow keys.
- Pressing Return accepts the highlighted candidate, replaces the current token
  with its value, and leaves the cursor on the trailing space after the token.

## Status Line Behaviour

- Show the token type for the highlighted candidate using the visual treatment
  for that token class.
- Only propose token types that are valid for the current editor mode.
  Eligible types include Folder (TBD?), Builtin, Command, SnippetTrigger,
  and TypeScript symbol (TBD?).
- Only propose token types that are valid for the current editor mode.
  Eligible types include Folder (TBD?), Builtin, Command, SnippetTrigger,
  and TypeScript symbol (TBD?).
- Provide type specific context:
  - TypeScript symbols: display the symbol type.
  - Builtins: show the one line help string.
  - Commands: run `tldr command-name 2>/dev/null | sed -n '4{/^$/!p;}'` and show
    the resulting line.
  - Folders: list the first file name found within the folder.
  - Snippets: render the `what` field from `lang.yml`.

## Example

```
# bun start
~> ls
ls         lsa        lsbom      lskq       lsmp    lsvfs
LS_COLORS  lsappinfo  LSCOLORS   lsm        lsof
Command:  List directory contents.
```

## TUI Layout

- The status zone is made of an interactive area (shown only while completions
  are active) plus the persistent status bar.
- The interactive area renders candidates in a grid sorted
  case insensitively and alphanumerically. Each column is two characters wider
  than the widest item in that column. The grid automatically shrinks or
  switches to a vertical list when the terminal becomes narrower.
- If the grid would exceed five lines, show this prompt and wait for `y` before
  expanding the table:

  ```
  lish: do you wish to see all N possibilities (M lines)?
  Typing y (no return needed) will show the whole table.
  ```
- When the grid fits within five lines, render the entire table immediately.
- When the table cannot fit within the terminal width, confirmations still
  apply but the expanded view is presented as a vertical list with the current
  entry highlighted.
- Resizing the terminal recomputes the layout, re-highlights the first entry,
  and keeps the status bar anchored at the bottom with command summaries
  truncated to the available width.
