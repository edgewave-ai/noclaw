import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRunInput, AgentRunOutput } from "./types";

const ALLOWED_TOOLS = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "Task",
  "TaskOutput",
  "TaskStop",
  "TeamCreate",
  "TeamDelete",
  "SendMessage",
  "TodoWrite",
  "ToolSearch",
  "Skill",
  "NotebookEdit",
];

export async function runClaudeAgent(input: AgentRunInput): Promise<AgentRunOutput> {
  const sessionId = input.sessionId;
  let newSessionId: string | undefined;
  let result: string | null = null;
  const chunks: string[] = [];

  const options: Record<string, unknown> = {
    maxTurns: 10,
    permissionMode: "bypassPermissions",
    allowedTools: ALLOWED_TOOLS,
  };

  if (sessionId) {
    options.resume = sessionId;
  }

  for await (const event of query({ prompt: input.prompt, options } as any)) {
    if (event?.type === "system" && event?.subtype === "init" && typeof event.session_id === "string") {
      newSessionId = event.session_id;
      continue;
    }

    if (event?.type === "assistant" && Array.isArray(event.message?.content)) {
      for (const block of event.message.content) {
        if (block?.type === "text" && typeof block.text === "string") {
          chunks.push(block.text);
        }
      }
    }
  }

  result = chunks.join("").trim();

  return {
    text: result || "（Agent 未返回任何内容）",
    sessionId: newSessionId || sessionId,
  };
}
