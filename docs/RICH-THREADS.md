# Cloudflare chat and conversation history

The Expo client sends chat requests to `apps/chat-worker`. Its `ChatThreads` Durable Object stores SQLite thread and message records. The Worker validates each bearer token with the OpenMuse API before accessing the object for that authenticated owner. One `main` thread is created automatically; the conversation menu can create, rename, archive, restore, and replay side chats.

Run the local API, Worker, and Expo client as described in the [quick start](../README.md#quick-start). Local Wrangler persistence lives under `apps/chat-worker/.wrangler/state`. The sample chat works without model credentials. Set `CF_ACCOUNT_ID`, `CF_API_TOKEN`, and `CF_MODEL` in `apps/chat-worker/.dev.vars` for model replies. The Worker uses Cloudflare AI Gateway's OpenAI-compatible Chat Completions endpoint and can call OpenMuse tools through the authenticated API. These model calls require an account and may be billed. Keep keys out of `EXPO_PUBLIC_` variables.

Chat history and task results have separate storage. A delegated task ID is saved with the assistant message, and the UI loads its current state from the API. Chat messages are limited to the newest 1,000 per thread on replay. The client keeps unsent drafts and its follow-up queue in app state. Stop aborts the current Worker request; the queue is not a durable server inbox.

For a deployed Worker, set `OPENMUSE_API_URL` in `apps/chat-worker/wrangler.toml` to a reachable HTTPS API and `ALLOWED_ORIGINS` to the web app origin. Use `WORKSPACE_MODE=live` with API access and encryption keys. Set Cloudflare credentials as Worker secrets. Point `EXPO_PUBLIC_CHAT_URL` to the Worker before building the app. The API's local sample mode accepts only loopback and cannot serve a deployed Worker.

The integration test in `tests/rich-threads.test.ts` starts an isolated Wrangler process and API. It checks authentication, main thread, creation, rename, archive, message replay, and duplicate-send handling. Live Cloudflare account model calls have not been acceptance tested.

## Agent computer

The optional [browser worker](../apps/worker/README.md) keeps Chromium profiles and supports interactive takeover. The optional [Linux computer](COMPUTER.md) adds bounded command execution, saved output, editable files, and PDF transfer. Tasks can use the same services after appropriate configuration.
