import assert from "node:assert/strict";
import { test } from "node:test";
import { agentConfigured, type Config } from "../apps/server/src/config.ts";

const sampleConfig: Config = {
  mode: "sample",
  port: 8787,
  host: "127.0.0.1",
  publicUrl: "http://localhost:8787",
  dataDir: ".openmuse",
  agentBackend: "sample",
  googleRedirectUri: "http://localhost:8787/api/google/callback",
  allowedOrigins: ["http://localhost:8081"],
};

test("sample API runs without model or hosted conversation credentials", () => {
  assert.equal(agentConfigured(sampleConfig), true);
});

test("model work requires a Cloudflare AI Gateway configuration", () => {
  const config: Config = {
    ...sampleConfig,
    mode: "live",
    agentBackend: "model",
    model: "openai/example",
  };
  const previousAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const previousToken = process.env.CLOUDFLARE_API_TOKEN;
  try {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
    assert.equal(agentConfigured(config), false);
    process.env.CLOUDFLARE_ACCOUNT_ID = "example-account";
    process.env.CLOUDFLARE_API_TOKEN = "example-token";
    assert.equal(agentConfigured(config), true);
  } finally {
    if (previousAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = previousAccount;
    if (previousToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = previousToken;
  }
});
