# builtins

It appears there will be no distinction between algebraic mode and shellish mode.
As a result the exact meaning of builtins may change.
Anyway a builtin surface symbol is displayed as italic by default.
Probably linking with busybox will add builtins. The goal is to reduce
dependency on external commands which poses problem of installation and portability.

### TBD

### cd

Change directory

### pwd

### show

```show file.ts
````

Will emit an accorn ast and will unparse it in a `Token[][]`.
Once I will have hooked to acorn, will help to unparse svelte
into leste.

### z

Change directory using [zoxide](https://github.com/ajeetdsouza/zoxide)
