# Evaluation record

Recorded 2026-10-13 on Linux, Node.js 22.23.2, Python 3.12.13. JiuwenSwarm revision: `8315c183a5d02fdab1674ab5120449c1d4b6728c`.

| Check | Status |
| --- | --- |
| Pinned TypeScript SDK install/build | Passed |
| Deterministic SDK/subprocess integration tests | 12 passed, including forced server-crash/restart and forwarded localhost ports |
| Localhost API smoke, including approved read and cancellation | Passed |
| Chromium browser regression | Passed: approvals, reload, chat switching, group replies, Stop, mobile width; no page errors |
| App lint | Passed, no warnings |
| Existing DS Bot unit tests | 418 passed |
| DS Bot generated-client check | Passed |
| DS Bot lint | Passed with existing warnings |
| Complete Python dependency installation | Blocked: pinned GitCode agent-core dependency returned HTTP 418 |
| Python Runtime generation | Not run |
| Live model acceptance | Not authorized or run |
| Target Mac acceptance | Not run; required before claiming Mac support |
| Controlled DSH/JiuwenSwarm quality comparison | Not run; fixtures and settings gate provided |

No latency, token-efficiency or correctness advantage is claimed for either harness. The deterministic subprocess is an integration fixture and cannot establish those results.
