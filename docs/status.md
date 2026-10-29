# Checklist and resumption

## Expanded v1 target

The user approved the private milestone [`v1.0.0`](https://github.com/ranokay/addonray/milestone/1) as the finite expanded v1 target on 2026-10-29. It contains tickets #2 through #46: saved investigations and report exchange, guided comparisons, mutation and request-failure diagnostics, an optional Rust companion, brand assets, qualification and release work. [The v1 contract](v1-contract.md) records the dated scope snapshot, intended support, existing evidence, supersession map, release acceptance and exclusions.

The implemented runtime below remains the current product. No full-v1 implementation or qualification exists. Current session, one-pair, report and permission limits stay effective until a future contract is approved, recorded, its applicable feasibility gates pass and its implementation is qualified. #4, #5, #13 and #20 are open decision gates. Backlog approval does not authorize signing, publication, licensing or visibility changes.

## Current state

The user approved [previewed investigation report export](plans/phase3-report-export.md)
on 2026-10-27 after accepting Q1 through Q11. The approved scope includes exact
read-only Markdown preview, an explicit browser-controlled download, existing
observations only, normal-window guards and a 1 MiB UTF-8 cap without truncation.
Feasibility-first implementation, tests, independent review and signed private
delivery to `main` were authorized. An essential Firefox 158 candidate lifetime
gate initially failed, and product wiring stopped. Small and
1 MiB exact downloads passed with Blob and data URLs, but immediate same-task
owner closure after `anchor.click()` could preempt the request and leave no file.
Firefox 140 repeated the Blob failure; Chrome for Testing 156.0.8078.47 passed
the same six candidate cases. ESR was not run in that initial attempt.
The failed assertions remain failed. See the
[feasibility record](evidence/2026-10-27-report-export-feasibility.md).

The user accepted Q12 on 2026-10-27. A dispatched request is not browser
acceptance. Keep the investigation open until the browser shows the download;
close/reload may cancel an unaccepted request. Browser-accepted bytes or files
can outlive the investigation. Permission and lifetime limits remain unchanged.
The original Q11 approval and failed assertions remain recorded. The revised
candidate gate then passed six checks each on Firefox 140.0, 153.5.1esr, 158.0.1
and Chrome for Testing 156.0.8078.47 before product wiring. The independent audit
verified all 16 retained artifact sizes/hashes, unchanged first-five-case source
blocks, original download-path retention through owner closure and cleanup.

The serializer, snapshot-bound controller, browser download adapter and exact
read-only preview are implemented in signed private `8091ad1`. All 433 behavior
tests with 1,834 assertions, native type checking of 55 files, the frozen shared
gate and both 14-file source rebuilds pass. The three local Firefox pins pass
79 checks each and Chrome passes 73. All six hosted Firefox members and two
Chrome members qualify, with all 16 selected reports and eight ZIP digests
verified independently and by the coordinator. The selected largest guarded
collector p95 is 3 ms locally and 4 ms hosted against the unchanged 5 ms limit.
Independent production/probe/evidence review has no unresolved material finding.

The [export evidence](evidence/2026-10-28-report-export.md) preserves the initial
private-fixture qualification gaps, one failed 6 ms local collector-budget
attempt and the unchanged passing retries. No cause or fix is established by
those retries. Available unmodified macOS consent, keyboard preview/Cancel and
download, reload and actual management-removal observations retain their
native authority limits. Their 41 product-input hashes match `8091ad1`.
A later documentation delivery head for that export requires its own frozen check
and hosted report verification. `.scratch/p3a-delivery.json` is the final local
receipt for that exact delivered head; do not infer later-head success from this
paragraph.
That receipt is absent in the current worktree; see [Historical delivery records](#historical-delivery-records).

The prior attachment delivery is complete at signed `deeb3d8`. Its final local
receipt is `.scratch/p2d-delivery-deeb3d8.json`, verified during read-only resumption
on 2026-10-27. Check, six Firefox jobs and two Chrome jobs passed at that exact
head, and the receipt records verification of all 16 browser/rebuild reports.
It closes the earlier pending-delivery wording below without erasing those
historical failed attempts or their unproven causes.

The approved [optional page-error comparison](plans/phase2-page-error-comparison.md) is implemented and privately pushed in signed `a5b8fed`. Completed checks attach once to explicit fixed Before/After slots, share one source tab with timings and leave independent investigation copies. Missing initial inventory access preserves a standalone completed check for retry after consent. Actual permission removal still clears it.

All 370 behavior tests with 1568 assertions, the clean frozen shared gate, both 14-file source rebuilds, three exact macOS Firefox versions with 73 checks each and Chrome with 67 checks pass. All six hosted Firefox and two Chrome jobs passed on the first attempt at `a5b8fed`; all 16 downloaded browser/rebuild reports passed verification. The maximum local guarded collector p95 is 5 ms, within the unchanged budget. Independent implementation/probe/evidence review has no unresolved material finding.

Original full native flows at `3346b35`/`f1b781d` and focused current-revision consent/retention/retry plus actual management revocation are recorded separately. Firefox check-tab interaction used explicit driver toolbar setup after CUA scrolling proved unreliable. [Comparison evidence](evidence/2026-10-26-phase2-page-error-comparison.md) preserves those authority limits, current artifact/input hashes, the earlier unexplained Windows interruption and remaining release gates. Later documentation delivery heads require their own checks/reports before being described as passing.

The approved [current-document page-error slice](plans/phase2-page-errors.md) is implemented and privately pushed in signed `d56b56f`. All 258 deterministic tests with 824 assertions, the clean shared gate, both source rebuilds, three macOS Firefox versions with 55 checks each and Chrome with 49 checks pass. The shared CI gate, all six Firefox jobs and both Chrome jobs passed at that exact head; all 16 downloaded browser/rebuild reports confirm clean source, identities, bounded outcomes, budgets and cleanup. Unmodified native launch/Start/reproduction/Stop and keyboard guidance were observed on Firefox 158.0.1 and Chrome for Testing 156.0.8078.47/macOS, with separate real optional management/scripting revocation assertions on Chrome. Those dirty-source native artifacts and all production input hashes match the clean implementation. Independent production/probe/native-helper review has no unresolved material finding. [Page-error evidence](evidence/2026-10-24-phase2-page-errors.md) records authority, corrections, BFCache and remaining native/platform/release gaps. This describes qualified implementation `d56b56f`; verify later documentation delivery heads against their own hosted runs before claiming they passed.

The approved [optional timing comparison](plans/phase2-timing-comparison.md) is implemented and privately pushed in signed `efa6bcb`, followed by test corrections `3e83d2a`. All 165 behavior tests with 525 assertions, both clean source rebuilds, three macOS Firefox versions with 40 checks each, and macOS Chrome with 34 checks pass at clean `3e83d2a`. Actual unmodified capture/select/confirm, retained timing copies, keyboard guidance/assessment, reset/reload, and private-source exclusion were observed on Firefox 158.0.1 and Chrome for Testing 156.0.8078.47/macOS. Chrome's unmodified post-native helper additionally passed 15 checks, including actual optional scripting and management revocation. Independent production/probe/evidence reviews have no unresolved material finding. The exact-head shared gate, all six Firefox jobs, and both Chrome jobs passed; all 16 downloaded browser/rebuild reports confirm identities, checks/budgets, and cleanup. [Timing-comparison evidence](evidence/2026-10-24-phase2-timing-comparison.md) preserves fixture authority, the corrected Linux Chrome readiness failure, and remaining native/platform/private-receiver/release gaps. This evidence describes qualified implementation/test head `3e83d2a`. Verify the current pushed head's own hosted checks before claiming later documentation delivery passed.

The approved [Phase 2 timing snapshot](plans/phase2-timing.md) is implemented and privately pushed in signed `8b8c968`. The existing popup page action adds DOM content loaded, load event completed, and first content displayed, with explicit unavailable/unrecorded states and the existing permission/lifetime budget. All 134 behavior tests with 384 assertions, both clean source rebuilds, three macOS Firefox versions with 27 checks each, and macOS Chrome with 24 checks passed. Actual timing rows, keyboard guidance, Clear, close/reopen, and protected-page outcomes were observed on Firefox 158.0.1 and Chrome for Testing 156.0.8078.47/macOS. The shared CI gate, all six Firefox jobs, and both Chrome jobs passed at that exact implementation head. All 16 downloaded browser/rebuild reports confirm clean source, versions, matching package identities, empirical collector budgets, and cleanup. Independent production-code and probe reviews found no actionable issue. [Timing evidence](evidence/2026-10-23-phase2-timing.md) records source/artifact identities, the overhead method, native observations, and remaining release gates.

Signed evidence delivery `2ff8420` is pushed. Its [shared gate](https://github.com/ranokay/addonray/actions/runs/39999106932), [six-job Firefox run](https://github.com/ranokay/addonray/actions/runs/39999106950), and [two-job Chrome run](https://github.com/ranokay/addonray/actions/runs/39999106807) passed. All 16 downloaded delivery reports confirm that exact clean head, passing checks/budgets/rebuilds, matching per-OS artifact hashes, and cleanup. The user then completed the [timing-comparison interview](decisions.md#timing-comparison-interview) and approved its implementation, tests, independent review, and signed private delivery.

The approved [manual comparison slice](plans/phase1-comparison.md) is implemented and privately pushed in signed `19516ef`, followed by test readiness correction `5b52ff2`. Each fresh investigation tab keeps one fixed Before/After pair and an explicit manual page assessment in memory. Start over, relevant permission revocation, close, reload, or unloading discards that investigation's data. The popup and other investigations remain independent. All 102 behavior tests, both source rebuilds, three macOS Firefox versions with 21 checks each, and macOS Chrome with 17 checks passed from clean committed source. Native full-tab consent, manual captures, keyboard assessment, independence, reset, and reload were observed on Firefox 158.0.1 and Chrome for Testing 156.0.8078.47/macOS. The shared gate, all six Firefox jobs, and both Chrome jobs passed at `5b52ff2`. All downloaded browser/rebuild reports confirm that exact clean source, versions, matching package identities, expected checks, and cleanup. [Comparison evidence](evidence/2026-10-23-phase1-comparison.md) records artifact/source identities, independent static review, hosted qualification, and remaining gates.

The user approved the [Chrome MV3 continuation](plans/chrome-mv3.md) on 2026-10-23 and kept the pinned Bun canary for native linting. Firefox MV3 remains the baseline; other browsers and MV2 are deferred. Signed implementation `824dda6` is pushed, followed by bounded Chrome launch/CI fixes. All 62 behavior tests and both source rebuilds passed for that earlier slice. Clean macOS packaged Firefox checks passed all 15 cases on three versions; Chrome passed all 11 checks. The actual Chrome for Testing 156.0.8078.47 popup was observed on macOS, including native inventory denial/approval and keyboard operation. [Chrome evidence](evidence/2026-10-23-chrome-mv3.md) separates unmodified product behavior, pre-granted fixtures, hosted qualification, and remaining gates. The two-job Chrome and six-job Firefox workflows passed at signed `e77fd7d`; their downloaded reports confirm clean source, exact versions, package identities, source rebuilds, and cleanup. The shared CI gate passed at the same source.

The first Phase 1 inventory slice is implemented in signed commit `a80125b` under [issue #1](https://github.com/ranokay/addonray/issues/1). The user selected layout A with a dark/black theme by default and the [documented acceptance criteria](plans/phase1-inventory.md). All 37 behavior tests passed. Packaged Firefox checks passed all 15 cases on each of three exact versions across macOS, Linux, and Windows. The actual rewritten popup was observed on macOS with Firefox 158.0.1. See [current inventory evidence](evidence/2026-10-23-phase1-inventory.md) for source identities, static review, CI links, and remaining gaps. The three-variant prototype remains on its separate branch.

The approved Phase 0 scaffold is implemented and published on `main` in private [ranokay/addonray](https://github.com/ranokay/addonray). Signed migration commit `abca489` replaces pnpm, Prettier, and Vitest with a pinned Bun canary and adds hk and jactionlint. Its [Linux CI run](https://github.com/ranokay/addonray/actions/runs/39720670911) passed. All 26 behavior tests, native formatting/lint/types, build, manifest checks, and workflow checks pass locally.

Firefox 140.0, Firefox 153.5.1esr, and Firefox 158.0.1 passed all 12 headless API checks and the observed native-popup protocol on macOS arm64. The three headless reruns and native minimum/ESR sessions used clean signed commit `664996d`; current-release native evidence comes from `abca489`. The minimum-version loading failure was a temporary fixture installation defect, resolved by retaining local directories. The installer's [Linux CI run](https://github.com/ranokay/addonray/actions/runs/39729414963) passed. See [qualification evidence](evidence/2026-10-22-qualification.md) for source boundaries and remaining gaps. All test runs use disposable profiles.

Matt Pocock's engineering skills now use the approved GitHub tracker, default triage labels, and domain documentation layout. Signed setup commit `7d1b588` is pushed and its [CI run](https://github.com/ranokay/addonray/actions/runs/39727979489) passed. Edit [agent configuration](agents/issue-tracker.md) and its sibling documents to change those settings later.

Signed packaging commit `bdad8f9` adds validated unsigned XPI/source archives and reproducible source builds. Clean packaged API checks passed on Firefox 140.0, 153.5.1esr, and 158.0.1 across macOS arm64, Ubuntu 24.04 x64, and Windows Server 2025 x64. The [six-job browser run](https://github.com/ranokay/addonray/actions/runs/39731719710) and development gate passed. The actual packaged popup was also observed on Firefox 140.0/macOS. [Packaging evidence](evidence/2026-10-22-packaging.md) records artifact hashes, source revisions, and remaining native UI/distribution gaps.

## Checklist

- [x] Retrieve available prior-conversation context and record its limitation.
- [x] Research names and collisions.
- [x] Confirm AddonRay and `ranokay/addonray` with the user.
- [x] Confirm private visibility and deferred licensing.
- [x] Confirm audience and privacy posture through the requirements interview.
- [x] Draft vision, requirements, architecture, API limits, privacy, phases, tests, contributing, and glossary.
- [x] Confirm final Phase 0 scope and shared understanding.
- [x] Scaffold WXT, TypeScript, and React.
- [x] Implement explicit consent, inventory, minimal page probe, and capability explanations.
- [x] Run deterministic checks and review failures. All 26 tests and the complete local check task pass. Pre-commit evidence is explicitly dirty, not frozen.
- [x] Run disposable-profile Firefox probes and record actual results/gaps.
- [x] Independently review product claims, permission/data boundaries, and probe evidence integrity. Fix the readiness validator, post-clear collection, reopen test, and cleanup findings.
- [x] Initialize Git, make a signed initial commit, and create/push the approved private repository.
- [x] Verify remote owner `ranokay`, private visibility, integration branch `main`, and the pushed implementation commit.
- [x] Migrate to the user-selected pinned Bun canary with native fmt/lint/check/tests and a frozen lockfile.
- [x] Add check-only hk hooks and strict jactionlint checks in local gates and CI.
- [x] Sign/push the migration and verify its Linux CI result.
- [x] Configure Matt Pocock's engineering skills with the approved GitHub tracker, default triage labels, and existing single-context domain docs. See [agent configuration](agents/issue-tracker.md).
- [x] Observe actual toolbar-popup consent, page inspection, Clear, close/reopen, retained grants, and renewed consent after Firefox UI revocation on Firefox 158.0.1/macOS arm64.
- [x] Run the API protocol on exact ESR 153.5.1esr and record all 12 passing checks.
- [x] Resolve Firefox 140 fixture loading and rerun all 12 API checks without changing product code or its minimum.
- [x] Observe the native-popup protocol on Firefox 140.0 and ESR 153.5.1esr from clean commit `664996d`, including Enter-triggered browser/server cleanup.
- [x] Confirm macOS, Linux, and Windows as intended desktop targets, with qualification tracked separately.
- [x] Add unsigned XPI/source packaging, exact contents validation, source rebuild checks, and package-mode API probes. Development trials pass on all three local Firefox versions.
- [x] Run clean committed package probes on all three macOS browser versions and verify a source archive rebuild.
- [x] Inspect all six Linux/Windows browser jobs and their reports, including source rebuild, version, artifact hash, dirty flag, and cleanup status.
- [x] Observe the packaged native popup on Firefox 140.0/macOS, including actual consent, page inspection, clearing, close/reopen, retained grant, and launcher cleanup.
- [ ] Complete native Linux/Windows usability and signed-distribution qualification before claiming release support.
- [x] Review Phase 0 acceptance evidence and provide a native desktop QA handoff. See [readiness](evidence/2026-10-22-phase0-readiness.md) and [desktop checks](desktop-popup-qa.md).
- [x] Confirm that Phase 1 planning may proceed for the private build while the native desktop/signing release gates stay open.
- [x] Confirm the first Phase 1 acceptance criteria and production layout before implementation. Investigation lifetime stays unchanged in this slice.
- [x] Select inventory utility in the existing popup as the first slice and draft [acceptance criteria](plans/phase1-inventory.md).
- [x] Capture three fixture-only layouts on the signed [prototype branch](https://github.com/ranokay/addonray/tree/prototype/inventory-popup) and link them from [issue #1](https://github.com/ranokay/addonray/issues/1).
- [x] Review the requested three-variant prototype and choose layout A with a dark/black default theme.
- [x] Finish the production rewrite, focused behavior tests, independent static review, and current Firefox evidence for the first slice.
- [x] Publish signed implementation `a80125b`; its quality check and six-job Firefox workflow passed at that exact head.

The current workflow status is available in [GitHub Actions](https://github.com/ranokay/addonray/actions). Local evidence and remote CI are separate. Inspect the run associated with the current head before claiming that CI passed. The real-Firefox task records its own source commit and dirty status locally.

## Chrome continuation checklist

- [x] Confirm native Bun canary, Chrome first, and MV3-only scope.
- [x] Add browser-context UI/adapters, conditional manifests, target-aware packages/source archives, and Chrome fixtures.
- [x] Run the 11 Chrome checks during development on macOS arm64. This dirty run is not frozen evidence.
- [x] Complete shared gate, independent review, and signed implementation commit.
- [x] Verify clean source rebuilds and packaged Firefox/Chrome probes.
- [x] Record actual Chrome native consent and popup observations separately.
- [x] Inspect exact-head Linux/Windows CI reports and record qualification gaps.
- [x] Record qualification evidence and identify the next product decision for signed private delivery.

## Manual comparison checklist

- [x] Resolve lifetime, comparison scope, fresh independent tabs, and one-pair reset behavior.
- [x] Confirm shared understanding and implementation/private-delivery authorization.
- [x] Implement the investigation controller, exact-ID differences, dark full-tab UI, and popup launch action.
- [x] Pass 102 behavior tests and the shared development gate; independently review product/UI/probe boundaries.
- [x] Run development packaged probes: Firefox 21 checks and Chrome 17 checks pass. These dirty runs are iteration evidence.
- [x] Make a signed implementation commit and run clean source rebuilds and packaged browser qualification.
- [x] Observe native full-tab inventory consent, keyboard operation, captures and lifetime on macOS Firefox/Chrome for Testing.
- [x] Inspect the qualified implementation head's Linux/Windows reports and record source/artifact identities and remaining gaps.
- [x] Record qualification evidence and prepare signed private delivery. Verify the delivery head's CI before reporting completion.

## Page-timing checklist

- [x] Resolve all five scope questions and obtain final shared-understanding confirmation for implementation, tests, review, and signed private delivery.
- [x] Establish isolated-world API feasibility on minimum/ESR/current Firefox and pinned Chrome for Testing. Keep missing-navigation and fixture-authority gaps explicit.
- [x] Implement the bounded collector/protocol, popup rendering, behavior tests, and shared browser fixtures/overhead checks.
- [x] Complete independent production-code and probe reviews. Static review is separate from execution evidence.
- [x] Pass the final development gate and make the signed implementation commit.
- [x] Run clean source rebuilds and exact-version packaged browser checks, retaining empirical overhead samples and clock limitations.
- [x] Observe actual native popup access, milestones, keyboard explanations, Clear and close/reopen on available macOS Firefox/Chrome.
- [x] Inspect the qualified implementation head's hosted reports and record dated evidence/gaps.
- [x] Prepare status/evidence for signed private delivery. Verify the delivery head's CI before reporting completion.

## Timing-comparison planning checklist

- [x] Select optional timing comparisons and the separate popup attachment workflow.
- [x] Resolve display, fixed sequence/slots, same source-tab ID, and complete reset on either permission revocation.
- [x] Establish own-view handoff feasibility with 11 checks on each pinned macOS browser; record dirty fixture authority and native/UI gaps in the draft plan.
- [x] Complete independent planning review and include context-guard qualification and the nonreproducing Bun startup observation.
- [x] Retry formatting and the shared gate through the existing Bun pin; all 134 baseline tests pass. This dirty planning run is not comparison implementation evidence.
- [x] Obtain final shared-understanding confirmation on the concrete plan before product implementation, qualification, and signed private delivery.
- [x] Implement optional timing state, explicit selected-view attachment, normal-context guards, UI, and focused behavior tests. Independent production review found a Firefox cross-realm discovery-array issue; the popup now makes its own array copy and a foreign-realm regression passes.
- [x] Complete independent production/probe review and development current-browser integration. Fix discovery-array ownership, the unused revocation callback, and the timing-cell assertion that could miss retained Before data.
- [x] Verify actual unmodified native popup capture/select/confirm and private-source exclusion on available macOS targets; retain native platform, private-receiver and headless authority gaps.
- [x] Pass the shared gate, sign/push implementation and test corrections, and collect clean committed source rebuilds and exact-version local qualification.
- [x] Verify all eight hosted browser jobs and all 16 downloaded browser/rebuild reports at qualified `3e83d2a`; complete independent evidence review.
- [x] Record dated evidence and resumption status for signed private delivery. Verify each pushed head's hosted checks/reports before reporting that head passed.

## Page-error check checklist

- [x] Resolve nine product decisions and obtain final feasibility-first implementation, budget, review and signed-private-delivery approval.
- [x] Record API/source research, the accepted execution-world trade-off, and independent static planning review.
- [x] Run seven preliminary API checks on each pinned macOS browser with declared fixture authority and cleanup.
- [x] Implement the independent check state/summary-validation module and focused behavior tests. These are model tests, not observer or product qualification.
- [x] Prove inactive-tab source bootstrap, actual toolbar grant, selected-world control, owner-close/revocation cleanup, navigation/BFCache, and actual duration/count limits before product wiring. All four candidate lifecycle runs and focused Firefox restoration checks pass; independent prerequisite review found no material unclosed gate in the declared scope.
- [x] Implement and test the approved observer/adapter, check UI, launch path, and context/permission boundaries after those gates pass.
- [x] Complete independent production/probe/native-helper review and the shared development gate; fix material findings.
- [x] Sign/push implementation, run clean source rebuilds and exact local browser checks, and observe available unmodified native UI. Native artifact/input identities match clean implementation.
- [x] Inspect all 16 implementation-head hosted browser/rebuild reports and prepare dated evidence/gaps for signed private delivery. Every later delivery head requires its own final hosted verification.

## Page-error comparison planning checklist

- [x] Select optional error-count comparisons and record all eight design answers.
- [x] Draft [P2D-01 through P2D-19](plans/phase2-page-error-comparison.md), data lifetime, shared source binding and feasibility/qualification gates.
- [x] Complete independent read-only planning review with no material finding. Formatting, relative plan links and whitespace checks pass; no new runtime evidence is claimed.
- [x] Obtain final shared-understanding confirmation and feasibility-first implementation/private-delivery approval. The user accepted Q9 on 2026-10-24.
- [x] Prove the new own check-tab sender, current-attempt one-use protocol, shared source binding and copy/reset races before product wiring. See [candidate evidence](evidence/2026-10-26-page-error-comparison-feasibility.md).
- [x] Implement the approved models, handoff and UI; pass 369 behavior tests and the dirty shared gate; complete independent production/probe review and correct the probe findings.
- [x] Qualify corrected production probes, six clean local browser/rebuild reports, available native views and all 16 implementation-head hosted reports, with explicit gaps.
- [x] Verify the unchanged follow-up retry and all 16 initial reports.
- [x] Qualify the final standalone permission-retention correction, new native absence/consent/retry cases, six clean local reports and all 16 corrected-head hosted reports.
- [x] Prepare reviewed evidence/status for signed private documentation delivery. Verify every later delivery head separately before reporting completion.

## Report export checklist

- [x] Select previewed, minimized export and settle the Q1 through Q10 product choices.
- [x] Confirm Q11, the 1 MiB UTF-8 cap, shared understanding and feasibility-first implementation/private-delivery approval.
- [x] Record the report/preview terms, [P3A-01 through P3A-18](plans/phase3-report-export.md), data boundaries and Firefox declaration rationale.
- [x] Record the initial Firefox 158 candidate's lifetime failure without converting successful byte checks into a gate pass.
- [x] Accept Q12's request/acceptance and owner-close guidance, and explicitly revise P3A-14/P3A-16 while preserving original failed assertions.
- [x] Qualify the revised candidate contract on all four pinned local targets, including ESR, before product wiring; retain the original failed attempts separately.
- [x] Prove the unchanged-permission candidate download, exact UTF-8 bytes and owner/stale-action behavior, with independent artifact and source-block audit.
- [x] Wire canonical report preparation, revision/reset validation, exact preview and explicit browser download; pass 63 focused tests with 266 assertions and native type checking of 55 files.
- [x] Complete independent export-core review with no material finding.
- [x] Complete probe/native-helper/evidence review and fix material findings.
- [x] Run the shared gate, source rebuilds and exact Firefox/Chrome implementation qualifications; observe available native flows and record gaps.
- [x] Prepare reviewed evidence and deliver signed implementation privately to `main` at `8091ad1`. The separate final documentation receipt is absent and remains unverified; see [Historical delivery records](#historical-delivery-records).

## Expanded v1 contract checklist

- [x] Read milestone `v1.0.0` and the bodies of tickets #2 through #46.
- [x] Record the dated finite scope, intended support, existing exact evidence, decision gates and native dependencies in [the v1 contract](v1-contract.md).
- [x] Record intended desktop architectures separately from exact OS versions and qualification evidence.
- [x] Record the prospective supersession map and keep current runtime limits effective.
- [x] Record final release acceptance, exclusions and the post-release support receipt.
- [ ] Close the #4, #5, #13 and #20 decisions before their dependent implementation tickets.
- [ ] Settle exact OS versions, Linux distribution and candidate release combinations before #39 candidate qualification.

## Next action

Issue #2 is complete at this documentation head. [The v1 contract](v1-contract.md)
is the current scope and support record. The next v1 action is to close the #4,
#5, #13 and #20 decisions, then start executable work in dependency order. #32
and #33 have no native blockers. #3 needs the user's visual selection. No
full-v1 qualification exists.

The pre-v1 stop condition is superseded by the approved [v1 contract](v1-contract.md).
Start v1 work only in dependency order and only after the named contract and
feasibility gates close. Preserve the original failed assertions and distinguish
request dispatch, browser acceptance and final file completion. Console feeds,
new browser targets, automatic extension-state changes and causal verdicts remain
excluded. Saved history, bounded collectors and the optional companion are
approved v1 scope, not authorization to skip their contracts.

## Historical delivery records

The report export implementation is signed `8091ad1`; the documentation head
inherited by this task is `a78e5d9`. The recorded test, browser and native
evidence is unchanged. The separate final documentation delivery receipt
`.scratch/p3a-delivery.json` is absent in this worktree. Treat that prior
documentation delivery as explicitly unverified history, not a pass.
Verify it only against the exact historical head and receipt it names. Do not
apply it to a later documentation-only head, and do not rerun export browser
probes merely because HEAD moved. This issue's proof is the frozen shared gate
for its documentation commit, not browser, export or full-v1 qualification.

The final `.scratch/p2d-delivery-deeb3d8.json` receipt closes the prior
documentation head's required verification. Future export implementation and
delivery heads need their own Check, Firefox/Chrome and browser/rebuild evidence.
Keep raw reports in ignored scratch space and use current source/dirty/artifact
records. Earlier product qualification does not qualify the export path.

Delivery `82ea820` has an unresolved Windows ESR duration-check failure after one
unchanged rerun. The product implementation remains unchanged from qualified
`a5b8fed`. Fixture-only lifecycle diagnostics preserve the failed assertion and
add a separate foreground control. Inspect those reports before any scenario or
product change; see the [failure record](evidence/2026-10-26-phase2-page-error-comparison.md#documentation-delivery-duration-failure).

At diagnostic `028c29c`, Windows ESR and four other Firefox jobs passed, along
with Check, both hosted Chrome jobs and clean local ESR/Chrome checks. Linux
Firefox 158 failed the unchanged 5 ms overhead guard at 6 ms. The reporting fix
retains raw samples before budget assertions. The later `deeb3d8` delivery receipt
records the completed matrix and report verification; the historical failure
remains failed. Neither failure's cause is established, and no budget or product
timing limit has changed.

## Remaining release gates

Native Linux/Windows usability, full accessibility, private/unknown-context native guards, retail installation/store and signed-distribution qualification remain release gates. Chrome's page-side observer is not tamper-proof. Production Firefox BFCache restoration remains unobserved; focused candidate restoration and production fresh-load outcomes are separate evidence. Follow the [desktop QA handoff](desktop-popup-qa.md) when an appropriate visible desktop becomes available.

The user approved the private build while these release gates remain open. Licensing/public visibility remain undecided. The original inventory prototype remains on signed `36e4d24` outside `main`. Toolchain setup and pinning remain in [toolchain](toolchain.md).

## Delivery evidence

The local check task ran successfully with 26 passing simulated tests, and dependency audits reported zero known advisories for the resolved production and development dependencies on 2026-10-22. Independent product-code and probe-evidence reviews completed; their actionable findings were fixed. The dated Firefox report records the 12 observed browser checks and the distinction between real permission dialogs, the production toolbar grant, and the separate test harness.

For fresh revision-bound evidence, run `/Users/ranokay/.agents/tools/run gate_run -- mise run check` and then `/Users/ranokay/.agents/tools/run gate_run -- mise run test-firefox` from a clean checkout on this machine. On other machines, the plain mise tasks remain portable; the receipt helper is local tooling, not a project dependency. Receipts are private local files and must be inspected for the actual command result, source revision, and frozen state.

## Open v1 decisions

Before the expanded v1 approval, the items below were recorded as unresolved future decisions. The approval moved them into the backlog and kept them as decision gates. They remain open:

- #4: license and source visibility, final extension and companion identities,
  publisher ownership, and the pre-release signing and limited-distribution
  routes.
- #5: saved-investigation and report-exchange data rules.
- #13: mutation and request-failure collector contracts.
- #20: the useful read-only companion capability.
- Exact OS versions, Linux distribution and release combinations. The intended
  architectures are macOS arm64, Windows x64 and Linux x64. Exact versions must
  be settled before candidate qualification. Existing evidence does not set a
  minimum OS version or qualify retail, native or full-v1 support.

These are approval gates inside the approved backlog, not open scope questions.
Current runtime limits remain effective until each contract and its applicable
feasibility gates pass. Licensing, visibility, signing and publication still
need their separate explicit approvals.
