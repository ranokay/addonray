# Checklist and resumption

## Current state

The approved Phase 0 scaffold is implemented and published on `main` in private [ranokay/addonray](https://github.com/ranokay/addonray). Signed migration commit `abca489` replaces pnpm, Prettier, and Vitest with a pinned Bun canary and adds hk and jactionlint. Its [Linux CI run](https://github.com/ranokay/addonray/actions/runs/39720670911) passed. All 26 behavior tests, native formatting/lint/types, build, manifest checks, and workflow checks pass locally.

Firefox 158.0.1 passed the 12 headless API checks and the observed native-popup protocol on macOS arm64. Firefox 153.5.1esr passed the 12 headless checks. Firefox 140 remains blocked at extension-document navigation, including a minimal static fixture. See [qualification evidence](evidence/2026-10-22-qualification.md) for the observed results, source boundaries, and remaining gaps. All test runs use disposable profiles.

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
- [x] Observe actual toolbar-popup consent, page inspection, Clear, close/reopen, retained grants, and renewed consent after Firefox UI revocation on Firefox 158.0.1/macOS arm64.
- [x] Run the API protocol on exact ESR 153.5.1esr and record all 12 passing checks.
- [ ] Resolve Firefox 140 extension-document loading and rerun the API/native-popup protocol.
- [ ] Qualify native ESR popup behavior and intended additional operating systems.

The current workflow status is available in [GitHub Actions](https://github.com/ranokay/addonray/actions). Local evidence and remote CI are separate. Inspect the run associated with the current head before claiming that CI passed. The real-Firefox task records its own source commit and dirty status locally.

## Next action

Investigate the [Firefox 140 loading blocker](evidence/2026-10-22-qualification.md#firefox-140-blocker). Compare an actual toolbar launch through `FIREFOX_VERSION=140.0 mise run test-firefox-popup` with direct-document WebDriver navigation before changing product code or the manifest minimum. Complete native ESR and OS qualification before advertising broader support. Keep Phase 1 implementation behind a new scope decision.

See [toolchain setup](toolchain.md) for the canary pin, hk installation, jactionlint, and rollback. Independent migration and qualification-tool reviews found no material issues. The popup launcher has been checked for normal startup and Enter-triggered browser/server cleanup; it does not issue an automated UI verdict.

## Delivery evidence

The local check task ran successfully with 26 passing simulated tests, and dependency audits reported zero known advisories for the resolved production and development dependencies on 2026-10-22. Independent product-code and probe-evidence reviews completed; their actionable findings were fixed. The dated Firefox report records the 12 observed browser checks and the distinction between real permission dialogs, the production toolbar grant, and the separate test harness.

For fresh revision-bound evidence, run `/Users/ranokay/.agents/tools/run gate_run -- mise run check` and then `/Users/ranokay/.agents/tools/run gate_run -- mise run test-firefox` from a clean checkout on this machine. On other machines, the plain mise tasks remain portable; the receipt helper is local tooling, not a project dependency. Receipts are private local files and must be inspected for the actual command result, source revision, and frozen state.

## Unresolved future decisions

License, public visibility, final AMO identity/publication, release/ESR and OS qualification, longer investigation lifetime, diagnostic collectors and overhead budgets, report export/history rules, and a concrete optional companion capability. These do not block the narrow Phase 0 proposal.
