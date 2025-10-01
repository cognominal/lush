
## elevator pitch

* Interactive shell and line editor in TypeScript that runs in raw TTY mode,
supports multi-line input, history navigation, and command execution.
* Uses semantic editing actions with a configurable keymap, making it easy to
extend or remap bindings like in readline or nvim.

## Longer pich

This project is a mini interactive shell / line editor in TypeScript (run with Bun or Node).

* It runs in the terminal in raw mode and captures keystrokes.
* Maintains a multi-line input buffer where Return inserts new lines.
* Supports cursor movement (←, → within a line; ↑, ↓ across lines or history).
* Executes the command if the first word is an executable in $PATH, otherwise echoes it.
* Preserves all previous output (no screen clearing, only prompt redraw).
* Uses a tokenizer to decode escape sequences into key names.
* Defines semantic editing actions (like beginningOfLine, acceptLine, cancelInput).
* Separates ACTIONS (functions) from a DEFAULT_KEYMAP (key name → action).
* Users can override keybindings easily or remap them dynamically.

## Naked string
