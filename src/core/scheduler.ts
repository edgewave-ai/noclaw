import { CronExpressionParser } from "cron-parser";
import { getDueTasks, getTaskById, updateTaskAfterRun, logTaskRun } from "./task-db";
import type { ScheduledTask } from "./types";

const POLL_INTERVAL = 60_000;
const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export interface SchedulerDeps {
  runAgent: (prompt: string) => Promise<string>;
  sendMessage: (chatId: string, text: string) => Promise<void>;
}

function computeNextRun(task: ScheduledTask): string | null {
  if (task.scheduleType === "cron") {
    const expr = CronExpressionParser.parse(task.scheduleValue, { tz: TIMEZONE });
    return expr.next().toISOString();
  }
  if (task.scheduleType === "interval") {
    const ms = parseInt(task.scheduleValue, 10);
    return new Date(Date.now() + ms).toISOString();
  }
  return null;
}

let running = false;

export function startScheduler(deps: SchedulerDeps): void {
  if (running) return;
  running = true;
  console.log("[scheduler] started, polling every 60s");

  const poll = async () => {
    try {
      const dueTasks = getDueTasks();
      if (dueTasks.length > 0) {
        console.log(`[scheduler] ${dueTasks.length} task(s) due`);
      }

      for (const task of dueTasks) {
        const current = getTaskById(task.id);
        if (!current || current.status !== "active") continue;

        await runTask(current, deps);
      }
    } catch (err) {
      console.error("[scheduler] poll error:", err);
    }

    setTimeout(poll, POLL_INTERVAL);
  };

  poll();
}

async function runTask(task: ScheduledTask, deps: SchedulerDeps): Promise<void> {
  const startTime = Date.now();
  console.log(`[scheduler] running task ${task.id}: "${task.prompt.slice(0, 60)}"`);

  let result: string | null = null;
  let error: string | null = null;

  try {
    result = await deps.runAgent(task.prompt);
    if (result) {
      await deps.sendMessage(task.chatId, result);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    console.error(`[scheduler] task ${task.id} failed:`, error);
  }

  const durationMs = Date.now() - startTime;

  logTaskRun({
    taskId: task.id,
    runAt: new Date().toISOString(),
    durationMs,
    status: error ? "error" : "success",
    result,
    error,
  });

  const nextRun = computeNextRun(task);
  const summary = error ? `Error: ${error}` : (result?.slice(0, 200) ?? "Completed");
  updateTaskAfterRun(task.id, nextRun, summary);

  console.log(`[scheduler] task ${task.id} done in ${durationMs}ms, next: ${nextRun ?? "none"}`);
}
