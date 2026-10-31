# Browser API limits

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

## Approved page-error observation

On 2026-10-24 the user approved a [bounded current-document check](plans/phase2-page-errors.md), with feasibility gates before product wiring. The two proposed counts are uncaught JavaScript error notifications and promise rejections that are unhandled when observed. Handled exceptions, console calls, resources/network failures, earlier console history, and other extensions' private errors are outside this mechanism. Visibility can be restricted, so zero observed notifications is not proof of an error-free page.

The [preliminary visibility fixtures](evidence/2026-10-24-page-error-api-research.md) observed both event kinds in Firefox's isolated world on the three pinned versions, and only in Chrome MAIN among its tested worlds. [ADR 0004](adr/0004-page-error-execution-worlds.md) records the accepted split. Chrome's page-side logic and results remain subject to page interference; it gains no extension-only APIs. The earlier isolated timing collector is unchanged. These host-granted fixtures do not qualify product consent, the toolbar bootstrap, or lifecycle control.

The approved count window is 30 seconds with a 200-event total cap. Check a monotonic deadline before incrementing; delayed timers must not silently lengthen the eligible window. Cleanup/delivery scheduling is distinct from that window. Injected code needs explicit stopping, not an assumption that permission loss removes it. Owner closure/revocation, source navigation/BFCache, and the actual production bounds remain required browser gates. Returned fields must be canonical counts, fixed completion reason and bounded elapsed duration, within 1 KiB, without reading event payload properties.

Primary API references are [Window error](https://developer.mozilla.org/en-US/docs/Web/API/Window/error_event), [unhandled rejection](https://developer.mozilla.org/en-US/docs/Web/API/Window/unhandledrejection_event), [execution worlds](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/ExecutionWorld), and [tabs.connect](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/connect). Their contracts do not replace the pending production qualification.

## Firefox restricted pages and world isolation

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

## Firefox inventory explanations

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

## Chrome MV3 continuation

Approved on 2026-10-23. The exact automated baseline is Chrome for Testing 156.0.8078.47; retail installation and native usability on each OS remain separately qualified. [Acceptance criteria](plans/chrome-mv3.md) and the [test-authority ADR](adr/0002-test-authority-and-browser-qualification.md) define the boundary.

| Question                      | Chrome contract and AddonRay behavior                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inventory and consent         | Optional `management` gates `getAll()`. Native permission wording covers extension controls as well as reading. AddonRay explains that broader authority before consent and only reads inventory.          |
| Global switching              | Chrome supports `management.setEnabled()` for ordinary extensions subject to its safeguards. AddonRay does not offer it. Only a separate disposable test controller exercises a controlled fixture.        |
| Disabled metadata             | Preserve the fields Chrome returns. Do not convert available permission arrays to unknown merely because Firefox omitted them in its observed disabled fixture.                                            |
| Selected page                 | Optional `scripting` plus a toolbar `activeTab` grant enables the minimal top-frame probe. No host grants enter the product manifest. Protected `chrome://` pages reject injection.                        |
| Site controls and attribution | AddonRay provides manual Chrome-settings guidance. Inventory does not prove execution on a page; there is no implemented cross-extension console or reliable resource/conflict attribution.                |
| Permission explanations       | Chrome `management` text distinguishes API authority from product policy. Chrome MV3 `webRequest` text distinguishes observation from blocking, which is generally limited to policy-installed extensions. |
| Builds and manifests          | Only Firefox/Chrome MV3 are accepted. Chrome omits Gecko settings; Firefox retains its existing minimum and local data declaration.                                                                        |

Chrome for Testing retains development extension loading used by the test driver. Retail Chrome removed the equivalent command-line loading switch starting at 137. Loading through a test-only DevTools command does not prove retail installation or store readiness. Safari lacks the inventory API needed by this design and would need a reduced-functionality proposal. Firefox MV2 is technically possible but deferred; Chrome MV2 is no longer a viable target. Edge requires its own qualification.

Primary sources for this continuation are [Chrome management](https://developer.chrome.com/docs/extensions/reference/api/management), [permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions), [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting), [webRequest](https://developer.chrome.com/docs/extensions/reference/api/webRequest), [Chrome's MV2 timeline](https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline), and [development-loading changes](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY/m/S0ET5wPjCAAJ).

## Phase 2 recorded load timings

Approved on 2026-10-23. The [timing slice](plans/phase2-timing.md) reads three already reported top-frame milestones through the existing isolated-world page probe. Navigation event-end values and first-contentful-paint timestamps are elapsed values from navigation start. Missing entries are unavailable at capture; event-end zero is unrecorded. A reported zero paint timestamp remains a valid value. Support for an entry type does not establish that the timeline currently contains an entry.

Whole navigation entries contain the page URL. Construct only approved milestone fields inside the injected collector and validate/copy its response before retention. No page-world bridge or additional permission is justified by this slice. Exact click-time document targeting is unavailable at the existing Firefox minimum; the selected tab is fixed while the document at execution supplies the result. SPA views and restored pages can expose original loading milestones. Timings do not identify extension impact or ongoing responsiveness.

Dirty feasibility probes on Firefox 140.0, 153.5.1esr, 158.0.1 and Chrome for Testing 156.0.8078.47 observed default isolated-world navigation/FCP values, native unrecorded load while a resource was held, missing FCP on an empty document, and protected-context rejection. A MAIN-world marker was visible only in its positive control. These host-granted disposable fixtures establish API visibility, not product consent, native UI, or clean packaged qualification. Authentic missing-navigation-entry behavior was not controlled and remains a deterministic test case. Qualification evidence must preserve that distinction.

Primary references are [navigation timing](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceNavigationTiming), [paint timing](https://developer.mozilla.org/en-US/docs/Web/API/PerformancePaintTiming), [current timeline reads](https://developer.mozilla.org/en-US/docs/Web/API/Performance/getEntriesByType), [scripting target compatibility](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/scripting.json), and [back/forward-cache measurement](https://web.dev/articles/bfcache#performance_measurement).

## Optional timing handoff

Approved on 2026-10-23. [The comparison plan](plans/phase2-timing-comparison.md) uses [Firefox getViews](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/extension/getViews) and [Chrome getViews](https://developer.chrome.com/docs/extensions/reference/api/extension#getViews) for own packaged documents. It does not require sensitive tab-metadata permission or a background service. Discovery returns metadata only, then the explicit transfer targets one live document/generation. Firefox cross-view references can become dead objects after owner closure; make retained copies in each receiving realm and bound stale access failures.

Scratch fixtures passed 11 checks on each pinned macOS browser with the product permission budget and an actual toolbar grant. They observed that a same-origin new-document reload removed access on Firefox 140.0, 153.5.1esr, and 158.0.1, while Chrome for Testing 156.0.8078.47 retained it. A fresh toolbar invocation restored access in each case. A retained source-tab ID cannot renew Firefox access. See [documented access lifetimes](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/activeTab_permission#when_access_is_revoked).

These candidate fixtures establish API feasibility, not production capture/select/confirm usability or private-window support. Attachments exclude private/incognito and unclassifiable contexts. `inIncognitoContext` alone does not classify every spanning-process extension view; the selected source tab and destination's own tab provide the needed flags. No page identity is inferred from their numeric tab IDs. Production integration, context exclusion, actual native use, and exact-head hosted evidence remain separate qualification gates.

## Page-error attachment boundary

The [approved comparison](plans/phase2-page-error-comparison.md) uses a distinct
own-check-tab sender. Own-view access does not create isolation between compromised
extension documents. A current unused completed check, normal contexts, current
permissions and an explicitly selected live investigation are required. Its
bounded action permit and synchronous reserved commit preserve one use after
lost acknowledgment. Existing popup-only timing sender checks remain unchanged.

Production source fixtures qualify the new handoff and shared timing/error tab
binding separately from native React interaction. Private/unknown classifications
remain simulated negative cases, with authentic-context gaps explicit in
[qualification](evidence/2026-10-26-phase2-page-error-comparison.md). No source-page
enumeration, broader permission, background owner or storage is added.

Firefox-isolated/Chrome-page-side collector limits still apply to copied counts.
Side-by-side durations/reasons do not establish equal interactions or conditions.
A numeric tab match does not identify the document, and attachment order does not
prove collection occurred after a particular inventory or manual change.

## Approved local report download

The [approved report slice](plans/phase3-report-export.md) constructs a local Blob
and requests its generic `.md` filename through an anchor's `download` attribute.
This adds no `downloads` permission or completion API. Browser settings control
prompting, saving and opening. Dispatching the click does not prove that the
browser accepted or finished the file.

Accepted Q12 requires keeping the owning investigation open until the browser
shows the download. Closing/reloading before acceptance may cancel the request;
accepted files can remain after clearing. The [candidate record](evidence/2026-10-27-report-export-feasibility.md)
preserves failed immediate-close cases separately from revised exact-byte checks
on the four pinned local browsers. It does not establish universal URL-revocation
or close/reload behavior. [Production evidence](evidence/2026-10-28-report-export.md)
separates built UI checks, native observations and clean delivery qualification.

Primary references are [anchor downloads](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a#download),
[Blob URLs](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static)
and [URL revocation](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static).

## Saved-data and exchange limits

Reviewed on 2026-10-30 for the approved [saved-data contract](plans/saved-investigation-data-rules.md) and the bounded #6 implementation. The Stage 1 candidate observations are recorded separately; they are not a full four-browser qualification pass.

| Area                     | Documented limit                                                                                                                                                                                                                                                                                                                    | Consequence                                                                                                                                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firefox permissions      | MDN's optional API permission list does not include `storage` or `unlimitedStorage`. Both appear in the required `permissions` API list.                                                                                                                                                                                            | A Firefox `storage.local` implementation would need a required permission. Optional `storage` is not established.                                                                                                                                                                                  |
| Chrome permissions       | Chrome allows most permissions as optional except a named list. `storage` is not in that exception list.                                                                                                                                                                                                                            | Optional `storage` is plausible in Chrome but does not create a cross-browser optional guarantee.                                                                                                                                                                                                  |
| `storage.local` quota    | Chrome documents 10 MB, or 5 MB in Chrome 113 and earlier. Firefox uses IndexedDB storage limits. `unlimitedStorage` can raise them but can still hit a global quota.                                                                                                                                                               | The approved 50-record, 5 MiB and 1 MiB bounds are product bounds, not browser quota promises.                                                                                                                                                                                                     |
| `storage.local` clearing | Chrome documents clearing when the extension is removed. Firefox documents clearing on uninstall, with `keepStorageOnUninstall` and related `about:config` exceptions. Chrome exposes `storage.local` to content scripts by default unless `setAccessLevel` restricts it.                                                           | Uninstall clearing is browser behavior, not a forensic-erasure guarantee. The chosen mechanism must keep records unreadable by content scripts or return for a decision.                                                                                                                           |
| IndexedDB                | Extension pages can use the Web IndexedDB API and do not use the `storage` permission. Firefox documents that `unlimitedStorage` lets an extension create a persistent IndexedDB database without the creation-time prompt; without it, persistence and prompting need observation. Quota, persistence and eviction vary by target. | The #6 mechanism is IndexedDB with no new permission. The Stage 1 candidate observed availability, exact bounds, transactional barriers and controlled loss handling on all four pins. Natural eviction, an actual Chrome quota error and verified Firefox post-clear emptiness remain unobserved. |
| Clipboard                | Firefox lists `clipboardWrite` as an optional API permission. Chrome optional permissions generally allow it. The exact write mechanism and permission need #11 feasibility.                                                                                                                                                        | No clipboard permission is approved by the saved-data contract.                                                                                                                                                                                                                                    |
| File import              | An explicit file input can read a user-selected file without a host permission. Validation and size limits are application responsibilities.                                                                                                                                                                                        | Import is untrusted text, not browser authority.                                                                                                                                                                                                                                                   |
| Print                    | The browser controls the print dialog and Save as PDF path. An extension cannot reliably observe dialog completion or cancellation.                                                                                                                                                                                                 | Report a print request or opened dialog, not a completed print.                                                                                                                                                                                                                                    |
| Download                 | The existing Markdown path uses an anchor download without the `downloads` permission. A request is not browser acceptance or file completion.                                                                                                                                                                                      | Keep the request-versus-acceptance boundary for every format.                                                                                                                                                                                                                                      |

The 5 MiB library bound is a product bound. It does not derive headroom from `storage.local`'s unrelated Chrome quota and does not promise IndexedDB headroom. The Stage 1 candidate measured the chosen mechanism on Firefox 140.0, 153.5.1esr, 158.0.1 and Chrome for Testing 156.0.8078.47, including exact capacity/refusal, controlled store loss, restart persistence, cross-view deletion and the reachable private popup guard. Natural eviction, the Chrome engine quota error, verified Firefox post-clear emptiness and a reachable Chrome private main-frame library route remain unqualified. The 50-record, 5 MiB and 1 MiB limits stay product bounds; no `storage` or `unlimitedStorage` permission is proposed.

The approved normal-window guard uses the existing current-tab classification and adds no permission. Private and unknown contexts fail closed for saved-data actions. The #6/#7 runtime has a local storage owner and read-only library with per-save 7/30/90-day retention, bulk deletion and confirmed delete-all, but no import path, printable HTML, clipboard action or collection permission. Delete-all clears the actual IndexedDB records store; it adds no browser API, permission or background task. No new permission, dependency or native messaging is approved.

## Primary Firefox references

- [management.getAll](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/management/getAll)
- [management.setEnabled](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/management/setEnabled)
- [Mozilla management implementation](https://github.com/mozilla-firefox/firefox/blob/main/toolkit/components/extensions/parent/ext-management.js)
- [scripting.executeScript](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/executeScript)
- [Content-script restrictions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts#permissions_restrictions_and_limitations)
- [Execution worlds](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/ExecutionWorld)
- [PerformanceObserver entry types](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver/supportedEntryTypes_static)
- [webRequest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest)

Saved-data references:

- [Firefox optional permissions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/optional_permissions)
- [Firefox API permissions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions)
- [Firefox storage.local](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/local)
- [Firefox IndexedDB use from extensions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Working_with_files)
- [Firefox clipboard](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Interact_with_the_clipboard)
- [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Chrome optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)
