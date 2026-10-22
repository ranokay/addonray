# Checklist and resumption

## Current state

The first Phase 1 inventory slice is being implemented under [issue #1](https://github.com/ranokay/addonray/issues/1). The user selected layout A with a dark/black theme by default and the [documented acceptance criteria](plans/phase1-inventory.md). Search/filter controls and expandable permission explanations stay within the existing popup session. The three-variant prototype remains on its separate branch.

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
- [ ] Finish the production rewrite, focused behavior tests, independent review, and current Firefox evidence for the first slice.
- [ ] Publish the signed implementation and record the exact-head workflow results.

The current workflow status is available in [GitHub Actions](https://github.com/ranokay/addonray/actions). Local evidence and remote CI are separate. Inspect the run associated with the current head before claiming that CI passed. The real-Firefox task records its own source commit and dirty status locally.

## Next action

Validate and publish the approved first inventory slice under [issue #1](https://github.com/ranokay/addonray/issues/1). The chosen A layout is being rewritten for production with a dark default. The original prototype is captured in signed commit `36e4d24` outside `main` and remains runnable with `mise run prototype` from its checkout.

The user approved planning for the private build with the remaining release gates open. Follow the [desktop QA handoff](desktop-popup-qa.md) when a visible Linux/Windows target becomes available, and complete signed-distribution checks at the release gate. Current hosted jobs provide headless API evidence.

See [toolchain setup](toolchain.md) for the canary pin, hk installation, jactionlint, and rollback. Independent migration and qualification-tool reviews found no material issues. The popup launcher has been checked for normal startup and Enter-triggered browser/server cleanup; it does not issue an automated UI verdict.

## Delivery evidence

The local check task ran successfully with 26 passing simulated tests, and dependency audits reported zero known advisories for the resolved production and development dependencies on 2026-10-22. Independent product-code and probe-evidence reviews completed; their actionable findings were fixed. The dated Firefox report records the 12 observed browser checks and the distinction between real permission dialogs, the production toolbar grant, and the separate test harness.

For fresh revision-bound evidence, run `/Users/ranokay/.agents/tools/run gate_run -- mise run check` and then `/Users/ranokay/.agents/tools/run gate_run -- mise run test-firefox` from a clean checkout on this machine. On other machines, the plain mise tasks remain portable; the receipt helper is local tooling, not a project dependency. Receipts are private local files and must be inspected for the actual command result, source revision, and frozen state.

## Unresolved future decisions

License, public visibility, final AMO identity/publication, additional OS and packaged XPI qualification, longer investigation lifetime, diagnostic collectors and overhead budgets, report export/history rules, and a concrete optional companion capability. These do not block the narrow Phase 0 proposal.
