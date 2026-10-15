# Local API

Use the origin printed by `npm start` (`http://127.0.0.1:4318` by default). All mutations require `Content-Type: application/json` and an exact matching `Origin`. `POST /api/session` with `{}` establishes the local HttpOnly cookie. The browser does this automatically. Other endpoints require that cookie; it is never printed or stored in SQLite.

| Method and path | Body / behavior |
| --- | --- |
| GET `/api/state` | Bots and conversations |
| GET `/api/capabilities` | Validated Runtime capability discovery |
| POST `/api/bots` | `{name, role: "chief" or "worker", instructions, model?}` |
| POST `/api/conversations` | `{name, kind: "private" or "group", botIds}`; one private bot or Chief + Worker |
| GET `/api/conversations/:id` | Visible transcript, runs, membership, interactions |
| POST `/api/conversations/:id/messages` | `{text, key}`; client-generated stable idempotency key |
| GET `/api/conversations/:id/events` | SSE; `Last-Event-ID` or `?after=` global event ID |
| POST `/api/conversations/:id/permission` | `{permission: "allow" or "ask" or "deny"}` for `read_note` |
| POST `/api/conversations/:id/runs/:runId/cancel` | `{}`; cancels the remaining exchange |
| POST `/api/conversations/:id/runs/:runId/interactions/:interactionId` | `{answers: [{selected_options: [offeredValue], custom_input: ""}]}` in question order |

Every normalized SSE event includes `id`, `runId`, `conversationId`, `sequence`, `type`, `payload` and `createdAt`. Text deltas append; `text.final` is a display observation only. Terminal events are `run.completed`, `run.failed`, `run.cancelled`, `run.timed_out`, or `run.interrupted`. `run.cancelling` is nonterminal. Group exchanges yield three run IDs in order. Stream disconnects never cancel or resubmit work.

Reusing a submission key with identical text returns the saved run IDs. Different text with the same key returns 409. Expired or duplicate interaction answers return 409; foreign conversation/run identities return 404. Request bodies are limited to 64 KiB. Errors do not expose process stderr or model configuration.

There is no delete/edit-bot or cross-chat context API in this increment. Create a new bot/session when changing an immutable runtime identity. Unsupported capabilities fail explicitly.
