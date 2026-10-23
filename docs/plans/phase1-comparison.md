# Phase 1 manual comparison

Status: the user approved these acceptance criteria and authorized implementation, testing, independent review, and signed private delivery on 2026-10-23. [The interview record](../decisions.md#manual-comparison-interview) captures the four design decisions and final shared-understanding confirmation. Implementation is in progress.

## Problem and result

The popup loses its inventory when the user leaves to change an extension's settings. A user cannot retain a Before observation while testing a manual change. This slice adds an independent investigation tab with one Before/After inventory pair and a page assessment supplied by the user.

The user changes settings through the browser or the other extension's controls and retests the page manually. AddonRay reports which exposed extensions were added, removed, enabled, or disabled between its captures. It does not change extensions, reload the page, verify which page was tested, measure performance, or identify a culprit.

## User flow

1. Choose New investigation in the popup. A fresh browser tab explains its temporary lifetime and starts empty. Existing investigation tabs remain independent; popup results are not transferred.
2. Choose Capture before. Explain and request optional inventory permission from that click, then capture only after approval. Display the captured inventory count and an expandable list of extension names, IDs, versions, and enabled states.
3. Guide the user to retest the same page, make a deliberate manual change through browser controls, and retest it. The user returns to the existing investigation tab. No collection runs during that interval.
4. Choose Capture after. Capture the second inventory through the same consent boundary and display the reported state changes alongside both snapshots.
5. Choose Better, Unchanged, Worse, or Uncertain as the page assessment. Label it as the user's assessment. No choice is selected automatically.
6. Choose Start over for another comparison. Discard the pair, assessment, errors, and pending work. Closing or reloading the tab also loses them. Browser unloading, restart, or an extension/process reload can lose this memory too.

## Acceptance criteria

| ID     | Required behavior                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1B-01 | New investigation opens a fresh extension-owned tab from an explicit popup action. Opening either interface collects no inventory or page data. A launch failure produces a bounded explanation. No `tabs` permission, background process, host grant, storage permission, or externally accessible page is added.                                                                                                     |
| P1B-02 | Every investigation owns its own temporary state. The popup and other investigation tabs neither inherit nor clear its results. Switching to browser settings or the page preserves an investigation while its document remains loaded. UI copy explains that close, reload, or unloading loses the data.                                                                                                              |
| P1B-03 | Capture before requests optional `management` directly in its click handler and calls inventory only after consent. Denied, unavailable, empty, and failed results stay distinct. A valid empty inventory counts as a successful snapshot. Repeated clicks while a capture is pending cannot start another capture.                                                                                                    |
| P1B-04 | Capture after is available only after a successful Before capture. An ordinary After failure preserves the valid Before snapshot and allows retry. The completed pair remains fixed until Start over; comparison history and recapturing successful snapshots are outside this slice.                                                                                                                                  |
| P1B-05 | Match identities by exact extension ID. Show added and removed entries, plus enabled/disabled transitions for identities present in both snapshots. Name changes do not become add/remove events. Do not infer page activity, site-access changes, or causes. A zero-delta message says no reported additions/removals/enabled-state changes; it does not claim all browser conditions were unchanged.                 |
| P1B-06 | Minimize retained snapshot entries to the displayed ID, name, version, and enabled state. Permission/host metadata is not retained by the comparison owner or diffed. Existing popup permission explanations remain available. Display snapshot values as text without loading icons, sites, or extension links.                                                                                                       |
| P1B-07 | After both captures succeed, the user can select or change the page assessment. It makes no browser calls. Leave it unset until an explicit selection. Do not add free-text notes, page identifiers, automatic page matching, timings, or a safety/culprit score.                                                                                                                                                      |
| P1B-08 | Start over invalidates pending work and erases both snapshots and assessment immediately. Relevant optional-permission revocation clears that investigation and cancels late results, matching the popup's current privacy behavior. Revocation can affect all open views, each through its own listener. No data returns from a cancelled capture.                                                                    |
| P1B-09 | Preserve the popup's inventory, page probe, dark theme, and capability explanations. Clarify that its Clear action affects popup results. Its page probe stays popup-only; the investigation reads no source-tab identity, URL, title, DOM content, or page measurements.                                                                                                                                              |
| P1B-10 | The investigation uses the current black palette with a readable full-tab layout. Persistent labels, keyboard-operable controls, visible focus, concise result announcements, and distinct empty/denied/error states remain available. Untrusted extension metadata is escaped. No saved theme preference is introduced.                                                                                               |
| P1B-11 | Firefox MV3 and Chrome MV3 manifests keep the approved permission budget and target restrictions. Validate both packages/source allowlists, reproduce each target's packaged contents from its source ZIP, and keep fixtures/test authority outside the artifacts.                                                                                                                                                     |
| P1B-12 | Behavior tests cover identity/state differences, empty snapshots, renamed/version-only changes, consent denial, failures, duplicate actions, independence, Start over, revocation, close/reload, and late completions. Real browser checks exercise the new production route and launch action, both snapshots, controlled fixture transitions, and switching/reload behavior.                                         |
| P1B-13 | Observe native inventory consent and keyboard/lifetime behavior in the actual investigation tab on the available macOS Firefox/Chrome for Testing environments. Extend the existing hosted Firefox/Chrome matrix and inspect source, artifact, actual versions, results, and cleanup. Record gaps, including native Linux/Windows and retail/store distribution. Existing popup evidence does not qualify the new tab. |

## Implementation boundaries

Use a WXT unlisted investigation page with the existing React, TypeScript, browser context, and CSS conventions. A popup click can create an extension-owned tab without the sensitive-metadata `tabs` permission. This is a browser integration that needs actual probes, even though the manifest budget does not expand.

Reuse `loadInventory` for its consent, bounded errors, sorting, and extension-only normalization. A comparison-specific state owner holds the Before/After observations and assessment instead of overwriting the popup session's single inventory slot. Normalize each successful result to the smaller displayed snapshot fields. Keep the state transition/cancellation boundary and pure inventory-difference logic separate from React rendering.

A new document always starts empty. There is no background coordinator, messaging handoff, single-instance lookup, durable history, or restored state. Browser permission grants remain independent of the retained observations. Starting a fresh investigation or changing a display control is never permission to collect automatically.

## Verification and delivery

- Write focused behavior tests for the new domain/state behavior and rendered user-visible contract. Avoid tests that merely repeat implementation details.
- Run the shared gate and source rebuilds for both targets. Use receipt tooling for revision-bound checks; dirty iteration is separate from clean committed evidence.
- Extend controlled browser tests without weakening the test-authority distinction. Chrome pre-granted fixtures cannot count as native optional-management consent. Product code never mutates another extension; only test controllers or browser-UI fixtures may change a disposable fixture.
- Review permission/data boundaries, state independence, comparison wording, and evidence integrity independently. Fix material findings before claiming completion.
- Deliver signed commits to private `ranokay/addonray`, preserve unrelated work and the prototype branch, record dated evidence, and update the resumption checklist. No tracker issue, label, public release, license decision, or store publication is requested.

## Stop condition

Stop after this one-pair manual comparison is implemented, reviewed, and qualified for the recorded environments, with gaps visible. Measured page diagnostics, causal attribution, comparison history, export, saved notes, browser-target expansion, automated state changes, and the Rust companion remain outside this slice.

## Primary findings

Read-only feasibility research establishes a supported route; observed integration still needs fresh evidence.

- [WXT unlisted pages](https://wxt.dev/guide/essentials/entrypoints#unlisted-pages).
- [Chrome tabs permission boundary](https://developer.chrome.com/docs/extensions/reference/api/tabs#permissions) and [Firefox tabs permission boundary](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs).
- [Firefox permission requests from a user action](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions/request) and [Chrome optional-permission requests](https://developer.chrome.com/docs/extensions/reference/api/permissions#step-3-request-optional-permissions).
