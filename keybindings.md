# Keybindings

- **Ctrl-C** (`exitEditor`): Exit the editor (exit code 130, like SIGINT).
- **Ctrl-D** (`deleteOrEOF`): Delete the char under the cursor; exit if the
  buffer is empty.
- **Ctrl-A** (`beginningOfLine`): Move the cursor to the start of the current
  line.
- **Ctrl-E** (`endOfLine`): Move the cursor to the end of the current line.
- **Ctrl-B** (`backwardChar`): Move the cursor one character to the left.
- **Ctrl-F** (`forwardChar`): Move the cursor one character to the right.
- **Ctrl-K** (`killLineEnd`): Delete from the cursor to the end of the line.
- **Ctrl-U** (`killLineBeginning`): Delete from the start of the line to the
  cursor.
- **Ctrl-L** (`clearScreen`): Clear the screen and redraw the prompt.
- **Left Arrow** (`backwardChar`): Move the cursor one character to the left.
- **Right Arrow** (`forwardChar`): Move the cursor one character to the right.
- **Up Arrow** (`previousLineAction`): Move the cursor up one line in the
  buffer.
- **Down Arrow** (`nextLineAction`): Move the cursor down one line in the
  buffer.
- **Ctrl-P** (`previousHistoryAction`): Recall the previous command from
  history.
- **Ctrl-N** (`nextHistoryAction`): Recall the next command from history.
- **Home** (`beginningOfLine`): Move the cursor to the start of the line.
- **End** (`endOfLine`): Move the cursor to the end of the line.
- **Delete** (`deleteChar`): Delete the char under the cursor.
- **Backspace** (`backwardDeleteChar`): Delete the char before the cursor and
  merge lines if needed.
- **Enter** (`insertNewline`): Insert a newline within the current buffer.
- **Cmd+Enter** (`acceptLine`): Submit the buffer; run the command or echo it.
