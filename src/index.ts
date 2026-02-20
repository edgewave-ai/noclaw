import * as Lark from "@larksuiteoapi/node-sdk";
import { runClaudeAgent } from "./core/agent";
import { ConversationRouter } from "./core/router";
import { FileRouterStateStore } from "./core/state-store";
import { initTaskDb } from "./core/task-db";
import { startScheduler } from "./core/scheduler";
import type { RouterIncomingMessage } from "./core/types";

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const ASSISTANT_NAME = process.env.ASSISTANT_NAME || "Andy";

if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
  console.error("Error: FEISHU_APP_ID and FEISHU_APP_SECRET must be set in .env");
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Error: ANTHROPIC_API_KEY must be set in .env");
  process.exit(1);
}

const client = new Lark.Client({
  appId: FEISHU_APP_ID,
  appSecret: FEISHU_APP_SECRET,
  appType: Lark.AppType.SelfBuild,
  domain: Lark.Domain.Feishu,
});

const stateStore = new FileRouterStateStore();

async function sendMessage(chatId: string, text: string): Promise<void> {
  await client.im.v1.message.create({
    params: { receive_id_type: "chat_id" },
    data: {
      receive_id: chatId,
      content: JSON.stringify({ text }),
      msg_type: "text",
    },
  });
}

const router = new ConversationRouter({
  assistantName: ASSISTANT_NAME,
  stateStore,
  runAgent: runClaudeAgent,
  sendMessage,
});

function parseTextContent(rawContent: string): string {
  try {
    return (JSON.parse(rawContent) as { text?: string }).text ?? "";
  } catch {
    return rawContent;
  }
}

async function replyToMessage(messageId: string, text: string): Promise<void> {
  await client.im.v1.message.reply({
    path: { message_id: messageId },
    data: {
      content: JSON.stringify({ text }),
      msg_type: "text",
    },
  });
}

async function addReaction(messageId: string, emojiType: string): Promise<void> {
  try {
    await client.im.v1.messageReaction.create({
      path: { message_id: messageId },
      data: { reaction_type: { emoji_type: emojiType } },
    });
  } catch {
    // reaction 失败不影响主流程
  }
}


const processingMessages = new Set<string>();

const dispatcher = new Lark.EventDispatcher({}).register({
  "im.message.receive_v1": async (data) => {
    const { message, sender } = data;

    if (message.message_type !== "text") {
      return;
    }

    if (processingMessages.has(message.message_id)) {
      return;
    }
    processingMessages.add(message.message_id);

    const incoming: RouterIncomingMessage = {
      chatId: message.chat_id,
      messageId: message.message_id,
      senderType: sender.sender_type === "user" ? "user" : "unknown",
      text: parseTextContent(message.content),
      timestamp: new Date().toISOString(),
    };

    const normalized = incoming.text.trim();
    if (!normalized) {
      processingMessages.delete(message.message_id);
      return;
    }

    console.log(`[recv] chat=${incoming.chatId} msg="${normalized}"`);

    await addReaction(incoming.messageId, "MeMeMe");

    try {
      const decision = await router.handleIncoming(incoming);

      if (!decision.replyText) {
        return;
      }

      console.log(`[send] msg_id=${incoming.messageId} reply="${decision.replyText.slice(0, 80)}..."`);
      await replyToMessage(incoming.messageId, decision.replyText);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[error] ${errMsg}`);
      await replyToMessage(incoming.messageId, `${ASSISTANT_NAME}: 出错了：${errMsg}`).catch(() => {});
    } finally {
      processingMessages.delete(message.message_id);
    }
  },
});

const wsClient = new Lark.WSClient({
  appId: FEISHU_APP_ID,
  appSecret: FEISHU_APP_SECRET,
});

initTaskDb();
startScheduler({
  runAgent: async (prompt) => {
    const result = await runClaudeAgent({ chatId: "scheduler", prompt });
    return result.text;
  },
  sendMessage,
});

console.log("Starting Feishu Bot via WebSocket long connection...");
wsClient.start({ eventDispatcher: dispatcher });
