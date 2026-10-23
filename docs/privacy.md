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

## Reports and companion

Export is a later feature. Before implementation, define redaction, preview, explicit save, retention, and treatment of URLs, query strings, DOM snippets, cookies, tokens, and extension IDs. A report must never be sent automatically.

The optional companion needs a separate disclosure of local process access and data crossing the native messaging boundary. Its installation must never become a prerequisite for basic inventory or capability explanations.

## References

- [Firefox browser-specific settings and data collection declaration](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)
- [Firefox built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
