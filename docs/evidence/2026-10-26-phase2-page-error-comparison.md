# Optional page-error comparison qualification

The approved [P2D slice](../plans/phase2-page-error-comparison.md) is implemented
and privately pushed in signed `a5b8fedd0c5dde409d365f925d2c992d9abfe087`,
including the standalone permission-retention correction qualified below.

Initial implementation `3346b35047e5f88c8c691e7697a09f9c23022e99` and native
helper follow-up `f1b781dd26d1b6f2b61ed8b6e5b20e8aed57ce57` have identical
product and comparison-source-fixture inputs. Their original qualification remains recorded separately
from the corrected revision.

A completed check can attach once to an explicitly selected investigation and
side. Fixed error slots share their numeric source-tab binding with timings.
Investigations own canonical copies after donor reset/closure. Counts, duration
and completion reason appear side by side, without error arithmetic or a causal
verdict. Permissions, collectors, background/storage policy and browser targets
are unchanged.

## Prerequisite and review

The [candidate gate](2026-10-26-page-error-comparison-feasibility.md) passed on
Firefox 140.0, ESR 153.5.1, Firefox 158.0.1 and Chrome for Testing
156.0.8078.47 before product wiring. Its synthetic authority remains separate
from the production results below.

Independent production reviews covered the donor model, investigation, narrow
check-tab handoff, UI, styles and entry-point lifetimes. No material product
finding remained. Independent probe review found two assertion gaps: retaining
an existing timing needed an explicit assertion, and releasing a scheduling hold
did not prove receiver completion. The fixture now tracks receiver work through
`finally`, and late-work assertions wait for completion. Both fixes received
independent review and are present in the qualified reports.

The first dirty Firefox trial stopped after 33 checks because a timing regression
still expected obsolete "inventory-only" guidance. The assertion now matches
the corrected wording while retaining its inventory/state assertions. Earlier
dirty Firefox 73/Chrome 67 runs remain iteration evidence. Final qualification
uses committed clean source.

## Local checks and artifacts

At clean `f1b781d`, all 369 Bun behavior tests with 1561 assertions pass, as do
native formatting, linting, type checking of 47 files, both manifest/archive
checks and jactionlint. The shared gate receipt records exit 0 and frozen source.
Both source archives reproduce all 14 corresponding packaged files.

| macOS arm64 distribution | Actual version | Driver                     | Passing browser checks |
| ------------------------ | -------------- | -------------------------- | ---------------------- |
| Firefox                  | 140.0          | geckodriver 0.37.1         | 73                     |
| Firefox ESR              | 153.5.1        | geckodriver 0.37.1         | 73                     |
| Firefox                  | 158.0.1        | geckodriver 0.37.1         | 73                     |
| Chrome for Testing       | 156.0.8078.47  | ChromeDriver 156.0.8078.47 | 67                     |

These checks use disposable profiles. Browser/server and helper-owned tab cleanup
passed. Six local browser/rebuild reports pass the revision,
clean-source, identity, payload, budget and cleanup verifier.

| Initial artifact on macOS/Linux at `f1b781d` | SHA-256                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| Firefox XPI                                  | `3bdbc9aee10fdcd23158d967fcd83c069aeb0e5b14335ec6ad519466eb61d561` |
| Chrome ZIP                                   | `7210b76349093e1729c8395919d931c6833d2c5e93f2b6b5e52ba965aeeb96b3` |
| Each source ZIP                              | `31e40a15a0d81c55a373e6b47aea36a38c4166c11df8d72c1b2282581ff3258f` |

Source archives contain exactly 37 allowed files. Windows source inputs use
CRLF; their raw hashes were checked against the corresponding immutable source
with that exact line ending. Per-job source rebuilds match their packaged
artifacts. ZIP compression/timestamps are not the rebuild comparison.

## Browser-test authority

Both protocols retain existing product, timing and collector regressions. The
18 new comparison checks use a separately named source fixture with six hashed
production modules. Its own packaged Window endpoints execute the actual donor,
investigation and handoff code. Inventories, completed-summary driver results
and timing seeds are synthetic. Required management is an explicit automation
seam on both targets. Optional scripting is actually requested and removed.
This is not production consent or React interaction evidence.

The checks cover copied metadata, selected-only delivery, all three finish kinds,
one use/concurrency, fixed ordering, shared source binding in both orders,
independent copies, stale/reset/reload/close, real five-second timeout cancellation,
lost acknowledgment after commit, malformed/getter summaries, a closed original
source and actual scripting revocation. Delayed invocation/acknowledgment wrappers
schedule races around unchanged production functions. Private/unknown/failed
classifications are explicit simulations. Generated fixture output hashes and
production input hashes match the reports.

The existing collector retains its 1 KiB summary and 5 ms p95 synchronous
setup/handler/finalization gates. Raw samples, calibrated clock steps and the
empirical p95-plus-two-steps guard remain in the reports. The largest guarded
value in the verified initial local and hosted matrices is 4 ms. These controlled
observations do not establish universal timing accuracy or a new transfer budget.

## Native macOS observations

The actual unmodified Chrome toolbar opened an investigation and a source-bound
check. Inventory consent was approved through Chrome's native prompt. Opening the
check collected nothing. Explicit Start, page-owned reproduction and Stop yielded
1/1/2 counts over 15,339.4 ms. Destination and side began blank. Native keyboard
selection and confirmation attached Before and left its used summary readable.
Resetting and closing that donor kept the investigation copy.

After inventory capture, a new explicit check supplied a confirmed zero over
4,874.4 ms for After. The black comparison table showed both summaries, durations
and reasons, with Uncertain selected manually and no error difference/rate. Real
scripting removal cleared the populated comparison and confirmed check. A fresh
manual refill preceded independent management removal, which also cleared them.
The automatic post-native helper records two API assertions and cleanup, without
issuing a native usability verdict.

Firefox's first native session observed investigation launch and inventory consent,
but CUA could not reliably scroll/reach the toolbar's page-error launcher. It was
closed before changing the helper. A subsequent explicit `driver-launch` used
Firefox's actual toolbar action and unchanged product launcher to establish a
ready, source-bound check. This is driver setup, not native toolbar usability.

CUA then exercised Firefox's unmodified check-tab Start, controlled 1/1/2
reproduction, Stop at 15,280 ms, blank destination/side choices and native
selection/confirmation. The accepted summary stayed readable. Donor reset kept
the investigation copy; investigation Start over cleared it. A fresh fixed pair
of confirmed zero summaries at 5,171 ms and 4,999 ms was attached around separate
inventory captures. Uncertain stayed an explicit manual assessment. Actual
scripting removal cleared the pair/check. A new populated Before and confirmed
check preceded independent management removal, which also cleared them.

Chrome's native report is clean `3346b35`. Firefox's report records the same head
with only the native-helper fallback dirty. All 37 production input hashes and
both native artifacts independently match immutable `3346b35` and the
`f1b781d` product inputs. Both browsers and servers closed successfully. The Firefox
helper's older static gap said system access was "only" for URL lookup; its
command-specific gap and actual method also include toolbar setup. The final
helper wording corrects that discrepancy. Raw historical reports are preserved.

## Hosted results and interruption

At `3346b35`, [Check](https://github.com/ranokay/addonray/actions/runs/40282362435),
[Firefox qualification](https://github.com/ranokay/addonray/actions/runs/40282362018)
and [Chrome qualification](https://github.com/ranokay/addonray/actions/runs/40282362050)
passed. All six Firefox and two Chrome jobs were inspected. All 16 downloaded
browser/rebuild reports passed ZIP digest, source/revision, exact distribution,
artifact, fixture, size/budget and cleanup verification.

Five Firefox jobs report 73 checks. Windows ESR reports 71 because its private
fixture control route was unavailable. Exactly two older private-window timing
checks remain unqualified there. All 18 new comparison checks passed in every
browser job. Neither missing private case is counted as passing.

The `f1b781d` Check and Chrome workflows passed. Its first Windows/Firefox 140
attempt returned interrupted during the unchanged 30-second standalone collector
case, after 44 checks and before comparison tests. Its artifact, standalone
fixture, browser and driver match the earlier passing job exactly. The reason
is not specific enough to distinguish connection loss, document interruption or
late delivery. No product change or weaker assertion was made. The failed report
and log are retained, and that failed job was requested again at the same head.
The unchanged rerun passed. All six Firefox jobs now report 73 checks, including
the two legacy timing cases unavailable in the earlier matrix. All 16 follow-up
browser/rebuild reports passed the same independent verification.
[Follow-up Check](https://github.com/ranokay/addonray/actions/runs/40287847738),
[Firefox](https://github.com/ranokay/addonray/actions/runs/40287847603) and
[Chrome](https://github.com/ranokay/addonray/actions/runs/40287847690) are successful.
The interruption remains an observed failure with an unproven cause; rerunning
did not change the product or accept interruption as a successful measurement.
Later delivery-head reports still require their own verification.

## Standalone permission-retention correction

A final requirements read found that choosing attachment before inventory access
had ever been granted discarded the completed standalone check. Missing a transfer
grant is not itself a permission-removal event. The source now rejects that
attachment attempt while preserving its exact summary, generation and unused
capture. Its existing permission-removal listener still owns actual revocation;
the receiver's fail-closed reset is unchanged.

A focused regression preserves the original snapshot and permits explicit retry
after inventory consent. Independent review found no material issue. The native
helper now records/asserts initially absent optional grants and its own source
hash.

At clean `a5b8fed`, all 370 tests with 1568 assertions, native formatting/lint/types,
the frozen shared gate, three macOS Firefox versions with 73 checks each, Chrome
with 67 checks and both 14-file source rebuilds pass. All six local reports passed
revision/identity/budget/cleanup verification. The largest local guarded collector
p95 is 5 ms, within the existing 5 ms limit; the collector source is unchanged.

Both fresh native profiles started with only activeTab and no host origins.
In Chrome, a completed zero-count check at 5,674.8 ms remained readable after
Attach reported unavailable with no inventory grant. In Firefox, the corresponding
zero summary at 9,519 ms remained readable. Each user flow then created an
investigation, approved inventory consent and explicitly retried attachment from
the same completed check without another Start. Before was accepted and marked
used. Actual management removal subsequently cleared both owners in each browser.
Both browsers/servers closed; both reports have clean start/end `a5b8fed` and
helper SHA-256 `e49e70aa6eaaa5fe0471cc00edadb41609992d0b7da87c60f0f0fecf2429e531`.

The raw snapshots prove the same check label, finished zero counts after the
unavailable attempt, and its subsequent accepted Before copy. Unchanged displayed
duration and absence of another Start are CUA observations; the deterministic
regression verifies exact snapshot/generation retention. These focused native
cases qualify the changed absence/consent/retry path. They do not requalify the
earlier full After/closure native flows. The current production-source matrix
re-exercises both fixed slots, shared binding, dead views and revocation.

| Current artifact on macOS/Linux at `a5b8fed` | SHA-256                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| Firefox XPI                                  | `8681cae7a383026459f58a116be49f8bff3668d8ba47f46a8821e024cade861f` |
| Chrome ZIP                                   | `4e1b3df37943c01ef204ad70112d34f9e4c4ce87084cba230fb6cf95a8682f08` |
| Each source ZIP                              | `ead75e48a086217c8f96e7fe398796e87e681157265f30427bf6207e5716f4e9` |

[Corrected Check](https://github.com/ranokay/addonray/actions/runs/40291397418),
[Firefox](https://github.com/ranokay/addonray/actions/runs/40291397380) and
[Chrome](https://github.com/ranokay/addonray/actions/runs/40291397484) passed on
the first attempt. All six Firefox jobs report 73 checks, both Chrome jobs report
67, and all 16 downloaded browser/rebuild reports passed digest, immutable-source,
fixture-output, artifact, bounds and cleanup verification. No cases are omitted
from this matrix; authentic private error-attachment contexts remain a separate
gap. Independent review verified the correction, native records and hosted data.

## Documentation delivery duration failure

The documentation-only `82ea820` passed Check and both Chrome jobs. In its
[Firefox run](https://github.com/ranokay/addonray/actions/runs/40318895190),
five jobs passed, but Windows ESR stopped after 44 checks at the existing
standalone 30-second observation assertion. One unchanged rerun failed at the
same assertion. Both reports contain `interrupted`, not a count summary, and
record owned-tab cleanup. The new comparison cases had not run in that job.
These failures do not qualify that delivery head, despite the passing corrected
implementation matrix above.

The duration test repeatedly selects the check tab and leaves its source in the
background. This is a scheduling hypothesis, not an established cause. Fixture-only
diagnostics now record bounded visibility, timer and control-port chronology. A
separate foreground control runs only after a failure and cannot replace the
original strict assertion. Test-only MAIN injections install and read the
controlled page's scheduling sentinel without selecting its tab. This sentinel
cannot establish the isolated observer's timer behavior by itself. Product source, permissions, timing limits and success
criteria are unchanged. Keep the original failed reports and investigate the
recorded chronology before changing the qualification scenario. Diagnostic source
work can affect scheduling, so a passing traced run alone does not establish the
cause or qualify a scenario correction.

Diagnostic `028c29c` passed Check, both hosted Chrome jobs and five hosted Firefox
jobs, including Windows ESR. Clean local Firefox ESR and Chrome runs passed 73
and 67 checks. The remaining Linux Firefox 158 job failed after 48 checks at a
6 ms guarded overhead result against the unchanged 5 ms limit. Its hidden-source
duration trace returned a confirmed timeout summary after about 31 seconds, and
its page-side sentinel fired at 30,001 ms. This duration attempt passed; it does
not explain the earlier Windows interruptions.

The failed overhead assertion threw while constructing its report entry, leaving
the raw sample arrays absent. The 6 ms result alone cannot distinguish clock
resolution from operation cost. The reporting correction publishes raw operation
arrays, clock steps and observations before asserting the budget, and retains the
world and operation being checked if an assertion throws. Passing output fields,
sample counts, p95 calculation, clock guard and 5 ms limit are unchanged. No
collector performance regression or scheduling fix is claimed from these reports.

## Remaining limits and resumption

Native Linux/Windows usability, full accessibility, authentic private/unknown
attachment contexts, Firefox native toolbar scrolling/launch through CUA, and
Firefox native donor-close survival in this slice remain unqualified. Real
source-fixture donor closure passed; Chrome native closure was observed. Chrome's
page-side observer remains subject to interference. Production Firefox BFCache
restoration, retail installation, store publication and signing remain release
gates. The user approved the private build with release gates open.

Raw local reports, native records, failed trials, downloaded reports and verifier
summaries remain in ignored `.scratch/`. The [status checklist](../status.md)
identifies the current delivery gate. Every later pushed head needs its own hosted
verification before being described as passing. Export, history, new collectors,
new targets and the companion require separate decisions.
