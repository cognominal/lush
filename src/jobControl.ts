import process from "node:process";
import type { ChildProcess } from "node:child_process";

export enum JobStatus {
  Running = "running",
  Stopped = "stopped",
  Done = "done",
}

export interface Job {
  id: number;
  pid: number | null;
  command: string;
  process: ChildProcess;
  status: JobStatus;
  background: boolean;
  startedAt: Date;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stoppedAt?: Date;
  disowned?: boolean;
}

type JobControlHooks = {
  pauseInput: () => void;
  resumeInput: () => void;
  renderPrompt: () => void;
  writeOut: (text: string) => void;
};

const defaultHooks: JobControlHooks = {
  pauseInput: () => {},
  resumeInput: () => {},
  renderPrompt: () => {},
  writeOut: chunk => process.stdout.write(chunk),
};

let hooks: JobControlHooks = { ...defaultHooks };

let nextJobId = 1;
const jobs: Job[] = [];
const doneResolvers: Map<number, { promise: Promise<void>; resolve: () => void }> = new Map();
let foregroundJobId: number | null = null;

function createDonePair(jobId: number) {
  let resolve: () => void;
  const promise = new Promise<void>(res => { resolve = res; });
  doneResolvers.set(jobId, { promise, resolve: resolve! });
}

function resolveJob(job: Job) {
  const pair = doneResolvers.get(job.id);
  if (pair) {
    pair.resolve();
    if (job.disowned || job.status === JobStatus.Done) {
      doneResolvers.delete(job.id);
    }
  }
}

function setForeground(jobId: number | null) {
  foregroundJobId = jobId;
}

function jobMessage(job: Job, statusLabel: string): string {
  return `[${job.id}] ${statusLabel} ${job.command}\n`;
}

function updateJobStatus(job: Job, status: JobStatus) {
  job.status = status;
  if (status === JobStatus.Stopped) {
    job.stoppedAt = new Date();
  }
  if (status === JobStatus.Running) {
    job.stoppedAt = undefined;
  }
}

function pruneDisowned(job: Job) {
  if (!job.disowned) return;
  const idx = jobs.findIndex(entry => entry.id === job.id);
  if (idx !== -1) jobs.splice(idx, 1);
}

export function configureJobControl(newHooks: Partial<JobControlHooks>) {
  hooks = { ...hooks, ...newHooks };
}

export function registerJob(command: string, child: ChildProcess, background: boolean): Job {
  const job: Job = {
    id: nextJobId++,
    pid: child.pid ?? null,
    command,
    process: child,
    status: JobStatus.Running,
    background,
    startedAt: new Date(),
    exitCode: null,
    signal: null,
  };
  jobs.push(job);
  createDonePair(job.id);

  if (!background) {
    hooks.pauseInput();
  }

  child.once("spawn", () => {
    job.pid = child.pid ?? job.pid;
    if (background) {
      hooks.writeOut(jobMessage(job, "Started"));
      hooks.renderPrompt();
    }
  });

  child.once("error", err => {
    updateJobStatus(job, JobStatus.Done);
    job.exitCode = 1;
    job.signal = null;
    if (foregroundJobId === job.id) {
      setForeground(null);
      hooks.resumeInput();
    } else {
      hooks.renderPrompt();
    }
    resolveJob(job);
  });

  child.once("exit", (code, signal) => {
    job.exitCode = typeof code === "number" ? code : null;
    job.signal = signal;
    updateJobStatus(job, JobStatus.Done);
    const wasForeground = foregroundJobId === job.id;
    if (wasForeground) {
      setForeground(null);
      hooks.resumeInput();
    }
    if (!wasForeground && !job.disowned) {
      const label = signal ? `Stopped (${signal})` : "Done";
      hooks.writeOut(jobMessage(job, label));
      hooks.renderPrompt();
    }
    resolveJob(job);
  });

  if (!background) {
    setForeground(job.id);
  }

  return job;
}

export function listJobs(): readonly Job[] {
  return jobs.filter(job => !job.disowned);
}

export function getForegroundJob(): Job | null {
  if (foregroundJobId === null) return null;
  return jobs.find(job => job.id === foregroundJobId) ?? null;
}

export function findJob(spec?: string): Job | undefined {
  const entries = listJobs();
  if (!spec || spec === "%" || spec === "%+") {
    return [...entries].reverse().find(job => job.status !== JobStatus.Done) ?? entries.at(-1);
  }

  if (spec === "%-") {
    return [...entries].reverse().filter(job => job.status !== JobStatus.Done)[1];
  }

  const normalized = spec.startsWith("%") ? spec.slice(1) : spec;
  const numeric = Number.parseInt(normalized, 10);
  if (Number.isFinite(numeric)) {
    return entries.find(job => job.id === numeric) ?? entries.find(job => job.pid === numeric) ?? undefined;
  }

  return entries.find(job => job.command.startsWith(normalized));
}

export function waitForJob(job: Job): Promise<void> {
  const pair = doneResolvers.get(job.id);
  if (pair) return pair.promise;
  return Promise.resolve();
}

export function waitForAllJobs(): Promise<void[]> {
  return Promise.all(listJobs().map(job => waitForJob(job)));
}

export function suspendForegroundJob(): boolean {
  const job = getForegroundJob();
  if (!job) return false;
  const sent = job.process.kill("SIGTSTP");
  if (!sent) return false;
  updateJobStatus(job, JobStatus.Stopped);
  job.background = false;
  setForeground(null);
  hooks.resumeInput();
  hooks.writeOut(`\n${jobMessage(job, "Stopped")}`);
  hooks.renderPrompt();
  return true;
}

export async function resumeJobInForeground(job: Job): Promise<void> {
  if (job.status === JobStatus.Done) return;
  hooks.pauseInput();
  setForeground(job.id);
  updateJobStatus(job, JobStatus.Running);
  job.background = false;
  job.process.kill("SIGCONT");
  await waitForJob(job);
}

export function resumeJobInBackground(job: Job): void {
  if (job.status === JobStatus.Done) return;
  updateJobStatus(job, JobStatus.Running);
  job.background = true;
  job.process.kill("SIGCONT");
  hooks.writeOut(jobMessage(job, "Continued"));
  hooks.renderPrompt();
}

export function killJob(job: Job, signal?: NodeJS.Signals | number): boolean {
  const sent = job.process.kill(signal);
  if (!sent) return false;
  return true;
}

export function disownJob(job: Job): void {
  job.disowned = true;
  pruneDisowned(job);
  resolveJob(job);
}

export function jobStatusLabel(job: Job): string {
  switch (job.status) {
    case JobStatus.Running:
      return job.background ? "Running" : "Foreground";
    case JobStatus.Stopped:
      return "Stopped";
    case JobStatus.Done:
      if (job.signal) return `Terminated (${job.signal})`;
      return job.exitCode === 0 ? "Done" : `Exit ${job.exitCode ?? "?"}`;
    default:
      return "Unknown";
  }
}

export function formatJob(job: Job): string {
  const pid = job.pid === null ? "?" : String(job.pid);
  const status = jobStatusLabel(job);
  return `[${job.id}] ${pid} ${status} ${job.command}`;
}

export function suspendShell(): void {
  hooks.pauseInput();
  process.kill(process.pid, "SIGTSTP");
}

export function resumeShell(): void {
  hooks.resumeInput();
}

export function cleanupFinishedJobs(): void {
  for (const job of [...jobs]) {
    if (job.disowned) {
      pruneDisowned(job);
      continue;
    }
    if (job.status === JobStatus.Done) {
      // Keep done jobs visible once; caller may prune explicitly later.
      continue;
    }
  }
}
