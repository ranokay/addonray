# Checklist and resumption

## Current state

The approved Phase 0 scaffold is implemented. Git is initialized on `main`. All 26 unit tests, formatting, type checks, build, and manifest checks pass. Real Firefox 158.0.1 on macOS arm64 passed 12 observed checks with [explicit qualification gaps](evidence/2026-10-22-firefox.md). Signed commits and private publication are being completed. Firefox was downloaded to Selenium's test cache; the ordinary application/profile was not used.

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
- [ ] Initialize Git, make a signed initial commit, and create/push the approved private repository.
- [ ] Verify remote owner, visibility, pushed commit, and available CI results.

## Next action

Finish the local gates and approved private publication. Then perform the [native-popup check](evidence/2026-10-22-firefox.md#native-popup-check-still-required) in a disposable visible Firefox profile before claiming complete Phase 0 qualification. Test the intended minimum/ESR versions and additional operating systems before advertising support for them. Keep Phase 1 implementation behind a new scope decision.

## Unresolved future decisions

License, public visibility, final AMO identity/publication, release/ESR and OS qualification, longer investigation lifetime, diagnostic collectors and overhead budgets, report export/history rules, and a concrete optional companion capability. These do not block the narrow Phase 0 proposal.
