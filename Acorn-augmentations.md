# Languages augmentations to Acorn according to codex

## TypeScript Parser Adds

  - Identifier/Literal still exist, but the plugin introduces TS‐specific nodes
    such as TSTypeAnnotation, TSTypeReference, TSInterfaceDeclaration,
    TSAsExpression, TSImportType, and similar TS* constructs that decorate
    standard statements and expressions with type metadata.
  - Many vanilla node shapes gain extra properties (e.g., FunctionDeclaration
    with optional typeParameters, returnType, declare) or wrap in
    TSDeclareFunction, TSModuleBlock, TSEnumDeclaration.
  - Overall: Acorn’s base ESTree stays, but any syntax beyond ES (types,
    interfaces, enums, decorators, namespaces) appears under names prefixed with
    TS.

## Svelte Compiler Adds

  - The Svelte compiler returns a component AST, not ESTree: top-level node is
    Component with html, css, and instance/module script blocks.
  - Inside html, you’ll encounter template-specific nodes such as Fragment,
    Element, Text, MustacheTag, IfBlock, EachBlock, AwaitBlock, InlineComponent,
    Slot, etc.
  - <script> blocks use instance/module properties that embed a nested ESTree
    program (parsed via Acorn) but wrapped in Svelte-specific node containers
    (Script, Ast).

## In short

TypeScript augments the ESTree with extra TS* declarations/annotations, while
Svelte switches to its own template AST with fragment/element/mustache-style
nodes plus nested Acorn programs for script sections.

## What we want to do

Our alternative syntax will use indentation instead of opening and closing tags.
Special syntax for id and class attributes inspired from emmet. Mustache will
not be necessary, code will appear in a light bg tone than naked string.
