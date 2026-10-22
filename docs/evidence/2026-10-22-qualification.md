# Phase 0 qualification continuation

## Headless release matrix

All runs used macOS arm64 and Selenium WebDriver 4.51.0 with disposable profiles. The 12-check protocol and its test-only permission boundaries are described in [the original Firefox evidence](2026-10-22-firefox.md).

| Requested release | Observed version | Result                                                                                                                                          |
| ----------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Current release   | 158.0.1          | All 12 API checks pass on clean migration commit `abca489`. Native popup results are recorded below.                                            |
| `153.5.1esr`      | 153.5.1          | All 12 API checks pass. Native ESR popup behavior remains untested.                                                                             |
| `140.0`           | 140.0            | Zero checks complete. Navigation to the installed extension document times out after 30 seconds. Minimum-version qualification remains blocked. |

Mozilla's [version metadata](https://product-details.mozilla.org/1.0/firefox_versions.json) named `158.0.1` and `153.5.1esr` as current release and ESR on 2026-10-22. Exact versions are selected and verified rather than following a moving browser label.

The first ESR and minimum trials used parent commit `abca489` with uncommitted probe changes. Their local reports explicitly record `sourceDirty: true`; they are iteration evidence. For a clean committed rerun, use the commands in [testing](../testing.md) and inspect the report's source revision and dirty flag before calling it revision-bound evidence.

### Firefox 140 blocker

In a focused diagnostic, Firefox 140 successfully navigated to a simple `data:` page and registered the temporary production extension. Navigation to its `moz-extension:` page timed out and left an empty HTML document. Copying the unchanged artifact into the operating system's temporary directory produced the same result. A separate minimal MV3 fixture containing only a manifest and static HTML also timed out with an empty document. That fixture has no AddonRay JavaScript, dependencies, or permission declarations.

These observations isolate the failure from AddonRay's application code but do not establish its underlying browser/driver cause. No product compatibility fix or minimum-version change follows from them. The next minimum-version investigation should compare a real toolbar launch with this direct-document WebDriver navigation, using the same Firefox 140 binary and a disposable profile. Preserve the failed full-run report in `.scratch/firefox-evidence-140.0.json` until the blocker is resolved.

## Native toolbar popup

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

## Scope and repeatability

These are observed UI results on one release and operating system. They do not establish native-popup behavior on ESR, the manifest minimum, Linux, or Windows. Other platform support and enterprise policy remain qualification work. Phase 1, AMO publication, and licensing remain separate decisions.

Run `mise run test-firefox-popup` in an interactive terminal to create another disposable visible profile. It defaults to the tested release, `158.0.1`; `FIREFOX_VERSION` can select another exact release. Follow the native-popup protocol in [testing](../testing.md), record observations, then press Enter in that terminal to close the owned browser and local server. The launcher does not produce a passing UI verdict automatically.
