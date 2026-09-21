# Same-workload provider benchmark

Dependency-free Node.js 22+ runner for one YouTube English-caption request and one Instagram Reel metadata request across SocialKit, ScrapeCreators and **two specific pinned Apify Actors**. Read [METHODOLOGY.md](METHODOLOGY.md) before making requests. This directory contains a draft protocol and tested runner, **not measured provider results**.

On 2026-09-21 the sprint owner excluded work requiring third-party access. Authenticated ScrapeCreators/Apify pilot and full comparative measurement are therefore **skipped by scope**, and no winner, speed or reliability claim is published. The runner remains reusable when credentials and an approved remaining budget are available. [READINESS.md](READINESS.md) records the exact gates.

## Offline verification

```sh
node --test examples/benchmark/benchmark.test.mjs
```

Fixtures are synthetic, never benchmark measurements. Tests cover provider response shapes, empty/wrong-identity results, null metrics, charge capture, async dataset latency, remote abort, transient retries, budget stop, unknown spending, preflight, redaction and analysis.

## Pilot setup

No package install is required. From this directory:

```sh
cp .env.example .env
cp config.example.json config.local.json
```

Set keys in `.env` without committing it. Record actual client geography/network and the tested accounts' pricing sources in `config.local.json`; set each `costs.*.reviewed` only after checking it. Example prices are labeled assumptions. The conservative four-input pilot reserves at most **$0.36**, including one retry per job: 8 SocialKit credits, 8 ScrapeCreators credits and 8 Apify run caps of $0.025. The $5 sprint cap covers pilot plus any later run; enter only the **remaining** budget per invocation. Never purchase credit or enable automatic refill through this runner.

`inputs.pilot.json` consists of explicitly labelled public documentation examples. Independently verify their current availability and caption/Reel type before a paid pilot. They are deliberately excluded from the full study, whose sample must be independently selected.

```sh
node --env-file=.env run.mjs check config.local.json inputs.pilot.json
node --env-file=.env run.mjs run config.local.json inputs.pilot.json /private/tmp/socialkit-benchmark-pilot-UNIQUE
node run.mjs analyze /private/tmp/socialkit-benchmark-pilot-UNIQUE
```

`check` sends no scraping requests. It verifies local configuration/credential presence and read-only Apify pricing/build metadata when Apify is selected; **it does not prove provider credit balances, account validity, SocialKit cohort or a usable response**. Missing prerequisites fail closed. `run` creates a new private directory and refuses overwrite. A nonzero exit may leave valuable attempt evidence; inspect it before any new paid run. Never blindly restart a timed-out Apify submission: it might still be spending within its remote cap. Actor IDs in private exchange bodies allow read-only reconciliation.

For a SocialKit-only development smoke test, set `providers` to `["socialkit"]`, `socialkitEnvironment` to `"development"`, `socialkitBaseUrl` to `"https://socialkit-api.development.corp.skyfall.ai"`, reduce budget/credit limits, and supply the development key. Its outputs remain labelled **pilot / development**, not comparative production measurements. Full runs refuse a missing provider or development endpoint.

## Locking and full run

After all three pilot legs and manual QA, prepare a full configuration (`phase: "full"`, production SocialKit, remaining budget) and `inputs.full.json`: 20–30 unique primary inputs **per workload**, plus 3 repeat inputs per workload. Every item uses the pilot schema plus `precheckedAt`, `publicConfirmed:true` and, for captions, `englishCaptionsConfirmed:true`. Repeat IDs differ but URLs must match primary inputs. Record diverse publishers/durations and selection notes. Do not select based on which provider succeeds. With 20 primary and 3 repeat inputs per workload, conservative reservations total $4.14 including all possible retries; combined with the example $0.36 pilot this fits $5. More inputs may not fit the cap.

Save a private pilot review JSON with `reviewer`, `reviewedAt`, `pilotRun`, and these verified booleans: `captionLanguageAndIdentityReviewed`, `creditPolicyReviewed`, `normalizationReviewed`, `providerAccessVerified`. Set `pilotReview:{"complete":true,"evidence":"pilot-review.json"}` and `lockFile:"methodology.lock.json"` in the full config.

```sh
node run.mjs lock config.local.json inputs.full.json methodology.lock.json
node --env-file=.env run.mjs run config.local.json inputs.full.json /private/tmp/socialkit-benchmark-full-UNIQUE
```

The lock binds protocol text, configuration, inputs and runner code by SHA-256. Keep pilot and full evidence separate. A changed method requires a versioned new protocol; no changing rules after observing a winner. The run stops when cost evidence exceeds a declared bound, a remote run still needs reconciliation, the remaining budget cannot reserve another attempt or wall time cannot accommodate the next deadline. Every planned job remains in the outcome table; stopped jobs cannot support a full-comparison headline.

## Evidence and publication

A run produces `manifest.json`, a durable `journal.jsonl` with every start/completion, redacted private HTTP exchange JSON, `results.json`, normalized `attempts.csv` and `outcomes.csv`. Output directory mode is 0700; files are 0600. Credentials and signed media queries are redacted. Raw transcripts and captions stay private; they are useful for manual QA and may have redistribution restrictions.

```sh
node run.mjs export /private/tmp/socialkit-benchmark-full-UNIQUE /private/tmp/socialkit-benchmark-public-UNIQUE
```

Export creates allowlisted numeric evidence and reproducible analysis (JSON and CSV). It excludes raw content, headers, remote run IDs and account IDs. **Export is not publication approval or proof of QA.** Preserve and inspect public outputs before tracking them. Include `qa.json` with all failures, required-field omissions, slowest successes, three successes per workload/provider, English/caption-source checks and identity checks. Record no caption language as verified when a provider did not report it and QA did not establish it. The comparison article must link the same frozen method/results and describe the tested Actors, single-URL startup overhead, sampling period, survivor latency and sample limitations.

Analysis reports first-attempt/eventual usable counts, ordinary median and nearest-rank p90 of usable results, missing fields, failure categories, actual credits, modeled credit USD, terminal Apify USD, unknown charge count and conservative reservations. A known-cost subtotal is not a complete total while unknowns remain. Credits and requests are not interchangeable with usable results.
