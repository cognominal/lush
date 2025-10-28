# Extending ts

brainStrorming.

We want to create new syntax expanded with snippets.
Each folder will add one syntactic feature.
Afer bit and str enums we will focus on huufmanized html and svelte.

The folder will be the trigger for the snippet.
In each folder there will be a code generator from the data of
the snippet edition.

We will start by supporting bitenums and strenum that huffmanize enums which member are
power of twos, or strings after their names.

A non posh susy for a bitenum would be

```
bitenum {
   bit0 
   bit1 
   bit0and1 = bit0 | bit1
   bit2 = 16
}
```

We will adapt code generated from [chatgpt](https://chatgpt.com/share/69000f78-1abc-8001-9609-8fef1387a245)

In a folder, there will be a file named `gen.ts` that will generate the acorn subtree and
a file `snippet.*` that will describe the snippet, probably in yaml.
