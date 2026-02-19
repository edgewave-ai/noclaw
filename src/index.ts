import { query } from "@anthropic-ai/claude-agent-sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Error: ANTHROPIC_API_KEY environment variable is not set.");
  console.error("Copy .env.example to .env and fill in your API key.");
  process.exit(1);
}

const userMessage = "Hello! Please introduce yourself briefly.";
console.log(`User: ${userMessage}\n`);

try {
  const stream = query({
    prompt: userMessage,
    options: {
      maxTurns: 1,
      permissionMode: "bypassPermissions",
    },
  });

  for await (const message of stream) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") {
          process.stdout.write(`Assistant: ${block.text}\n`);
        }
      }
    } else if (message.type === "result") {
      if (message.subtype === "success") {
        console.log(`\n[Done] Cost: $${message.total_cost_usd.toFixed(6)}`);
      } else {
        const errorMsg =
          "errors" in message ? message.errors.join(", ") : message.subtype;
        console.error(`\n[Error] ${errorMsg}`);
        process.exit(1);
      }
    }
  }
} catch (err: unknown) {
  if (err instanceof Error) {
    if (err.message.includes("401") || err.message.includes("authentication")) {
      console.error("Error: Invalid API key. Please check your ANTHROPIC_API_KEY.");
    } else if (err.message.includes("429")) {
      console.error("Error: Rate limit exceeded. Please wait and try again.");
    } else if (err.message.includes("500") || err.message.includes("529")) {
      console.error("Error: Anthropic API is temporarily unavailable. Please try again later.");
    } else {
      console.error(`Error: ${err.message}`);
    }
  } else {
    console.error("An unexpected error occurred:", err);
  }
  process.exit(1);
}
