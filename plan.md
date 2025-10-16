# Lush

Keywords : lush, lish, susy, astre

# Decoupling of programs in Astres and Susies

We (intend to) (de)couple the susy, the Surface Syntax based representation of a
program and astre its augmented
[AST](https://en.wikipedia.org/wiki/Abstract_syntax_tree) based REference
REpresentation with their reliance on
[UUIDs](https://en.wikipedia.org/wiki/Unique_identifier) for symbols and nodes.
Simple example of the benefit of the couple susy/astre : renaming a symbol is
just updating the mapping between its uuid and its name, even if downside it
affects susys all over the place. But that's the point, susys are just the
serialization of astres. This interelation between Astres and Susys is designed
to foster a greater flexibility of languages and programs, a goal of Larry Wall
who took natural languages as an inspiration. Susys conventions can be personal,
be adopted by teams, and eventually go main stream. This should be possible by
using grit, a would-be git adapted to support astres.

A posh susy is a susy that uses font styling as primary representation. Leste
will be a posh susy for svelte.

All is not rosy though, AST are implementation specific, often even language
specific, not part of language specifications. Line based diffs, for all their
limitations come for free.

## 6 main ideas

They are related and interdependent. But I have ordered them as the necessary
order to boot the system. Core parts of an idea are necessary to implement the
core of the next. Now I am working on the first 2 but the `lush` builtin would
help with astres.

- Font styling as primary notation. Tty based edition. Nvim based. Codemirror,
  Monaco next.
- Interactive shell
- Embrace the js/ts ecosystem. Lish on Bun. Later, Leste as a better Svelte
  Susy.
- Indentation and space as syntax
- Astre, augmented ASTs are the reference representation,
- Grit, an improved git based on astre diffs instead of line diffs. Allows for a
  better surface syntax (susy) for existing languages

# lush, the langage; lish, the shellish mode

This a plan about lush, a would be language inspired by Larry Wall ideas about
computer languages being as flexible as natural languages. Taken literally, this
is not an heterodox idea but an heretic one. Dijkstra famously said that natural
languages used for coding was a bad idea.

Natural languages are spoken first, writing them came very late. Computer
languages are written.

## font styling as primary notation

They should take in account the capabilities of modern displays even just for
terminals, our initial target. For terminals, that means color and font style.
They do use color, mostly foreground and sometimes background, but not as
primary notation. What is wrongly called syntax highlighting is secondary
notation, to highlight information already present in the program.

But primary notation should not preclude the benefit of secondary. Font style
has been used by Donald Knuth for literate programming output on paper but that
is irrelevant to us. So, color being taken for secondary notation, font styling
is left for use to be used as primary notation.

## start implementation as an interactive shell

The second idea is: I had to start with what Perl and Raku have never been, but
should have, an interactive shell. Indeed, language inspired from natural
language should have an interactive mode. In that mode we call lush lish, for
lush interactive shell. This sound suspiciously like yiddish but I won't go to
sing Klezmer. Starting as a shell, is a good way to bootstrap lush and
experiment in an iterative way as soon as possible. It is also a nice way to
onboard new people, including old timers.

Shells run in the constrained world of ttys. Ttys are grid of characters in
monospace fonts. But ttys have evolved over time. First as soon they became
virtual they have been resizable. But that is not the interesting part here.
Second they support colors and styled fonts (bold, italic...). Shell have a
concept of naked string that Larry Wall tried to borrow in Perl without much
success. He went to the opposite direction with Raku.

Shells support redirections and piping, they deal a lot with paths and file
names, they encourage the use of naked strings. That's why you won't usually
find `|`, `<`, `>`, `&` characters in filenames. Non printable characters in
path are possible but that would be vice.

## Editing susys in the multi line editor

Goal : support `say foo >bar`, cycling `>bar` to a naked string
Also  : support `say foo if true`

This means generating and executing acorn as well.

How far can I go without true parsing, full structural editing, or too complex
edition for the user ?

Posh susys, that is `su`perficial `sy`ntax that use indentation and styling as
syntax have tokens of different types, including space tokens, that are styled
accordingly.

Naked strings can include spaces and sometimes consecutive tokens may be not be
separated by spaces.

So how to enter a space token and how to cycle trhu the potential types of a
token, or multitokens sequence of characters (not separated with spaces) if the
heuristics choose it wrong ? With conditional here postfix if the token line
doubles as some sort of AST. And cycling back changes it completely. This may
break if the conditional is complex but who would cycle back the if to a naked
string so late.

### magic strings

Despite our nakedstring as default token, there are initial magic strings that
override that. They are not even always simple chars like `>` and `>>` for shell
redirection. They impose a mode or a next token. Redirection means the next
token is a path. I create a `magicStr` field in `lang.yml` to drive an engine
yet to be written or even fully thought. Also with

### double spacing in a space token

We consider the previous tokens not separated by space tokens.

Entering two space keys in succession will add a space token if not in a space
token, otherwise it will cycle the types of the previous token.

```
echo toto >foo  # `>` and `foo` are two token
```

### modes

Introducing mode avoid token ambiguity. I anticipate at least 3 modes:
expression, shell statement, statement. Maybe shell statement will take over
statement. For the time being that's a moot point, we are dealing with the lish
shell.

## the heuristics
