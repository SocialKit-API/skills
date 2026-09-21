# Competitor research

> Real public-data sample from deployed development using an internal monitor credential with billing waived. API headers reported 2 endpoint credits; this is not proof of paid customer usage. Three items per profile, collected 2026-09-21.

Collected: 2026-09-21T07:40:50.691Z → 2026-09-21T07:40:53.117Z

Schema 1.0.0. Up to 3 items/profile; Instagram Reels only. Sample rankings are not cross-platform comparisons.

Requests: 2/2. Modeled credit reservations: 2/2. API-reported endpoint credits: 2. Billing debits are not independently verified (monitor/test calls may be waived). Per-request used and remaining-credit headers are recorded in JSON.

Missing metrics stay unknown. API-reported zero is retained; upstream defaults can hide missing observations. No AI inference, transcripts, or per-video enrichment.

## https://www.youtube.com/@NASA — ok


| Recent sample (API order) | Type | Published | Views | Likes | Comments |
|---|---|---|---:|---:|---:|
| [NASA Moon Base: The First Six Months](https://www.youtube.com/watch?v=IwZVXmQdX1E) | video | 2026-09-08T18:33:06.000Z | 0 | unknown | unknown |
| [What It Takes](https://www.youtube.com/watch?v=90Kgw_SvK4w) | video | 2026-09-04T18:01:42.000Z | 0 | unknown | unknown |
| [Artemis III: Our Next Step Back to the Moon](https://www.youtube.com/watch?v=jHKf1eHp3eQ) | video | 2026-09-03T18:49:04.000Z | 0 | unknown | unknown |

## https://www.instagram.com/nasa/ — ok

- instagram:DdhFkS7KGkZ has primary author @ravens; feed membership does not prove original authorship (shared/collaborative posts may differ).
- instagram:DdRyQxKteC1 has primary author @astro\_jessica; feed membership does not prove original authorship (shared/collaborative posts may differ).
- instagram:DdPsDCWRT-u has primary author @nasaadmin; feed membership does not prove original authorship (shared/collaborative posts may differ).
- More items exist; continuation cursor was not followed.

| Recent sample (API order) | Type | Published | Views | Likes | Comments |
|---|---|---|---:|---:|---:|
| [Our first Leader of the Uprising 🔥 Tune in on @paramountplus / @nfloncbs](https://www.instagram.com/reel/DdhFkS7KGkZ/) | reel | 2026-09-20T17:20:00.000Z | 4425053 | 31735 | 239 |
| [Volume up and get your groove on! A bit of weekend dancing on the @iss to start your week off right. A friend of mine was shocked when she realized that it was ](https://www.instagram.com/reel/DdRyQxKteC1/) | reel | 2026-09-14T18:58:07.000Z | 8648546 | 201124 | 2127 |
| [Today’s @nfl flyover in Pittsburgh is just the beginning. This is how @nasa does game day. 🇺🇸](https://www.instagram.com/reel/DdPsDCWRT-u/) | reel | 2026-09-13T23:01:52.000Z | 5284435 | 56869 | 248 |

## Sample top performers

### instagram:reel

known API-reported views within collected sample

- [instagram:DdRyQxKteC1](https://www.instagram.com/reel/DdRyQxKteC1/): 8648546 views
- [instagram:DdPsDCWRT-u](https://www.instagram.com/reel/DdPsDCWRT-u/): 5284435 views
- [instagram:DdhFkS7KGkZ](https://www.instagram.com/reel/DdhFkS7KGkZ/): 4425053 views

### youtube:video

known API-reported views within collected sample

- [youtube:90Kgw_SvK4w](https://www.youtube.com/watch?v=90Kgw_SvK4w): 0 views
- [youtube:IwZVXmQdX1E](https://www.youtube.com/watch?v=IwZVXmQdX1E): 0 views
- [youtube:jHKf1eHp3eQ](https://www.youtube.com/watch?v=jHKf1eHp3eQ): 0 views

## Request ledger

| Profile | Attempt | HTTP | Outcome | Reserved credits | Charged header | Remaining header |
|---|---:|---:|---|---:|---:|---:|
| https://www.youtube.com/@NASA | 1 | 200 | usable | 1 | 1 | 20 |
| https://www.instagram.com/nasa/ | 1 | 200 | usable | 1 | 1 | 20 |
