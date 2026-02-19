import * as Lark from "@larksuiteoapi/node-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;

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

async function askAgent(prompt: string): Promise<string> {
  const chunks: string[] = [];

  for await (const event of query({
    prompt,
    options: {
      maxTurns: 10,
      permissionMode: "bypassPermissions",
    },
  })) {
    if (event.type === "assistant") {
      for (const block of event.message.content) {
        if (block.type === "text") {
          chunks.push(block.text);
        }
      }
    }
  }

  const result = chunks.join("").trim();
  return result || "（Agent 未返回任何内容）";
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

const dispatcher = new Lark.EventDispatcher({}).register({
  "im.message.receive_v1": async (data) => {
    const { message, sender } = data;

    if (message.message_type !== "text") {
      return;
    }

    if (sender.sender_type !== "user") {
      return;
    }

    let userText: string;
    try {
      userText = (JSON.parse(message.content) as { text?: string }).text ?? "";
    } catch {
      userText = message.content;
    }

    userText = userText.trim();
    if (!userText) {
      return;
    }

    console.log(`[recv] chat=${message.chat_id} msg="${userText}"`);

    try {
      const reply = await askAgent(userText);
      console.log(`[send] msg_id=${message.message_id} reply="${reply.slice(0, 80)}..."`);
      await replyToMessage(message.message_id, reply);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[error] ${errMsg}`);
      await replyToMessage(message.message_id, `出错了：${errMsg}`).catch(() => {});
    }
  },
});

const wsClient = new Lark.WSClient({
  appId: FEISHU_APP_ID,
  appSecret: FEISHU_APP_SECRET,
});

console.log("Starting Feishu Bot via WebSocket long connection...");
wsClient.start({ eventDispatcher: dispatcher });
