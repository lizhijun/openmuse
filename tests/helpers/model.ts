import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { TestContext } from "node:test";

type ModelCall = { name: string; arguments: object };

// Serve the OpenAI-compatible chat completion protocol used by Cloudflare AI Gateway.
export async function modelFixture(
  t: TestContext,
  reply: (index: number) => ModelCall | undefined | Promise<ModelCall | undefined>,
) {
  const requests: { path: string; body: string }[] = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const index = requests.length;
    requests.push({ path: request.url ?? "", body });
    const call = await reply(index);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        id: `completion-${index}`,
        choices: [
          {
            message: call
              ? {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: `call-${index}`,
                      type: "function",
                      function: { name: call.name, arguments: JSON.stringify(call.arguments) },
                    },
                  ],
                }
              : { role: "assistant", content: "Done." },
          },
        ],
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const previousBase = process.env.OPENAI_BASE_URL;
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
  process.env.OPENAI_API_KEY = "local-test-fixture";
  t.after(async () => {
    if (previousBase === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = previousBase;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { requests };
}
