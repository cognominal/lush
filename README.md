# lush, a shell in node

## Now

Embryo of a shell in node with a multi line edit and history. No pipe, no redirection.
When the first word is a command in $PATH (shown in red), execute the line command.
Otherwise echo the line.

See [prompt](./prompt.md) for forthcoming IA based updates.
See [keybindings](./keybindings.md)

## Next

Not necessarily in the given order

* builtins, user functions (aliases can be made user functions?)
* An history for each cwd stored using freedesktop file hierarchy conventions. Moving up and down
selecting commands which start with the same current string.
* highlighting as primary notation. Start with naked string with metachars as regular code. Naked string highlighted as
a special background.
* borrow from [slash](https://github.com/cronvel/slash) for regular pipes and redirections
* typed pipes

## Thinking mid term

Eventually I need to do the shell program edition in nvim. Later in codemirror/monaco.
But I want to deffer that. Can I do menu driven strutural editing using terminal-kit.
Should I add my multiline input field to it ?
Can I use/create an adapter and use nvim, with what plugin, as a backend.
Add raku syntax in the mix.
Optional autovivifying  (explicit in programs, default in command line).
* to enable it. - to disable it.    @a+<toto>
Raku syntax. Will be simplified with highlighting as primary notation.
@*PATH

## More long term

Using xtermjs in svelte to make shell as notebooks

## LSP should enter the dance

Storing history as a yaml dump of an augmented acorn AST tree ?
Augmented ASt tree is what does svelte.
Use it to do LSP,  what is the model there ?
The augmented tree should become the reference representation.

## How

I have to use chatgpt to generate the code. It required many iterations. It will not scale.
Probably next month will be spentlearning to use some AI from a terminal or nvim.
I have tried crush and did not grok it (yet?)
