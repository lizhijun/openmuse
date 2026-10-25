import worker from "../src/index";
// Local-only fixture: the actual Worker fetch handler, with no provider/container binding.
export default {
  async fetch(request: Request): Promise<Response> {
    const enabled = request.headers.get("x-fixture-metered") !== "false";
    const env = {
      MUSE_BILLING_ENABLED: enabled ? "true" : "false",
      MUSE_BILLING_URL: "https://billing.example.test/api/internal/muse/inference",
      MUSE_BILLING_CLIENT_ID: "shared",
      MUSE_BILLING_SECRET: "s".repeat(43),
      MODEL_PROXY_KEY: "synthetic-legacy-proxy-key",
      PUBLIC_API_URL: "https://api.example.test",
      OPENMUSE_CHAT_PUBLIC_URL: "https://chat.example.test",
      DATABASE_URL: "postgres://synthetic.invalid/fixture",
      OPENMUSE_ACCESS_KEY: "synthetic-access-key",
      TOKEN_ENCRYPTION_KEY: "synthetic-encryption-key",
      SESSION_SIGNING_KEY: "synthetic-session-key",
      MODEL: "@cf/moonshotai/kimi-k2.6",
      AI: {
        run() {
          throw new Error("Unmetered provider must not run");
        },
      },
      API_CONTAINER: {
        getByName() {
          return {
            fetch() {
              return new Response(null, { status: 204 });
            },
          };
        },
      },
    };
    return worker.fetch(request, env as never);
  },
};
