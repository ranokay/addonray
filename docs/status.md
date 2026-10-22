# Checklist and resumption

## Current state

The approved Phase 0 scaffold is implemented and published on `main` in private [ranokay/addonray](https://github.com/ranokay/addonray). The initial implementation commit is `1c5165b`, and its SSH signature was verified locally. All 26 unit tests, formatting, type checks, build, and manifest checks pass. Real Firefox 158.0.1 on macOS arm64 passed 12 observed checks with [explicit qualification gaps](evidence/2026-10-22-firefox.md). Firefox was downloaded to Selenium's test cache; the ordinary application/profile was not used.

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

The current workflow status is available in [GitHub Actions](https://github.com/ranokay/addonray/actions). Local evidence and remote CI are separate. Inspect the run associated with the current head before claiming that CI passed. The real-Firefox task records its own source commit and dirty status locally.

## Next action

Perform the [native-popup check](evidence/2026-10-22-firefox.md#native-popup-check-still-required) in a disposable visible Firefox profile before claiming complete Phase 0 qualification. Test the intended minimum/ESR versions and additional operating systems before advertising support for them. Keep Phase 1 implementation behind a new scope decision.

## Delivery evidence

The local check task ran successfully with 26 passing simulated tests, and dependency audits reported zero known advisories for the resolved production and development dependencies on 2026-10-22. Independent product-code and probe-evidence reviews completed; their actionable findings were fixed. The dated Firefox report records the 12 observed browser checks and the distinction between real permission dialogs, the production toolbar grant, and the separate test harness.

For fresh revision-bound evidence, run `/Users/ranokay/.agents/tools/run gate_run -- mise run check` and then `/Users/ranokay/.agents/tools/run gate_run -- mise run test-firefox` from a clean checkout on this machine. On other machines, the plain mise tasks remain portable; the receipt helper is local tooling, not a project dependency. Receipts are private local files and must be inspected for the actual command result, source revision, and frozen state.

## Unresolved future decisions

License, public visibility, final AMO identity/publication, release/ESR and OS qualification, longer investigation lifetime, diagnostic collectors and overhead budgets, report export/history rules, and a concrete optional companion capability. These do not block the narrow Phase 0 proposal.
