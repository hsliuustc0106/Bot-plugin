# Acceptance and controlled comparison

## Offline checks

Run `npm ci`, `npm run setup:sdk`, `npm test`, `npm run lint`, `npm run doctor -- --mock`, and `npm run smoke`. Tests exercise real SDK subprocess transport against an original deterministic fixture. They cover streaming, terminal validation, session reuse, queue ordering, private/group separation, group failure, duplicate submissions/callbacks, denied tools, stale/foreign answers, cancellation during answers and tool work, recovery, inherited-environment removal and authenticated SSE replay.

For the browser regression (chat switching, streaming completion, approval, reload, group replies and Stop), run `npx playwright install --with-deps chromium` then `npm run test:browser`. Browser binaries are optional for the API/unit suite.

The mock is deliberately not a model-quality evaluation or proof of Python Runtime behavior. Run the same offline commands on the target Mac, start `npm run dev`, exercise the browser, stop with Ctrl+C and verify no child remains.

## Python and live acceptance (separate authorization)

After the complete pinned Python dependency installation succeeds, configure only the isolated runtime and run `npm run doctor` on the target Mac. This must validate module availability, process startup/exit, capabilities and a configured model catalog. An import-only or capability-only installation is not a complete Runtime install.

Before making billable calls, obtain explicit authorization for the provider/model and cost bounds. Then use the browser to verify:

1. Create a bot, stream a response, Stop, reload and see the saved transcript.
2. Read a known workspace note after approval; deny a second read and confirm it does not execute.
3. Cancel during generation, a question and a tool approval. No later tool begins.
4. Send a group task; verify Chief assignment, Worker result, Chief summary and stopping.
5. Disconnect/reconnect during generation, retry the same submission key, then restart during generation/approval. Verify no duplicate work, interrupted runs and expired cards.
6. Confirm process cleanup on the target Mac. Record any failures without turning partial text into success.

No live acceptance has been performed by this implementation task.

## Comparison

Use `tests/fixtures/comparison.json` for both backends. Each operator-produced result file has:

```json
{
  "settingsVerified": false,
  "settings": {
    "provider": "provider identifier",
    "modelVersion": "exact model/version",
    "reasoning": "verified actual setting",
    "tools": ["read_note"],
    "permissions": "ask",
    "maxModelCalls": 4,
    "timeoutSeconds": 180
  },
  "results": [
    {
      "id": "private-reply",
      "supported": true,
      "correct": true,
      "manualInterventions": 0,
      "latencyMs": 1234,
      "usage": null,
      "failure": null
    }
  ]
}
```

Include a result for every fixture case. Set `settingsVerified: true` only after checking the actual settings on that backend. Use `supported: false` and a `reason` for unavailable features; do not score these as model failures. Record settings from each backend's actual catalog/configuration, not similarly named UI labels. Record correctness, manual interventions, wall latency, reported token/cost usage and failures. Unknown usage is `null`. Keep fixture data free of credentials or personal transcripts.

`node scripts/compare.mjs DSH-results.json Jiuwen-results.json` rejects missing/different settings and supported cases with missing metrics, and preserves unsupported cases separately. It does not run either model or claim a harness advantage. A meaningful harness comparison needs a DSH setup exposing the same read-only tool, policies, model and limits; this repository does not modify DSH to manufacture parity.
