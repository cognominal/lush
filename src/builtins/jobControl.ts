import {
  registerBuiltin,
  registerBuiltinHelp,
  type BuiltinContext,
} from "./registry.ts";
import { detectHelpLevel } from "./helpFlags.ts";
import {
  listJobs,
  formatJob,
  findJob,
  resumeJobInForeground,
  resumeJobInBackground,
  suspendForegroundJob,
  suspendShell,
  killJob,
  waitForJob,
  waitForAllJobs,
  disownJob,
  jobStatusLabel,
} from "../jobControl.ts";
import { JobStatus } from "../types.ts";

function respondHelp(ctx: BuiltinContext, cluster: string, single = "TBD -h\n", double = "TBD -h -h\n") {
  const level = detectHelpLevel(ctx);
  if (level === "cluster") {
    ctx.write(`${cluster}\n`);
    return true;
  }
  if (level === "double") {
    ctx.write(double);
    return true;
  }
  if (level === "single") {
    ctx.write(single);
    return true;
  }
  return false;
}

registerBuiltin("jobs", ctx => {
  if (respondHelp(ctx, "List active jobs")) return;
  const entries = listJobs();
  if (!entries.length) {
    ctx.write("jobs: no active jobs\n");
    return;
  }
  const lines = entries.map(job => formatJob(job));
  ctx.write(`${lines.join("\n")}\n`);
});

registerBuiltinHelp("jobs", "List tracked jobs");

registerBuiltin("fg", async ctx => {
  if (respondHelp(ctx, "Resume the most recent job in the foreground")) return;
  const spec = ctx.argv[0];
  const job = findJob(spec);
  if (!job) {
    const target = spec ?? "%+";
    ctx.write(`fg: no such job ${target}\n`);
    return;
  }
  if (job.status === JobStatus.Done) {
    ctx.write(`fg: job already complete ${job.command}\n`);
    return;
  }
  ctx.write(`${job.command}\n`);
  await resumeJobInForeground(job);
});

registerBuiltinHelp("fg", "Resume a job in the foreground");

registerBuiltin("bg", ctx => {
  if (respondHelp(ctx, "Resume a stopped job in the background")) return;
  const spec = ctx.argv[0];
  const job = findJob(spec);
  if (!job) {
    const target = spec ?? "%+";
    ctx.write(`bg: no such job ${target}\n`);
    return;
  }
  if (job.status !== JobStatus.Stopped) {
    ctx.write(`bg: job not stopped (${jobStatusLabel(job)})\n`);
    return;
  }
  resumeJobInBackground(job);
});

registerBuiltinHelp("bg", "Continue a stopped job in the background");

registerBuiltin("kill", ctx => {
  if (respondHelp(ctx, "Send a signal to a job or pid")) return;
  if (!ctx.argv.length) {
    ctx.write("kill: missing target\n");
    return;
  }
  const targets = [...ctx.argv];
  let signal: NodeJS.Signals | number | undefined;
  const first = targets[0];
  if (first?.startsWith("-")) {
    targets.shift();
    const value = first.slice(1);
    const numeric = Number.parseInt(value, 10);
    if (Number.isFinite(numeric)) {
      signal = numeric;
    } else if (value.length) {
      signal = value.toUpperCase() as NodeJS.Signals;
    }
  }
  if (!targets.length) {
    ctx.write("kill: missing target\n");
    return;
  }
  for (const spec of targets) {
    const job = findJob(spec);
    if (job) {
      if (!killJob(job, signal)) {
        ctx.write(`kill: failed for ${spec}\n`);
      }
      continue;
    }
    const pid = Number.parseInt(spec, 10);
    if (!Number.isFinite(pid)) {
      ctx.write(`kill: invalid target ${spec}\n`);
      continue;
    }
    try {
      process.kill(pid, signal);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.write(`kill: ${message}\n`);
    }
  }
});

registerBuiltinHelp("kill", "Send a signal to a job or pid");

registerBuiltin("wait", async ctx => {
  if (respondHelp(ctx, "Wait for jobs to finish")) return;
  if (!ctx.argv.length) {
    await waitForAllJobs();
    return;
  }
  for (const spec of ctx.argv) {
    const job = findJob(spec);
    if (!job) {
      ctx.write(`wait: no such job ${spec}\n`);
      continue;
    }
    await waitForJob(job);
  }
});

registerBuiltinHelp("wait", "Wait on the last job or provided IDs");

registerBuiltin("suspend", ctx => {
  if (respondHelp(ctx, "Suspend the shell")) return;
  suspendShell();
});

registerBuiltinHelp("suspend", "Suspend the shell");

registerBuiltin("disown", ctx => {
  if (respondHelp(ctx, "Forget about a job")) return;
  if (!ctx.argv.length) {
    ctx.write("disown: missing job spec\n");
    return;
  }
  for (const spec of ctx.argv) {
    const job = findJob(spec);
    if (!job) {
      ctx.write(`disown: no such job ${spec}\n`);
      continue;
    }
    disownJob(job);
  }
});

registerBuiltinHelp("disown", "Remove jobs from tracking");

registerBuiltin("suspend-job", ctx => {
  if (respondHelp(ctx, "Suspend the current foreground job")) return;
  if (!suspendForegroundJob()) {
    ctx.write("suspend-job: no foreground job\n");
  }
});

registerBuiltinHelp("suspend-job", "Suspend the foreground job");
