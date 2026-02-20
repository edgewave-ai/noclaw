export interface RouterIncomingMessage {
  chatId: string;
  messageId: string;
  senderType: "user" | "bot" | "unknown";
  text: string;
  timestamp?: string;
}

export interface AgentRunInput {
  chatId: string;
  prompt: string;
  sessionId?: string;
  onToolUse?: (toolName: string, input: Record<string, unknown>) => void;
}

export interface AgentRunOutput {
  text: string;
  sessionId?: string;
}

export type AgentRunner = (input: AgentRunInput) => Promise<AgentRunOutput>;

export interface RouterStateStore {
  getSession(chatId: string): string | undefined;
  setSession(chatId: string, sessionId: string): void;
  clearSession(chatId: string): boolean;
  isDuplicate(chatId: string, messageId: string): boolean;
  markProcessed(chatId: string, messageId: string): void;
  save(): void;
}

export interface RouterDecision {
  replyText?: string;
  skipped?: boolean;
  reason?: string;
}

export interface ScheduledTask {
  id: string;
  chatId: string;
  prompt: string;
  scheduleType: "cron" | "interval" | "once";
  scheduleValue: string;
  nextRun: string | null;
  lastRun: string | null;
  lastResult: string | null;
  status: "active" | "paused" | "completed";
  createdAt: string;
}

export interface TaskRunLog {
  taskId: string;
  runAt: string;
  durationMs: number;
  status: "success" | "error";
  result: string | null;
  error: string | null;
}
