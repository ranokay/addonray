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

## Repeatable developer checks

`mise run check` runs the shared hk gate with native Bun formatting, linting, type checking and behavior tests, followed by both Firefox/Chrome packaging, manifest/archive validation, and jactionlint workflow checks. `mise run test-firefox` rebuilds and runs the real-browser probes. See [toolchain setup](toolchain.md) for the pinned canary and lockfile. Browser downloads stay in Selenium's cache, while raw local evidence stays in ignored `.scratch/`.

CI runs the deterministic gate and separate Linux/Windows Firefox and Chrome matrices. Browser probes must fail visibly or report an explicit skip when no browser is available. They must not silently pass on mocks.

The browser task reports `passed-with-qualification-gaps` when its observed checks pass but broader qualification remains. That is not a completed Phase 0 release gate. See [the dated evidence](evidence/2026-10-22-firefox.md) and [status](status.md) before deciding readiness.
