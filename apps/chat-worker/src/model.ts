import type { Ai } from "@cloudflare/workers-types";
/** Normalise the Workers AI binding response for the existing agent loops. */
export async function completeWithBinding(
  ai: Ai,
  input: {
    model: string;
    messages: Record<string, unknown>[];
    tools?: {
      type: "function";
      function: { name: string; description: string; parameters: Record<string, unknown> };
    }[];
    max_tokens?: number;
    tool_choice?: "auto" | "required";
    reasoning_effort?: "none" | "high";
  },
  gatewayId = "default",
): Promise<{
  choices: {
    message: {
      content: string;
      tool_calls: { id: string; type: "function"; function: { name: string; arguments: string } }[];
    };
  }[];
  usage?: unknown;
}> {
  // Newer Workers AI models use the Chat Completions envelope for both tools
  // and responses. Llama/Qwen binding models retain their legacy tool shape.
  const nativeTools =
    input.model.startsWith("@cf/moonshotai/kimi-") || input.model.startsWith("@cf/zai-org/");
  const result = (await ai.run(
    input.model as Parameters<Ai["run"]>[0],
    {
      messages: input.messages,
      ...(input.tools?.length
        ? { tools: nativeTools ? input.tools : input.tools.map((tool) => tool.function) }
        : {}),
      max_tokens: input.max_tokens ?? 1200,
      ...(nativeTools && input.tool_choice ? { tool_choice: input.tool_choice } : {}),
      ...(nativeTools && input.reasoning_effort
        ? { reasoning_effort: input.reasoning_effort }
        : {}),
      stream: false,
    } as never,
    { gateway: { id: gatewayId } },
  )) as {
    response?: string;
    usage?: unknown;
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: {
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }[];
      };
    }[];
    tool_calls?: { name: string; arguments: Record<string, unknown> | string }[];
  };
  const message = result.choices?.[0]?.message;
  if (message) {
    const calls = message.tool_calls ?? [];
    if (
      calls.some(
        (call) =>
          !call.id ||
          typeof call.function?.name !== "string" ||
          typeof call.function?.arguments !== "string",
      )
    )
      throw new Error("Workers AI returned an invalid tool call");
    if (typeof message.content !== "string" && !calls.length)
      throw new Error("Workers AI returned no response");
    return {
      choices: [{ message: { content: message.content ?? "", tool_calls: calls } }],
      usage: result.usage,
    };
  }
  const calls = (result.tool_calls ?? []).map((call) => ({
    id: crypto.randomUUID(),
    type: "function" as const,
    function: {
      name: call.name,
      arguments:
        typeof call.arguments === "string" ? call.arguments : JSON.stringify(call.arguments),
    },
  }));
  if (typeof result.response !== "string" && !calls.length)
    throw new Error("Workers AI returned no response");
  return {
    choices: [{ message: { content: result.response ?? "", tool_calls: calls } }],
    usage: result.usage,
  };
}
