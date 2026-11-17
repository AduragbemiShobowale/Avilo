# H1: visibility latency and discrepancy detection (live system)

Run on 16 Nov 2026, 18:28–18:43 UTC, against the live Supabase project (eu-west-2, London) from a
cloud Linux machine running headless Chromium with software graphics. Client and network are therefore
slower than a typical office laptop; the figures are conservative.

## Latency: 200 events each
A server function posts a self-cancelling adjustment on a quarantined test item. The time is measured
from the moment the write is sent until the change is in the screen's loaded data (realtime notice,
then a full reload of what that user may see).

| Measure | In-app (same user) | Cross-user (admin writes, planner sees) |
|---|---|---|
| Events sent / measured | 200 / 200 | 200 / 200 |
| Mean (95% CI) | 1.63 s (1.58–1.67) | 1.61 s (1.57–1.65) |
| Median · 95th percentile · max | 1.54 · 2.18 · 3.32 s | 1.54 · 2.10 · 3.65 s |
| Within 5 s | 100% | 100% |
| Server write (round trip) | 0.28 s | 0.28 s |

Decision rule (H1, latency): mean ≤ 5 s → **met**.

## Detection of planted discrepancies
| Discrepancy | Seeded | Flagged | False flags |
|---|---|---|---|
| Lost transfers (sent 80 h ago, never received) | 10 | 10 | 0 of 10 normal transfers |
| ERP record mismatches | 10 | 10 | 0 of 56 matching lines |
| Stock leaving with no transfer (RFID gate) | 5 | 5 | – |

Decision rule (H1, detection): every seeded lost transfer flagged → **met**. The planted data reached the
second user's screen 2.2 s after it was written.

## Defect found and fixed during testing
In a first run the planner's realtime channel timed out while joining (slow first page load) and changes
written in that gap never reached the planner. The app now reloads whenever the channel (re)joins, when the
tab becomes visible, and once a minute (commit "Realtime: catch up when the channel joins or reconnects").
The results above are from the fixed version.

## Files
`h1_latency_inapp.csv`, `h1_latency_cross_user.csv` (per event), `h1_latency_summary.json`,
`h1_detection.csv`, `h1_run.json` (run metadata, channel status), screenshots.
Reproduce: `node scripts/h1_live_test.cjs <built dist> <out dir> 200 <logins file>` then `python3 scripts/h1_stats.py <out dir>`.
The logins file is not in the repository.
