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

### BusyBox integration

The CLI can use BusyBox when a shared library build is available. Provide
`libbusybox.(so|dylib)` plus the companion `libbusybox_host.(so|dylib)` shim in
either `vendor/busybox/<platform>-<arch>/`, `lib/`, or by setting
`LUSH_BUSYBOX_SO` and `LUSH_BUSYBOX_HOST`. On startup the host library loads
BusyBox, enumerates its applets via `busybox --list`, and exposes wrappers so
each applet appears as a builtin. Output is captured through a pipe so history
records BusyBox results alongside native commands. Existing builtins still win
if they share a name with a BusyBox applet.

At this point, we want enough builtins for a demo.

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
