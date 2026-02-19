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
