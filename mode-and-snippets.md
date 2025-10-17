# Modes and snippets

A `TokenMultiline` tree has a double role.

As the data behind the multiline
and later a nvim buffer it does drive the display of a susy.

But it is already a PreAST.

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
