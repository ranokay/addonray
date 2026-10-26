# Privacy and permissions

Approved on 2026-10-22: no telemetry, no cloud service, session-only diagnostics, and explicit consent before inventory or selected-page inspection.

## Phase 0 and first Phase 1 slice data lifecycle

| Data                                                                 | Trigger                                             | Retention                            | Destination                 |
| -------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------ | --------------------------- |
| Extension names, IDs, versions, states, available permission strings | Inventory click and optional permission approval    | Visible popup session only           | React memory                |
| Document readiness and supported performance entry types             | Inspect-page click and optional permission approval | Visible popup session only           | React memory                |
| Capability outcomes                                                  | Related action or documented capability explanation | Visible popup session only           | React memory                |
| Optional permission grant                                            | Browser permission prompt                           | Managed by the browser until revoked | Browser permission settings |

No diagnostic data enters local storage, sync storage, logs, analytics, or a remote endpoint. The extension does not read page URLs or DOM content for the Phase 0 report. Clear removes results immediately. Closing the popup destroys its session. A retained browser permission does not imply retained diagnostic data.

Revocation clears affected results. Clear and revocation invalidate in-flight actions so late responses cannot restore discarded data. Denial must leave the interface usable.

The first inventory slice keeps search text, state filters, and expanded details in the same popup's memory. Display filtering makes no browser calls. Refreshing inventory discards these controls and their state before loading the new result. The default dark theme is static and adds no stored preference.

## Manifest budget

- `activeTab` supports a temporary selected-tab grant after the user opens the extension.
- Optional `management` supports inventory only after an inventory action.
- Optional `scripting` supports the minimal selected-page probe only after an inspect action.
- No broad host access, network observer, persistent storage, or native messaging in Phase 0.
- Declare Firefox data collection permission `none` for the local-only initial scope. Reassess that declaration before any export, native transmission, or new integration.

## Chrome permission disclosure

Chrome's `management` permission includes API authority to change other extensions, even though AddonRay uses it only for inventory. The Chrome popup explains this before requesting consent. AddonRay's product API boundary contains no extension-state mutation methods. Firefox's ordinary switching restriction must not be presented as a Chrome API restriction.

Both builds retain the same required/optional permission budget, explicit actions, popup-only memory, and minimal page result. Chrome omits the Firefox-only data declaration. Test controllers with extra permissions and the pre-granted UI copy are disposable fixtures outside both product archives. They do not establish that a user approved an optional permission.

## Manual comparison data lifecycle

The user approved the one-pair manual comparison on 2026-10-23. A deliberate New investigation action opens a fresh independent tab without reading inventory or page data. Each capture requests optional management access from its own click. The comparison retains only extension ID, name, version, and enabled state from the resulting inventory; permission/host metadata is discarded before it enters the comparison state.

Before/After snapshots and the explicit Better/Unchanged/Worse/Uncertain assessment live only in that investigation document's memory. Switching to settings or the page does not end a loaded document. Start over, relevant management revocation, close, reload, browser unloading/restart, or an extension/process reload removes its data. Pending work cannot restore it. There is no recovery or saved comparison history.

The popup remains separate. Clear popup results affects only popup data; Start over affects only its investigation. A browser-wide permission revocation can clear every affected view through each view's own listener. No results transfer between views. No background process, messaging handoff, storage, page identifier, free text, automatic page access, or new manifest permission is added. The page assessment records the user's judgment and makes no browser call.

## Phase 2 timing data lifecycle

The approved [timing snapshot](plans/phase2-timing.md) extends only the deliberate selected-page action. The injected collector constructs three fixed milestone results before returning to the extension. It reads only DOMContentLoaded event end, load event end, and the named first-contentful-paint timestamp. Numeric values describe elapsed time since navigation, accompanied by fixed measured/unrecorded/unavailable statuses. The added timing block cannot exceed 1 KiB.

Never return a whole performance entry: a navigation entry contains the page URL. No entry name, resource list, server timing, request details, page content, absolute time origin, URL, title, or free-form page data enters the extension through this change. Validate the response and copy only canonical fields into popup memory. The selected tab stays bound across consent; a navigation can change the document read or remove access. No page identity or navigation history is collected to resolve that change.

No observer or recorder remains on the page. Clear, popup close, and either existing optional-permission revocation remove popup results and invalidate pending actions. A later explicit page capture replaces the prior result; duplicate actions while busy remain ignored. Investigation tabs retain their independent inventory-only contract. No permission, host access, background process, storage, telemetry, cloud service, export, or result transfer is added.

## Optional timing attachments

The user approved the [timing comparison](plans/phase2-timing-comparison.md) on 2026-10-23. This explicitly extends the earlier popup-only timing contract. A separate Attach timing action discovers only eligible own investigation views, with synthetic labels and opaque document/generation identities. It does not enumerate browsing tabs, read investigations' observations, or broadcast a timing payload. The user chooses both destination and side and confirms transfer.

The destination retains its own canonical copy of only the three milestone results and a numeric source-tab ID. This ID binds After to the same browser tab; it does not verify page identity. No URL, title, content, readiness/support list, absolute time origin, or free-form page data is attached. Protocol IDs and selections remain in visible-document memory and never enter extension URLs, storage, history, logs, or remote services.

Only verified normal-window senders and destinations participate. Private/incognito and unclassifiable contexts cannot list, send, or receive attachments. Context checks use the existing selected tab's incognito flag and the investigation's own current-tab classification; ambiguous classifications fail closed. This does not add private-window feature qualification.

Before timing precedes starting After inventory capture. Each side is fixed until Start over. A successful attachment survives popup close/Clear because the investigation owns an independent copy. Start over, either management/scripting revocation, destination close/reload/unloading, or teardown discards the entire investigation and its source ID. Pending work cannot repopulate it. Ordinary timing failure preserves valid destination observations. One popup capture can be attached successfully once.

## Approved page-error check boundary

The [page-error check](plans/phase2-page-errors.md) was approved on 2026-10-24 with feasibility gates before product wiring. Its visible check tab owns only the original source's numeric tab ID, attempt identity/generation, current status, and one final summary of two event-kind counts, total, fixed completion reason, and bounded elapsed duration. No identifier enters its URL. Opening the check collects no events; Start requests optional scripting access explicitly. Existing permission grants remain separate from diagnostic retention.

Never read or serialize event message/error/reason/filename/stack/target properties, raw event objects, page content, URLs/titles, or absolute timestamps. Keep no per-event list or timeline. The observer counts only notifications received during the eligible current-document window, with a 200-event total cap and 1 KiB summary bound. Results appear after confirmed completion or Stop. Interrupted/unavailable is distinct from an observed zero.

Clear/Start over, either optional-permission revocation, and owner teardown discard results and invalidate pending work. Source navigation/closure ends observation without moving to a replacement document. A Stop action is different from discard and may retain confirmed partial counts. Owner-close/revocation cleanup must use an established control connection and pass feasibility, because access loss is not proof that injected code was removed.

Firefox observation remains isolated. Chrome's new observer shares the page execution environment and its results can be suppressed or altered by that page. It receives no extension-only API authority. Page-visible control data cannot authorize browser actions; validate fixed count/status results and keep extension control in its isolated/visible owners. This boundary does not claim hostile-page tamper-proof observation or create a cross-extension console feed. Normal-window classification remains mandatory. The existing inventory and timing lifetimes continue independently.

## Selected page-error attachment design

The [approved comparison plan](plans/phase2-page-error-comparison.md) would explicitly
extend the current check-only retention contract. After selected and confirmed
transfer, the investigation would own a canonical copy of counts, duration and
completion reason, plus its shared numeric source-tab binding. Donor Clear/reset
or closure would not retract that accepted copy. Investigation reset, either
optional-permission revocation, and destination teardown would discard it with
all other investigation data.

Each completed check would attach successfully once, with discovery limited to
normal own-view metadata. No raw event details, URL/title, page content, absolute
time, storage, broadcast payload or extra permission is proposed. Timing and
error attachments would share one source tab without claiming the same page or
conditions. The user approved this retention boundary in Q9. New transport/lifetime
feasibility and implementation remain required; this is not current product
behavior.

## Reports and companion

Export is a later feature. Before implementation, define redaction, preview, explicit save, retention, and treatment of URLs, query strings, DOM snippets, cookies, tokens, and extension IDs. A report must never be sent automatically.

The optional companion needs a separate disclosure of local process access and data crossing the native messaging boundary. Its installation must never become a prerequisite for basic inventory or capability explanations.

## References

- [Firefox browser-specific settings and data collection declaration](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)
- [Firefox built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
