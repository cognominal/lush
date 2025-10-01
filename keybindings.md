
| Key           | Action                  | Description                                       |
| ------------- | ----------------------- | ------------------------------------------------- |
| **Ctrl-C**    | `exitEditor`            | Exit editor (exit code 130, like SIGINT)          |
| **Ctrl-D**    | `deleteOrEOF`           | Delete char under cursor, or exit if buffer empty |
| **Ctrl-A**    | `beginningOfLine`       | Move cursor to beginning of current line          |
| **Ctrl-E**    | `endOfLine`             | Move cursor to end of current line                |
| **Ctrl-B**    | `backwardChar`          | Move cursor left one character                    |
| **Ctrl-F**    | `forwardChar`           | Move cursor right one character                   |
| **Ctrl-K**    | `killLineEnd`           | Kill (delete) from cursor to end of line          |
| **Ctrl-U**    | `killLineBeginning`     | Kill (delete) from start of line to cursor        |/Users/cog/.config/zellij/config.kdl
| **Ctrl-L**    | `clearScreen`           | Clear screen and redraw prompt                    |
| **Left**      | `backwardChar`          | Move cursor left                                  |
| **Right**     | `forwardChar`           | Move cursor right                                 |
| **Up**        | `previousLineAction`    | Move cursor up one line in buffer                 |
| **Down**      | `nextLineAction`        | Move cursor down one line in buffer               |
| **Ctrl-P**    | `previousHistoryAction` | Recall previous command from history              |
| **Ctrl-N**    | `nextHistoryAction`     | Recall next command from history                  |
| **Home**      | `beginningOfLine`       | Move cursor to beginning of line                  |
| **End**       | `endOfLine`             | Move cursor to end of line                        |
| **Delete**    | `deleteChar`            | Delete char under cursor                          |
| **Backspace** | `backwardDeleteChar`    | Delete char before cursor (merge lines if needed) |
| **Enter**     | `insertNewline`         | Insert a new line within the current buffer       |
| **Cmd+Enter** | `acceptLine`            | Submit line(s), execute command or echo           |
