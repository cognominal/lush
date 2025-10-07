# Builtins

Lush attempts to interpret the first word as a builtin before attempting
other interpretations. The line being interpreted as an astre, once chosen
its builtin nature is hardwired. Until we hook to acorn, the line is
stored as `TokenMultiLine`.

It appears there will be no distinction between algebraic mode and shellish mode.
As a result the exact meaning of builtins may change.
Anyway a builtin surface symbol is displayed as italic by default.
Probably linking with [busybox](busybox) will add builtins. The goal is to reduce
dependency on external commands which pose problems of installation and portability.

At this point, we want enough builtins for a demo.

  - [x] Core logic
  - [x] Builtin command `builtins` that list the builtins
  - [ ] Minimal support of builtins  `cd`, `pushd`,  `popd` (`dirs` TBD). The 3
  latter should print the resulting stack
  - [ ] Use minimist
  - [x] `-hh` should output one liner help for builtins except `builtins`
  - [ ] With builtins `builtin`, it calls all the other builtins with `-h`
  - [ ] `ts` takes as argument a path to a js/ts file and use json  stringify
  to display it
  - [ ] `lush`  will do the same but will display it in lush tokenized format
  - [ ] `lush` will do the same and will add it to history



## TBD

### cd

Change directory

### pwd

Print current directory

### mkdir

Equivalent to the command `mkdir -p` but as a builtin

### log

Short for `console.log`

### say

Like Raku say

### show

```show file.ts
````

Will emit an acorn AST and will unparse it in a `TokenMultiLine`.
Once I will have hooked to acorn, will help to unparse svelte
into Leste.

### z

Change directory using [zoxide](https://github.com/ajeetdsouza/zoxide)
