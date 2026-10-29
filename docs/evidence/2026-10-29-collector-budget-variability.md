# Collector budget variability

Recorded on 2026-10-29 for issue #33. The browser-evidence implementation
head is `031ebff451e99ef93bb029a2b0ddc3e587a07593`. The later failure-path-only
study corrections are `c58744f27401be3179b0dac54e6d8e4ea37275d2` (attempt
registration and persistence) and `1d3593e97d15abdff8aea8f53b25eff22886ba81`
(start-to-end total finalization); they change no successful measurement body or
budget input and have no full-study rerun. The later test-only quality and
shared-operations heads are `dd6062e4bdf30f7906e286031ec6a6718859aa2f` and
`14d8bb9c20a67e2b423af62c59de2aa83580aaf8`; local and hosted packaged suites
validate `14d8bb9` separately. The final documentation head is the last commit
containing this record; it is separate from all implementation heads and does
not move the browser evidence. The orchestration base was
`a708fb5896c47fba592d7ddee80502e50753a4e6`.

The investigation changes no product collector, threshold, quantile, sample
count, scenario, permission or latency promise. It adds one shared fixed-budget
helper, diagnostic setup labels, and a bounded test-only study. Every retained
failed assertion remains failed.

## Scope and authority

The retained page-error collector gate is unchanged: at least 30 synchronous
operation samples, nearest-rank p95 plus two observed clock steps at most 5 ms,
and a 1 KiB summary limit. The gate is evaluated separately for setup, event
handling and finalization. The timing collector's separate 5 ms gate is not
part of this record.

The existing source fixture uses explicitly hashed wrappers around unchanged
production observer bodies. It is diagnostic/instrumented authority, not native
usability, consent or independent qualification evidence. The standard
packaged Firefox and Chrome runs are a separate qualification protocol, not the
new diagnostic study; both use the disclosed instrumented source fixture, so no
uninstrumented collector measurement exists here. The retained hosted
Linux/Windows reports are historical artifacts, not new executions. The new study
ran only on macOS arm64 Firefox; local Linux/Windows and Chrome diagnostic study
environments are unavailable in this record. No new hosted run was made because
the approved PR handoff has not happened.

## Retained failures

Four retained budget failures are known. Three have raw setup arrays
(`8091ad1`, `ab8618a`, #32); the hosted `028c29c` 6 ms failure does not. Two
different 6 ms failures must not be combined: `8091ad1` is local with arrays,
while `028c29c` is hosted without them.

### `028c29c` Linux Firefox 158

The retained report is
`.scratch/collector-budget/artifacts/028c29c-firefox/firefox-Linux-158.0.1/firefox-evidence-158.0.1-xpi.json`
(SHA-256 `c21a809806adb35f568224d0b9b153664da707af443dcf32f7a5b20d01c0132f`).
It is clean source `028c29cf4d1e51700f6e7b93e542bc7ea775a876`, records 48
observed checks and fails with
`Synchronous operation p95 plus two observed clock steps is 6 ms`.

`pageErrorQualification.overhead` is empty. The pre-`deeb3d8` reporting code
evaluated and threw before publishing its measurement object, so the operation,
world, raw samples and clock step are absent. The 6 ms result cannot distinguish
setup work, collector work, quantization or load. The failed assertion and
missing-artifact limitation stay explicit. Later passing runs do not supply
those missing arrays or explain this result.

### `8091ad1` local Firefox 158

The retained report is
`/Users/ranokay/Documents/ChatGPT/fext/.scratch/p3a-local-8091ad1-retry/firefox-evidence-158.0.1-first-retry-failed.json`
(SHA-256 `c8d9eb38b00f2319cac4bfe5b8743e507d3c38a3d46343a643b9de8443150405`),
with the retained audit at
`/Users/ranokay/Documents/ChatGPT/fext/.scratch/p3a-audit/local-158-first-retry-failure-audit.json`
(SHA-256 `78a8c900cadaf134b8898cb2fff7d1c5500b89ed0e693d9a9f54107ce7227c04`).
It is clean source `8091ad120cb12195722c59e87bad8563f214ed27`, macOS 27.2
arm64, Firefox 158.0.1, geckodriver 0.37.1. It records 54 observed checks and
fails at `/page-errors/empty` with
`Synchronous operation p95 plus two observed clock steps is 6 ms`.

| Measure                     | Value                                  |
| --------------------------- | -------------------------------------- |
| Setup raw samples           | `[4, 0, 0, 1, 0, 5, 0, …]` (30 values) |
| Setup p95 / max             | 4 / 5 ms                               |
| Setup samples at least 4 ms | 2 of 30                                |
| Handler p95 / max           | 0 / 1 ms                               |
| Finalization p95 / max      | 1 / 2 ms                               |
| Clock samples               | 1 ms in all 30                         |
| Guarded result              | 4 + 2 × 1 = 6 ms, failed               |

The existing per-attempt `metrics.setup` arrays contain `[4, 0]` at position 0
and `[5, 0]` at position 5. Both high values are in the first, installation
slot. This is a separate failure from the hosted `028c29c` 6 ms result, which has
no arrays. The audit records `confirmed-failed-6ms-guard-unchanged-source`; the
page-error source hashes match the qualified baseline. The subsequent controlled
repeat at the same clean head passed 79 checks
(`.scratch/p3a-local-8091ad1-retry/firefox-evidence-158.0.1-controlled-repeat.json`,
SHA-256 `c0bdbdee920cc88b33c41c932fa1b6c92a438cce9172aa6fffb9085d46683065`)
with setup p95 0–1 ms. That later pass does not erase the failure or explain the
two installation samples.

### `ab8618a` Windows Firefox 153.5.1esr

The retained report is
`.scratch/collector-budget/artifacts/ab8618a/firefox-Windows-153.5.1esr/firefox-evidence-153.5.1esr-xpi.json`
(SHA-256 `ea7b43e0c614141f10bba815b2824c8baccff0535abdd07402cc1f215047fa95`).
It is clean source `ab8618a8482512c3cd5e994031062812ecaeb080`, Windows Server
2025 x64, Firefox 153.5.1, geckodriver 0.37.1. It records 56 observed checks
and fails at `/page-errors/heavy` with `budgetEvaluation` identifying
`supervisor` setup.

| Measure                     | `/page-errors/empty` | `/page-errors/heavy`     |
| --------------------------- | -------------------- | ------------------------ |
| Setup raw p95 / max         | 1 / 8 ms             | 5 / 9 ms                 |
| Setup samples at least 4 ms | 1 of 30              | 2 of 30                  |
| Start-handling maximum      | 1 ms                 | 2 ms                     |
| Handler raw p95 / max       | 0 / 1 ms             | 0 / 0 ms                 |
| Finalization raw p95 / max  | 2 / 2 ms             | 1 / 1 ms                 |
| Clock samples               | 1 ms in all 30       | 1 ms in all 30           |
| Guarded result              | 3 ms, passed         | 5 + 2 × 1 = 7 ms, failed |

The heavy setup print positions 0 and 13 contain `[9, 0]` and `[5, 0]` in the
existing per-attempt `metrics.setup` arrays. The first slot is the
observer-body installation invocation; the second is start-message handling.
The two values that produce p95 = 5 ms are therefore both in the installation
slot for this report. The 9 ms and 5 ms samples are the only two values at or
above 5 ms in 30 attempts. The empty fixture had one 8 ms installation sample;
nearest-rank p95 ignores one outlier and remained 1 ms. This report already
contained the per-attempt setup arrays before the new labels; the labels clarify
attribution rather than fill missing raw data.

The 7 ms guarded value contains 2 ms of clock allowance and a 5 ms setup p95.
Handler stayed at 0–1 ms. Finalization p95 was 2 ms on empty and 1 ms on heavy,
with a 2 ms maximum on empty and 1 ms on heavy. The report does not identify why
two installation samples were slow; browser scheduling, compilation/GC, driver
activity or host contention remain candidates.

### #32 Firefox 140.0 local budget failure

The report is
`/Users/ranokay/.t3/worktrees/addonray/t3-7d2f3158/.scratch/private-fixture-readiness/firefox-evidence-140.0-iteration-failed-budget.json`
(SHA-256 `0c7207c3a9ead3d3a6417ea4b23ab118cb6538666cb7973f597b7b7e70cf743a`).
It was read read-only from the #32 worktree and was not modified. It is dirty
source `7a49eeecf741c1966d449b9fe1c514592278260e`, macOS 27.2 arm64, Firefox
140.0, and records 54 observed checks.

It fails at `/page-errors/empty` with a 13 ms guarded value. Setup raw p95 is
11 ms and max 14 ms; the existing per-attempt setup arrays contain `[11, 0]` and
`[14, 0]` at positions 0 and 21. Handler maximum is 1 ms, finalization maximum
is 1 ms, and every clock sample is 1 ms. The guarded result is 11 + 2 × 1 = 13
ms. The report retains the arrays but is not clean source evidence. The later
79-check pass at the same protocol does not explain this failure and is not used
as a cause.

### Passing retained matrix

At clean `a708fb5`, all six hosted Firefox jobs record 79 checks and both Chrome
jobs record 73. All 16 Firefox/Chrome overhead entries are present. Firefox setup
p95 is 0–1 ms; the largest guarded Firefox value is 5 ms (Linux ESR
`/page-errors/heavy` finalization p95 3 ms plus two 1 ms steps). Chrome records a
0.1 ms clock step; its largest setup guard is about 1.9 ms and its largest
finalization guard is about 1.0 ms. No budget assertion failed.

The passing matrix shows the gate is tight but can pass at its 5 ms limit. It
neither explains the 6 ms, 7 ms and 13 ms failures nor supplies a universal
bound.

## Measurement semantics

For each Firefox supervisor attempt the fixture records two setup intervals:

1. the outer observer-body installation invocation; and
2. the later start-message handling that arms the observers.

The gate's setup sample is their maximum, exactly as before. The handler sample
is one interval per observed event; the finalization sample is one per attempt.
The nearest-rank p95 is computed over 30 setup values, 60 handler values and 30
finalization values. The observed clock step is the maximum of the 30
per-attempt minima; the guard adds two of those steps. Firefox reports 1 ms
steps and Chrome about 0.1 ms in the retained and new runs.

The standard report now publishes `setupComponents.installationMs` and
`setupComponents.startHandlingMs` next to the unchanged `rawOperationSamplesMs`
and `setupSlotCounts`. The Firefox supervisor has two slots. The page-world copy
has one combined observer-body slot. The Chrome isolated supervisor has one
installation-only slot and never starts the observation. Missing or unexpected
slot counts fail the report visibly after the measurement is published.

`driverAndUserFlowSamplesMs` spans the driver/user Start, emit and Stop flow. It
is not part of the synchronous budget. Browser injection/IPC and driver latency
remain separate from the measured synchronous bodies. The study records phase
flow times but no injection-only interval; injection/IPC/driver work is included
in `flowMs` and is not used for the gate.

## Bounded controlled study

The diagnostic script is `scripts/page-error-budget-study.mjs`. It requires a
packaged Firefox XPI and accepts only Firefox `140.0` or `153.5.1esr`. Its
predeclared matrix is:

| Factor      | Values                                                                 |
| ----------- | ---------------------------------------------------------------------- |
| Fixtures    | `/page-errors/empty`, `/page-errors/heavy`                             |
| Conditions  | `baseline`, one page-owned busy Web Worker                             |
| Repetitions | 3 per fixture/condition cell                                           |
| Samples     | 30 attempts per block, unchanged gate                                  |
| Order       | empty B,L / L,B / B,L; heavy L,B / B,L / L,B                           |
| Bound       | 12 blocks and 360 attempts per version; 720 per two-version invocation |
| Retries     | none                                                                   |

Each attempt is registered and persisted before execution, then performs a fresh
Start, one page-owned error/rejection pair, Stop and metric collection. Available
summary, raw metrics and phase timings are persisted before the post-Stop event
pair and assertion; a protocol failure therefore retains the current attempt's
index, stage, error and any available measurements. A budget-failed block stays
failed and later predeclared blocks still run; the command exits 1 when any
budget block failed. A protocol/instrumentation failure keeps its partial report
and stops with exit 2. A completed no-failure study exits 0 but remains
diagnostic evidence, not a qualification pass.

The load worker is created by a page-owned helper that posts `started` before
entering its loop. The run records that the start message was observed, then
calls `terminate()` and verifies the worker marker was cleared. This is one
controlled worker on an 11-core Apple M3 Pro host, not a reconstruction of the
hosted CI scheduler and not proof of the historical cause.

Clean study runs at `031ebff` used the unsigned XPI SHA-256
`82b754a02dbaa3e7b7700567ce82d873dc023a3ba91a8fcf27cfcaecc08ec08a`, the same
product artifact as the #32 clean matrix. The fixture records five production
input hashes, five transpiled output hashes and four observer-wrapper hashes; for
example the supervisor observer input is
`25ea16373f0fefd4402d4774ad14f1de5df4621378f640552b1fed3b3d72c67c` and the
measured supervisor wrapper is
`ba03e2e8e4edd30484048386b129b7931f8ba9e89575434b17e2629bcac30514`.
The reports contain the complete maps and the exact host/browser/driver
identity.

## Attempt accounting

The 720-attempt figure is a bound per two-version study invocation, not an
aggregate bound across source revisions. The retained study reports contain
1,470 recorded attempts:

| Revision  | Reports                  | Recorded attempts | Outcome                                                                      |
| --------- | ------------------------ | ----------------- | ---------------------------------------------------------------------------- |
| `981f6f1` | one 140.0 partial report | 30                | protocol-failed at the page-owned worker control; second block did not start |
| `23a39d7` | 140.0 and 153.5.1esr     | 720 (360 each)    | completed, 0 budget failures                                                 |
| `031ebff` | 140.0 and 153.5.1esr     | 720 (360 each)    | completed, 0 budget failures                                                 |
| Total     | five reports             | 1,470             | two completed full studies and one partial protocol run                      |

The `23a39d7` study preceded the Chrome probe reporting correction. After that
correction changed the implementation head to `031ebff`, both versions were run
again so the study evidence named the same source as the final probe. The second
full study is a source-revision repetition, not a retry of a budget-failed
sample, a failure-selection pass or a replacement for the earlier reports. It
had no budget failure to retry; the `23a39d7` reports remain retained. The
`981f6f1` run was a protocol/instrumentation failure, was fixed by the
page-owned worker control, and is not a budget result. No further full study was
run for this review. The later `c58744f` and `1d3593e` corrections change only
failed-attempt bookkeeping; they have no new study report or browser rerun, and
the 031ebff successful-path reports remain the measurement evidence.

## Study results

At `031ebff`, both exact versions completed 12 blocks and 360 attempts with zero
budget failures, exit 0. All owned tabs, workers, browsers and servers closed.
Each version started and terminated all six load workers.

| Version | Condition | Blocks | Setup p95 | Setup guard | Max installation | Max start | Handler p95 max | Finalization p95 max | Clock | Flow p50 / p95 |
| ------- | --------- | ------ | --------- | ----------- | ---------------- | --------- | --------------- | -------------------- | ----- | -------------- |
| 140.0   | baseline  | 6      | 0–1 ms    | 2–3 ms      | 4 ms             | 1 ms      | 0 ms            | 1 ms                 | 1 ms  | 924 / 948 ms   |
| 140.0   | load      | 6      | 0–1 ms    | 2–3 ms      | 3 ms             | 1 ms      | 0 ms            | 1 ms                 | 1 ms  | 864 / 876 ms   |
| 153.5.1 | baseline  | 6      | 0–1 ms    | 2–3 ms      | 3 ms             | 1 ms      | 0 ms            | 1 ms                 | 1 ms  | 278 / 294 ms   |
| 153.5.1 | load      | 6      | 0–1 ms    | 2–3 ms      | 4 ms             | 1 ms      | 0 ms            | 1 ms                 | 1 ms  | 262 / 305 ms   |

Across the 720 final-head attempts the handler maximum was 1 ms and the
finalization maximum was 1 ms. Start handling never exceeded 1 ms. Installation
was the only setup component above 2 ms: each version had 12 installation
samples at or above 2 ms, exactly one per block, with a maximum of 4 ms. Because
the nearest-rank p95 over 30 samples is the second-highest value, one
installation outlier per block leaves setup p95 at 0–1 ms. The three retained
failures with setup arrays (`8091ad1`, `ab8618a`, #32) each had two high
installation samples (`4, 5`, `9, 5` and `11, 14`), which is sufficient to move
p95 to 4, 5 or 11 ms.

The separate 50 ms clock probe observed a 1 ms minimum and 1 ms p95 in every
final block. It records the raw step arrays. A clock step of 1 ms accounts for
2 ms of each guarded value; it does not explain a setup p95 of 4, 5 or 11 ms.

The busy-worker condition produced no budget failure and no higher setup,
handler or finalization p95 than baseline in these runs. It did not reproduce
the historical two-outlier pattern. The historical failures therefore remain
unexplained as to the source of the second installation outlier; the data do
not support a product-code cause or a concurrent-load cause.

## Hosted qualification and test-only refactor

The approved head `11dee65` initially failed SonarCloud with 6.7% duplication,
D reliability and B security. The probe fixes at `dd6062e` addressed the
reliability/security findings, and the shared page-error driver operations at
`14d8bb9` reduced duplication. SonarCloud then passed at `14d8bb9`: 1.8%
duplication on new code, 0 security hotspots, Quality Gate passed. CodeRabbit
reviewed `14d8bb9` with no actionable comments and low merge/security risk.

Clean packaged local suites at `14d8bb9` pass 79 checks each on Firefox 140.0,
153.5.1esr and 158.0.1 and 73 on Chrome for Testing 156.0.8078.47. The reports
name clean source `14d8bb9`, close owned tabs, and retain the unchanged 5 ms
budget.

The PR hosted checks at `14d8bb9` passed through GitHub's merge commit
`8e23f32f113299b32a613852d0733a4e4d75c775` (parents `a708fb5` and `14d8bb9`).
Check, all six Firefox jobs and both Chrome jobs passed. Each Firefox report has
79 checks and each Chrome report 73; all eight reports name clean source
`8e23f32`, the exact requested browser/driver versions, both page-error overhead
entries, `ownedTabsClosed: true`, and source rebuilds that reproduced all 19
packaged files. The largest guarded collector value in the hosted matrix is 4 ms
(Windows Firefox). Linux Firefox reports use XPI SHA-256
`82b754a02dbaa3e7b7700567ce82d873dc023a3ba91a8fcf27cfcaecc08ec08a`; Windows
Firefox uses `af2a6a807f7c59e4bb41ad664f341fffdb19d6ae4e9ea3e92e567371335a80b2`;
Chrome uses `09015daf4fae56b7d3539e537cd0bd447143722cb16d0852225fdf8313e1e22b`
on Linux and `96ebe0d7c9182ef6543e347e0d27897ed680834566ededfb7e08a05671a40e94`
on Windows. The per-OS differences are the recorded checkout line-ending
conversion, not different reviewed sources.

The two-version diagnostic study was not rerun after the test-only shared
operations change. The `031ebff` study reports remain the measurement evidence;
the `14d8bb9` packaged suites exercise the shared driver operations separately.
No product collector, permission, browser target, duration/count/size limit or
5 ms gate changed. The final documentation head requires its own hosted rerun
before merge; this record does not claim that later run.

| Additional report                 | Head      | Status    | SHA-256                                                            |
| --------------------------------- | --------- | --------- | ------------------------------------------------------------------ |
| local Firefox 140.0 suite         | `14d8bb9` | 79 checks | `74ffc4a36caa6833af0b888c8eb4681db4145cd005920c5c6d80f72f3b031a27` |
| local Firefox 153.5.1esr suite    | `14d8bb9` | 79 checks | `01761dae37832fcccadbbf29ad9f0b009345964630a9dca5e72e8261f89006a7` |
| local Firefox 158.0.1 suite       | `14d8bb9` | 79 checks | `da1a50f19ddc0369ee4ad188c8f8f84b00c72113d9160996b4b11f09dd0163b7` |
| local Chrome suite                | `14d8bb9` | 73 checks | `d98415dd112d1009b9582829b46720844015d03f26059c5446a1c86812eb9934` |
| hosted Linux Firefox 140.0        | `8e23f32` | 79 checks | `163c6b1b3d91c74854a97ce55f85c663ce4f5b739b6626b8c3812b2d6ef5028c` |
| hosted Linux Firefox 153.5.1esr   | `8e23f32` | 79 checks | `930a3602c326bcb25fb9ec41510620d0b41d5f887b0837629ae11a3d3a65d812` |
| hosted Linux Firefox 158.0.1      | `8e23f32` | 79 checks | `eb35be003b08e7028f68e30dbb55954d4ffd024b14ad0e9af046e4921e1fd3a0` |
| hosted Windows Firefox 140.0      | `8e23f32` | 79 checks | `b17879ad66315045b07b1e1a6e6f17963c6d3840db2176210f8fb7c3e5823fca` |
| hosted Windows Firefox 153.5.1esr | `8e23f32` | 79 checks | `08a2edc446accc620846fd03e9f806f14b16338f1c9a0ebb11e6cbff7f841792` |
| hosted Windows Firefox 158.0.1    | `8e23f32` | 79 checks | `d3877ae111e9381dd99fa87eb4ec30c0b5c30600910f356e3253050008b3003d` |
| hosted Linux Chrome               | `8e23f32` | 73 checks | `bba003b5de0db42ffacbd0a0039dffe25483362f4b0b2ef58e71ce647c8ad99d` |
| hosted Windows Chrome             | `8e23f32` | 73 checks | `10247210e9d10f02db896af7d127720e3633c2186d7d20ef7d6d61f10197f5a6` |

## Reporting correction

The initial Chrome run at implementation `23a39d7` failed at the new
diagnostic assertion because the Chrome isolated supervisor has one
installation-only setup slot, not two. The failed report is retained at
`.scratch/collector-budget/suites/chrome-156.0.8078.47-23a39d7/chrome-evidence.json`
(SHA-256 `6871f32ba887dcd1cb9714b42a546d84672c908521885acf8bb4492ac3f5f92d`,
48 checks). It is a probe/reporting failure, not a collector budget failure. The
correction accepts the installation-only supervisor, labels its start handling
as absent, and keeps the gate unchanged. The clean `031ebff` Chrome run passes
73 checks. This was found by running the changed probe, not inferred from a
later pass.

The study failure-path corrections at `c58744f` and `1d3593e` register each
attempt before execution, persist available summary, metrics and phase timings
before the post-Stop assertion, and finalize the start-to-end total after the
post-Stop stage. A protocol failure now leaves the current attempt marked failed
with its index, stage, error and all available data instead of retaining only
previous attempts. The pre-assertion snapshot leaves `flowMs.total` unset; the
outer finally updates it through the last executed stage, so completed attempts
include postStop and failures retain a finalized total. `tests/budget-study-attempts.test.ts`
supplies metrics, performs a post-Stop throw and verifies that the failed
attempt and its finalized total survive JSON persistence. Successful
measurement bodies, gate inputs and the 031ebff study reports are unchanged; no
full study was rerun for these corrections.

## Release disposition

- The unchanged 5 ms/30-sample/clock-guard gate remains in force. No quantile,
  threshold, scenario, sample count or summary limit was lowered.
- `028c29c` remains failed and unresolved because its raw operation, world and
  clock evidence is missing. The `8091ad1`, `ab8618a` and #32 failures remain
  failed.
- The evidence points to observer-installation outliers as the operation that
  drove the three retained p95 failures with setup arrays (`8091ad1` 6 ms,
  `ab8618a` 7 ms and #32 13 ms), not handler or finalization work. This is an
  attribution from the retained per-attempt metrics, not a proven root cause.
  The `028c29c` 6 ms operation remains unknown.
- A candidate head still needs the unchanged gate to pass in every required
  job. A later passing run does not erase an earlier failed assertion. Any
  future budget failure should retain its raw components and be dispositioned;
  changing the gate needs a separate approved contract.
- This investigation does not qualify future collectors, a universal latency
  bound, a new OS support floor or any other release gate. Hosted Linux/Windows
  and PR qualification remain pending.

## Retained reports

All raw reports are ignored local `.scratch` data. These hashes bind the copies
used for this record.

| Report                                                                     | Head      | Status                                                   | SHA-256                                                            |
| -------------------------------------------------------------------------- | --------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| `p3a-local-8091ad1-retry/firefox-evidence-158.0.1-first-retry-failed.json` | `8091ad1` | 54 checks, failed 6 ms                                   | `c8d9eb38b00f2319cac4bfe5b8743e507d3c38a3d46343a643b9de8443150405` |
| `p3a-audit/local-158-first-retry-failure-audit.json`                       | `8091ad1` | audit confirms failed 6 ms with unchanged source         | `78a8c900cadaf134b8898cb2fff7d1c5500b89ed0e693d9a9f54107ce7227c04` |
| `p3a-local-8091ad1-retry/firefox-evidence-158.0.1-controlled-repeat.json`  | `8091ad1` | 79 checks, later controlled repeat; not a cause          | `c0bdbdee920cc88b33c41c932fa1b6c92a438cce9172aa6fffb9085d46683065` |
| `study-firefox-140.0-2026-10-29T12-29-53-823Z-21947.json`                  | `981f6f1` | protocol-failed at worker control, 2 blocks, 30 attempts | `777f11be0c4f4e1d411a9bdfc06fdfe19f79baad5d353d1915d43cb11d8e7aa9` |
| `study-firefox-140.0-2026-10-29T12-33-46-319Z-47990.json`                  | `23a39d7` | completed, 12 blocks, superseded by `031ebff`            | `6fc1ca089a62e00cba8932e154f4d93372fba8741c71c5b8280dc27e30bebeac` |
| `study-firefox-140.0-2026-10-29T13-01-12-912Z-29777.json`                  | `031ebff` | completed, 12 blocks, 0 budget failures                  | `243a17d566abd7ff217e50b6bc409e49446e3386e58707d306ada656de7cccf0` |
| `study-firefox-153.5.1esr-2026-10-29T12-40-44-327Z-90776.json`             | `23a39d7` | completed, 12 blocks, superseded by `031ebff`            | `7b272c8a82650e03b5cfa8365a90fef58e9d96eb774dee10e7624eb733f3e0b0` |
| `study-firefox-153.5.1esr-2026-10-29T13-08-10-823Z-73857.json`             | `031ebff` | completed, 12 blocks, 0 budget failures                  | `de698bc28a93867665ddc3d377b0758d689e6e72c733b9fac0ea3adb5b34c9a2` |
| `suites/firefox-140.0-031ebff/firefox-evidence-140.0-xpi.json`             | `031ebff` | 79 checks, passed-with-qualification-gaps                | `3f21542e9197d9676c526263fb2af6f6a06856aadfa5b9fe076f5d46d527b0ab` |
| `suites/firefox-153.5.1esr-031ebff/firefox-evidence-153.5.1esr-xpi.json`   | `031ebff` | 79 checks, passed-with-qualification-gaps                | `b96d5f3e7d89eb0e126e14fdcd9bdbcfe394c4e77ee4d362b9c739afb8037497` |
| `suites/firefox-158.0.1-031ebff/firefox-evidence-158.0.1-xpi.json`         | `031ebff` | 79 checks, passed-with-qualification-gaps                | `ba58b1af29f88eaa7c9dc1097a03378a869700436638345862fad7b0a8e2f13e` |
| `suites/chrome-156.0.8078.47-031ebff/chrome-evidence.json`                 | `031ebff` | 73 checks, passed-with-qualification-gaps                | `24e98cd89a833528623b5e444f6edbe18aae647fdf8a9479acca196537dca51b` |
| `suites/chrome-156.0.8078.47-23a39d7/chrome-evidence.json`                 | `23a39d7` | failed at the new reporting assertion, 48 checks         | `6871f32ba887dcd1cb9714b42a546d84672c908521885acf8bb4492ac3f5f92d` |

The earlier Firefox `23a39d7` suite copies are also retained under
`suites/firefox-*-23a39d7/`; they are superseded by the `031ebff` copies but were
not overwritten. The study command logs are next to the JSON reports.
