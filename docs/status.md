# Checklist and resumption

## Current state

The approved [optional timing comparison](plans/phase2-timing-comparison.md) is implemented locally. All 165 behavior tests with 525 assertions pass, and independent production/probe reviews have no unresolved material finding. Development Chrome passed 34 checks with the actual pre-granted fixture popup. Development Firefox 158.0.1 passed 40 checks with the declared source-popup fixture, strict actual optional-scripting revocation, and private-source fixture exclusion. The shared development gate passes. Native unmodified UI/private checks, remaining browser versions, clean source rebuilds, exact-head hosted reports, and signed delivery are still incomplete. Firefox's source fixture and Chrome's pre-granted UI copy remain distinct from actual native optional consent/usability.

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
- [ ] Verify the actual unmodified native popup workflow and private-source exclusion on available macOS targets; keep native platform and headless authority gaps explicit.
- [ ] Run final development checks, sign implementation, and collect clean committed qualification before private delivery.

## Next action

Finish qualification of the approved [timing-comparison slice](plans/phase2-timing-comparison.md). The user confirmed all six design choices and final implementation/testing/review/signed-private-delivery scope. Product state and UI are implemented locally; durable browser probes, context exclusion, native actual-popup observations, and clean committed delivery remain incomplete. Scratch API feasibility passed 11 checks on all four pinned macOS browser targets, with dirty source and explicit fixture/native-UI limits. Bun startup later passed eight bounded trials and the shared gate without a proven cause or toolchain change. Preserve native OS, accessibility, retail/store and signing release gaps. The completed popup [plan](plans/phase2-timing.md) and [evidence](evidence/2026-10-23-phase2-timing.md) retain its 1 KiB timing-block bound, measured 5 ms p95 collector budget, and clock limitations. Page-error diagnostics remain deferred. The original inventory prototype remains in signed `36e4d24` outside `main`, runnable with `mise run prototype` from its checkout.

The user approved planning for the private build with the remaining release gates open. Follow the [desktop QA handoff](desktop-popup-qa.md) when a visible Linux/Windows target becomes available, and complete signed-distribution checks at the release gate. Current hosted jobs provide headless API evidence.

See [toolchain setup](toolchain.md) for the canary pin, hk installation, jactionlint, and rollback. Independent migration and qualification-tool reviews found no material issues. The popup launcher has been checked for normal startup and Enter-triggered browser/server cleanup; it does not issue an automated UI verdict.

## Delivery evidence

The local check task ran successfully with 26 passing simulated tests, and dependency audits reported zero known advisories for the resolved production and development dependencies on 2026-10-22. Independent product-code and probe-evidence reviews completed; their actionable findings were fixed. The dated Firefox report records the 12 observed browser checks and the distinction between real permission dialogs, the production toolbar grant, and the separate test harness.

For fresh revision-bound evidence, run `/Users/ranokay/.agents/tools/run gate_run -- mise run check` and then `/Users/ranokay/.agents/tools/run gate_run -- mise run test-firefox` from a clean checkout on this machine. On other machines, the plain mise tasks remain portable; the receipt helper is local tooling, not a project dependency. Receipts are private local files and must be inspected for the actual command result, source revision, and frozen state.

## Unresolved future decisions

License, public visibility, final AMO identity/publication, remaining native OS and signed-distribution qualification, retail Chrome installation, longer investigation lifetime, diagnostic collectors and overhead budgets, report export/history rules, and a concrete optional companion capability. These remain separate from the completed inspection slices.
