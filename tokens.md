Tokens are at the heart of lush edition.

The traditional model is that a parser break the input string in a stream of tokens passed to the parser. Recently, the introduction treesitters enabled fast analysis as the user types
the program and properly highlight the tokens according to their types 
Server using the LSP server protocol then refine the highlighting.
Note the term syntactic higlighting is incorrect. It is lexical and semantic.
Also it is a secondary notation, it emphasize info that is already present in
the parsed program.

Lush on the other hand, use font styling and background color as part of 
the syntax of a program. The potential benefits are many. The most obvious
one is that there is no need for reserved words for keywords. Lush goes further 
by using astres, augmented AST as the reference representation of programs. 
What we discuss here is the susy (for surface syntax) of a program

Here we focus on lish, a lush interactive shell on a terminal.
More specifically we foocus on the edition multi lines (mlines) commands.
The editor does its best to guess the type of tokens but there is a 
way for the user to force the type. When the cursor is on a space that 
follow a token, he can type the space key twice in rapid succession to 
cycle between the potential type of the token, indicated by its specific 
primary highlighting and choose one.

The files that implements this logic are [editor.ts](src/editor.ts)
and [tokens.ts](src/tokens.ts). 



