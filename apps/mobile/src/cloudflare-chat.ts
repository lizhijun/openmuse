import { type ReactNode, useMemo } from "react";
import { ChatApi, type ChatMessage } from "./api";
import { useWorkspace } from "./workspace";

type ToolCall = { id: string; name: string; args: Record<string, unknown> };
export type Message =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | ToolMessage;
export type ToolMessage = { id: string; role: "tool"; content: string; toolCallId: string };

type MessageListener = (event: { messages: Message[] }) => void;
type ErrorListener = (event: { error: unknown; context?: { agentId?: string } }) => void;
const errorListeners = new Set<ErrorListener>();

class ChatAgent {
  messages: Message[] = [];
  isRunning = false;
  private listeners = new Set<MessageListener>();
  controller?: AbortController;
  constructor(
    readonly agentId: string,
    readonly threadId: string,
  ) {}
  subscribe({ onMessagesChanged }: { onMessagesChanged: MessageListener }) {
    this.listeners.add(onMessagesChanged);
    return {
      unsubscribe: () => {
        this.listeners.delete(onMessagesChanged);
      },
    };
  }
  private changed() {
    for (const listener of this.listeners) listener({ messages: this.messages });
  }
  setMessages(messages: Message[]) {
    this.messages = messages;
    this.changed();
  }
  addMessage(message: Message) {
    this.messages = [...this.messages, message];
    this.changed();
  }
  detachActiveRun() {
    return Promise.resolve();
  }
}

const agents = new Map<string, ChatAgent>();
function getAgent(agentId: string, threadId: string) {
  const existing = agents.get(agentId);
  if (existing) return existing;
  const agent = new ChatAgent(agentId, threadId);
  agents.set(agentId, agent);
  return agent;
}

export function displayMessages(saved: ChatMessage[]): Message[] {
  return saved.flatMap((message): Message[] => {
    if (message.role === "user")
      return [{ id: message.id, role: "user", content: message.content }];
    if (message.data?.toolCalls?.length) {
      return [
        {
          id: message.id,
          role: "assistant",
          content: message.content,
          toolCalls: message.data.toolCalls.map(({ id, name, args }) => ({ id, name, args })),
        },
        ...message.data.toolCalls.map(({ id, result }) => ({
          id: `result-${id}`,
          role: "tool" as const,
          toolCallId: id,
          content: JSON.stringify(result),
        })),
      ];
    }
    const toolName = message.data?.taskId
      ? "delegate_task"
      : message.data?.browserId
        ? "browse_web"
        : undefined;
    if (!toolName) return [{ id: message.id, role: "assistant", content: message.content }];
    const toolCallId = `tool-${message.id}`;
    return [
      {
        id: message.id,
        role: "assistant",
        content: message.content,
        toolCalls: [{ id: toolCallId, name: toolName, args: {} }],
      },
      {
        id: `result-${message.id}`,
        role: "tool",
        toolCallId,
        content: JSON.stringify(
          message.data?.taskId
            ? { id: message.data.taskId }
            : { sessionId: message.data?.browserId },
        ),
      },
    ];
  });
}

export function useAgent({
  agentId,
  threadId,
}: {
  agentId: string;
  runtimeAgentId: string;
  threadId: string;
}) {
  return { agent: getAgent(agentId, threadId), isReady: true };
}

export function useCloudflareChat() {
  const { api } = useWorkspace();
  const chat = useMemo(() => {
    const chatApi = new ChatApi(api.token);
    return {
      async connectAgent({ agent }: { agent: ChatAgent }) {
        const result = await chatApi.request<{ messages: ChatMessage[] }>(
          `/threads/${agent.threadId}/messages`,
        );
        agent.setMessages(displayMessages(result.messages));
      },
      async runAgent({ agent }: { agent: ChatAgent }) {
        const user = [...agent.messages].reverse().find((message) => message.role === "user");
        if (!user) throw new Error("Add a message before starting the reply");
        agent.isRunning = true;
        const controller = new AbortController();
        agent.controller = controller;
        try {
          const result = await chatApi.request<{ message: ChatMessage }>(
            `/threads/${agent.threadId}/messages`,
            { id: user.id, text: user.content },
            "POST",
            controller.signal,
          );
          agent.setMessages([...agent.messages, ...displayMessages([result.message])]);
        } catch (error) {
          for (const listener of errorListeners)
            listener({ error, context: { agentId: agent.agentId } });
          throw error;
        } finally {
          agent.isRunning = false;
          agent.controller = undefined;
        }
      },
      async stopAgent({ agent }: { agent: ChatAgent }) {
        agent.controller?.abort();
        await chatApi.request(`/threads/${agent.threadId}/cancel`, {});
      },
      subscribe({ onError }: { onError: ErrorListener }) {
        errorListeners.add(onError);
        return {
          unsubscribe: () => {
            errorListeners.delete(onError);
          },
        };
      },
    };
  }, [api.token]);
  return { chat };
}

export function useAgentContext(_context: { description: string; value: unknown }) {}

type Renderer = (input: {
  args: Record<string, unknown>;
  result: unknown;
  status: string;
}) => ReactNode;
const renderers = new Map<string, Renderer>();
export function useRenderTool(input: {
  name: string;
  description: string;
  parameters: unknown;
  render: Renderer;
}) {
  renderers.set(input.name, input.render);
}

export function useRenderToolCall() {
  return ({
    toolCall,
    toolMessage,
  }: {
    toolCall: ToolCall;
    toolMessage?: ToolMessage;
  }): ReactNode => {
    const renderer = renderers.get(toolCall.name);
    if (!renderer) return null;
    let result: unknown = toolMessage?.content;
    if (typeof result === "string") {
      try {
        result = JSON.parse(result);
      } catch {
        // Renderers can handle plain text results.
      }
    }
    return renderer({ args: toolCall.args, result, status: toolMessage ? "complete" : "running" });
  };
}
