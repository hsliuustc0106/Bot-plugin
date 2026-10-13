# Jiuwen Bot

A separate, local browser app using JiuwenSwarm's process SDK. The existing `../ds-bot/` remains a DSH plugin. This app implements the first small backend: Chief + Worker, two private chats and one group, streamed replies, a permission-controlled `read_note` tool, SQLite history and cancellation.

## Try the deterministic demo

Requires Node.js 22.19+ (or 24+), Git and npm. Run from `jiuwen-bot/`:

```sh
npm ci
npm run setup:sdk
npm run doctor -- --mock
npm test
npm run smoke
npm run dev
```

Open **http://127.0.0.1:4318**. The demo uses the pinned TypeScript SDK and an original subprocess fixture; it makes no model calls. Send `read note` to exercise approval, `question` to exercise a question, or `hang` and then Stop to exercise cancellation. A Team message runs Chief → Worker → Chief. Ctrl+C stops the server and its runs.

`setup:sdk` downloads the revision in `runtime-lock.json` into ignored `.runtime/`, uses its npm lockfile, and builds the upstream SDK. SDK source is a dependency, not copied into this application. Run setup before tests in a fresh checkout. All application dependencies are separate from DS Bot.

## Use the Python Runtime

The pinned upstream revision requires **Python >=3.11,<3.14**. From this directory on macOS or Linux:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install ./.runtime/jiuwenswarm
```

Configure JiuwenSwarm using its documented configuration format, with the app's isolated runtime directory at **`jiuwen-bot/.data/live/runtime/`**, not your existing JiuwenSwarm or DSH home. Its configuration belongs under `runtime/config/config.yaml`. Configure only the required model; do not enable unrelated connectors. This app does not generate, import, print or copy credentials. If your configuration uses environment references, set `JIUWEN_BOT_CREDENTIAL_VARS` to a comma-separated list of the required credential variable names ending in `API_KEY`, `TOKEN`, `SECRET` or `PASSWORD`. Only those values enter child processes. No credentials are needed for the demo or tests.

```sh
npm run doctor
npm start
```

Doctor checks the pinned checkout, SDK build, Python version, module availability, a capability-query subprocess and a nonempty configured model catalog. It does not generate text or prove that credentials are valid. `npm start` fails closed if required process capabilities are unavailable.

Environment options:

| Variable | Meaning |
| --- | --- |
| `PORT` | Local HTTP port, default `4318`; bind address stays `127.0.0.1` |
| `JIUWEN_BOT_DATA` | Dedicated app data directory; default `.data/live` or `.data/mock` |
| `JIUWEN_BOT_PYTHON` | Absolute Python executable in the installed environment |
| `JIUWEN_BOT_CREDENTIAL_VARS` | Explicit credential variable names to pass to Python; no values in this setting |

Do not use `~/.dsh`, a user DSH instance, or an existing JiuwenSwarm home for app data or tests. The app gives Python a private home, temporary directory and `JIUWENSWARM_DATA_DIR`, and removes inherited environment variables before each SDK invocation.

## Validation status

Linux deterministic SDK/subprocess tests and the localhost API smoke pass. Installing the full pinned Python runtime was attempted but its pinned `agent-core` GitCode dependency returned HTTP 418 in this environment. Python generation and live model behavior are therefore **not validated**. No live-model calls were authorized or made. Target-Mac startup, shutdown and live acceptance remain unverified; a Linux fixture pass is not Mac certification.

See [architecture](docs/architecture.md), [API](docs/api.md), [acceptance and comparison](docs/acceptance.md), and [evaluation record](docs/evaluation.md). The small browser client is for exercising this backend; Electron, mobile, advanced memory, scheduling, browser automation, connectors and native team orchestration are deferred.

Upstream references: [pinned SDK contract](https://github.com/openJiuwen-ai/jiuwenswarm/blob/8315c183a5d02fdab1674ab5120449c1d4b6728c/sdks/README.md), [protocol](https://github.com/openJiuwen-ai/jiuwenswarm/blob/8315c183a5d02fdab1674ab5120449c1d4b6728c/sdks/PROTOCOL.md), [configuration](https://github.com/openJiuwen-ai/jiuwenswarm/blob/8315c183a5d02fdab1674ab5120449c1d4b6728c/docs/en/Configuration.md). Fei's DeepSeek-Bot supplies the product reference; this app's implementation and UI are original.
