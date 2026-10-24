# Current-document page-error qualification

The [approved slice](../plans/phase2-page-errors.md) is implemented in signed
`d56b56fe35f7aefda835f931bf12c0b2114f448a` and privately pushed to
`ranokay/addonray`. Its clean shared gate, source rebuilds, local browser matrix
and eight hosted browser jobs passed. All 16 downloaded hosted browser/rebuild
reports identify that exact clean head and passed independent identity, result,
budget and cleanup checks. This record qualifies that implementation head.
Later documentation commits require their own hosted verification before a
final delivery claim.

## Result and data boundary

The popup opens a fresh independent check tab bound to the original numeric
source-tab ID. Opening collects nothing. Start requests optional scripting and
observes only future top-frame uncaught JavaScript error and unhandled-rejection
notifications in the document present at installation. Stop retains confirmed
partial counts. The window ends after 30 seconds or 200 events total. Counts
appear only in the final summary, with a completion reason and elapsed duration.

Start over and Clear discard the attempt. Either existing optional-permission
revocation clears results and cancels pending work. Owner close/reload/unloading
loses its state; source navigation/closure interrupts without reattaching.
A reloaded unbound check cannot start. Existing popup inspections and
Before/After investigations remain independent.

The product adds no permission, host grant, background process, storage,
telemetry, export, automatic reload, extension-state change or new browser
target. It reads no raw error messages, error/rejection objects, stacks,
filenames, URLs, titles, page content or absolute timestamps. Normal-window
classification is required; unknown/private contexts fail closed. Chrome's
page-side observer and page interference limit are visible in its interface.
Firefox remains isolated. Neither result identifies a responsible extension.

## Source, artifacts and checks

| Target                   | macOS/Linux package SHA-256                                        | Windows package SHA-256                                            |
| ------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Firefox MV3 unsigned XPI | `31df609da641c881544bc2381d23ff59546e2f047ec41ef13714e115499e8317` | `b9aea57847a8d0c256eb4ade1b002117d595b0b5042dd9f50dfcfd96d95b814d` |
| Chrome MV3 ZIP           | `f21da7d5d92f896cea29daf07fedd6a320a034d8e9a66bb7da87ecce8d0a87d1` | `942e9903ac63d8ac360cdb096a6910f570fb63d5d68e3b328a38c589d33be886` |

Both macOS/Linux source archives have SHA-256
`e8526023c5ef36680b7e4f217ee8ceb82f27347292e9abdb3beea6035caafd49`.
Both Windows source archives have SHA-256
`028cc84a40377a943b8c12cff9afab44a41da7afd4d5e0d617042389e3ecb1a8`.
Each contains 34 allowlisted source files and rebuilds all 13 packaged files.
Hosted reports independently pair every browser package with its own OS/target
source rebuild. Cross-OS byte identity is not claimed. Five Windows fixture
input hashes match exact CRLF transformations of the committed modules. No
fixture or measurement module enters either package/source archive.

The checksum-pinned Bun reports `1.4.4-canary.1` at source revision
`963452075e9d7e2a47a482f297143af5ed4f76c0`. All 258 deterministic tests with
824 assertions, formatting, native lint/type checks, manifest/package checks
and strict jactionlint passed. The clean receipt is
`20261024T140341Z-a7750e708984`, with child exit 0 and frozen state true.
It records snapshots before and after the gate; this is not continuous
filesystem monitoring.

## Browser matrix

Each Firefox row covers 140.0, requested 153.5.1esr reported as 153.5.1,
and 158.0.1 with geckodriver 0.37.1. Chrome for Testing and ChromeDriver both
report 156.0.8078.47. Firefox reports 55 passing checks per run and Chrome 49,
including the prior inspection/comparison regressions. Native usability is a
separate evidence level.

| Host                    | Firefox runs | Chrome runs | Maximum empirical guarded p95, Firefox / Chrome |
| ----------------------- | ------------ | ----------- | ----------------------------------------------- |
| macOS arm64             | 3 local      | 1 local     | 3 ms / 0.60 ms                                  |
| Ubuntu 24.04 x64        | 3 hosted     | 1 hosted    | 3 ms / 0.80 ms                                  |
| Windows Server 2025 x64 | 3 hosted     | 1 hosted    | 4 ms / 1.30 ms                                  |

These maxima apply to the measured operations and controlled fixtures below,
not arbitrary websites or devices. Local actual duration checks took 30047,
30044, 30238 and 30311 ms respectively. Each returned observedMs 30000.
Scheduling and transport can delay cleanup or result delivery.

The implementation's [shared Check](https://github.com/ranokay/addonray/actions/runs/40100909848),
[six-job Firefox run](https://github.com/ranokay/addonray/actions/runs/40100909957)
and [two-job Chrome run](https://github.com/ranokay/addonray/actions/runs/40100909869)
all succeeded. Artifact ZIP digests were verified before extracting all 16 JSON
reports. Revision, clean status, distribution/driver, check counts, fixed
outcomes, operation samples/clock guards, summary bounds, paired package/rebuild
identities and owned-tab cleanup were checked from those reports. Browser/server
cleanup completed without a recorded failure. Reports are written after the
runner's cleanup; every page-error fixture also confirms its owned tabs closed.

## Fixture authority and measurements

`scripts/page-error-fixture.mjs` creates a named disposable source fixture from
exact production model, adapter, observer, bootstrap and browser-context modules.
It records source/output hashes and uses activeTab plus optional
management/scripting, with no host permissions. The actual toolbar action grants
the source. Minimal fixture popup/owner controls replace the React entry points.
Their success is not an unmodified UI or human consent verdict.

Page-owned button handlers generate real errors/rejections and independent
positive counts. A child frame generates its own pair. Console/resource
exclusions wait for both the action and actual image failure. Rejection sentinel
getters stay unread. The observer preserves only future top-frame notifications,
a confirmed zero, Stop counts, actual 200-event and 30-second outcomes. Clear,
observed revocations, source navigation/closure and owner reload cannot restore
erased results. Navigation/closure assertions require interrupted or
source-unavailable with no retained summary, rather than accepting any failure.

Chrome headless cannot approve management through this fixture route. Its
scripting revocation is exercised there; actual management revocation is checked
separately in the unmodified native session. Firefox exercises both optional
revocations through its real API. Grant requests remain deliberate. Firefox may
grant scripting without a visible warning; a probe must accept that actual grant
rather than wait for an absent prompt.

Separate measurement copies wrap the actual serialized production bodies.
Original/instrumented hashes and numeric samples are recorded. Wrappers measure
synchronous setup, event handling and finalization; sample publication occurs
outside the timed body. Each empty and 10,000-node fixture supplies 30 attempts.
Worlds have separate distributions. Setup uses the maximum individual setup
operation per attempt, so a fast install cannot conceal a slow Start operation.
Selected-world raw metrics and the isolated supervisor's per-attempt maxima are
retained. The latter does not retain every individual nested setup value.

The nearest-rank p95 plus twice the largest calibrated minimum positive clock
step must be at most 5 ms for each operation distribution. All raw guarded
calculations were recomputed. This is an empirical clock guard, not a guaranteed
clock-error bound. Individual hosted setup outliers reached 13 ms; the approved
budget concerns p95. All tested summaries fit 1 KiB. Driver/IPC and full workflow
durations are separate and do not qualify the CPU budget.

Measurement runs verify physical callback counts remain fixed after Stop,
Clear, scripting revocation, Firefox management revocation, owner reload and
owner close. They wait for observed finalization before generating another
page-owned pair. These measurements add disclosed instrumentation; the ordinary
lifecycle runs use untouched production observation functions. Physical cleanup
is not inferred merely from erased model state or successful zero counts.

Chrome obtained genuine measured BFCache restoration without resumed callbacks.
The production-source Firefox runs restored fresh documents, so they do not
qualify genuine production restoration. The separate focused candidate runs
obtained genuine restoration on all three Firefox versions before product
wiring. Their authority, source hash and full-sequence limitation remain in the
[API/lifecycle research](2026-10-24-page-error-api-research.md). The reason the
full Firefox sequences were not cached is unknown.

## Unmodified native observations

CUA exercised the actual packaged toolbar interface on macOS Firefox 158.0.1
and Chrome for Testing 156.0.8078.47. The initial sessions ran against dirty
`93f938e` while implementation was in progress. A Chrome follow-up ran at `d56b56f` with documentation-only changes in
the worktree. All 27 production input hashes and the native package hashes match
the clean macOS implementation artifacts. These are artifact-matched native
observations, not native execution with an entirely clean Git worktree.

Firefox opened a fresh ready check through its real popup, started explicitly,
then observed a page-owned pair on the source. Stop showed 1 JavaScript error,
1 rejection and 2 total, with observedMs 10576. Start over erased the summary
and enabled Start; a later attempt observed again. Clear was invoked before
reload, and reload showed a new unbound check with disabled Start/Stop and no
counts. Clear's intermediate ready state was not separately observed natively.
Keyboard Tab reached Clear and scope guidance; Return expanded it. The black
and mint layout was visually inspected.

Chrome's actual inventory warning was approved, including its broad management
wording. Reopening the popup started empty. New page-error check opened ready
without counts, and the page-interference disclosure was visible. Explicit
Start, source reproduction and Stop showed 1/1/2 with observedMs 10432.7.
Keyboard Tab reached Start over and the scope disclosure; Return expanded it.
In the follow-up, Stop confirmed another 1/1/2 at observedMs 11278.6. Start over
removed the summary and enabled Start with Ready status. A fresh Start observed
again; Clear returned it to Ready with no counts and disabled Stop. Reload
created an unbound check with a new label, no counts and disabled Start/Stop.
Closing it and launching again through the original source popup produced a
fresh ready check. Start/reproduction/Stop confirmed 1/1/2 at observedMs 11601.9.

The focused native helper ran three separate API assertions against the
unmodified product in both Chrome sessions. It confirmed retained 1/1/2 counts
and both optional grants,
removed management and observed erased counts/ready state, ran another explicit
check with a fresh page-owned pair, then removed scripting and observed erasure.
Both browser/server cleanup flags are true. Those assertions qualify real
revocation of finished results, not native usability or instrumented physical
cleanup. Independent review strengthened its positive-control wait to compare
each new pair with counters captured before that click. The follow-up successfully
exercised that correction after two historical page pairs. No product code
changed. Native reports and CUA observations remain separate.

## Review, corrections and remaining gaps

Independent production, probe and native-helper reviews have no unresolved
material finding. Review was read-only and supplies no execution verdict.
Production corrections reject owner replacement during either launch await and
buffer canonical Chrome completion until isolated readiness arrives. Focused
regressions prove cancellation cannot restore either erased state.

Probe corrections wait for initialized popup code and launcher-owned activation
before switching the driver, distinguish actual grants from visible prompts,
wait for real resource failures, separate world/setup budgets, measure physical
cleanup and require specific interruption outcomes. Initial launch, prompt and
Chrome management-approval failures remain in ignored scratch reports. Their
results are not passing qualification.

Native Linux/Windows usability, complete accessibility auditing, new private or
unclassifiable native-context guards, retail installation, store/signing checks,
hostile-page behavior, crash/discard and transport loss remain unqualified.
Chrome's page-visible control tokens are not authentication secrets. Firefox's
production BFCache gap remains explicit. Zero notifications never proves the
page is error-free. No later collector or comparison integration is approved
by this delivery.

Raw local reports, native observations, artifact manifests, digest checks and
verification summaries remain in ignored `.scratch/`. The durable runner paths
and native protocol are in [testing](../testing.md). Resume through
[status](../status.md) and verify the current pushed head's own hosted reports.
