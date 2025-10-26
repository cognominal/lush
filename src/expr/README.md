# Expressions

We want some rudimentary expression parsing to try to support a expression Field.
So far we support only binary expression and that our syntax is special.
Operators with less space around them bind tighter. The goal is to support an
unlimited number of operators without to care  about their respective
precedences.

We want to support as soon as possible the postfix if where the conditional is
an expression to get a feeling in what direction we want to develop our system
next. Supporting means generating and executing acorn code. Currently codex
does not use acorn types. We should study how svelte use acorn types and extend
them. Same for positional annotation.
