# lush, a shell in node

## Run me

No release yet.

```bash
bun run start
```


## Screen layout

See [completion-expansion.md](./completion-expansion.md) for the full completion UX.

The prompt stays where you launch lush.
Completion arrays render directly under the prompt. The status bar remains
pinned to the bottom of the terminal.


### Via Docker

```bash
docker build -t lush .
docker run -it --rm lush
```

## Lush is special

A shell that runs on node. Highlighting is used as primary representation. That
complexifies slightly the input by the user but that makes code syntax simpler
and more readable. Most obvious consequences : rejuvenate the concept of naked
string. Hilite as syntax avoids the syntactic complexity of variables
(may be expression) interpolation
in string (no sigil or
[mustache](https://en.wikipedia.org/wiki/Mustache_(template_system)) needed).
The input is encoded as a sequence of tokens. In fact more like an ast tree.

For ts and svelte, see [augmentations](./Acorn-augmentations.md)

# Work in progress

See [now](#now). See [AGENTS.md](./AGENTS.md) for general
development instructions. They are for API but are relevant for humans too.
At early this stage I don't even care to have commits that break everything.
Also lush is just a way to bootstrap a more ambitious project.
See [plan](./plan.md)

# Implementing

At this point, this  README is about the implementation spec. As the guide for
codex to generate code.

TBD html, to demonstrate the shell in action. I have a builtin for that.

See [naked strings](#naked-strings-cool-again-no-poisoned-apple) (TBD). We focus
now on features more than configurability.

Token shapes live in [src/tokenLine.ts](src/tokenLine.ts). Eventually the
reference readable representation of code is an augmented AST (astre) with
nodes using unique id, this will revolutionize diff handling. The augmented AST
is now
[acorn](https://github.com/acornjs/acorn). The astre will be unparsed in
[unparse.ts](./src/unparse.ts)`. More info [here](./unparsing.md). But that's
for [later](#more-long-term). See [.secureHash.ts](src/secureHash.ts) for uuids.

## Data driven

Lushed (currently a multi line editor for the lish shell)
is data driven by `lang.yml`

## Token editing

The multiline editor mutates existing `InputToken`s instead of rebuilding a
line from plain text. Every insert, delete, or split updates the token (and any
`subTokens`) that owns the edited character, then re-computes the `tokenIdx`
and `x` fields for the affected containers. Parent tokens with `subTokens`
keep their `text` undefined; their surface text is derived from the
concatenation of child token texts. This behaviour lives in
[src/tokenEdit.ts](src/tokenEdit.ts) and lets highlighting and token metadata
survive incremental edits without re-tokenizing the entire line.

Submission mirrors shell enter semantics. `Enter` inserts newlines by default,
but when the cursor sits on the final empty line of a command that already has
content on earlier lines it submits the buffer. Pressing `Enter` with a fully
empty buffer keeps editing in insert mode and rings the bell instead of
running.

## Mode and Token Types

The editor is modal depending on what we are currently editing.
In a given mode, just a certain set of token types is allowed.
When the mode is changed with `setMode` when entering certain places
we update the map `tokenMap`

## Planned/Done

This is the detailed plan. For the general plane, see [plan](./plan.md)

Currently, we do lush as a command line editor. We want to know how far we can
go without structural editing. For structural editing, we should thing of an API
similar in Lua (for nvim) and ts (for the terminal). Some builtins have for sole
purpose to help development. `ts`, `lush` and `lush` will be passed path to
files in [sample-js](./sample-js) that are simplistic files. The `ts` builtin
accepts `.js`, `.ts`, and `.svelte` sources and prints the parsed AST (Acorn for
JS/TS, Svelte compiler for Svelte). We focus on features that help top bootstrap
the rest. But, hey, short term usefulness helps too.

Some items are moved to avoid cluttering the Readme.

[builtins](./builtins.md)

- Programming. Not necessarily linked to a user facing feature but needed to run/grow the
  system
  - [x] `Token` should be a registry not an enum.
  - []  edition of insecable token is forbidden. Such token is erased when
        backspacing from the
        token after it.
  - [x]  Status field below the multi line editor would help
  - [ ] specify display and edition of multilevel tokens. Maybe driven
        by new fields. See[modes and snippets](/mode-and-snippets.md)
  - [x]  the `tokenstypes` field in `lang.yml` should be a map keyed by type names

- Multi line editor.
  - [x] correct handling of tokens when launching builtins and commands, meaning
        space token separates arguments
  - [ ] On submit on empty command, possibly multi line, emit a bell, don't add
        to history
  - [ ] Space handling
    Single space inside NakedString or Space token must insert a literal space.
    Single space elsewhere (only on a secable token)
    must split the token and insert a distinct Space token.
    Rapid double-space  on a non Space token move the cursor to the adjacent space
    token or create one to do so,
    Double space on a space token just rotate the previous token type if any.
      [ ]
  - [ ] Backslash for metachars specially highlighted as one char
  - [ ] Same for globbing
  - [ ] Command/builtin completion
  - [x] the mline status:  below the mline editor, shows the current mode, the
       current token idx, a list of valid types with the current type highlighted.
  - [ ] bring it to the next level. See [modes and snippets](/mode-and-snippets.md)
- lush : Features specific to lush
- [ ] Hooking to acorn to do more than launching commands and executing
      builtins.
- [ ] Typed pipes a la nushell
- [ ] A builtin `ts` that output the unparsing of ts/js/svelte file
- syntax and semantic (depends on Acorn hooking)
- [ ] Expressions with less spacing to identify subexpressions `a + b *c` means
      `(a+b)*c`
- [ ] Variables, sigil or sigiless
- [ ] Optional autovivifying (explicit in programs, default in command line).

- classic shell features
  - [ ] Implicit cd
  - [ ] (shortened) path in prompt
  - [ ] Aliases ??
  - [ ] Globbing
  - [ ] Simple redirections
  - [ ] Job control (code not tested)
  - History
    - [x] ^P, ^N move in history
    - [ ] But should display only entries with same initial tokens
    - [x] saving history, per cwd
    - [x] History saved as yaml (astre later)
    - [ ] History saved as yaml (also as AST)
- Astre (Ast REference Representation) is what it says, and what we interact
  with is an Astre unparsing
  - [ ] Build on Acorn a la svelte
  - [ ] Node UUID
  - [ ] A map that binds symbol UUID to external names (general, localized,
        personal)
  - [ ] Grit, a diff system based on Astre, not on lines
- Leste, a better svelte representation, adapted from code of
  [svelte.dev](https://github.com/sveltejs/svelte.dev)
  - [ ] Using xtermjs in svelte to make shell as notebooks
- Various
  - [x] Docker image
  - [ ] Stackblitz. Run a shell server side ?
- [ ] Nvim. We now run in a terminal. We want to program lush in nvim
- [ ] Doc. I have tons of thoughts in various .mds. This tick list makes little
      sense without it. Make some of them readable for an newcomer. But a demo
      is even better

## Working on

Using Space token as separator instead of space to separate arguments UI. Better
handling of token and subtokens

## Naked strings cool again, no poisoned Apple

Apple file names contains spaces, they are a nightmare to deal with shells.

Vanilla shells have metachars that cannot be used for file names. Spaces are
used to separate command arguments so they must be escaped when used in naked
string.

In lush, if one want to use metachars, say for globbing, they must be escaped
and will be displayed in bold.

```
echo  a\ b\ c
echo  'a b c'
```

## space keybinding

Double spacing (two space in rapid succession) moves the cursor after a symbol,
then rotate between its token potential types. So the interface guesses the
token type wrong you can rectify it. Example : keyword is preferred over naked
string.

## Interpolation in naked string

Code interpolation will be underlined (slightly better then mustache). No
recursive code interpolation.

Variable interpolation will use highlighting for variables so no underlining
except within non atomic code interpolation.

Escape ends the code interpolation.

## mixed editing, structural and normal

Statements will be edited using structural editing. Expressions within such
Statements will be edited using normal editing. We don't support structural
editing yet. We want to have fun as soon as possible. So we will have a `ts`
builtin that will unparse code and add it to the history. So we can edit it. We
need to think what tokens and subtokens are, and their names too. Anyway tokens
other than expression, will be readonly. So the `forwardToken` and
`backwardToken` will skip readonly token.

## variable names

They are always sigiled. But the underlying name is not sigiled.

## Consequences

The line editor must be rewritten in term of lines of sequence of token

## Now

Embryo of a shell in node with a multi line edit and history. No pipe, no
redirection. When the first word is a command in $PATH (shown in red), execute
the line command. Otherwise echo the line.

See [prompt](./prompt.md) for forthcoming IA based updates. See
[keybindings](./keybindings.md)

The shell is special because it uses hightlighting as primary representation.
For now, the command and its argument are naked strings highlighted with a light
gray background. You don't need to escape metachars, obviously you need to use
escape convention for non printable chars.

To separate arguments, type 2 space in rapid sequence.

## Next

TBD retrofit into tick list

Not necessarily in the given order.

- implicit `cd`. A naked string as unique token that can be interpreted as
  folder path. Other tokens are ignored and not registered in history. See also
  [cd](./builtins.md#cd) and [z](./builtins#z).
- builtins, user functions (aliases can be made user functions?)
- An history for each cwd stored using freedesktop file hierarchy conventions.
  Moving up and down selecting commands which start with the same current
  string.
- highlighting as primary notation. Start with naked string with metachars as
  regular code. Naked string highlighted as a special background.
- borrow from [slash](https://github.com/cronvel/slash) for regular pipes and
  redirections
- typed pipes

## Thinking mid term

TBD retrofit into tick list

Eventually I need to do the shell program edition in nvim. Later in
codemirror/monaco. But I want to defer that. Can I do menu driven structural
editing using terminal-kit. Should I add my multi line input field to it? Can I
use/create an adapter and use nvim, with what plugin, as a backend. Add Raku
syntax in the mix.

- to enable it. - to disable it. `@a+<toto>` Raku syntax. Will be simplified
  with highlighting as primary notation. `@*PATH`

### LLM

Lush has not been thought with LLMs in mind. Let's try.
The source of the most popular modules (in whatever lush supported language)
lush aware or not can be pulled and a huffmanization of the most used symbols
can be done so as to be used as unique tokens.

Maybe a serialization of astres can be done using the huffmnized symbols
Maybe a lush aware model can be build using that scheme.

### History file location

Command history persists between sessions. When `$LUSH_HISTORY` is set, Lush
uses that absolute or tilde-expanded path. Otherwise it follows the [freedesktop](https://specifications.freedesktop.org/basedir-spec/latest/)
Base Directory spec: if `$XDG_STATE_HOME` is defined the history is written to
`$XDG_STATE_HOME/lush/history.yaml`; when it is unset, the fallback path is
`~/.local/state/lush/history.yaml`.
