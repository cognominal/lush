import fs from "node:fs";
import path from "node:path";
import {
  registerBuiltin,
  registerBuiltinHelp,
  getBuiltin,
  type BuiltinContext,
} from "./registry.ts";

interface BusyboxHostFFI {
  symbols: {
    busybox_host_new: (path: string) => number;
    busybox_host_free: (handle: number) => void;
    busybox_host_applet_count: (handle: number) => number;
    busybox_host_applet_name: (handle: number, index: number) => number;
    busybox_host_run: (
      handle: number,
      argc: number,
      argv: number,
      stdoutFd: number,
      stderrFd: number,
      exitCodePtr: number,
    ) => number;
  };
}

interface FFIBridge {
  dlopen: (path: string, symbols: Record<string, unknown>) => any;
  CString: { new (ptr: number): String };
  ptr: (view: ArrayBufferView | Buffer) => number;
}

interface BusyboxIntegration {
  host: BusyboxHostFFI;
  handle: number;
  applets: string[];
  ffi: FFIBridge;
  libc: LibcBridge | null;
}

interface Pipe {
  readFD: number;
  writeFD: number;
}

interface ArgvEncodeResult {
  argvPtr: number;
  cleanup: () => void;
}

interface LibcBridge {
  pipe: (outPtr: number) => number;
}

const FFI_TYPE = {
  ptr: 12,
  int: 5,
  void: 13,
  cstring: 14,
} as const;

const POINTER_SIZE = process.arch.includes("64") ? 8 : 4;

const ffi = resolveFFI();
const busybox = ffi ? initialiseBusybox(ffi) : null;

if (busybox) {
  registerApplets(busybox);
}

function resolveFFI(): FFIBridge | null {
  const bun = (globalThis as unknown as { Bun?: { FFI?: FFIBridge } }).Bun;
  if (!bun || !bun.FFI) return null;
  const bridge = bun.FFI as Partial<FFIBridge>;
  if (typeof bridge.dlopen !== "function" || typeof bridge.ptr !== "function" || typeof bridge.CString !== "function") {
    return null;
  }
  const dlopenFn = (bridge.dlopen as FFIBridge["dlopen"]).bind(bridge);
  const ptrFn = (bridge.ptr as FFIBridge["ptr"]).bind(bridge);
  const CStringCtor = bridge.CString as FFIBridge["CString"];
  return {
    dlopen: dlopenFn,
    CString: CStringCtor,
    ptr: ptrFn,
  };
}

function initialiseBusybox(ffiBridge: FFIBridge): BusyboxIntegration | null {
  const busyboxPath = resolveBusyboxSharedObject();
  const hostPath = resolveHostLibrary();
  if (!busyboxPath || !hostPath) return null;

  let host: BusyboxHostFFI;
  try {
    host = ffiBridge.dlopen(hostPath, {
      busybox_host_new: { args: [FFI_TYPE.cstring], returns: FFI_TYPE.ptr },
      busybox_host_free: { args: [FFI_TYPE.ptr], returns: FFI_TYPE.void },
      busybox_host_applet_count: { args: [FFI_TYPE.ptr], returns: FFI_TYPE.int },
      busybox_host_applet_name: { args: [FFI_TYPE.ptr, FFI_TYPE.int], returns: FFI_TYPE.ptr },
      busybox_host_run: {
        args: [FFI_TYPE.ptr, FFI_TYPE.int, FFI_TYPE.ptr, FFI_TYPE.int, FFI_TYPE.int, FFI_TYPE.ptr],
        returns: FFI_TYPE.int,
      },
    }) as BusyboxHostFFI;
  } catch {
    return null;
  }

  let handle = 0;
  try {
    handle = host.symbols.busybox_host_new(busyboxPath);
  } catch {
    return null;
  }

  if (!handle) return null;

  const applets = collectApplets(ffiBridge, host, handle);
  if (!applets.length) {
    try {
      host.symbols.busybox_host_free(handle);
    } catch {
      /* ignore */
    }
    return null;
  }

  const libc = loadLibc(ffiBridge);

  process.on("exit", () => {
    try {
      host.symbols.busybox_host_free(handle);
    } catch {
      /* ignore */
    }
  });

  return { host, handle, applets, ffi: ffiBridge, libc };
}

function resolveBusyboxSharedObject(): string | null {
  const hints = new Set<string>();
  const env = process.env.LUSH_BUSYBOX_SO ?? process.env.BUSYBOX_SO ?? process.env.BUSYBOX_PATH;
  if (env) hints.add(env);
  const cwd = process.cwd();
  hints.add(path.join(cwd, "vendor", "busybox", `${process.platform}-${process.arch}`, sharedName()));
  hints.add(path.join(cwd, "lib", sharedName()));
  hints.add(path.join(cwd, "native", sharedName()));
  hints.add(sharedName());

  for (const candidate of hints) {
    const resolved = resolveExistingFile(candidate);
    if (resolved) return resolved;
  }
  return null;
}

function resolveHostLibrary(): string | null {
  const hints = new Set<string>();
  const env = process.env.LUSH_BUSYBOX_HOST;
  if (env) hints.add(env);
  const cwd = process.cwd();
  hints.add(path.join(cwd, "vendor", "busybox", `${process.platform}-${process.arch}`, hostName()));
  hints.add(path.join(cwd, "lib", hostName()));
  hints.add(path.join(cwd, "native", hostName()));
  hints.add(hostName());

  for (const candidate of hints) {
    const resolved = resolveExistingFile(candidate);
    if (resolved) return resolved;
  }
  return null;
}

function sharedName(): string {
  return process.platform === "darwin" ? "libbusybox.dylib" : "libbusybox.so";
}

function hostName(): string {
  return process.platform === "darwin" ? "libbusybox_host.dylib" : "libbusybox_host.so";
}

function resolveExistingFile(candidate: string): string | null {
  if (path.isAbsolute(candidate)) {
    return fs.existsSync(candidate) ? candidate : null;
  }
  const cwdCandidate = path.join(process.cwd(), candidate);
  if (fs.existsSync(cwdCandidate)) return cwdCandidate;
  const searchPath = [process.env.LD_LIBRARY_PATH, process.env.DYLD_LIBRARY_PATH, process.env.PATH]
    .filter(Boolean)
    .join(path.delimiter);
  const pathDirs = searchPath.split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    const full = path.join(dir, candidate);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function collectApplets(ffiBridge: FFIBridge, host: BusyboxHostFFI, handle: number): string[] {
  let count = 0;
  try {
    count = host.symbols.busybox_host_applet_count(handle);
  } catch {
    return [];
  }
  if (!Number.isFinite(count) || count <= 0) return [];
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    let namePtr = 0;
    try {
      namePtr = host.symbols.busybox_host_applet_name(handle, i);
    } catch {
      continue;
    }
    if (!namePtr) continue;
    try {
      const name = String(new ffiBridge.CString(namePtr));
      if (name && !getBuiltin(name)) {
        names.push(name);
      }
    } catch {
      continue;
    }
  }
  return names.sort();
}

function registerApplets(integration: BusyboxIntegration) {
  for (const applet of integration.applets) {
    if (getBuiltin(applet)) continue;
    registerBuiltin(applet, ctx => runApplet(integration, applet, ctx));
    registerBuiltinHelp(applet, `BusyBox shared applet ${applet}`);
  }
}

function runApplet(integration: BusyboxIntegration, applet: string, ctx: BuiltinContext) {
  const argv = [applet, ...ctx.argv];
  const encode = encodeArgv(integration.ffi, argv);
  const stdoutPipe = createPipe(integration.ffi, integration.libc);
  const stderrPipe = createPipe(integration.ffi, integration.libc);
  const exitCode = new Int32Array(1);

  try {
    const stdoutFd = stdoutPipe?.writeFD ?? -1;
    const stderrFd = stderrPipe?.writeFD ?? -1;
    const rc = integration.host.symbols.busybox_host_run(
      integration.handle,
      argv.length,
      encode.argvPtr,
      stdoutFd,
      stderrFd,
      integration.ffi.ptr(exitCode),
    );

    if (stdoutPipe) {
      safeClose(stdoutPipe.writeFD);
      stdoutPipe.writeFD = -1;
    }
    if (stderrPipe) {
      safeClose(stderrPipe.writeFD);
      stderrPipe.writeFD = -1;
    }

    if (stdoutPipe) drainPipe(stdoutPipe.readFD, ctx.write);
    if (stderrPipe) drainPipe(stderrPipe.readFD, chunk => ctx.write(chunk));

    if (rc !== 0) {
      ctx.write(`busybox ${applet} run failed: ${rc}\n`);
    }
    const status = exitCode[0];
    if (Number.isFinite(status) && status !== 0) {
      ctx.write(`busybox ${applet} exited with code ${status}\n`);
    }
  } catch (err) {
    ctx.write(`busybox ${applet} threw: ${formatError(err)}\n`);
  } finally {
    if (stdoutPipe) safeClose(stdoutPipe.readFD);
    if (stderrPipe) safeClose(stderrPipe.readFD);
    encode.cleanup();
  }
}

function encodeArgv(ffiBridge: FFIBridge, argv: string[]): ArgvEncodeResult {
  const buffers = argv.map(arg => Buffer.from(`${arg}\0`, "utf8"));
  if (POINTER_SIZE === 8) {
    const pointerArray = new BigUint64Array(buffers.length + 1);
    for (let i = 0; i < buffers.length; i++) {
      pointerArray[i] = BigInt(ffiBridge.ptr(buffers[i]));
    }
    pointerArray[pointerArray.length - 1] = 0n;
    const argvPtr = ffiBridge.ptr(pointerArray);
    return {
      argvPtr,
      cleanup: () => {
        void buffers;
        void pointerArray;
      },
    };
  }
  const pointerArray = new Uint32Array(buffers.length + 1);
  for (let i = 0; i < buffers.length; i++) {
    pointerArray[i] = ffiBridge.ptr(buffers[i]) >>> 0;
  }
  pointerArray[pointerArray.length - 1] = 0;
  const argvPtr = ffiBridge.ptr(pointerArray);
  return {
    argvPtr,
    cleanup: () => {
      void buffers;
      void pointerArray;
    },
  };
}

function loadLibc(ffiBridge: FFIBridge): LibcBridge | null {
  const candidates = process.platform === "darwin"
    ? ["/usr/lib/libSystem.B.dylib"]
    : ["libc.so.6", "libc.so", "/lib/x86_64-linux-gnu/libc.so.6", "/lib/aarch64-linux-gnu/libc.so.6"];
  for (const candidate of candidates) {
    try {
      const libc = ffiBridge.dlopen(candidate, {
        pipe: { args: [FFI_TYPE.ptr], returns: FFI_TYPE.int },
      }) as { symbols: { pipe: (ptr: number) => number } };
      return { pipe: libc.symbols.pipe };
    } catch {
      continue;
    }
  }
  return null;
}

function createPipe(ffiBridge: FFIBridge, libc: LibcBridge | null): Pipe | null {
  if (!libc) return null;
  const fds = new Int32Array(2);
  const rc = libc.pipe(ffiBridge.ptr(fds));
  if (rc !== 0) return null;
  return { readFD: fds[0]!, writeFD: fds[1]! };
}

function drainPipe(fd: number, write: (chunk: string) => void) {
  const chunk = Buffer.allocUnsafe(4096);
  try {
    while (true) {
      const bytes = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (!Number.isFinite(bytes) || bytes <= 0) break;
      write(chunk.subarray(0, bytes).toString("utf8"));
    }
  } catch {
    /* ignore */
  }
}

function safeClose(fd: number) {
  if (fd < 0) return;
  try {
    fs.closeSync(fd);
  } catch {
    /* ignore */
  }
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
