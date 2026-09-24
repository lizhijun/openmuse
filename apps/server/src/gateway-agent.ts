import { randomUUID } from "node:crypto";
import { type BaseEvent, EventType, type RunAgentInput } from "@ag-ui/core";
import { Observable } from "rxjs";
import { z } from "zod";

export interface AgentTool<T extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  parameters: T;
  execute: (args: z.output<T>) => Promise<unknown> | unknown;
}

export function defineTool<T extends z.ZodType>(tool: AgentTool<T>): AgentTool<T> {
  return tool;
}

interface GatewayMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: GatewayCall[];
}
interface GatewayCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
interface GatewayResponse {
  choices?: { message?: { content?: string | null; tool_calls?: GatewayCall[] } }[];
  error?: { message?: string };
}

export class BuiltInAgent {
  private controller?: AbortController;
  constructor(
    private readonly options: {
      model: string;
      maxSteps?: number;
      maxRetries?: number;
      tools: AgentTool[];
      prompt: string;
    },
  ) {}

  abortRun() {
    this.controller?.abort();
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      const controller = new AbortController();
      this.controller = controller;
      const run = async () => {
        subscriber.next({
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
        });
        const messages: GatewayMessage[] = [
          { role: "system", content: this.options.prompt },
          ...input.messages
            .filter((message) => message.role === "user" || message.role === "assistant")
            .map((message) => ({
              role: message.role as "user" | "assistant",
              content:
                typeof message.content === "string"
                  ? message.content
                  : JSON.stringify(message.content),
            })),
        ];
        const mockBase = process.env.OPENAI_BASE_URL;
        const account = process.env.CLOUDFLARE_ACCOUNT_ID;
        const token = mockBase ? process.env.OPENAI_API_KEY : process.env.CLOUDFLARE_API_TOKEN;
        if (!token || (!account && !mockBase))
          throw new Error("Cloudflare AI Gateway is not configured");
        const endpoint = mockBase
          ? `${mockBase.replace(/\/$/, "")}/chat/completions`
          : `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`;
        for (let step = 0; step < (this.options.maxSteps ?? 8); step++) {
          controller.signal.throwIfAborted();
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              ...(!mockBase
                ? { "cf-aig-gateway-id": process.env.CLOUDFLARE_GATEWAY_ID ?? "default" }
                : {}),
            },
            body: JSON.stringify({
              model: this.options.model,
              messages,
              tools: this.options.tools.map((tool) => ({
                type: "function",
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: z.toJSONSchema(tool.parameters),
                },
              })),
              tool_choice: "auto",
              stream: false,
            }),
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]),
          });
          const value = (await response.json()) as GatewayResponse;
          if (!response.ok)
            throw new Error(value.error?.message ?? `AI Gateway returned ${response.status}`);
          const answer = value.choices?.[0]?.message;
          if (!answer) throw new Error("AI Gateway returned no message");
          const content = answer.content ?? "";
          const calls = answer.tool_calls ?? [];
          messages.push({
            role: "assistant",
            content,
            ...(calls.length ? { tool_calls: calls } : {}),
          });
          if (content) {
            const messageId = randomUUID();
            subscriber.next({ type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" });
            subscriber.next({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: content });
            subscriber.next({ type: EventType.TEXT_MESSAGE_END, messageId });
          }
          if (!calls.length) break;
          for (const call of calls) {
            controller.signal.throwIfAborted();
            subscriber.next({
              type: EventType.TOOL_CALL_START,
              toolCallId: call.id,
              toolCallName: call.function.name,
            });
            subscriber.next({
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: call.id,
              delta: call.function.arguments,
            });
            subscriber.next({ type: EventType.TOOL_CALL_END, toolCallId: call.id });
            let result: unknown;
            try {
              const selected = this.options.tools.find((tool) => tool.name === call.function.name);
              if (!selected) throw new Error(`Unknown tool: ${call.function.name}`);
              result = await selected.execute(
                selected.parameters.parse(JSON.parse(call.function.arguments)),
              );
            } catch (error) {
              result = { error: error instanceof Error ? error.message : "Tool failed" };
            }
            const text = JSON.stringify(result);
            subscriber.next({
              type: EventType.TOOL_CALL_RESULT,
              toolCallId: call.id,
              messageId: randomUUID(),
              role: "tool",
              content: text,
            });
            messages.push({ role: "tool", tool_call_id: call.id, content: text });
          }
        }
        subscriber.next({
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
        });
        subscriber.complete();
      };
      void run()
        .catch((error) => {
          subscriber.next({
            type: EventType.RUN_ERROR,
            message: error instanceof Error ? error.message : String(error),
          });
          subscriber.complete();
        })
        .finally(() => {
          if (this.controller === controller) this.controller = undefined;
        });
      return () => controller.abort();
    });
  }
}
