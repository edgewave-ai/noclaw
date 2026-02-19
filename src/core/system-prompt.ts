import os from "os";

export function getSystemPrompt(): string {
  const platform = os.platform();
  const arch = os.arch();
  const hostname = os.hostname();
  const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024);
  const now = new Date().toISOString();

  return [
    `Current time: ${now}`,
    `Environment: ${platform}/${arch}, host: ${hostname}, memory: ${totalMem}GB`,
  ].join("\n");
}
