# Testing and API evidence

## Evidence levels

| Evidence                       | What it proves                                                    | What it does not prove                      |
| ------------------------------ | ----------------------------------------------------------------- | ------------------------------------------- |
| Documentation/source research  | A documented contract or source behavior at the cited revision    | Installed Firefox behavior                  |
| Bun tests with browser fakes   | AddonRay's handling of success, denial, partial data, and failure | Browser permission prompts or API authority |
| Type checking and build        | Type consistency and an extension artifact                        | Runtime support                             |
| Manifest/package checks        | Permission budget, MV3 target, local packaging constraints        | Usability or actual consent                 |
| Disposable-profile Firefox run | Observed cases on the named browser/OS                            | Every Firefox release, ESR, or OS           |

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

## Repeatable developer checks

`mise run check` runs the shared hk gate with native Bun formatting, linting, type checking and behavior tests, followed by build, manifest validation, and jactionlint workflow checks. `mise run test-firefox` rebuilds and runs the real-browser probes. See [toolchain setup](toolchain.md) for the pinned canary and lockfile. Browser downloads stay in Selenium's cache, while raw local evidence stays in ignored `.scratch/`.

CI initially runs deterministic checks. Browser probes must fail visibly or report an explicit skip when no browser is available. They must not silently pass on mocks.

The browser task reports `passed-with-qualification-gaps` when its observed checks pass but broader qualification remains. That is not a completed Phase 0 release gate. See [the dated evidence](evidence/2026-10-22-firefox.md) and [status](status.md) before deciding readiness.
