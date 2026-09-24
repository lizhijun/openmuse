import { Platform } from "react-native";

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "android" ? "http://10.0.2.2:8787" : "http://localhost:8787")
).replace(/\/$/, "");

export const CHAT_URL = (
  process.env.EXPO_PUBLIC_CHAT_URL ||
  (Platform.OS === "android" ? "http://10.0.2.2:8792" : "http://localhost:8792")
).replace(/\/$/, "");

export interface ChatMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  data?: {
    taskId?: string;
    browserId?: string;
    toolCalls?: { id: string; name: string; args: Record<string, unknown>; result: unknown }[];
  };
}

export interface ChatThread {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export class ChatApi {
  constructor(readonly token: string) {}
  async request<T>(
    path: string,
    body?: unknown,
    method?: string,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch(`${CHAT_URL}${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Chat request failed (${response.status})`);
    return payload as T;
  }
}

export class MuseApi {
  constructor(readonly token: string) {}
  async request<T>(path: string, body?: unknown, method?: string): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body === undefined || body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(
        typeof payload.error === "string" ? payload.error : `Request failed (${response.status})`,
      );
    return payload;
  }
  url(path: string) {
    return path.startsWith("http") ? path : `${API_URL}${path}`;
  }
}

export async function createSession(
  accessKey?: string,
): Promise<{ token: string; mode: "sample" | "live" }> {
  const response = await fetch(`${API_URL}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessKey }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Could not open your workspace.");
  return payload;
}
