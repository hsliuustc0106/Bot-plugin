# Architecture

`apps/api` owns HTTP and local browser access. `apps/web` is a dependency-free client. `packages/domain` owns application identity, SQLite, routing, permissions and the queue. `packages/runtime-contracts` documents the five adapter operations and normalized events. `packages/runtime-jiuwen` wraps the pinned upstream TypeScript SDK. The SDK launches one Python process per turn or query; there is no second model loop.

## State and execution

SQLite tables contain bots, conversations, memberships, messages, runs, interactions, runtime-session mappings, idempotent submissions, tool calls and normalized events. Events have a global replay ID plus run ID, conversation ID and contiguous per-run sequence. Domain state changes and their event records commit together for submissions and terminal transitions. Each authenticated local browser sees the same local account.

Bots have stable UUIDs. A mapping `(conversationId, botId)` owns a runtime session and workspace. Private and group sessions never share mappings. The immutable agent definition is saved with the mapping and resent on every turn, because the Runtime rejects changed definitions on resume. The adapter's reopen operation validates `session.get`; normal continuation submits the saved session ID. Missing sessions are errors, never silently reset.

The queue serializes all turns within a conversation (stronger than a per-session lock) and runs at most two conversations concurrently. A group submission atomically reserves three steps: Chief assignment, Worker result, Chief summary. Only the same group's visible transcript enters these prompts; later queued user submissions and all private transcripts are excluded. Worker failure prevents summary generation and marks the remaining step failed. There is one delegation level, three group turns and at most four model calls per turn (12 per exchange). No agent has a delegation or native team tool. A transcript window caps group prompt transport size; it is not a compactor for runtime working context.

`chat.delta` streams text. `chat.final` is an observation, never completion. Only the SDK's validated terminal record plus matching process exit status completes a run and commits an assistant message. Failures retain partial text and an honest status. Usage comes from the terminal result; missing values remain unknown.

## Tools and interactions

The agent allowlist contains only `read_note`; no shell, native filesystem, MCP or delegation tools are exposed. The Runtime permission override allows reaching the host callback; the host then independently applies its current allow/ask/deny policy. An approval grants one read, not a wider runtime permission. A changed deny policy is checked again immediately before dispatch.

The tool reads only `note.txt` in the mapped workspace. It accepts no caller-selected path, rejects symlinks, non-regular files, multiple hard links and files larger than 64 KiB, and uses a bounded read. The directory is not an OS sandbox; this design relies on the runtime's verified tool allowlist and the absence of other executable tools. The shared read operation never opens a private transcript.

Interactions persist their exact questions/options and a random app ID. Answers must match the conversation, run and active waiter; only offered option values or explicitly permitted custom input are accepted. Original question text and card IDs are reconstructed server-side. Duplicate answers fail. Duplicate tool call IDs reuse a pending promise or saved completed result, and cannot execute twice. Unknown outcomes are not retried.

## Cancellation and recovery

Cancel immediately marks the exchange cancelling, aborts the local signal, expires waiters, stops any new tool dispatch and cancels queued steps in the same exchange. The adapter sends cancellation through the SDK. The service waits for dispatched host work to settle before it publishes a terminal state. A read already dispatched may finish; its result stays in the audit trail. Process termination cannot undo a host action.

Normal Python cancellation must produce its terminal result. A hung process is bounded by the 190-second SDK host deadline and 3-second cleanup grace. If cleanup or protocol validation fails, the run fails with an unknown outcome; it is not labelled cancelled merely because the user clicked Stop. No automatic retries occur.

Startup marks prior queued/running/cancelling runs interrupted, pending interactions expired and pending/running tools unknown. It never recreates callbacks or replays work. Submission keys survive restart and return the original runs. SSE reconnect replays committed events; opening or closing a stream never starts a turn. A separate SQLite database holds an exclusive lock for the server lifetime, preventing concurrent servers from recovering or changing the same app data. The OS releases that lock on exit or crash; there is no stale PID-file race.

## Local access and environment

HTTP binds only to `127.0.0.1`. Host checking accepts only literal `localhost`, `127.0.0.1` or `[::1]` with a valid optional port, including browser-facing ports preserved by local tunnels. Other hostnames are rejected to protect against browser DNS rebinding. Same-origin JSON bootstrap establishes an in-memory HttpOnly SameSite=Strict session cookie. API requests require it; mutations require the exact browser-facing Origin matching the validated Host and JSON content type. Foreign Origin / Fetch-Site requests fail and no CORS access is offered. CSP disallows inline scripts and framing. This is one trusted local account, not multi-user OS authentication: local processes can bootstrap, and hostile same-user software is outside the boundary.

Because the upstream SDK merges `process.env`, each invocation explicitly maps every inherited variable to undefined before adding the minimal environment and explicitly selected credentials. Runtime home, data and temp paths are isolated. The application never logs SDK stderr or arbitrary runtime error text. The Python runtime owns its own isolated diagnostics; treat that directory as private. The database, runtime directories and app lock are private to the current OS user.
