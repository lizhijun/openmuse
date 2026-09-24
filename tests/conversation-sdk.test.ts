import assert from "node:assert/strict";
import { test } from "node:test";
import { ConversationQueue } from "../apps/mobile/src/conversation-queue.ts";
import { runConversationTurn } from "../apps/mobile/src/conversation-run.ts";

test("a chat transport error pauses the queue even when its request resolves", async () => {
  let attempts = 0;
  const queue = new ConversationQueue();
  queue.enqueue({ id: "first", text: "First task" });
  queue.enqueue({ id: "second", text: "Second task" });
  await assert.rejects(
    queue.flush(() =>
      runConversationTurn(
        "default",
        async () => {
          attempts++;
          listener?.({
            error: new Error("Connection interrupted"),
            context: { agentId: "default" },
          });
        },
        (onError) => {
          listener = onError;
          return {
            unsubscribe: () => {
              listener = undefined;
            },
          };
        },
      ),
    ),
    /Connection interrupted/,
  );
  assert.equal(attempts, 1);
  assert.equal(queue.getSnapshot().paused, true);
  assert.deepEqual(
    queue.getSnapshot().pending.map((message) => message.id),
    ["second"],
  );
});

let listener: ((event: { error: unknown; context?: { agentId?: string } }) => void) | undefined;
