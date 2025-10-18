# Modes and snippets

This is brain storming to introduce many features which
will induce many structural changes : snippets, modes starting
by expression mode. Expression mode will start by supporting
atomic expressions with numbers and naked strings.
Command completion will be interesting because of different hilite for
commands/functions/snippet-triggers...

This document is changing very fast.
We add the data types to the existing
code without implementing the feature to be sure we understand
ts logic of ts types.

All this stuff being data-driven we focus on lang.yml structure now.

## Contextual behavior

The behavior of lushed, the editor for lush supported languages is
contextual it depends on the [edmode](#lush-edmodes) and the current token.
This is driven by `lang.yml`.

Our current focus is to develop the Expr edmod, starting supporting
the Space, NakedString, Number and Variable tokens types, with interpolation
withing naked string. Special hiliting avoid special syntax like sigils or
mustache but requires smarter editing. We may go as far as to create
a NakedYaml
We want to generate a Acorn tree for a program that prints the result
of the expression. It will also declare and initializethe var `foo` to 42.
Supporting operators will come later.

## Lush edmodes

Edmodes

Each mode has its own map of acceptable token types.
`lang.yml` exposes the available modes which are reloaded
each time the user changes mode. Programatically the function `setMode`
changes the current mode.

## datatypes

A `TokenMultiline` tree has a double role.

As the data behind the multiline
and later a nvim buffer it does drive the display of a susy.

But it is already a pre ast meaning it should be trivial to
convert it to an astre.

A `TokenMultiLine` is made of `InputToken`s.
The `TokenType` of `InputToken`s drives the behavior or the mline editor.

```ts
export interface TokenType {
  priority: number // type of higher priority are chosen before lower
  type: string   // type of the token
  validator?: (s: string) => boolean // true if string `s` can be token `type`
  hilite?: (s: string) => string
  secable?: boolean
  instances?: string[]
}

export interface SnippetField extends TokenType {
  mode?: Mode
  placeholder?: string
  defaultCode: string  // serialized TokenMultiline
} 
export interface Hiliter extends TokenType {
  doesHilite?: boolean
}

```

```ts
export interface InputToken {
  type: TokenTypeName;
  tokenIdx: number;
  text?: string; // missing for types that have subtypes
  subTokens?: InputToken[];
  x?: number;
}
```

A `Hiliter` takes no part in edition and its fiels `doesHite` is not serialized
or deserialized.

`SnippeitField`s are modal. The mode influences the edition.
Only tab and shift tab will move the cursor out of the field.

## Snippets

We want to implement a snippet system. It will allow to have structural
edition with executable code at any time.
When a snippet field does not parse or is empty, default code will be
generated.

### Snippets and mode

For dev purpose, we will create a plugin set the mode to expression.

### Editing a Snippet

Expanding a snippet will create the appropriate keywords, and  `SnippetFields.
Snippet are allowed at the start of statements.

Within a snippet tab will more from one snippet field to the next, and
shift tab  back

The `placeholder` field will be printed when the `text` of the input token is
empty.

```
ife 

  `if` sf-expr 
    sf-block


```

`TokenMap maps type name to the corresponding TokenType.
