# Demos

Recorded September 16, 2026, before the Cloudflare chat migration. Both recordings feature OpenMuse's original capybara mascot and the current composer: the send arrow changes to a stop square inside the input pill while OpenMuse replies, then returns when the run ends. The mobile story explores websites; the desktop story starts with email and continues into related research.

## Mobile

[Watch the 38-second MP4](../assets/demos/2026-09-16/mobile.mp4) · [Animated hero](../assets/demos/2026-09-16/mobile.gif) · [Cover image](../assets/demos/2026-09-16/mobile.png).

**OpenMuse 🪁 — ask it to browse, follow along in chat, and take control when you need to.** The native iPhone recording is framed in a 1920 × 1080 (16:9) canvas, with a cream, blue, and lilac background and captions for sound-off viewing.

The model responses use [CopilotKit AI Mock](https://github.com/CopilotKit/aimock). The app runs its actual CopilotKit agent and `browse_web` tool against a real Chromium worker. The script requests a page, waits for the real tool result, and extracts headlines or overview text from that result. It does not supply browser results or invent page content.

### What the mobile recording shows

| Time | Scene |
| --- | --- |
| 0:00–0:04 | Ask OpenMuse to explore Hacker News |
| 0:04–0:09 | Read highlights from the live page |
| 0:09–0:15 | Ask it to summarize CopilotKit |
| 0:15–0:21 | Follow the inline browser and result, with Stop inside the input pill |
| 0:21–0:31 | Take control of the same live browser |
| 0:31–0:38 | Return to chat and the OpenMuse repository |

- A chat request to find interesting stories on Hacker News.
- A server tool call that opens and reads the page, with a browser card inline in the conversation.
- Highlights extracted from the page the browser just read.
- A second request to summarize CopilotKit, using the same persistent browser session.
- **Take control**, which opens that session's live browser console.
- The open-source repository at [CopilotKit/OpenMuse](https://github.com/CopilotKit/OpenMuse).

Captures are trimmed and paced for readability, including brief slowdowns of the browser card and faster transitions into takeover. This is a historical demonstration of the app and tool flow; it is not an evaluation of a live model's reasoning. Site content changes, so your highlights can differ. Personal workspace information is fictional. Live Google, provider quality, Intelligence persistence/replay, and OpenBot require separately configured acceptance runs; see [verification](VERIFICATION.md).

## Desktop web

[Watch the 42-second web MP4](../assets/demos/2026-09-16/web.mp4) · [Animated preview](../assets/demos/2026-09-16/web.gif) · [Cover image](../assets/demos/2026-09-16/web.png).

A separate recording of the actual desktop web app, placed below the mobile demo in the README. Ask **“Check my emails for the school trip”**, open the school's reminder, then ask **“Research Monterey Bay Aquarium and suggest three exhibits”**. The 1440 × 810 browser capture sits inside a 1920 × 1080 canvas with the same cream, blue, and lilac background and OpenMuse 🪁 branding.

| Time | Scene |
| --- | --- |
| 0:00–0:06 | Ask for the school-trip email; the agent searches and reads it |
| 0:06–0:13 | Open the inline email card and full message |
| 0:13–0:17 | Review departure, return, and packing details |
| 0:17–0:23 | Ask for research about Monterey Bay Aquarium |
| 0:23–0:28 | Follow the aquarium website inline |
| 0:28–0:33 | Read three exhibit excerpts and their source |
| 0:33–0:42 | Take control, scroll the same browser, and return to chat |

This recording uses the same AI Mock model and real Chromium tool flow described above, plus the actual `search_mail` and `read_mail_thread` tools against an isolated fictional mailbox. The model selects the thread ID returned by search and quotes its returned details. Opening the card loads the full thread through the app's existing email viewer. The aquarium excerpts come from exhibit entries on its current website. The email says “aquarium”; the second user prompt supplies Monterey Bay Aquarium explicitly.

The production web export captures actual typing, clicks, and scrolling. Cuts, brief holds, and speed changes shorten waiting time. No development overlays or private workspace information appear in the published media. No real email is sent or live Google account connected.

## Composer interaction

The primary button stays in the same place through each reply. Its accessible label changes from **Send message** to **Stop reply** while running. Stopping preserves the current draft. When there are no held follow-ups, sending a new message continues immediately; an existing paused queue resumes through **Send queued messages**.

To check interruption yourself, send a supported prompt, type a follow-up while the agent is replying, and tap the stop square. Confirm the draft remains, then send it once the arrow returns. The recordings show the send/stop state change; this interruption check is a separate acceptance step.

## Run the current Cloudflare app

The original AI Mock runner was retired with the CopilotKit dependency. To run the current local sample app, start the API, Cloudflare Worker, and Expo client with the three commands in the [quick start](../README.md#quick-start). Sample chat can create the permission slip task without a model. To explore public websites through chat, configure a Cloudflare AI Gateway model and the browser worker as described in the README. Model behavior and live website content may differ from these historical recordings.

## Record your own demo

### iPhone

With the app open on a simulator containing fictional personal information:

```sh
xcrun simctl io booted recordVideo --codec=h264 openmuse-recording.mp4
# Interact with the app. Press Control-C to finish the video.
```

Capture at native resolution, trim idle time, and frame the portrait capture inside a 16:9 canvas. Show the chat request and its real tool result. Describe the model setup in the accompanying recording notes. Check the final video for development reload banners and private content before publishing.

### Web

Start the API and Cloudflare Worker, then export and serve the web app to avoid development reload banners:

```sh
pnpm --dir apps/mobile exec expo export --platform web --clear --output-dir dist/web
python3 -m http.server 8081 --bind 127.0.0.1 --directory apps/mobile/dist/web
```

Use port 8081 when the development server is stopped. `--clear` ensures the export uses the requested API URL. Open the page in a clean desktop browser and record the two prompts and takeover flow at 1440 × 810 or larger. Describe the model setup in the accompanying recording notes. Scroll to keep the browser card and resulting text readable.

The original [75-second alpha walkthrough](https://github.com/jerelvelarde/openmuse/releases/download/v0.1.0-alpha/openmuse-demo.mp4) remains available as a historical release archive. OpenMuse's [capybara artwork and provenance](../apps/mobile/assets/README.md) are included under the repository's MIT license.
