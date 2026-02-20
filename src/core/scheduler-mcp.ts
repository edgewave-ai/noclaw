import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { CronExpressionParser } from "cron-parser";
import {
  createTask,
  getTaskById,
  getTasksForChat,
  getAllTasks,
  updateTask,
  deleteTask,
} from "./task-db";
import type { ScheduledTask } from "./types";

const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

function generateId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function computeNextRun(scheduleType: string, scheduleValue: string): string | null {
  if (scheduleType === "cron") {
    const expr = CronExpressionParser.parse(scheduleValue, { tz: TIMEZONE });
    return expr.next().toISOString();
  }
  if (scheduleType === "interval") {
    return new Date(Date.now() + parseInt(scheduleValue, 10)).toISOString();
  }
  if (scheduleType === "once") {
    const t = new Date(scheduleValue);
    return t > new Date() ? t.toISOString() : null;
  }
  return null;
}

function formatTask(task: ScheduledTask): string {
  return [
    `ID: ${task.id}`,
    `Prompt: ${task.prompt}`,
    `Schedule: ${task.scheduleType} (${task.scheduleValue})`,
    `Status: ${task.status}`,
    `Next run: ${task.nextRun ?? "N/A"}`,
    `Last run: ${task.lastRun ?? "Never"}`,
    `Last result: ${task.lastResult ?? "N/A"}`,
  ].join("\n");
}

export function createSchedulerMcp(chatId: string) {
  return createSdkMcpServer({
    name: "noclaw-scheduler",
    version: "1.0.0",
    tools: [
      tool(
        "schedule_task",
        "Schedule a recurring or one-time task. The task will run as a Claude agent and can send messages back to this chat.",
        {
          prompt: z.string().describe("The instruction for the task when it runs"),
          schedule_type: z.enum(["cron", "interval", "once"]).describe(
            'Type: "cron" (e.g. "0 9 * * 1-5"), "interval" (milliseconds), "once" (ISO timestamp)',
          ),
          schedule_value: z.string().describe("Cron expression, milliseconds, or ISO timestamp"),
        },
        async (args) => {
          const nextRun = computeNextRun(args.schedule_type, args.schedule_value);
          if (nextRun === null && args.schedule_type !== "once") {
            return { content: [{ type: "text" as const, text: "Error: Invalid schedule, task would never run." }] };
          }

          const task: Omit<ScheduledTask, "lastRun" | "lastResult"> = {
            id: generateId(),
            chatId,
            prompt: args.prompt,
            scheduleType: args.schedule_type,
            scheduleValue: args.schedule_value,
            nextRun,
            status: "active",
            createdAt: new Date().toISOString(),
          };

          createTask(task);

          return { content: [{ type: "text" as const, text: `Task scheduled!\n\n${formatTask(task as ScheduledTask)}` }] };
        },
      ),

      tool(
        "list_tasks",
        "List all scheduled tasks for this chat.",
        {},
        async () => {
          const tasks = getTasksForChat(chatId);
          if (tasks.length === 0) {
            return { content: [{ type: "text" as const, text: "No scheduled tasks." }] };
          }
          const text = tasks.map((t, i) => `--- Task ${i + 1} ---\n${formatTask(t)}`).join("\n\n");
          return { content: [{ type: "text" as const, text: `${tasks.length} task(s):\n\n${text}` }] };
        },
      ),

      tool(
        "pause_task",
        "Pause a scheduled task.",
        { task_id: z.string().describe("Task ID") },
        async (args) => {
          const task = getTaskById(args.task_id);
          if (!task) return { content: [{ type: "text" as const, text: `Task not found: ${args.task_id}` }] };
          if (task.chatId !== chatId) return { content: [{ type: "text" as const, text: "Access denied." }] };

          updateTask(args.task_id, { status: "paused" });
          return { content: [{ type: "text" as const, text: `Task ${args.task_id} paused.` }] };
        },
      ),

      tool(
        "resume_task",
        "Resume a paused task.",
        { task_id: z.string().describe("Task ID") },
        async (args) => {
          const task = getTaskById(args.task_id);
          if (!task) return { content: [{ type: "text" as const, text: `Task not found: ${args.task_id}` }] };
          if (task.chatId !== chatId) return { content: [{ type: "text" as const, text: "Access denied." }] };

          const nextRun = computeNextRun(task.scheduleType, task.scheduleValue);
          updateTask(args.task_id, { status: "active", nextRun });
          return { content: [{ type: "text" as const, text: `Task ${args.task_id} resumed. Next run: ${nextRun}` }] };
        },
      ),

      tool(
        "cancel_task",
        "Cancel and delete a scheduled task.",
        { task_id: z.string().describe("Task ID") },
        async (args) => {
          const task = getTaskById(args.task_id);
          if (!task) return { content: [{ type: "text" as const, text: `Task not found: ${args.task_id}` }] };
          if (task.chatId !== chatId) return { content: [{ type: "text" as const, text: "Access denied." }] };

          deleteTask(args.task_id);
          return { content: [{ type: "text" as const, text: `Task ${args.task_id} cancelled.` }] };
        },
      ),
    ],
  });
}

// also export for scheduler.ts to reuse
export { computeNextRun };
