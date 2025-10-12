# Unparsing

Unparsing, for lack of a better term, will be the workhorse of our system. Now
it is the less defined. We anticipate it to deserve its own language, mostly
independent of the handled language. Given an astre (augmented AST as a
reference representation), we will unparse it to `TokenLine[]`.

We will start by handling the Raku vars `%*ENV` and `@*PAtH` which translate in
ts in term of `process.env`. Maybe we can avoid to explicitly state the AST of
`process.env`. That would be the gist of our unparsing language.
