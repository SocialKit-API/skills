# Verification — 2026-09-21

Tested **n8n 2.39.8**, Node.js **24.2.0**, and **PostgreSQL 18.3 via PGlite 0.5.8** with pglite-socket 0.2.11 and pg-promise 11.9.1. The database used persistent disk storage on loopback. The unchanged credential-free export imported into a fresh n8n instance; credential setup and executions used local synthetic SocialKit/Slack endpoints. **No external Slack delivery was attempted or is claimed.**

[Machine-readable results and exact export SHA-256](qa-results.json) bind these outcomes to the versioned JSON. [qa-local.mjs](qa-local.mjs) is the executed harness; [README](README.md#reproduce-fresh-import-qa-without-docker) pins the test dependencies and commands.

| Case | API fixture calls | Simulated Slack calls | Result |
|---|---:|---:|---|
| First manual collection | 2 | 1 | Success; two delivered IDs committed |
| Repeat after n8n process restart | 2 | 0 | Quiet; persistent dedup retained |
| Empty feeds | 2 | 0 | Quiet |
| Bad SocialKit authentication | 2 | 0 | Visible execution failure, no digest |
| Invalid profile syntax | 0 | 0 | Failed before collection |
| One unavailable/private-profile-shaped failure | 2 | 1 | Successful profile delivered with partial-failure notice |
| Slack HTTP 429 / `ok:false` | 2 | 1 | Failed; exact pending outbox retained, no delivered IDs |
| Second run while lease remains held | 0 | 0 | Quiet; lease excludes overlapping work |
| Retry after simulated lease expiry | 0 | 1 | Pending digest delivered; no API spend repeated |
| Repeat after confirmed retry | 2 | 0 | Quiet |

The separate [SQL persistence test](persistence.test.mjs) passed lease exclusion, failed-delivery retention, exact pending payload preservation, expired-lease reclaim, stale-owner rejection, digest mismatch rejection, post-confirmation commit and reconnect persistence. SQL conditions/row locks implement atomic ownership; PGlite's connection multiplexer is not a distributed/native PostgreSQL concurrency load test. Each n8n execution used a new process. A native production PostgreSQL deployment, actual private Instagram account, and real Slack credentials remain operator integration checks; fixture results are not represented as those external outcomes.

The [starter](../../examples/competitor-research/) separately passed ten Node tests, including a fresh-directory execution of the README command, bad-key handling, invalid input without requests, real transport timeout, nullable metrics/zero, content/profile identity, secret-safe parse errors, request/time/credit caps, and immediate stop after an unexpected reported credit charge. Its real development sample uses Node.js 22.23.2 and the actual SocialKit endpoints. Monitor credentials waive billing; endpoint credit headers do not prove paid usage.

Observed blockers fixed before these results: n8n CLI import requires a workflow ID; the Code sandbox lacks the browser `URL` global; shared Instagram feed items can have a different primary author. All are reflected in the final artifact and documented contract.
