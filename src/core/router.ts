import type { AgentRunner, RouterDecision, RouterIncomingMessage, RouterStateStore } from "./types";

const CLEAR_COMMAND = /^\/clear$/i;

export class ConversationRouter {
  constructor(
    private readonly deps: {
      assistantName: string;
      stateStore: RouterStateStore;
      runAgent: AgentRunner;
      sendMessage?: (chatId: string, text: string) => Promise<void>;
    },
  ) {}

  async handleIncoming(message: RouterIncomingMessage): Promise<RouterDecision> {
    if (message.senderType !== "user") {
      return { skipped: true, reason: "sender-not-user" };
    }

    const text = message.text.trim();
    if (!text) {
      return { skipped: true, reason: "empty-message" };
    }

    if (this.deps.stateStore.isDuplicate(message.chatId, message.messageId)) {
      return { skipped: true, reason: "duplicate-message" };
    }
    this.deps.stateStore.markProcessed(message.chatId, message.messageId);

    if (CLEAR_COMMAND.test(text)) {
      const hadSession = this.deps.stateStore.clearSession(message.chatId);
      this.deps.stateStore.save();
      return {
        replyText: hadSession
          ? `${this.deps.assistantName}: Session cleared. Next message will start with a fresh context.`
          : `${this.deps.assistantName}: No session to clear.`,
      };
    }

    const sessionId = this.deps.stateStore.getSession(message.chatId);
    const contextualPrompt = this.buildContextPrompt(message.chatId, text);
    const { sendMessage } = this.deps;
    const result = await this.deps.runAgent({
      chatId: message.chatId,
      prompt: contextualPrompt,
      sessionId,
      onToolUse: sendMessage
        ? (toolName, toolInput) => {
            const command = typeof toolInput.command === "string" ? toolInput.command : JSON.stringify(toolInput);
            sendMessage(message.chatId, `🔧 ${toolName}: ${command}`).catch(() => {});
          }
        : undefined,
    });

    if (result.sessionId) {
      this.deps.stateStore.setSession(message.chatId, result.sessionId);
    }
    this.deps.stateStore.save();

    const reply = result.text.trim() || "(Agent returned no content)";
    return { replyText: `${this.deps.assistantName}: ${reply}` };
  }

  private buildContextPrompt(chatId: string, prompt: string): string {
    return [
      `[channel=feishu]`,
      `[reply_to_chat_id=${chatId}]`,
      `[prefix_responses_with="${this.deps.assistantName}:"]`,
      "",
      `User message: ${prompt}`,
    ].join("\n");
  }
}
