import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRunInput, AgentRunOutput } from "./types";
import { getSystemPrompt } from "./system-prompt";

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

const PERMISSION_MODES: ReadonlyArray<NonNullable<Options["permissionMode"]>> = [
  "default",
  "acceptEdits",
  "bypassPermissions",
  "plan",
  "dontAsk",
];

function resolvePermissionMode(): NonNullable<Options["permissionMode"]> {
  const raw = process.env.CLAUDE_PERMISSION_MODE?.trim();
  if (!raw) {
    return "default";
  }

  if ((PERMISSION_MODES as readonly string[]).includes(raw)) {
    return raw as NonNullable<Options["permissionMode"]>;
  }

  return "default";
}

export async function runClaudeAgent(input: AgentRunInput): Promise<AgentRunOutput> {
  const sessionId = input.sessionId;
  let newSessionId: string | undefined;
  const chunks: string[] = [];

  const systemPrompt = getSystemPrompt(input.chatId);
  const permissionMode = resolvePermissionMode();

  const options: Options = {
    maxTurns: 10,
    permissionMode,
    allowedTools: ALLOWED_TOOLS,
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: systemPrompt,
    },
  };

  if (permissionMode === "bypassPermissions") {
    options.allowDangerouslySkipPermissions = true;
  }

  if (sessionId) {
    options.resume = sessionId;
  }

  for await (const event of query({ prompt: input.prompt, options })) {
    if (event?.type === "system" && event?.subtype === "init" && typeof event.session_id === "string") {
      newSessionId = event.session_id;
      continue;
    }

    if (event?.type === "assistant" && Array.isArray(event.message?.content)) {
      for (const block of event.message.content) {
        if (block?.type === "text" && typeof block.text === "string") {
          chunks.push(block.text);
        } else if (block?.type === "tool_use" && input.onToolUse) {
          input.onToolUse(block.name as string, (block.input ?? {}) as Record<string, unknown>);
        }
      }
    }
  }

  const result = chunks.join("").trim();

  return {
    text: result || "(Agent returned no content)",
    sessionId: newSessionId || sessionId,
  };
}
