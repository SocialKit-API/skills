# SocialKit Competitor Monitor v0.1.0

A versioned n8n workflow that collects up to three public YouTube/Instagram competitors and sends only new sampled content to Slack. Instagram uses **Reels only**. It reuses the [starter normalization contract](../../examples/competitor-research/SPEC.md). No native node extension, mandatory AI, or transcript calls.

Download/import [`socialkit-competitor-monitor.v0.1.0.json`](socialkit-competitor-monitor.v0.1.0.json). Keep [`sql/schema.sql`](sql/schema.sql) with that exact version. This is a self-hosted automation, not a hosted monitoring service.

## Requirements and setup

1. n8n with the built-in Code, HTTP Request, Postgres, If, and Schedule Trigger nodes. The verified runtime and test scope are recorded in [QA.md](QA.md).
2. A persistent PostgreSQL database accessible to n8n. Use a dedicated database/role, run `sql/schema.sql` once, and grant the role access to the created tables/functions. This database holds the delivery state; ephemeral/in-memory storage is unsuitable. The SQL is not n8n's internal schema and should not overwrite it.
3. Create an n8n **Postgres** credential for that database. Assign it to all four Postgres nodes: Claim delivery lease, Stage persistent outbox, Guard delivery lease, Commit confirmed delivery. For production connections, configure TLS for your database; local fixture tests use loopback without TLS.
4. Create an **HTTP Header Auth** credential with header name `x-access-key` and your SocialKit access key ([get a key](https://www.socialkit.dev/login?asset_id=competitor-monitor-n8n&asset_version=0.1.0&asset_context=workflow-readme)). Assign it to **Collect SocialKit**. Do not put keys into URLs, configuration code or the exported JSON.
5. Create a separate **HTTP Header Auth** credential with header name `Authorization` and value `Bearer YOUR_SLACK_BOT_TOKEN`. Assign it to **Send Slack digest**. The bot requires `chat:write` and must be able to access the destination channel. Use your own authorized test channel first.
6. Edit **Configure competitors**: one to three profile URLs, limit 1–10, API origin, Slack channel ID (`C…` or `G…`), and a stable `destination` identifier unique to that workspace/channel. Keep the destination stable across upgrades/restarts; never reuse one for a different Slack destination. Public settings are the only values to edit in this node.
7. Click **Execute workflow**. Inspect the normalized report, staged outbox, Slack confirmation and committed delivered count. Repeat immediately: previously delivered IDs should produce no Slack request. Enable/publish the schedule only after testing. It defaults to daily at 09:00 UTC; change the timezone/schedule deliberately.

Export contains no credential IDs or secrets. The stable workflow ID supports CLI import; import the file as a new workflow when maintaining multiple monitors. n8n may reuse the ID during CLI re-import, so inspect the target instance first.

## Bounds and interpretation

At most three HTTP collection requests and three modeled SocialKit credits per run, up to ten items/profile, no pagination, no inline retries, 60-second request timeouts and a 600-second workflow timeout. HTTP node concurrency is bounded by the maximum three input profiles. Every scheduled retry starts a fresh bounded run; daily scheduling does not mean a lifetime spend cap. Disable the schedule when the cumulative spend limit for your project is reached.

YouTube list pricing is one credit per 50 results; Instagram Reels pricing is one per 20, at least one per successful call. Since the workflow caps the limit at ten, either call reserves one modeled credit. Actual used/remaining-credit headers are recorded. Total API-reported endpoint credits remains unknown if any used header is absent; billing debits are not inferred from concurrent account balances. Optional API features/AI analysis are outside this version's budget. If adding them later, define a separate request/token/spend cap and preserve item IDs, source links and post-delivery commit ordering.

Nullable metrics stay unknown, including YouTube likes/comments unavailable from its list endpoint. The digest does not compare raw platform view counts. API-reported zero is retained, with the upstream-zero limitation documented in the starter. The first run sends the sampled items; this is not an exhaustive historic import. Pinned items, deletion, private accounts and more than ten new posts between runs can prevent complete coverage. No promise of “all new posts” is made.

## Persistence, overlap and failure policy

PostgreSQL stores delivered keys by `(destination, platform:contentId)` indefinitely. Back up the database with your workflow configuration. Removing old delivered records permits those items to be sent again if they reappear; retention is an explicit operator choice, not an automatic silent expiry.

An atomic **15-minute lease** serializes runs for the same destination. It is longer than the 10-minute execution timeout, and the guard requires at least 60 seconds left before a 30-second Slack call. An overlapping run exits quietly without making collection or Slack calls. Never manually clear an unexpired lease while a run may still be executing.

New items are saved in a durable **pending outbox before delivery**. Only Slack HTTP 200 plus `ok:true`, matching channel and a message timestamp leads to the atomic delivered-ID commit. A failed/ambiguous send leaves the exact outbox intact. After the lease expires, the next manual/scheduled execution resends that pending digest without making new SocialKit calls. After it succeeds, a later execution collects fresh data. Authentication or all-profile failures fail visibly in execution history. Partial failures accompany available new items; empty/new-item-free results produce no noise-only Slack digest.

Delivery is **at least once**. If Slack accepted a message but its acknowledgement or database commit was lost, a retry can duplicate it. Every message includes the stable digest ID to recognize duplicates. Do not mark items delivered manually merely to hide a failed execution.

Monitor n8n failed execution alerts/history as part of operating the workflow. After fixing bad credentials, unavailable profiles or Slack access, wait for lease expiry before retrying. A permanently private profile should be removed or replaced. Invalid profile syntax fails before acquiring a lease or consuming credits.

## Verify or modify

The JSON is generated from the starter's shared normalization functions and [build.mjs](build.mjs):

```bash
node workflows/competitor-monitor/build.mjs
node --test examples/competitor-research/*.test.mjs
```

The SQL integration test requires `pg-promise` installed in a test directory and an isolated PostgreSQL database:

```bash
AEO_QA_MODULES=/absolute/path/to/test/package.json \
AEO_QA_POSTGRES_URL=postgresql://test_user:test_password@127.0.0.1:5432/test_database \
node --test workflows/competitor-monitor/persistence.test.mjs
```

Never aim tests at a production database. The test creates uniquely named destination records. Integration QA uses a local simulated external Slack service; no external Slack delivery is implied. [Changelog](CHANGELOG.md).

### Reproduce fresh-import QA without Docker

Use Node.js 22+ and OpenSSL. Pin the test tools in a disposable directory; none are starter runtime dependencies:

```bash
qa_dir="$(mktemp -d)"
npm install --prefix "$qa_dir" n8n@2.39.8 pg-promise@11.9.1 @electric-sql/pglite@0.5.8 @electric-sql/pglite-socket@0.2.11
"$qa_dir/node_modules/.bin/pglite-server" --db="$qa_dir/postgres-data" --host=127.0.0.1 --port=55439 --max-connections=10
```

Leave that isolated database running. In another terminal, set `qa_dir` to the same directory (choose an unused loopback port if 55439 is occupied):

```bash
export AEO_QA_MODULES="$qa_dir/package.json"
export AEO_QA_POSTGRES_URL=postgresql://postgres:postgres@127.0.0.1:55439/postgres
export AEO_QA_N8N="$qa_dir/node_modules/.bin/n8n"
node --test workflows/competitor-monitor/persistence.test.mjs
node workflows/competitor-monitor/qa-local.mjs
```

The harness creates a fresh n8n user directory, imports the unchanged export first, then supplies local synthetic credentials, public settings and local HTTPS fixture endpoints. Its only workflow changes are that test configuration and TLS allowance for the local self-signed certificate. It executes the actual n8n nodes in fresh processes for every case; the database persists across them. Results/logs are written to the printed temporary directory. Stop the isolated database afterward. For native PostgreSQL testing, point the same scripts at an isolated loopback PostgreSQL database instead. PGlite's connection multiplexer is not a substitute for load-testing a distributed native PostgreSQL deployment.
