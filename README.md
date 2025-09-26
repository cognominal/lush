# lush, a shell in node

## Lush is special

Work in progress, see [now](#now).
See [naked strings](#naked-strings-cool-again-no-poisoned-apple) (TBD).

## Done

Multi line editor. Launching commands with space separated argument.

## Working on

Highlighting is used as primary representation. That complexifies slightly the input but that makes
code syntax simpler and more readable.
Eventually the reference representation of code is an augmented AST with node using unique id, this will
revolutionize diff handling. But  that's for [later](#more-long-term)

## Naked strings cool again, no poisoned Apple

Apple file names contains spaces, they are a nightmare to deal with shells.

Vanilla shells have metachars that cannot be used for file names. Spaces are used
to separate command arguments so they must be escaped when used in naked string.

In lush, if one want to use metachars, say for globbing, they must be escaped and will be
displayed in bold.

```
echo  a\ b\ c          
echo  'a b c'
```

## Interpolation in naked string

Code interpolation will be underlined (slightly better then mustache).
No recursive code interpolation.

Variable interpolation will use highlighting for variables so no underlining
except within non atomic code interpolation.

Escape ends the code interpolation.

## variable names

They are always sigiled. But the underlying name is not sigiled.

## Consequences

The line editor must be rewritten in term of lines of sequence of token

## Now

Embryo of a shell in node with a multi line edit and history. No pipe, no redirection.
When the first word is a command in $PATH (shown in red), execute the line command.
Otherwise echo the line.

See [prompt](./prompt.md) for forthcoming IA based updates.
See [keybindings](./keybindings.md)

The shell is special because it uses hightlighting as primary representation.
For now, the command and its argument are naked strings highlighted with a light gray background.
You don't need to escape metachars, obviously you need to use escape convention for non
printable chars.

To separate arguments, type 2 space in rapid sequence.

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
But I want to deffer that. Can I do menu driven structural editing using terminal-kit.
Should I add my multi line input field to it?
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
Augmented AST tree is what does svelte.
Use it to do LSP,  what is the model there ?
The augmented tree should become the reference representation.

## How

I have to use chatgpt to generate the code. It required many iterations. It will not scale.
Probably next month will be spent learning to use some AI from a terminal or nvim.
I have tried crush and did not grok it (yet?)
