import os from "os";
import fs from "fs";
import path from "path";

const MEMORY_DIR = path.resolve(process.cwd(), "data/memory");

function memoryFilePath(chatId: string): string {
  const safe = chatId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(MEMORY_DIR, safe, "MEMORY.md");
}

function readMemoryFile(chatId: string): string {
  try {
    return fs.readFileSync(memoryFilePath(chatId), "utf8").trim();
  } catch {
    return "";
  }
}

function ensureMemoryDir(chatId: string): void {
  const dir = path.dirname(memoryFilePath(chatId));
  fs.mkdirSync(dir, { recursive: true });
}

export function getSystemPrompt(chatId: string): string {
  const platform = os.platform();
  const arch = os.arch();
  const hostname = os.hostname();
  const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024);
  const now = new Date().toISOString();

  ensureMemoryDir(chatId);
  const memoryPath = memoryFilePath(chatId);
  const memoryContent = readMemoryFile(chatId);

  const envContext = [
    `Current time: ${now}`,
    `Environment: ${platform}/${arch}, host: ${hostname}, memory: ${totalMem}GB`,
  ].join("\n");

  const memorySection = memoryContent
    ? [
        "## MEMORY.md",
        `Path: ${memoryPath}`,
        "Content:",
        "```",
        memoryContent,
        "```",
      ].join("\n")
    : [
        "## MEMORY.md",
        `Path: ${memoryPath}`,
        "This file is empty. It will be created on first write.",
      ].join("\n");

  const memoryPolicy = [
    "You have a persistent memory file (MEMORY.md) for this user.",
    "When the user tells you their name, location, occupation, preferences, or any fact worth remembering across sessions:",
    `  1. Write it to ${memoryPath} (create the file if it doesn't exist)`,
    "  2. Use concise Markdown: bullet points or key-value pairs",
    "  3. Then reply naturally",
    "If someone says 'remember this', write it down. Do not keep it only in conversation context.",
  ].join("\n");

  return [envContext, memorySection, memoryPolicy].join("\n\n");
}
