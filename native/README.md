# BusyBox Shared Library Setup

To enable the BusyBox-builtins integration, you need both the BusyBox shared
library and the lightweight host shim shipped in `native/`.

## 1. Build BusyBox as a shared object

BusyBox does not ship prebuilt shared libraries, so you must compile it
yourself. A minimal build looks like this (from the BusyBox source tree):

```sh
make menuconfig
```

Enable the following options:

- `Settings  → Build BusyBox as a shared library (CONFIG_FEATURE_SHARED_BUSYBOX)`
- (optional but recommended) `Settings → Build shared libbusybox with position independent code`

You can disable unused applets or leave the defaults. Then build:

```sh
make busybox
make install
```

The build will emit `libbusybox.so` (on Linux) or `libbusybox.dylib` (on macOS
when cross-compiling). Copy the resulting library next to your checkout, for
example:

```sh
cp path/to/busybox/libbusybox.so native/
```

If you are targeting macOS, cross-compile or use a distribution that provides a
Darwin build; once compiled, place it as `native/libbusybox.dylib` instead.

## 2. Build the host shim

We vendor a small C shim that protects the Bun runtime while invoking BusyBox.
Compile it once per platform:

macOS (clang):

```sh
clang -dynamiclib -o native/libbusybox_host.dylib native/busybox_host.c
```

Linux (gcc or clang):

```sh
gcc -fPIC -shared -o native/libbusybox_host.so native/busybox_host.c -ldl
```

The shim exposes the `busybox_host_*` functions expected by
`src/builtins/busybox.ts`.

## 3. Point the CLI at the libraries

When both libraries live under `native/`, no extra configuration is needed. The
shell also checks:

- `vendor/busybox/<platform>-<arch>/`
- `lib/`
- Environment variables `LUSH_BUSYBOX_SO` and `LUSH_BUSYBOX_HOST`

If you store the files elsewhere, export the env vars before running the CLI:

```sh
export LUSH_BUSYBOX_SO=/absolute/path/to/libbusybox.so
export LUSH_BUSYBOX_HOST=/absolute/path/to/libbusybox_host.so
```

## 4. Verify

Run the CLI and list the builtins:

```sh
bun run start
# inside the shell
builtins | head
```

BusyBox applets should now appear alongside the native builtins. History and
output capture continue to work via the FFI shim.
