# Phase 0 qualification continuation

## Headless release matrix

All runs used macOS arm64 and Selenium WebDriver 4.51.0 with disposable profiles. The 12-check protocol and its test-only permission boundaries are described in [the original Firefox evidence](2026-10-22-firefox.md).

| Requested release | Observed version | Result                                                                                                                                     |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Current release   | 158.0.1          | All 12 API checks pass on clean commit `664996d`. Native popup results are recorded below.                                                 |
| `153.5.1esr`      | 153.5.1          | All 12 API checks pass on clean commit `664996d`. Native ESR popup results are recorded below.                                             |
| `140.0`           | 140.0            | All 12 API checks pass on clean commit `664996d` after correcting temporary fixture installation. Native popup results are recorded below. |

Mozilla's [version metadata](https://product-details.mozilla.org/1.0/firefox_versions.json) named `158.0.1` and `153.5.1esr` as current release and ESR on 2026-10-22. Exact versions are selected and verified rather than following a moving browser label.

The first ESR and minimum trials used parent commit `abca489` with uncommitted probe changes. Their local reports explicitly record `sourceDirty: true`; they are iteration evidence. The final three runs used clean commit `664996db4ef87431280f359c53447649444ff543`. Each version-named report records `sourceDirty: false`, all 12 checks passed, and the local gate receipt records exit 0 with unchanged clean snapshots before and after the run.

| Requested version | Local receipt identifier        |
| ----------------- | ------------------------------- |
| `140.0`           | `20261022T054037Z-a7ae4d8e7e58` |
| `153.5.1esr`      | `20261022T054058Z-0a9a2fd341c1` |
| `158.0.1`         | `20261022T054136Z-5ee4ad840f32` |

The receipts are local files under the agent tools' gate directory. Raw version-named reports remain in ignored `.scratch/`. To repeat, use the commands in [testing](../testing.md) and inspect the report's revision and dirty flag.

### Firefox 140 fixture installation

The initial run timed out before completing any checks. Both the actual toolbar popup and a separate static MV3 fixture displayed empty documents. Firefox's parent process could read the fixture, while content navigation logged an invalid file descriptor.

The controlled diagnostic confirmed that the Base64 installation route had deleted its temporary XPI. Installing the same static content through the classic endpoint's `path` parameter kept its files available and loaded successfully. This matches [Mozilla bug 2045054](https://bugzilla.mozilla.org/show_bug.cgi?id=2045054) and the deletion in [Firefox 140's installer source](https://raw.githubusercontent.com/mozilla-firefox/firefox/FIREFOX_140_0_RELEASE/remote/shared/Addon.sys.mjs).

The shared test installer now uses retained local directories, and the Firefox 140.0 trial passes all 12 API checks with geckodriver 0.37.1 on macOS 27.2 arm64. Product code, its manifest, browser security settings, and the declared minimum remain unchanged. The initial failure is preserved in `.scratch/firefox-evidence-140.0-base64-failure.json`; the version-named report records the new result. These are unpacked-directory tests. Packaged XPI distribution remains a separate release check.

## Native toolbar popup on current release

Observed on 2026-10-22 using Firefox 158.0.1 on macOS arm64. The production artifact came from clean commit `abca489b3ea5d5f1f0800599cec931d34db3b3a2`. Selenium 4.51.0 created a visible disposable profile, installed AddonRay and one controlled fixture, and served a local HTTP page. Computer-use automation operated Firefox's actual toolbar popup and permission controls. No test-only host permission or browser-UI privilege was added to the product.

| Action                                                          | Observed result                                                                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open AddonRay from Firefox's extension menu                     | The actual toolbar popup opens with no results.                                                                                                                                 |
| Request inventory, then deny Firefox's prompt                   | The popup stays open, reports that access was declined, and shows no inventory.                                                                                                 |
| Request inventory again and approve                             | The popup stays open and displays AddonRay and the controlled fixture.                                                                                                          |
| Inspect the selected local page                                 | The product returns document readiness `complete` and supported performance entry types. Firefox shows no additional permission dialog for `scripting` in this case.            |
| Clear session                                                   | Both inventory and page results disappear.                                                                                                                                      |
| Populate inventory, close with Escape, then reopen              | The new popup session has no inventory or page results. A fresh inventory action succeeds with the retained grant and no new prompt.                                            |
| Revoke inventory access in Firefox's Permissions and data panel | Firefox shows the optional grant switched off. Reopening AddonRay starts empty, and the next inventory action shows a new consent prompt. Denying again leaves inventory empty. |
| Inspect `about:addons` through the actual popup                 | The product reports an invalid or unavailable probe result and displays no page observation.                                                                                    |

The revocation UI closes the popup before changing the grant. This check proves the reopened session and renewed consent behavior. The separate headless production-document test observes the live revocation event clearing an existing result. Neither result substitutes for the other.

The inventory prompt stayed open in the tested browser. The alternate case where Firefox closes a popup while consent is pending was not observed. Cancellation of late work has separate Bun behavior tests.

## Native toolbar popup on minimum and ESR

Observed on 2026-10-22 using Firefox 140.0 and Firefox 153.5.1esr on macOS 27.2 arm64. Both sessions used production artifacts from clean commit `664996db4ef87431280f359c53447649444ff543`, Selenium 4.51.0, the retained-directory installer, a disposable profile, one controlled fixture, and a local HTTP page. Computer-use automation operated the actual toolbar popup and Firefox permission controls. These are observed UI results, not an automated verdict from the launcher.

| Action                                                               | Firefox 140.0                                                                                                           | Firefox 153.5.1esr    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Open AddonRay from the extension menu                                | Empty popup renders.                                                                                                    | Empty popup renders.  |
| Deny inventory access                                                | Popup remains open during the prompt. Denial leaves no inventory.                                                       | Same observed result. |
| Retry and approve inventory access                                   | Displays AddonRay and the controlled fixture.                                                                           | Same observed result. |
| Inspect the selected local page                                      | Returns readiness `complete` and supported performance entry types without another browser permission dialog.           | Same observed result. |
| Clear session                                                        | Removes both inventory and page results.                                                                                | Same observed result. |
| Populate inventory, close with Escape, then reopen                   | Reopened popup has no results. A fresh inventory action uses the retained grant without another prompt.                 | Same observed result. |
| Revoke inventory access through Firefox's Permissions and data panel | Optional grant shows off. Reopened popup is empty. The next inventory action prompts again, and denial leaves it empty. | Same observed result. |
| Inspect `about:addons` through the actual popup                      | Reports an invalid or unavailable probe result without a page observation.                                              | Same observed result. |
| Finish the visible launcher with Enter                               | Owned browser and server close with exit 0.                                                                             | Same observed result. |

On ESR, some accessibility click actions did not activate a popup button. Keyboard navigation and Return activated the controls, and the resulting UI states above were verified. This observation does not establish a pointer-input defect. The checks used keyboard controls where needed.

Both inventory consent prompts left the popup open. Neither session exercised closure while consent was pending. Revocation through Firefox's settings closed the popup first, so live clearing in an open document remains evidence from the separate headless check. These sessions qualify unpacked local installation, not a packaged or signed XPI.

## Scope and repeatability

These results cover the named minimum, ESR, and current releases on macOS arm64. They do not establish Linux, Windows, enterprise-policy behavior, or packaged XPI distribution. Phase 1, AMO publication, and licensing remain separate decisions.

Run `mise run test-firefox-popup` in an interactive terminal to create another disposable visible profile. It defaults to the tested release, `158.0.1`; `FIREFOX_VERSION` can select another exact release. Follow the native-popup protocol in [testing](../testing.md), record observations, then press Enter in that terminal to close the owned browser and local server. The launcher does not produce a passing UI verdict automatically.
