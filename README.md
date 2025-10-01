# lush, a shell in node

## Run me

No release yet.

```bun run start
```

## Lush is special

Work in progress, see [now](#now).

A shell that runs on node.
Highlighting is used as primary representation. That complexifies slightly the input by the user but that makes
code syntax simpler and more readable. Most obvious consequences : rejuvenate the concept of naked sting.
The input will be encoded as a sequence of tokens.

# TBD  html, to demonstrate the shell in action. I have a builtin for that

See [naked strings](#naked-strings-cool-again-no-poisoned-apple) (TBD).
We focus now on features more than configurability.

See [type.ts](src/types.ts).
Eventually the reference readable representation of code is an augmented AST (astre) with nodes using unique id, this will
revolutionize diff handling. The augmented AST is [acorn](https://github.com/acornjs/acorn).
The astre will be unparsed in [unparse.ts](./src/unparse.ts)`. More info [here](./unparsing.md).
But that's for [later](#more-long-term).
See [secureHash.ts](src/secureHash.ts) for uuids.

## Planned/Done

Currently, we do lush as command line editor. We want to know how far we can go without structural editing.
For sturctual editing, we should thing of an API similar in lua (for nvim) and ts (for the terminal)

- Multi line editor.
  - [x] Core logic
  - [ ] Handling spaces. Fast double space should exit current token and move next token which is a space one, creating it if missing
  - [ ] Sackslash for metachars specially highlighted as one char
  - [ ] Same for globbing
  - [ ] Type logic. Once in a space, fast double space, should rotate between the logical types for the previous tokem
[-] Builtins
  - [x] Core logic
  - [x] Builtin command `builtins` that list the builtins
  - [ ] Use minimist
  - [ ] `-hh` should output one liner help for builtins except `builtins`
  - [ ] With builtins, it calls all the other builtins with `--h`
- lush : Features specific to lush  
  - [ ] Hooking to acorn to do more than launching commands and executing builtins.
  - [ ] Expressions with less spacing to identify subexpressions  a + b  *c  means (a+b)*c
  - [ ] Typed pipes a la nushell
  - [ ] A builtin `ts` that output the unparsing of ts/js/svelte file
- classic shell features
  - [ ] Aliases ??
  - [ ] Globbing
  - [ ] Simple redirections
  - [ ] Job control
  - History
  - [ ] ^P, ^N move in history
  - [ ] but should display with same initial tokens
  - [ ] saving history, per cwd
  - [ ]
- Various
- [ ] stackblitz
- [ ]
- Nvim. We now run in a terminal. We want to program lush in nvim

## Working on

UI. Better handling of token and subtokens

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

## space keybinding

Double spacing (two space in rapid succession) moves the cursor after a symbol, then rotate between its token type.
So the interface guesses the token type wrong you can rectify it.
Example : keyword is preferred over naked string.

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

Not necessarily in the given order.

- implicit `cd`. A naked string as unique token that can be interpreted as folder path. Other tokens are ignored and not registered in history.
See also [cd](./builtins.md#cd) and [z](./builtins#z).
- builtins, user functions (aliases can be made user functions?)
- An history for each cwd stored using freedesktop file hierarchy conventions. Moving up and down
selecting commands which start with the same current string.
- highlighting as primary notation. Start with naked string with metachars as regular code. Naked string highlighted as
a special background.
- borrow from [slash](https://github.com/cronvel/slash) for regular pipes and redirections
- typed pipes

## Thinking mid term

Eventually I need to do the shell program edition in nvim. Later in codemirror/monaco.
But I want to deffer that. Can I do menu driven structural editing using terminal-kit.
Should I add my multi line input field to it?
Can I use/create an adapter and use nvim, with what plugin, as a backend.
Add raku syntax in the mix.
Optional autovivifying  (explicit in programs, default in command line).

- to enable it. - to disable it.    @a+<toto>
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
