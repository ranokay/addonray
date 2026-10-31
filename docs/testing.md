# Testing and API evidence

## Evidence levels

| Evidence                       | What it proves                                                    | What it does not prove                      |
| ------------------------------ | ----------------------------------------------------------------- | ------------------------------------------- |
| Documentation/source research  | A documented contract or source behavior at the cited revision    | Installed browser behavior                  |
| Bun tests with browser fakes   | AddonRay's handling of success, denial, partial data, and failure | Browser permission prompts or API authority |
| Type checking and build        | Type consistency and an extension artifact                        | Runtime support                             |
| Manifest/package checks        | Permission budget, MV3 target, local packaging constraints        | Usability or actual consent                 |
| Disposable-profile Firefox run | Observed cases on the named browser/OS                            | Other distributions, releases, or OSs       |

Keep these levels separate in reports. Record the tested commit after the initial repository exists. Never describe pending or skipped probes as passing.

## Automated behavior tests

- No inventory access before an explicit action and successful permission request.
- Denial, missing API, API rejection, and empty inventory remain distinct outcomes.
- Disabled extension metadata preserves absent permissions as unknown.
- Themes are excluded from the extension inventory.
- `mayDisable` never becomes an AddonRay toggle capability.
- Page access uses the selected top frame and validates the response.
- Missing tab IDs, protected pages, closed tabs, unavailable scripting, malformed payloads, and missing performance APIs yield bounded results.
- Permission revocation and clear invalidate in-flight work.
- Inventory search matches names, IDs, API tokens, and host patterns literally, combines with enabled-state filtering, and preserves ordering.
- Rendered inventory distinguishes empty and unavailable metadata, retains unknown identifiers, and escapes supplied strings.
- Production Firefox checks exercise search, filter combinations, refresh/reset, permission explanations, and disabled metadata in the dark interface.
- Build output uses MV3, only the intended required/optional permissions, no broad hosts, no persistent data collection, and no remote script sources.

## Real Firefox protocol

Use a temporary profile, never the user's normal profile. Install controlled ordinary fixture extensions with known IDs. Keep test-only mutation attempts outside the product bundle.

1. Record Firefox version, OS, build identity, fixture versions, timestamp, and automation method.
2. Open AddonRay and verify it starts with empty results.
3. Exercise optional permission denial and approval. Record whether the browser prompt was exercised or grants were supplied by test automation.
   Check actual popup lifetime while the prompt opens. If Firefox closes it, reopening must start empty and permit a fresh explicit action with the retained grant.
4. Confirm enabled/disabled fixture inventory behavior and missing metadata.
5. On a local HTTP fixture, exercise the explicit page probe and inspect the minimal result.
6. Try protected contexts such as `about:addons` and a restricted Mozilla page. Record actual rejection without broadening permissions.
7. In the test fixture only, attempt `setEnabled` against a disposable ordinary extension and verify expected refusal plus unchanged state. If it unexpectedly succeeds, stop and investigate the environment.
8. Clear, revoke, and reopen. Confirm results do not return from late work or prior sessions.

Automation may establish API results while leaving real prompt usability untested. Mark that gap. Local macOS testing does not qualify Linux, Windows, or the minimum supported release.

The local driver installs retained directories or an unsigned XPI through Firefox's classic `path` endpoint and keeps them available until browser teardown. This avoids the older Base64 installer's premature archive deletion, documented in [Mozilla bug 2045054](https://bugzilla.mozilla.org/show_bug.cgi?id=2045054). The browser and driver must share the local filesystem. The default tasks test unpacked installation. Packaged tasks test temporary unsigned installation, not signed distribution or a remote Grid.

`mise run test-firefox-popup` opens a visible disposable profile with the production extension, one controlled fixture, and a local page. Use an interactive terminal, perform the protocol above through Firefox's actual toolbar popup, record the results, and press Enter to clean up. The launcher performs setup only. [Native-popup evidence](evidence/2026-10-22-qualification.md) records the observed releases and limits. Run browser sessions sequentially and do not rebuild `.output/` while a visible session uses its retained directory.

To select an exact browser for headless API probes, run `FIREFOX_VERSION=140.0 mise run test-firefox` or supply an exact ESR version such as `153.5.1esr`. The task asserts the actual browser version and writes a separate version-named evidence file. Browser labels such as `latest` or `esr` are rejected so a named qualification run cannot silently move to another release.

## Packaging checks

`mise run package` builds `.output/addonray-0.0.1-firefox.xpi` and the corresponding source ZIP. The extension archive must contain the same names and bytes as the validated production directory, including a root-level manifest. The source archive must contain exactly the reviewed build inputs and rebuild instructions. Archive checks verify CRCs and reject rewritten or unsafe file paths. Source allowlisting excludes fixtures, local evidence, environment files, and unrelated documentation.

`mise run test-source-build` extracts the validated sources into a new ignored `.scratch/source-build-*` directory, installs from the frozen lockfile, rebuilds, and compares every output file with the XPI. `.scratch/source-build-evidence.json` records the commit, dirty flag, Bun revision, platform, archive hashes, and compared filenames. This compares extension contents; it does not promise identical archive timestamps or compression.

Run `FIREFOX_VERSION=140.0 mise run test-firefox-package` to install the retained XPI and exercise the API cases plus the first-slice inventory interface checks. The report has an `-xpi.json` suffix and records the archive SHA-256, installation mode, and actual geckodriver version. `mise run test-firefox-popup-package` opens the XPI for the separate native-popup protocol. Do not repackage while a visible session is using that file.

The Linux/Windows qualification workflow runs source rebuilds and packaged API probes across all three exact browser versions. Inspect each job's report, source revision, installation mode, and actual browser/driver version. A green development gate does not replace this matrix. Passing headless jobs does not establish native-popup focus/lifetime behavior on those systems.

## Chrome protocol and qualification

`mise run test-chrome` validates the Chrome ZIP, extracts its unchanged contents into a Chrome-readable system temporary directory, and uses a disposable Chrome for Testing profile. The driver pins and asserts both browser and ChromeDriver 156.0.8078.47. `CHROME_VERSION` accepts only that exact pin. Selenium statistics are disabled and browser/driver binaries on PATH are ignored. Raw reports go to `.scratch/chrome-evidence.json`.

The 17 checks distinguish unmodified product startup, toolbar-triggered `activeTab`, the production minimal page probe and scripting revocation, from a separately named pre-granted UI fixture. That fixture runs the production UI assets with required inventory/scripting permissions solely to exercise filtering, explanations, refresh, Clear, and disabled metadata without a native prompt. A third controller has host access and mutation authority for isolation, protected-page, and controlled-fixture checks. Neither fixture is included in product/source archives. See the [test-authority ADR](adr/0002-test-authority-and-browser-qualification.md).

`mise run test-chrome-popup` opens the unmodified ZIP extraction visibly. Record real optional inventory denial/approval, keyboard operation, page inspection, Clear, close/reopen, and retained grants through the toolbar popup. Keep inventory permission granted before pressing Enter. The launcher then verifies empty popup reopening and action-triggered inventory with that grant, captures an independent investigation pair/assessment, and removes actual optional management to verify clearing in both documents. Its `.scratch/chrome-native-api-evidence.json` is an API report, not an automatic native UI verdict. Enter closes the owned browser and loopback server.

`mise run package-chrome` produces `.output/addonray-0.0.1-chrome.zip` and `.output/addonray-0.0.1-chrome-sources.zip`. The Firefox source archive is now `.output/addonray-0.0.1-firefox-sources.zip`. `mise run test-source-build-chrome` compares an extracted frozen source rebuild with every Chrome ZIP file and writes `.scratch/source-build-evidence-chrome.json`. The same permission, file-path, CRC, and source allowlist rules apply to both targets.

The Chrome workflow runs source rebuilds and these 17 checks on Ubuntu 24.04 x64 and Windows Server 2025 x64. Local macOS arm64 evidence is separate. Chrome for Testing evidence does not qualify retail Chrome installation, native Linux/Windows popup behavior, Chrome Web Store publication, or future Chrome releases.

## Manual comparison checks

The investigation route has its own controller and memory. Behavior tests cover exact identity changes, minimized snapshots, valid empty captures, consent/failure/retry, a fixed pair, explicit assessment, independent views, Start over, revocation, and cancelled work. Render tests cover labels, text escaping, narrow zero-change wording, disabled/empty/error states, and no automatic assessment.

The shared real-browser comparison protocol opens an investigation through the production popup, captures Before, switches to a controlled page and browser settings, changes only a disposable fixture through test authority, captures After, and checks its state delta. It tests assessment, independent/fresh tabs, popup Clear, Start over, close/reopen, and reload. Firefox additionally exercises actual optional management revocation with populated snapshots. Chrome hosted inventory checks use the labelled pre-granted UI fixture, whose required management permission cannot be revoked. The original Chrome toolbar launch and empty new route are checked independently.

Observe native full-tab inventory denial/approval and keyboard/lifetime behavior separately through `mise run test-firefox-popup-package` and `mise run test-chrome-popup`. These launch the normal disposable native session; use New investigation in its actual popup. Keep the Chrome inventory grant approved before pressing Enter. Chrome's post-consent helper then captures an unmodified investigation pair and assessment and removes actual optional management, verifying that both the investigation and the separate popup document clear. Its API report is separate from native UI observations. Firefox's native helper records exact source/package/browser/driver setup and cleanup in `.scratch/firefox-native-<version>.json` and issues no automatic UI verdict.

No browser fixture/controller authority enters the product or source archives. Record native observations with source identity, artifact, distribution, OS, exact versions, and remaining gaps. A past popup observation does not qualify the new investigation tab.

## Page-timing checks

The approved popup snapshot adds three loading milestones to the existing one-shot page result. Behavior tests cover fractional and zero values, absent entries/APIs, invalid numeric/protocol values, canonical copying, size bounds, consent/target binding, duplicate actions, later captures, late responses, clearing/revocation/close, and rendered meanings/limitations. Event-end zero is unrecorded; reported zero paint is measured. That original slice transfers no timing; the separately approved attachment tests below cover the new integration.

`scripts/timing-checks.mjs` embeds the actual collector's source function in a static module inside a disposable host-granted test controller. It never enters the product/source ZIPs. Both browser protocols run it in the default isolated world on completed, resource-heavy, held-resource, empty and protected fixtures. The heavy fixture serves and counts 200 controlled resource requests. The held-resource case verifies that a request is actually pending, observes unrecorded load, then confirms a measured load after release. Raw-response key/sentinel checks establish that the collector returns only approved values before the adapter receives them. Missing navigation entries remain covered by deterministic tests rather than a fabricated real-browser case.

Each completed/heavy fixture records the true first attempt separately from its first completed snapshot, then 30 sequential synchronous collector durations. An isolated test wrapper brackets the full collector with `performance.now()`. The report retains raw samples, nearest-rank p95, an observed minimum clock step, and a p95-plus-two-steps empirical guard. Both the guard and the 1 KiB timing-block size must pass. A missing/inadequate clock fails qualification. The guard does not establish a guaranteed clock-error bound. Browser injection and driver/IPC durations are separate samples and do not satisfy the collector execution budget. These are controlled-environment observations, not universal latency or website-speed promises.

The qualified popup timing baseline records 27 Firefox checks and 24 Chrome checks. Chrome additionally asserts all three timing rows in the actual unmodified toolbar popup. Firefox's native popup is qualified separately on available macOS targets; its headless timing controller cannot establish packaged UI/consent behavior. Record exact source, artifact, browser/driver, CPU/OS, samples, clock method and remaining gaps in dated evidence. Native checks inspect actual page access, milestone labels, keyboard explanations, Clear, close/reopen and protected errors with the unmodified product. Keep inventory consent approved for Chrome's existing post-native comparison/revocation checks.

## Optional timing attachment checks

The [approved comparison plan](plans/phase2-timing-comparison.md) adds sequence/source binding, fixed slots, signed/missing comparisons, one-use capture, metadata-only discovery, explicit destination/side selection, destination-owned copies, stale/reset/closed views, permissions during transfer, and independent lifetimes. Deterministic tests cover normal/private/unclassifiable boundaries and classification exceptions. A foreign-array regression checks that discovery arrays belong to the popup realm; real Firefox lifetime checks remain separate.

Durable browser qualification must identify whether it exercises unmodified packaged UI, a named pre-granted UI copy, or a source-level handoff fixture. A driver reading popup DOM or obtaining an activeTab grant does not establish that the actual capture/select/confirm flow worked. Record failed automation routes as such; never add a product test hook or broaden permissions to make a probe pass. Preserve native capture/select/confirm evidence on available macOS Firefox/Chrome, and keep native Linux/Windows gaps open.

Verify private/incognito exclusion using disposable browser context fixtures where possible. Those checks qualify rejection, not private-window support. An authentic unclassifiable context may remain unavailable; deterministic exception cases do not replace a real-browser observation. The existing collector size/overhead method and clock limits remain unchanged.

The new normal integration records 40 Firefox checks when the private source fixture is available and 34 Chrome checks. Firefox's named source-popup fixture compiles the production inspector/session/handoff/browser-context modules and retains the packaged investigation assets. It keeps the product's optional permission budget, obtains separate optional approval, and substitutes `contains` only for the fixture source session's request. Input/output hashes identify those compiled modules. It does not exercise the actual React popup consent/interaction. The unmodified native Firefox flow remains a separate gate.

Firefox scripting-revocation checks begin with an attached Before timing and pending After selection. After removal they assert both inventories absent, every Before/After timing cell exactly unattached, every difference missing, and the popup selection removed. Matching a placeholder somewhere in the row is insufficient. Private Firefox checks identify source-fixture exclusion and fresh receiver context/non-popup rejection separately; the latter does not independently prove receiver-private rejection with a valid normal sender. The private fixture waits for the new window's own startup document to commit and finish loading, then requires the exact control route, fixture runtime ID and private tab classification before its assertions. The receiver route gets the same exact check. A source-route gap leaves both private checks unexecuted. A receiver-only gap after the source check retains that passed check and fails the run. This remains fixture authority and does not qualify native private-window behavior.

Chrome's pre-granted UI fixture runs the actual production popup assets, including explicit discovery/selection/confirmation and stale-destination handling. Native optional-management consent and populated optional-scripting revocation remain outside that required-permission fixture. Its headless private-context route is unqualified and does not add a passing check. Observe actual private-source exclusion in the unmodified native session; keep headless/platform gaps explicit.

For the unmodified Chrome native helper, retain both optional inventory and page-inspection grants before pressing Enter. Its 15 post-consent API checks exercise actual toolbar timing handoff, populated scripting revocation, and independent management revocation after refilling the original views. Helper-owned receiver checks tolerate other loaded investigation tabs without closing them or making them test destinations. The automatic private callback is omitted here; record actual incognito-source exclusion separately. The [dated timing-comparison evidence](evidence/2026-10-24-phase2-timing-comparison.md) records native observations and remaining gates. Do not rebuild or edit tracked source during a retained native session.

## Repeatable developer checks

`mise run check` runs the shared hk gate with native Bun formatting, linting, type checking and behavior tests, followed by both Firefox/Chrome packaging, manifest/archive validation, and jactionlint workflow checks. `mise run test-firefox` rebuilds and runs the real-browser probes. See [toolchain setup](toolchain.md) for the pinned canary and lockfile. Browser downloads stay in Selenium's cache, while raw local evidence stays in ignored `.scratch/`.

CI runs the deterministic gate and separate Linux/Windows Firefox and Chrome matrices. Browser probes must fail visibly or report an explicit skip when no browser is available. They must not silently pass on mocks.

The browser task reports `passed-with-qualification-gaps` when its observed checks pass but broader qualification remains. That is not a completed Phase 0 release gate. See [the dated evidence](evidence/2026-10-22-firefox.md) and [status](status.md) before deciding readiness.

## Current-document page-error checks

The [approved collector](plans/phase2-page-errors.md) has independent model,
launch, observer, adapter and rendered-view tests. They distinguish a confirmed
zero from interruption, require normal source/owner contexts, enforce a fixed
summary schema, and cover cancellation, retained grants, late results, payload
getters, deadline/cap behavior, duplicate actions and reset generations. Launch
regressions replace the owner document during verification and immediately after
binding. Neither replacement may receive the old launch or be activated.

Both browser protocols include a separately named source fixture. Its report
must identify copied package assets, any replaced entry points, source/output
hashes, permissions, driver authority and consent seams. Keep fixture execution
separate from unmodified product and native UI evidence. No fixture endpoint,
measurement wrapper or extra permission may enter either product archive.

Qualify the real 30-second and 200-event limits, top-frame event scope, confirmed
Stop, discard, source navigation/closure, owner teardown and optional-permission
revocation. Page-owned positive controls must establish that generated events
actually occurred. An unread sentinel getter checks raw-payload minimization.
Listener cleanup requires evidence beyond an empty owner result. Keep the
candidate BFCache evidence separate from production behavior.

Measure synchronous setup, event handlers and finalization separately. Record
numeric raw samples, a calibrated minimum positive clock step and the empirical
p95-plus-two-steps guard against the approved 5 ms budget. Identify any source
instrumentation and preserve unmodified lifecycle runs separately. Neither the
30-second duration nor browser injection/IPC time qualifies synchronous overhead.
Enforce the 1 KiB summary bound, without interpreting counts as page quality or
extension attribution.

Publish raw samples and clock steps before evaluating an overhead assertion.
If it fails, preserve the fixture path, execution world and operation, and keep
the run failed. A successful later run does not establish the earlier cause.

For native macOS checks, the existing popup helpers open a controlled source
with page-owned error/rejection buttons. Use the actual unmodified toolbar popup
to open a check, confirm opening collects nothing, Start and approve scripting,
return to the source and reproduce events, then Stop and inspect the summary.
Exercise keyboard controls, Start over, Clear, reload/close and permission
revocation. Record exact source/package/browser/OS and cleanup. Retain separate
native Linux/Windows, accessibility, retail installation and signing gates.

For the focused Chrome page-error native session, first build with
`mise run package-chrome`, then run
`mise exec -- bun scripts/page-error-chrome-native.mjs`. Approve inventory
through the actual popup and leave one confirmed 1/1/2 check open with both
optional grants retained. After observations, Enter runs three separate API
assertions against the unmodified product, including actual management and
scripting revocation, then closes its disposable browser/server. Its JSON report
and any CUA observations are separate evidence. It contains no physical callback
instrumentation and does not declare a usability verdict.

## Optional page-error attachment checks

The [P2D plan](plans/phase2-page-error-comparison.md) adds a separate own-check
sender and fixed error slots. Model tests cover all completion kinds, exact
summary validation without payload getters, canonical copying, shared timing/error
source binding in both orders, ordering, one-use reservation, reset/revocation,
late work and lost acknowledgments. Handoff tests use separate fake view APIs and
foreign-realm metadata. React server rendering tests cover visible states and
wording; they do not establish interactive selection or native usability.

Both browser protocols install a separately named comparison source fixture.
Its six transpiled production modules and generated outputs have recorded hashes.
Inventories, completed-summary driver results and timing acceptance are synthetic;
actual own-view endpoints perform the transfer. Required management is a disclosed
automation seam on both targets. Scripting is requested and removed using real
browser APIs. This does not qualify optional-management consent/removal, the
collector, the toolbar bootstrap or React interaction. Existing standalone and
popup timing protocols continue independently.

The comparison fixture checks normal contexts, copied metadata, selected-only
acceptance, all finish kinds, shared binding, fixed slots, concurrency, stale
reset/reload/close, five-second timeout cancellation, lost acknowledgment,
independent copies and actual scripting revocation. Scheduling wrappers delay
invocation or acknowledgment around unchanged production functions. Private,
unknown and failed classifications remain explicit simulations. Every owned tab
must close and the original control handle must be restored. A failed cleanup
fails the run.

Native macOS qualification uses the unmodified product's completed check,
blank destination/side selectors, explicit confirmation, retained donor summary,
donor close/reset, populated investigation and reset/revocation. Record available
Firefox and Chrome separately. No native/platform, private-context or consent
claim follows from the source fixture. Existing 1 KiB and synchronous 5 ms p95
collector regression budgets remain unchanged; transfer latency has no new
performance promise.

The focused native comparison helper is
`mise exec -- bun scripts/page-error-comparison-native.mjs firefox` or `chrome`.
Its `snapshot`, `revoke-scripting` and `revoke-management` commands read the
unmodified product and verify actual grant removal after a populated comparison.
A fresh populated snapshot and confirmed check are required before each removal.
`finish` checks source/package identity and closes the disposable browser/server.

Firefox additionally offers explicit `driver-launch` setup when native automation
cannot reach the toolbar launch control. It uses Firefox's actual toolbar action
and unchanged product launcher, then verifies a bound ready check without starting
observation. This setup does not qualify native toolbar scrolling or launch
usability. Start, reproduction and attachment interactions must be recorded
separately. No product hook or permission is added.

## Collector budget variability study

The agreed page-error gate is fixed in `scripts/synchronous-budget.ts`: at least
30 synchronous-operation samples, nearest-rank p95 plus two observed clock
steps at most 5 ms. `scripts/page-error-checks.mjs` and the diagnostic study
both call that implementation. The focused tests in
`tests/synchronous-budget.test.ts` use independent literals for the retained
5, 6, 7 and 13 ms outcomes, the exact boundary, the 60-sample nearest-rank rule
and invalid sample/clock inputs. There is no configurable quantile or threshold.

The standard page-error report publishes `setupComponents.installationMs` and
`setupComponents.startHandlingMs` next to the unchanged `rawOperationSamplesMs`
and `setupSlotCounts`. The gate still uses the maximum of the two Firefox setup
slots. The page-world copy has one combined observer-body slot. The Chrome
isolated supervisor has one installation-only slot and never starts an
observation. Missing or unexpected slots fail the report visibly after the
measurement is published. These labels clarify attribution from the existing per-attempt
`metrics.setup` arrays; they do not change the wrappers, sample counts, p95,
clock guard or 5 ms limit.

`scripts/page-error-budget-study.mjs` is a bounded diagnostic, not a
qualification pass. It requires a packaged XPI (`mise run package`) and accepts
only Firefox `140.0` or `153.5.1esr`:

```sh
FIREFOX_VERSION=140.0 mise exec -- bun scripts/page-error-budget-study.mjs
FIREFOX_VERSION=153.5.1esr mise exec -- bun scripts/page-error-budget-study.mjs
```

Each command predeclares 12 blocks: `/page-errors/empty` and
`/page-errors/heavy` under `baseline` and one page-owned busy Web Worker, with
three counterbalanced repetitions and 30 attempts per block. That is 360
attempts per version and 720 per two-version invocation, with no retries of
failed samples, extra samples or configurable limits. The order is recorded in
the report. This is a per-invocation bound, not an aggregate bound across source
revisions: the #33 record retains 1,470 attempts (30 at `981f6f1`, 720 at
`23a39d7`, 720 at `031ebff`). The two full runs are source-revision repetitions,
not retries or failure selection; the second followed the Chrome probe
reporting correction. Every attempt is registered before execution and persisted
with its index, stage and status. Available raw setup components,
handler/finalization samples, clock samples, summary and phase timings are
published before the post-Stop assertion; a failure then retains the failed
attempt and its error for exit 2. The pre-assertion snapshot leaves
`flowMs.total` unset. The start-to-end total is finalized in the outer finally
after the post-Stop stage; the measured window starts after reset. A completed
attempt includes postStop, and a failure after the window starts records the
total through its last measured stage. A reset failure retains index, stage and
error without a measurement total; reset is a precondition, not part of the
measured window. A sidecar `.sha256` binds the final file. The
study records browser/driver/OS/host identity, the XPI digest and the fixture
input/output hashes.

A budget-failed block stays failed while remaining blocks run; the command exits
1 if any budget block failed. A protocol or instrumentation failure keeps its
partial report and exits 2. Exit 0 means the study completed with no budget
failure; it is still diagnostic/instrumented authority, not independent
qualification, native usability or a latency guarantee. The load worker is one
controlled condition, not a reconstruction of the historical hosted scheduler.
The study does not run on Chrome, Linux or Windows in this record; those
diagnostic environments are unavailable. Its `attempts[].flowMs` includes
driver/injection/IPC work and is not part of the synchronous gate.
`tests/budget-study-attempts.test.ts` is the focused failure-path regression:
it supplies metrics, simulates a post-Stop throw and requires the failed attempt
to retain its index, stage, error, summary, metrics, setup slots and timings
through JSON persistence. The failure-path-only corrections are at `c58744f`
and `1d3593e`; successful measurement bodies and the `031ebff` study reports are
unchanged.

Read a study report's `blocks[].operationSamples`, `setupComponents`,
`clockSamplesMs`, `clockProbe`, `attempts[].flowMs` and `cleanup`. Each block
stores the raw setup slots in `setupInstallSamples` and `setupStartSamples`;
`setupComponents` summarizes them as `installation` and `startHandling`.
`rawOperationSamplesMs`, `setupComponents.installationMs` and
`setupComponents.startHandlingMs` belong to the standard qualification report,
not to study reports. The report must show all owned tabs, the worker, the
browser and the server closed. The [dated evidence](evidence/2026-10-29-collector-budget-variability.md)
records all known retained failures, including the separate `8091ad1` and
`028c29c` 6 ms results, the missing `028c29c` arrays, study results and release
disposition. Do not lower the gate, omit a scenario or treat a later pass as an
explanation of an earlier failure.

After the test-only shared-operations refactor at `14d8bb9`, clean packaged
local suites pass 79 checks each on Firefox 140.0/153.5.1esr/158.0.1 and 73 on
Chrome 156.0.8078.47. Hosted Check, all six Firefox jobs and both Chrome jobs
passed at `14d8bb9` through the PR merge commit `8e23f32`; all eight raw reports
name clean merged source, close owned tabs, keep the unchanged budgets and pass
their source rebuilds. The `031ebff` two-version study reports remain the
measurement evidence; the shared operational change did not trigger another
720-attempt study. The final documentation head requires its own hosted run
before merge.

## Report export checks

The export contract distinguishes request dispatch, browser acceptance and final
disk completion. An anchor click establishes only the request. Under accepted
Q12, keep the investigation open until the browser shows the download; closing
or reloading can cancel an unaccepted request. Do not restore the original
immediate-owner-close requirement or relabel its failed receipts as passing.
The [feasibility record](evidence/2026-10-27-report-export-feasibility.md) records
the final six-check revised candidate on all four pinned local targets, with
the first five source blocks unchanged and the sixth checking an exact 1 MiB
file at its original download path through owner closure.

Focused model/view/adapter checks cover allowlisted report content, omitted ID
fields and internal labels, literal names/versions, exact UTF-8 limits, explicit
missing values, current snapshot reference/reset generation, async normal-window
and permission checks, initial scripting absence, actual revocation, cancellation
and failures. Run the four focused files with
`mise exec -- bun test tests/investigation-report.test.ts tests/report-export.test.ts tests/report-download.test.ts tests/report-export-view.test.tsx`.
These tests do not establish a browser download or native usability. Run the full
shared gate and source rebuild tasks separately for delivery.

### Packaged browser UI

`scripts/report-export-checks.mjs` is integrated into the shared investigation
protocol for Firefox and Chrome. It uses Selenium to operate the packaged React
controls and reads the exact read-only textarea value. Existing runner authority
supplies retained or labelled pre-granted inventory access; this helper does not
observe a new optional-permission prompt. At this writing the new packaged export
checks are pending execution, not qualified results.

Use the existing exact-version packaged Firefox and Chrome tasks with disposable
profiles. Their test-only download preferences or download behavior select an
owned empty directory and automatic MIME handling. The external process observes
file creation. Those settings do not qualify default browser prompts, native
Save As, cancellation or retail installation.

The helper checks explicit preparation without a download, read-only exact
Markdown, Cancel preserving the investigation, assessment changes invalidating
the preview and Download report creating exactly the reviewed UTF-8 bytes under
`addonray-investigation.md`. Inspect the raw JSON's `reportExport` details for
`reviewedMarkdown`, `downloadedMarkdown`, byte counts, SHA-256 digests,
`exactUtf8Match`, omitted fixture ID/internal label, stage and observed directory
entries. Keep partial file observations reachable when an assertion fails.
Direct byte equality is required; matching lengths alone are insufficient.

The shared investigation protocol additionally prepares a new preview and
resets, verifying unsaved text is erased while the completed file remains exact
at its original path. It checks the same file after owner tabs close. The
Firefox actual-management-revocation path prepares a preview before removing
the grant, then verifies erased preview and disabled preparation. Keep these
product checks distinct from the candidate fixture's lifecycle results. The
standalone helper itself leaves the owner open until file completion and makes
no immediate-close or reload-survival claim.

### Native preview and download

The helper `scripts/report-export-native.mjs` opens visible unmodified
product sessions. Invoke it with
`mise exec -- bun scripts/report-export-native.mjs firefox` or `chrome`, with
`snapshot`, `verify-download`, `revoke-management` and `finish` controls. The
[dated export evidence](evidence/2026-10-28-report-export.md) separates observed
native controls from the helper's API assertions.

Use a disposable profile and record exact browser/driver/OS, source and artifact
identities. Capture the pair through the actual product, prepare the report,
inspect keyboard access, focus and the full read-only text, Cancel, and prepare
again. The helper discloses automatic-download settings and an owned destination.
Observe the browser's download indication without treating button activation as
a completed file. Default settings, Save As and cancellation need separately
controlled observations and are not qualified by this helper's preset flow.

When a file completes, use `verify-download` according to the helper's prompt to
compare its raw UTF-8 bytes with the reviewed preview. Keep the file at its
browser-chosen path for any claimed reset/owner-close retention observation.
Record user cancellation separately if exercised; product code has no final
completion/cancellation API. Use `snapshot` before actual management removal,
verify erased report data after `revoke-management`, and `finish` to record
cleanup and close only the owned session. Native human observations, helper API
assertions and raw file equality JSON are separate evidence. Private/unknown
guards, other OSs, default browser settings and Save As behavior remain gaps
until explicitly observed.

## Saved-investigation and exchange checks

The [saved-data contract](plans/saved-investigation-data-rules.md) governs the
bounded #6/#7 slices and the future exchange work. #6 save/list/read-only reopen
and single-record delete are implemented with model, storage, UI and product
browser checks. #7 adds per-save 7/30/90-day retention, bulk deletion and
confirmed delete-all. Import, printable HTML and clipboard remain future tests.
Keep model tests, storage adapter tests, UI tests, browser evidence and native
observations separate.

Model and schema checks:

- exact saved payload, precomputed ID-based changes, duplicate names, absent
  assessment, optional timing and error summaries and observation limits;
- omitted extension IDs, live identity and tab, document, attempt and transfer
  identifiers, page and browser context, user notes and exchanged timestamps;
- measured, unrecorded, unavailable and null states preserved without coercion;
- strict schema version 1, unknown fields, duplicate keys, prototype-affecting
  keys, malformed values, non-finite numbers and unsupported versions;
- negative, non-finite and above-range `milliseconds` and `observedMs` values
  rejected; measured `milliseconds` at most `Number.MAX_SAFE_INTEGER` and
  `observedMs` at most 30,000;
- unsupported saved records listed for explicit deletion without migration,
  rewrite or silent deletion;
- 1,000 inventory entries per side, 2,000 changes, 4,096 characters per string,
  nesting depth 8, 1 MiB complete JSON and no truncation;
- save, export and import byte accounting, including the local envelope in the
  stored record, the accepted-export re-import requirement for inspection and
  the separate save bound;
- maximum-size import is view-only when the local envelope would exceed the
  1 MiB stored-record bound; the view remains available for inspection or
  deletion and save writes no partial record;
- read-only reopen with no inventory or page collection, no source-tab access,
  no collector resumption and no collection-permission prompt; exercise the
  narrow current-view context and storage eligibility checks.

Storage adapter checks:

- IndexedDB availability, controlled store loss, fail-closed metadata, deletion
  epochs, bounded waits and multi-view hint behavior;
- 50 records, 5 MiB total and 1 MiB per complete record, refusal when full, no
  automatic eviction of unexpired records;
- 30-day default retention, the 7/30/90-day per-save choice and the 90-day
  maximum; expiry refusal and lazy cleanup;
- single-record delete, frozen selection-based bulk delete and confirmed
  delete-all, including unsupported and not-currently-listed rows;
- pending-action invalidation, no resurrection and suspended-view next-action
  failure; pending-save ordering on either side of selected-delete and
  delete-all commits against the real adapter;
- ordinary storage, quota, size or output save failure preserves the current
  valid live state, while reset, permission removal, source change or context
  loss invalidates the save and cannot restore discarded data or resurrect a
  deleted record;
- unsupported and unreadable record listing and explicit delete.

UI checks:

- disclosure before the first save, generated labels, per-save retention
  choice, expiry text and read-only archive views;
- frozen bulk selection, explicit bulk and delete-all confirmations, and cleared
  selection/confirmation on denied, unavailable and suspended transitions;
- normal, private and unknown context guards for every saved-data action;
- imported label, untrusted rendering, separate Save imported report and no
  automatic persistence (future #9);
- exact Markdown, JSON and printable HTML previews, and exact clipboard text
  (future #8 through #11);
- truthful clipboard success after a write and bounded denial or failure
  (future #11);
- download and print reported as requests, not completion.

Browser and native evidence:

- actual persistence, clearing, eviction, file selection, download, browser
  Print/Save as PDF, clipboard write and multi-view deletion on exact Firefox and
  Chrome distributions, versions, OS and architecture;
- authentic private-context evidence kept separate from simulated unknown cases;
- native UI observations kept separate from fixtures and model tests.

#6 execution:

- `tests/saved-record.test.ts` covers exact payload/model validation, state
  preservation, duplicate names, ID-based changes, limits, expiry accounting and
  unsupported/invalid inspection.
- `tests/saved-save.test.ts`, `tests/saved-library.test.ts`,
  `tests/live-activity.test.ts`, `tests/saved-launch.test.ts` and the two view
  suites cover the exclusive save lease, snapshot/reset cancellation, private
  and unknown refusal before storage access, exact transaction results,
  expired/unsupported rows, stale opens, single delete, disclosures, text
  escaping and no collection on render.
- The clean local `05ac5ef` browser tasks pass 88 checks on Firefox 140.0,
  153.5.1esr and 158.0.1 and 82 checks on Chrome for Testing 156.0.8078.47. They
  exercise the packaged save/list/open/delete flow, reload, multi-view deletion,
  the normal popup launcher, Firefox management removal, a Firefox authentic
  private window with a seeded archive, a Chrome authentic incognito popup with
  a seeded incognito partition, a simulated Chrome `QuotaExceededError`, and a
  simulated persisted `pageshow` that revalidates after another view deletes the
  archive. No actual Chrome BFCache restoration is claimed.
- The Chrome private main-frame library navigation is an observed
  `ERR_BLOCKED_BY_CLIENT` policy block. The authentic incognito popup refusal is
  separate evidence; the library's own private guard remains unexercised in
  Chrome. Chrome product checks use the named pre-granted UI fixture with
  unchanged production assets.
- `scripts/saved-store-checks.mjs` compiles the production storage adapter and
  runs fifteen checks on all four pins: a bounded barrier timeout followed by a
  later save, synchronous barrier capture, deletion after the barrier, queued
  save-versus-selected-delete and save-versus-delete-all ordering on either side
  of commit, empty-list delete-all epoch advancement, corrupt/exhausted metadata
  failing closed, not-ready/recreated connections, idempotent delete, add-only
  duplicate refusal, abort cancellation and oversized-row rejection. Run it with
  `FIREFOX_VERSION=<pin> bun run test:saved-store:firefox` or
  `bun run test:saved-store:chrome`.
- The #7 product checks extend the packaged save flow with the stored 7-day
  retention delta, a frozen two-record bulk delete and confirmed delete-all that
  removes an unsupported row from the actual IndexedDB store. They are part of
  the shared `mise run test-firefox` and `mise run test-chrome` probes, not
  separate native evidence.
- The separate `scripts/saved-restart-checks.mjs` probe passes six checks on
  Firefox 158.0.1 and Chrome 156.0.8078.47 after #7. Run it with
  `FIREFOX_VERSION=<pin> bun run test:saved-restart:firefox` or
  `bun run test:saved-restart:chrome`. It performs explicit product Save, a full
  browser restart with the retained profile/origin, read-only list/reopen,
  live-state loss, single-delete persistence and a confirmed delete-all of a
  seeded unsupported record before another restart. Firefox uses a retained
  temporary-install profile with a fixed test UUID mapping; Chrome uses the named
  pre-granted UI fixture with unchanged production assets. Neither is a
  native-consent or retail-install claim.
- Natural eviction, an actual Chrome engine quota error and the hosted exact-OS
  matrix remain unqualified. See
  [product evidence](evidence/2026-10-30-saved-investigations.md) and the
  [Stage 1 feasibility record](evidence/2026-10-30-saved-storage-feasibility.md).

A passing model or fixture check does not qualify storage, output, native
usability or support. Run future exchange checks only when the corresponding
implementation and qualification tickets are authorized.
