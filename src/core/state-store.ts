import fs from "node:fs";
import path from "node:path";
import type { RouterStateStore } from "./types";

const PROCESSED_MSG_LIMIT = 200;

type RouterState = {
  sessions: Record<string, string>;
  processedMessageIds: string[];
};

type ArchivedSessions = Record<string, Array<{ session_id: string; cleared_at: string }>>;

function defaultState(): RouterState {
  return {
    sessions: {},
    processedMessageIds: [],
  };
}

function loadJson<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function saveJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export class FileRouterStateStore implements RouterStateStore {
  private readonly stateFile: string;
  private readonly archivedFile: string;
  private state: RouterState;

  constructor(dataDir = path.resolve(process.cwd(), "data")) {
    this.stateFile = path.join(dataDir, "router_state.json");
    this.archivedFile = path.join(dataDir, "archived_sessions.json");
    const loaded = loadJson<Partial<RouterState>>(this.stateFile, {});
    this.state = {
      ...defaultState(),
      ...loaded,
      processedMessageIds: Array.isArray(loaded.processedMessageIds)
        ? loaded.processedMessageIds
        : [],
    };
  }

  getSession(chatId: string): string | undefined {
    return this.state.sessions[chatId];
  }

  setSession(chatId: string, sessionId: string): void {
    this.state.sessions[chatId] = sessionId;
  }

  clearSession(chatId: string): boolean {
    const sessionId = this.state.sessions[chatId];
    if (!sessionId) {
      return false;
    }

    const archived = loadJson<ArchivedSessions>(this.archivedFile, {});
    if (!archived[chatId]) {
      archived[chatId] = [];
    }
    archived[chatId].push({
      session_id: sessionId,
      cleared_at: new Date().toISOString(),
    });
    saveJson(this.archivedFile, archived);

    delete this.state.sessions[chatId];
    return true;
  }

  isDuplicate(_chatId: string, messageId: string): boolean {
    return this.state.processedMessageIds.includes(messageId);
  }

  markProcessed(_chatId: string, messageId: string): void {
    this.state.processedMessageIds.push(messageId);
    if (this.state.processedMessageIds.length > PROCESSED_MSG_LIMIT) {
      this.state.processedMessageIds = this.state.processedMessageIds.slice(-PROCESSED_MSG_LIMIT);
    }
  }

  save(): void {
    saveJson(this.stateFile, this.state);
  }
}
