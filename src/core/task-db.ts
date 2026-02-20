import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { ScheduledTask, TaskRunLog } from "./types";

const DATA_DIR = process.env.ROUTER_DATA_DIR?.trim() || path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "tasks.db");

let db: Database;

export function initTaskDb(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.run("PRAGMA journal_mode = WAL");

  db.run(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      next_run TEXT,
      last_run TEXT,
      last_result TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS task_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      run_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT
    )
  `);
}

// --- row mapper ---

function rowToTask(row: Record<string, unknown>): ScheduledTask {
  return {
    id: row.id as string,
    chatId: row.chat_id as string,
    prompt: row.prompt as string,
    scheduleType: row.schedule_type as ScheduledTask["scheduleType"],
    scheduleValue: row.schedule_value as string,
    nextRun: (row.next_run as string) || null,
    lastRun: (row.last_run as string) || null,
    lastResult: (row.last_result as string) || null,
    status: row.status as ScheduledTask["status"],
    createdAt: row.created_at as string,
  };
}

// --- queries ---

export function createTask(task: Omit<ScheduledTask, "lastRun" | "lastResult">): void {
  db.run(
    `INSERT INTO scheduled_tasks (id, chat_id, prompt, schedule_type, schedule_value, next_run, status, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    [task.id, task.chatId, task.prompt, task.scheduleType, task.scheduleValue, task.nextRun, task.status, task.createdAt],
  );
}

export function getTaskById(id: string): ScheduledTask | undefined {
  const row = db.query("SELECT * FROM scheduled_tasks WHERE id = ?1").get(id) as Record<string, unknown> | null;
  return row ? rowToTask(row) : undefined;
}

export function getAllTasks(): ScheduledTask[] {
  return (db.query("SELECT * FROM scheduled_tasks ORDER BY created_at DESC").all() as Record<string, unknown>[]).map(rowToTask);
}

export function getDueTasks(): ScheduledTask[] {
  const now = new Date().toISOString();
  return (db.query(
    "SELECT * FROM scheduled_tasks WHERE status = 'active' AND next_run IS NOT NULL AND next_run <= ?1 ORDER BY next_run",
  ).all(now) as Record<string, unknown>[]).map(rowToTask);
}

export function getTasksForChat(chatId: string): ScheduledTask[] {
  return (db.query("SELECT * FROM scheduled_tasks WHERE chat_id = ?1 ORDER BY created_at DESC").all(chatId) as Record<string, unknown>[]).map(rowToTask);
}

export function updateTask(id: string, updates: Partial<Pick<ScheduledTask, "prompt" | "scheduleType" | "scheduleValue" | "nextRun" | "status">>): void {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.prompt !== undefined) { fields.push("prompt = ?"); values.push(updates.prompt); }
  if (updates.scheduleType !== undefined) { fields.push("schedule_type = ?"); values.push(updates.scheduleType); }
  if (updates.scheduleValue !== undefined) { fields.push("schedule_value = ?"); values.push(updates.scheduleValue); }
  if (updates.nextRun !== undefined) { fields.push("next_run = ?"); values.push(updates.nextRun); }
  if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }

  if (fields.length === 0) return;
  values.push(id);
  db.run(`UPDATE scheduled_tasks SET ${fields.join(", ")} WHERE id = ?`, values);
}

export function updateTaskAfterRun(id: string, nextRun: string | null, lastResult: string): void {
  const now = new Date().toISOString();
  db.run(
    `UPDATE scheduled_tasks
     SET next_run = ?1, last_run = ?2, last_result = ?3, status = CASE WHEN ?1 IS NULL THEN 'completed' ELSE status END
     WHERE id = ?4`,
    [nextRun, now, lastResult, id],
  );
}

export function deleteTask(id: string): void {
  db.run("DELETE FROM task_run_logs WHERE task_id = ?1", [id]);
  db.run("DELETE FROM scheduled_tasks WHERE id = ?1", [id]);
}

export function logTaskRun(log: TaskRunLog): void {
  db.run(
    "INSERT INTO task_run_logs (task_id, run_at, duration_ms, status, result, error) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    [log.taskId, log.runAt, log.durationMs, log.status, log.result, log.error],
  );
}
