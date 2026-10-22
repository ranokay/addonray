# Privacy and permissions

Approved on 2026-10-22: no telemetry, no cloud service, session-only diagnostics, and explicit consent before inventory or selected-page inspection.

## Phase 0 and first Phase 1 slice data lifecycle

| Data                                                                 | Trigger                                             | Retention                        | Destination                 |
| -------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------- | --------------------------- |
| Extension names, IDs, versions, states, available permission strings | Inventory click and optional permission approval    | Visible popup session only       | React memory                |
| Document readiness and supported performance entry types             | Inspect-page click and optional permission approval | Visible popup session only       | React memory                |
| Capability outcomes                                                  | Related action or documented capability explanation | Visible popup session only       | React memory                |
| Optional permission grant                                            | Firefox permission prompt                           | Managed by Firefox until revoked | Browser permission settings |

No diagnostic data enters local storage, sync storage, logs, analytics, or a remote endpoint. The extension does not read page URLs or DOM content for the Phase 0 report. Clear removes results immediately. Closing the popup destroys its session. A retained browser permission does not imply retained diagnostic data.

Revocation clears affected results. Clear and revocation invalidate in-flight actions so late responses cannot restore discarded data. Denial must leave the interface usable.

The first inventory slice keeps search text, state filters, and expanded details in the same popup's memory. Display filtering makes no browser calls. Refreshing inventory discards these controls and their state before loading the new result. The default dark theme is static and adds no stored preference.

## Manifest budget

- `activeTab` supports a temporary selected-tab grant after the user opens the extension.
- Optional `management` supports inventory only after an inventory action.
- Optional `scripting` supports the minimal selected-page probe only after an inspect action.
- No broad host access, network observer, persistent storage, or native messaging in Phase 0.
- Declare Firefox data collection permission `none` for the local-only initial scope. Reassess that declaration before any export, native transmission, or new integration.

## Reports and companion

Export is a later feature. Before implementation, define redaction, preview, explicit save, retention, and treatment of URLs, query strings, DOM snippets, cookies, tokens, and extension IDs. A report must never be sent automatically.

The optional companion needs a separate disclosure of local process access and data crossing the native messaging boundary. Its installation must never become a prerequisite for basic inventory or capability explanations.

## References

- [Firefox browser-specific settings and data collection declaration](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)
- [Firefox built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
