import { Container } from "@cloudflare/containers";
import { completeWithBinding } from "../../chat-worker/src/model";
import { billingVariables } from "./billing";
import { type IntegrationEnvironment, integrationVariables } from "./integrations";

interface Env extends IntegrationEnvironment {
  API_CONTAINER: DurableObjectNamespace<OpenMuseApiContainer>;
  AI: Ai;
  PUBLIC_API_URL: string;
  OPENMUSE_CHAT_PUBLIC_URL: string;
  XIACHAT_IDENTITY_URL: string;
  ALLOWED_ORIGINS: string;
  DATABASE_URL: string;
  OPENMUSE_ACCESS_KEY: string;
  TOKEN_ENCRYPTION_KEY: string;
  SESSION_SIGNING_KEY: string;
  MODEL: string;
  COST_REVIEW_ENABLED?: string;
  MUSE_BILLING_ENABLED?: string;
  MUSE_BILLING_URL?: string;
  MUSE_BILLING_CLIENT_ID?: string;
  MUSE_BILLING_SECRET?: string;
  MODEL_PROXY_KEY: string;
  RUNTIME_ADMIN_KEY?: string;
  RUNTIME_MIGRATION_ENABLED?: string;
  NOTIFICATION_ROLE?: string;
  NOTIFICATION_HUB_URL?: string;
  NOTIFICATION_HUB_SIGNING_KEY?: string;
  NOTIFICATION_RELAY_URL?: string;
  NOTIFICATION_RELAY_KEY?: string;
  RUNTIME_DEPLOYMENT_ID?: string;
  RUNTIME_OWNER_ID?: string;
  WORKSPACE_TRANSFER_ROLE?: string;
  WORKSPACE_TRANSFER_ISSUER_URL?: string;
  WORKSPACE_TRANSFER_PUBLIC_KEY?: string;
  WORKSPACE_TRANSFER_SIGNING_KEY?: string;
}

function configured(env: Env): boolean {
  try {
    integrationVariables(env);
    billingVariables(env);
  } catch {
    return false;
  }
  return Boolean(
    env.DATABASE_URL &&
      env.OPENMUSE_ACCESS_KEY &&
      env.TOKEN_ENCRYPTION_KEY &&
      env.SESSION_SIGNING_KEY &&
      (env.MUSE_BILLING_ENABLED === "true"
        ? env.MUSE_BILLING_URL && env.MUSE_BILLING_CLIENT_ID && env.MUSE_BILLING_SECRET
        : env.MODEL_PROXY_KEY) &&
      env.PUBLIC_API_URL.startsWith("https://") &&
      env.OPENMUSE_CHAT_PUBLIC_URL.startsWith("https://"),
  );
}

export class OpenMuseApiContainer extends Container<Env> {
  defaultPort = 8787;
  sleepAfter = "10m";
  envVars = {
    ...integrationVariables(this.env),
    ...billingVariables(this.env),
    NODE_ENV: "production",
    WORKSPACE_MODE: "live",
    AGENT_BACKEND: "model",
    TASK_WORKER_ENABLED: "true",
    HOST: "0.0.0.0",
    PORT: "8787",
    PUBLIC_API_URL: this.env.PUBLIC_API_URL,
    OPENMUSE_CHAT_PUBLIC_URL: this.env.OPENMUSE_CHAT_PUBLIC_URL,
    XIACHAT_IDENTITY_URL: this.env.XIACHAT_IDENTITY_URL,
    ALLOWED_ORIGINS: this.env.ALLOWED_ORIGINS,
    DATABASE_URL: this.env.DATABASE_URL,
    OPENMUSE_ACCESS_KEY: this.env.OPENMUSE_ACCESS_KEY,
    TOKEN_ENCRYPTION_KEY: this.env.TOKEN_ENCRYPTION_KEY,
    SESSION_SIGNING_KEY: this.env.SESSION_SIGNING_KEY,
    MODEL: this.env.MODEL,
    COST_REVIEW_ENABLED: this.env.COST_REVIEW_ENABLED === "true" ? "true" : "false",
    RUNTIME_ADMIN_KEY: this.env.RUNTIME_ADMIN_KEY ?? "",
    RUNTIME_MIGRATION_ENABLED: this.env.RUNTIME_MIGRATION_ENABLED === "true" ? "true" : "false",
    NOTIFICATION_ROLE: this.env.NOTIFICATION_ROLE ?? "disabled",
    NOTIFICATION_HUB_URL: this.env.NOTIFICATION_HUB_URL ?? "",
    NOTIFICATION_HUB_SIGNING_KEY: this.env.NOTIFICATION_HUB_SIGNING_KEY ?? "",
    NOTIFICATION_RELAY_URL: this.env.NOTIFICATION_RELAY_URL ?? "",
    NOTIFICATION_RELAY_KEY: this.env.NOTIFICATION_RELAY_KEY ?? "",
    RUNTIME_DEPLOYMENT_ID: this.env.RUNTIME_DEPLOYMENT_ID ?? "",
    RUNTIME_OWNER_ID: this.env.RUNTIME_OWNER_ID ?? "",
    WORKSPACE_TRANSFER_ROLE: this.env.WORKSPACE_TRANSFER_ROLE ?? "disabled",
    WORKSPACE_TRANSFER_ISSUER_URL: this.env.WORKSPACE_TRANSFER_ISSUER_URL ?? "",
    WORKSPACE_TRANSFER_PUBLIC_KEY: this.env.WORKSPACE_TRANSFER_PUBLIC_KEY ?? "",
    WORKSPACE_TRANSFER_SIGNING_KEY: this.env.WORKSPACE_TRANSFER_SIGNING_KEY ?? "",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!configured(env))
      return Response.json({ error: "OpenMuse API deployment is not configured" }, { status: 503 });
    const url = new URL(request.url);
    if (url.pathname.startsWith("/internal/ai/")) {
      if (env.MUSE_BILLING_ENABLED === "true")
        return Response.json({ error: "Unmetered inference is disabled" }, { status: 403 });
      if (url.pathname !== "/internal/ai/v1/chat/completions" || request.method !== "POST")
        return Response.json({ error: "Not found" }, { status: 404 });
      const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
      const expected = env.MODEL_PROXY_KEY;
      if (
        supplied.length !== expected.length ||
        [...supplied].reduce(
          (diff, char, index) => diff | (char.charCodeAt(0) ^ expected.charCodeAt(index)),
          0,
        ) !== 0
      )
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      if (Number(request.headers.get("content-length") ?? 0) > 200_000)
        return Response.json({ error: "Request too large" }, { status: 413 });
      try {
        const body = (await request.json()) as {
          model?: string;
          messages?: Record<string, unknown>[];
          tools?: {
            type: "function";
            function: { name: string; description: string; parameters: Record<string, unknown> };
          }[];
          max_tokens?: number;
          tool_choice?: "auto" | "required";
          reasoning_effort?: "none" | "high";
        };
        if (
          body.model !== env.MODEL ||
          !Array.isArray(body.messages) ||
          body.messages.length > 60 ||
          JSON.stringify(body).length > 200_000 ||
          (body.tools?.length ?? 0) > 40 ||
          (body.tool_choice !== undefined && !["auto", "required"].includes(body.tool_choice)) ||
          (body.reasoning_effort !== undefined && !["none", "high"].includes(body.reasoning_effort))
        )
          return Response.json({ error: "Invalid model request" }, { status: 400 });
        return Response.json(
          await completeWithBinding(env.AI, {
            model: env.MODEL,
            messages: body.messages,
            tools: body.tools,
            max_tokens: Math.min(Math.max(body.max_tokens ?? 1200, 1), 4096),
            tool_choice: body.tool_choice,
            reasoning_effort: body.reasoning_effort,
          }),
        );
      } catch (cause) {
        return Response.json(
          { error: cause instanceof Error ? cause.message : "Model request failed" },
          { status: 502 },
        );
      }
    }
    return env.API_CONTAINER.getByName("shared").fetch(request);
  },
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    if (!configured(env)) return;
    await env.API_CONTAINER.getByName("shared").fetch(
      new Request(new URL("/api/health", env.PUBLIC_API_URL)),
    );
  },
};
