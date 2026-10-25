import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { Miniflare, convertV4MiniflareOptions, Log, LogLevel } = wranglerRequire("miniflare");
test("actual Worker blocks every legacy AI proxy method when metering is enabled", async (t) => {
  const bundle = process.env.MUSE_BILLING_TEST_BUNDLE;
  assert.ok(bundle, "Build the local-only billing fixture first");
  const script = await readFile(bundle, "utf8");
  const mf = new Miniflare({
    ...convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: "2026-09-21",
      compatibilityFlags: ["nodejs_compat"],
      cf: false,
    }),
    log: new Log(LogLevel.ERROR),
  });
  t.after(() => mf.dispose());
  for (const method of ["GET", "POST", "PUT", "DELETE"]) {
    for (const path of ["/internal/ai/v1/chat/completions", "/internal/ai/other"]) {
      const response = await mf.dispatchFetch(`https://fixture.test${path}`, {
        method,
        headers: { authorization: "Bearer synthetic-legacy-proxy-key" },
      });
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: "Unmetered inference is disabled" });
    }
  }
  assert.equal((await mf.dispatchFetch("https://fixture.test/api/health")).status, 204);
  assert.equal(
    (
      await mf.dispatchFetch("https://fixture.test/internal/ai/v1/chat/completions", {
        method: "POST",
        headers: { "x-fixture-metered": "false" },
      })
    ).status,
    401,
  );
});
