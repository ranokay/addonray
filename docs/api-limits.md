# Firefox API limits

Research date: 2026-10-22. The table records documentation/source findings. [Firefox evidence](evidence/2026-10-22-firefox.md) and the [qualification continuation](evidence/2026-10-22-qualification.md) record observed minimum/release/ESR APIs and native-popup behavior on macOS arm64. Source on a moving main branch may differ from the installed release.

| Question                                            | Ordinary Firefox WebExtension capability                                                                                                           | Product consequence                                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Which extensions are installed?                     | `management.getAll()` requires `management` and returns metadata Firefox exposes. System components and some add-on types are filtered.            | Call it an inventory of exposed extensions.                                                        |
| What permissions does a disabled extension have?    | Permission fields can be missing when Firefox has no live extension object.                                                                        | Missing means unknown. Preserve the distinction from an empty list.                                |
| Did an extension execute on this page?              | Inventory and permission metadata do not supply that evidence.                                                                                     | Never label inventory entries as active on the page.                                               |
| Can AddonRay toggle other extensions globally?      | MDN documents `setEnabled` for themes and rejection for other extension types.                                                                     | Provide no ordinary extension switches.                                                            |
| Does enterprise policy change this?                 | Current Mozilla source has an exception for a caller required by enterprise policy.                                                                | A separate, unqualified deployment path. API presence and `mayDisable` do not establish authority. |
| Can AddonRay toggle another extension for one site? | Scripting and permission APIs govern the caller's own access and scripts. There is no general authority here over another extension's site access. | Guide the user through Firefox controls in a later comparison workflow.                            |
| Can it inspect a selected page?                     | `scripting.executeScript` needs `scripting` plus a host grant or `activeTab`. Restricted pages remain protected.                                   | Request access on a click and handle refusal normally.                                             |
| Can it tail every extension's console?              | Ordinary content scripts run in isolated worlds. This design has no global cross-extension console feed.                                           | Explain the visibility limit.                                                                      |
| Can it identify CPU/memory/conflict ownership?      | This design has no reliable per-extension attribution API. Page measurements have multiple possible causes.                                        | Report observations and controlled comparisons with uncertainty.                                   |
| Can it inspect network failures?                    | `webRequest` needs relevant permissions and host access. Errors do not reliably identify a blocking extension.                                     | Defer collection and avoid culprit claims.                                                         |
| Can a Rust companion bypass these limits?           | Native messaging supplies a local message channel.                                                                                                 | Qualify each additional mechanism separately.                                                      |

## Restricted pages and world isolation

Expect injection to fail on browser UI, other extensions' pages, restricted Mozilla domains, reader view, and built-in PDF viewer contexts. Protocol checks can reject obvious cases, but Firefox's actual response is authoritative because restricted hosts and settings can vary.

The real probe on `about:addons` returned no usable frame result; AMO rejected the API promise. Both pages lacked the test injection marker. Treat both promise rejection and unusable results as failed access. The product adapter validates the returned observation before publishing it.

Use the default isolated world in Phase 0. `MAIN` is separately available in newer Firefox versions but shares the page's environment and exposes instrumentation to interference. It is not a route into other extensions' private state.

Performance APIs differ by browser and version. Feature-detect supported entry types. Do not promise Chrome-only metrics or infer that a supported entry type identifies an extension.

## Feasibility probes

- Request optional inventory access, including denial and revocation.
- Compare controlled enabled and disabled fixture metadata.
- Inject the minimal probe into a local HTTP fixture after explicit access.
- Observe expected rejection in restricted contexts.
- Verify ordinary extension toggling rejection only against a disposable fixture in a disposable profile. Product code never attempts it.
- Record untested cases explicitly rather than inferring them from mocks.

## Inventory explanations

Reviewed on 2026-10-23 for the first Phase 1 slice. Explanations describe reported permission identifiers, not observed extension activity or a safety score. Unknown identifiers remain visible with an unavailable-explanation message. Missing metadata remains distinct from an empty list.

| Identifier   | Explanation boundary                                                                              | Primary reference                                                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`  | Temporary access after an extension interaction, subject to browser restrictions.                 | [activeTab](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions#activetab_permission)                                                                                         |
| `management` | Access to exposed add-on information does not grant ordinary cross-extension switching.           | [management](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/management), [setEnabled limits](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/management/setEnabled) |
| `scripting`  | Scripts/styles require access to the target page in addition to this permission.                  | [scripting](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting)                                                                                                                          |
| `storage`    | Extension storage access does not disclose the data stored.                                       | [storage](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage)                                                                                                                              |
| `tabs`       | Additional tab metadata, including URLs and titles, does not establish which tabs were inspected. | [API permissions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions#api_permissions)                                                                                        |
| `webRequest` | Request observation needs host access. Blocking/modification needs additional authority.          | [webRequest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest)                                                                                                                        |

Host patterns stay plain escaped text. They describe reported scope, not evidence of execution or a promise that Firefox allows every matching page. AddonRay does not visit these patterns or request their host access.

## Primary references

- [management.getAll](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/management/getAll)
- [management.setEnabled](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/management/setEnabled)
- [Mozilla management implementation](https://github.com/mozilla-firefox/firefox/blob/main/toolkit/components/extensions/parent/ext-management.js)
- [scripting.executeScript](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/executeScript)
- [Content-script restrictions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts#permissions_restrictions_and_limitations)
- [Execution worlds](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/ExecutionWorld)
- [PerformanceObserver entry types](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver/supportedEntryTypes_static)
- [webRequest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest)
