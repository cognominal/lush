# Builtins

Lush attempts to interpret the first word as a builtin before attempting other
interpretations. The line being interpreted as an astre, once chosen its builtin
nature is hardwired. Until we hook to acorn, the line is stored as
`TokenMultiLine`.

It appears there will be no distinction between algebraic mode and shellish
mode. As a result the exact meaning of builtins may change. Anyway a builtin
surface symbol is displayed as italic by default. Probably linking with
[busybox](busybox) will add builtins. The goal is to reduce dependency on
external commands which pose problems of installation and portability.

At this point, we want enough builtins for a demo.

- [x] Core logic
- [x] Builtin command `builtins` that list the builtins
- [ ] Minimal support of builtins `cd`, `pushd`, `popd` (`dirs` TBD). The 3
      latter should print the resulting stack
- [ ] Use minimist
- [x] `-hh` should output one liner help for builtins except `builtins`
- [ ] With builtins `builtin`, it calls all the other builtins with `-h`
- [ ] `ts` takes as argument a path to a js/ts file and use json stringify to
      display it
- [ ] `lush` will do the same but will display it in lush tokenized format
- [ ] `lush` will do the same and will add it to history

## Implemented builtins

### history

The `history` builtin prints the recorded commands with numbered entries. Pass
an optional positive integer to limit the number of lines that are displayed.

### clear

The `clear` builtin erases the visible terminal content and moves the cursor
back to the top-left corner.

### dealing with dirs

#### cd, pushd, popd, dirs

`cd`: Change directory
`dirs`: 
`pushd` 

`pushd`, `popd`, `dirs` print the resulting stack dir

#### mkdir

The `mkdir` builtin mirrors `mkdir -p`, creating any missing parent directories.
Pass one or more path arguments; successful runs stay quiet, just like the
traditional command.

#### mkcd

The `mkcd` builtin combines `mkdir -p` and `cd`: it creates the requested
directory (and parents) before switching the shell to that path.

### History persistence

Command history now persists between sessions. Entries are stored as YAML in
`$XDG_STATE_HOME/lush/history.yaml` (defaulting to
`~/.local/state/lush/history.yaml` when the environment variable is unset). Set
`LUSH_HISTORY` to override the location for a given run.

## TBD


### pwd

Print current directory

### log

Short for `console.log`

### say

Like Raku say

### show

```show file.ts
````

Will emit an acorn AST and will unparse it in a `TokenMultiLine`. Once I will
have hooked to acorn, will help to unparse svelte into Leste.

### z

Change directory using [zoxide](https://github.com/ajeetdsouza/zoxide)
