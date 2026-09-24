import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { serve } from "@hono/node-server";
import { createApp } from "../apps/server/src/app.ts";
import { createStore } from "../apps/server/src/db.ts";

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

test("Cloudflare Durable Object saves authenticated threads and replies", {
  timeout: 45000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "openmuse-cloudflare-chat-"));
  const db = await createStore({ dataDir: join(directory, "db") });
  const apiPort = await freePort();
  const chatPort = await freePort();
  const { app, agent } = await createApp(db, {
    mode: "sample",
    port: apiPort,
    host: "127.0.0.1",
    publicUrl: `http://127.0.0.1:${apiPort}`,
    dataDir: directory,
    agentBackend: "sample",
    googleRedirectUri: `http://127.0.0.1:${apiPort}/api/google/callback`,
    allowedOrigins: ["http://localhost:8081"],
    taskWorkerEnabled: false,
  });
  const apiServer = serve({ fetch: app.fetch, port: apiPort, hostname: "127.0.0.1" });
  const worker = spawn(
    join(process.cwd(), "node_modules/.bin/wrangler"),
    [
      "dev",
      "--config",
      "apps/chat-worker/wrangler.toml",
      "--port",
      String(chatPort),
      "--ip",
      "127.0.0.1",
      "--local",
      "--persist-to",
      join(directory, "wrangler"),
      "--var",
      `OPENMUSE_API_URL:http://127.0.0.1:${apiPort}`,
      "--log-level",
      "error",
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: "ignore",
    },
  );
  t.after(async () => {
    worker.kill("SIGTERM");
    if (worker.exitCode === null)
      await Promise.race([
        once(worker, "close"),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    await new Promise<void>((resolve) => apiServer.close(() => resolve()));
    await agent.stop();
    await db.close();
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${chatPort}`;
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Wrangler is starting. */
    }
    if (worker.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(ready, true, "Wrangler did not start");
  assert.equal((await fetch(`${base}/threads`)).status, 401);
  assert.equal(
    (await fetch(`${base}/threads`, { headers: { Authorization: "Bearer invalid" } })).status,
    401,
  );
  const session = await fetch(`http://127.0.0.1:${apiPort}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const token = ((await session.json()) as { token: string }).token;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const list = await fetch(`${base}/threads`, { headers });
  assert.equal(list.status, 200);
  assert.ok(
    ((await list.json()) as { threads: { id: string }[] }).threads.some(
      (thread) => thread.id === "main",
    ),
  );
  const created = await fetch(`${base}/threads`, { method: "POST", headers });
  assert.equal(created.status, 201);
  const thread = (await created.json()) as { id: string };
  const renamed = await fetch(`${base}/threads/${thread.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ name: "School forms" }),
  });
  assert.equal(((await renamed.json()) as { name: string }).name, "School forms");
  const send = () =>
    fetch(`${base}/threads/${thread.id}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ id: "message-1", text: "Complete the permission slip" }),
    });
  const reply = await send();
  assert.equal(reply.status, 200, await reply.clone().text());
  const first = (await reply.json()) as { message: { id: string; data?: { taskId: string } } };
  assert.ok(first.message.data?.taskId);
  const duplicate = await send();
  assert.equal(((await duplicate.json()) as typeof first).message.id, first.message.id);
  const history = await fetch(`${base}/threads/${thread.id}/messages`, { headers });
  assert.equal(((await history.json()) as { messages: unknown[] }).messages.length, 2);
  const archived = await fetch(`${base}/threads/${thread.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ archived: true }),
  });
  assert.equal(((await archived.json()) as { archived: boolean }).archived, true);
});
