import { execFileSync } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const wrangler = resolve(root, "node_modules/.bin/wrangler");
const runWrangler = (...args) =>
  JSON.parse(execFileSync(wrangler, args, { cwd: tmpdir(), encoding: "utf8" }));

const identity = runWrangler("whoami", "--json");
if (!identity.loggedIn || identity.accounts?.length !== 1)
  throw new Error("Sign in with Wrangler and select a single Cloudflare account first.");

const accountId = identity.accounts[0].id;
const token = runWrangler("auth", "token", "--json").token;
if (!accountId || !token) throw new Error("Wrangler did not provide an account ID and token.");

const model = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const chatVars = resolve(root, "apps/chat-worker/.dev.vars");
writeFileSync(
  chatVars,
  `CF_ACCOUNT_ID=${accountId}\nCF_API_TOKEN=${token}\nCF_MODEL=${model}\nCF_GATEWAY_ID=default\n`,
  { mode: 0o600 },
);
chmodSync(chatVars, 0o600);

const envPath = resolve(root, ".env");
const current = readFileSync(envPath, "utf8").split("\n");
const values = new Map([
  ["AGENT_BACKEND", "model"],
  ["MODEL", model],
  ["CLOUDFLARE_ACCOUNT_ID", accountId],
  ["CLOUDFLARE_API_TOKEN", token],
  ["CLOUDFLARE_GATEWAY_ID", "default"],
]);
const seen = new Set();
const lines = current.map((line) => {
  const key = line.match(/^([A-Z_]+)=/)?.[1];
  if (!key || !values.has(key)) return line;
  seen.add(key);
  return `${key}=${values.get(key)}`;
});
for (const [key, value] of values) if (!seen.has(key)) lines.push(`${key}=${value}`);
writeFileSync(envPath, `${lines.filter(Boolean).join("\n")}\n`, { mode: 0o600 });
chmodSync(envPath, 0o600);

console.log(
  "Cloudflare AI Gateway configured for local chat and tasks. Restart the API and chat Worker.",
);
