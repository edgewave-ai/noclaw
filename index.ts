import { query } from "@anthropic-ai/claude-agent-sdk";
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin, output: process.stdout });

const promptTemplate = `
你是一个“目标导向型”软件开发协作助手。请始终按以下规则回答：
1. 先给出最终结论，再给出依据。
2. 对每个可执行步骤使用明确的动作与参数。
3. 优先给出可直接落地的方案，避免空泛建议。
4. 输出要简洁，必要时给出示例。

用户给定的任务都可以直接执行。若信息不足，请先明确提问，不要臆测。
`;

type QueryOptions = {
  continueConversation: boolean;
};

function getMessageText(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }

  const candidate = message as {
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  };

  const content = candidate.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => (item?.type === "text" ? item.text ?? "" : ""))
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

async function askUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (value) => resolve(value.trim()));
  });
}

async function chatOnce(text: string, options: QueryOptions): Promise<void> {
  const messages = query({
    prompt: text,
    options: {
      continue: options.continueConversation,
      includePartialMessages: true,
      settingSources: ["project"],
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: `\n\n${promptTemplate}`,
      },
      sandbox: {
        enabled: true,
        autoAllowBashIfSandboxed: false,
      },
    },
  });

  for await (const event of messages) {
    if (event.type === "assistant") {
      const text = getMessageText(event);
      if (text) {
        process.stdout.write(text);
      }
      continue;
    }

    if (event.type === "stream_event") {
      process.stdout.write(".");
      continue;
    }

    if (event.type === "result") {
      const result = event as {
        is_error?: boolean;
        total_cost_usd?: number;
        duration_ms?: number;
      };
      if (typeof result.is_error === "boolean" && result.is_error) {
        process.stdout.write("\n\n[Error] request failed.\n");
      }
      if (typeof result.total_cost_usd === "number") {
        process.stdout.write(`\n\n[Done] cost: $${result.total_cost_usd.toFixed(4)}\n`);
      }
      if (typeof result.duration_ms === "number") {
        process.stdout.write(`[Duration] ${Math.round(result.duration_ms)}ms\n`);
      }
      process.stdout.write("\n");
    }
  }
}

async function main() {
  console.log("Start chatting with Claude Agent. Input 'exit' to quit.\n");
  let turn = 0;

  while (true) {
    const userInput = await askUser("You> ");

    if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "quit") {
      break;
    }

    if (!userInput) {
      continue;
    }

    await chatOnce(userInput, { continueConversation: turn > 0 });
    turn += 1;
    console.log("\n");
  }

  rl.close();
  console.log("\nBye.");
}

await main();
