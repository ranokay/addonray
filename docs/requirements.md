# Product requirements

Status: Phase 0 scope approved on 2026-10-22 and scaffold implemented. The user approved the [first Phase 1 slice](plans/phase1-inventory.md), layout A with a dark/black default theme, on 2026-10-23. See [decisions](decisions.md) and [observed evidence and gaps](evidence/2026-10-22-firefox.md).

## User stories

1. As a Firefox or Chrome user, I want to see which extensions the selected browser exposes so I can start investigating a problem.
2. As a privacy-conscious user, I want an explanation before granting inventory access so I can decline without breaking the rest of the tool.
3. As a user, I want enabled state and missing permission metadata represented accurately so I do not mistake missing data for no access.
4. As a user, I want to inspect the selected page only after a deliberate action so the tool does not monitor my browsing.
5. As a user, I want to know when the browser prevents inspection so a browser restriction is not presented as a broken extension.
6. As a user, I want observations distinguished from suspicions so I do not blame an unrelated extension.
7. As a user, I want to clear the visible session immediately so diagnostic details do not linger.
8. As a contributor, I want repeatable probes and evidence records so I can verify browser support independently.
9. In a later phase, as a user, I want a guided comparison while I change extension settings through the browser so I can reproduce a difference.
10. In a later phase, as a user, I want to review a minimized report before exporting it so sharing remains my choice.

## Phase 0 acceptance

| ID    | Observable behavior                                                                                                                                                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-01 | A Firefox MV3 build opens a React interface without collecting inventory or page data on load.                                                                                                                                               |
| P0-02 | The inventory action explains and requests optional `management` access from a user gesture. Denial produces a clear result and no inventory call.                                                                                           |
| P0-03 | The inventory lists extension identity, name, version, enabled state, and permission metadata when Firefox supplies it. Missing permission fields are shown as unknown. Themes are outside this inventory.                                   |
| P0-04 | A separate page action requests optional `scripting` access and uses `activeTab` for the tab selected at the click. Start capturing the tab before waiting for consent and never retarget after the prompt. The top frame only is inspected. |
| P0-05 | The page probe returns only document readiness and supported performance entry types. It collects no URL, title, DOM content, resource list, request headers, or page errors.                                                                |
| P0-06 | Restricted pages, closed tabs, denied permissions, absent APIs, malformed results, and other failures become bounded explanatory results.                                                                                                    |
| P0-07 | Capability explanations explicitly mark global toggling, per-site control of other extensions, and cross-extension console/performance attribution as unsupported for the ordinary distribution.                                             |
| P0-08 | Closing the interface or clearing the session discards diagnostic results. Reopening starts empty even if Firefox remembers a previously granted optional permission.                                                                        |
| P0-09 | Tests exercise consent, partial inventory metadata, capability gating, invalid page responses, and permission revocation. Build checks enforce the intended permission budget.                                                               |
| P0-10 | A disposable Firefox profile runs real probes. Evidence names the browser version, OS, probe, expected/observed behavior, and qualification gaps. Simulated tests never stand in for these results.                                          |

## Approved browser continuation

On 2026-10-23 the user approved [Chrome MV3 compatibility](plans/chrome-mv3.md) before comparison planning. Firefox MV3 remains the baseline. Chrome starts at major 156, with exact Chrome for Testing 156.0.8078.47 as the repeatable qualification target. Edge, Safari, mobile, and all MV2 builds remain deferred. Qualification records distinguish distribution, version, OS, test authority, and native usability.

Chrome permits extension-management actions that ordinary Firefox extensions cannot perform. AddonRay still offers inspection only. The capability explanation must describe this as a product choice on Chrome. The Phase 0 table records the original Firefox contract; the Chrome continuation supplies the target-specific contract.

## Later product behavior

The approved first Phase 1 slice adds inventory search/filtering, permission explanations, manual Firefox-controls guidance, and accessible empty/error states. Its acceptance criteria are [P1A-01 through P1A-09](plans/phase1-inventory.md). The popup remains the quick-inspection session boundary. The separately approved investigation tab supplies the manual comparison lifetime described below. Phase 2 considers bounded page diagnostics with separate consent and explicit feature support. Export requires preview and minimization rules. No later phase begins automatically because a capability appears possible.

## Approved manual comparison slice

On 2026-10-23 the user approved [P1B-01 through P1B-13](plans/phase1-comparison.md). Each fresh investigation tab holds one fixed Before/After inventory pair and a user-selected page assessment. Explicit captures report added, removed, enabled, and disabled extensions; no automatic state changes or measured page diagnostics are introduced. The independent document retains memory only while loaded and loses it on Start over, relevant revocation, close, reload, or unloading. The existing popup remains separate. This approval includes implementation, tests, independent review, and signed delivery to the existing private repository.

## Approved Phase 2 timing slice

On 2026-10-23 the user approved [P2A-01 through P2A-13](plans/phase2-timing.md), including implementation, tests, independent review, and signed private delivery. The existing page action gains three recorded top-frame loading milestones: DOMContentLoaded handler completion, load handler completion, and first contentful paint when reported. Values are elapsed milliseconds from navigation start, with unavailable and unrecorded states. The original selected tab is bound at the click; its document at execution supplies the result if access is still permitted.

This is a one-shot popup snapshot with the existing permission and memory budget. It never reloads, observes subsequent events, records interaction responsiveness, transfers results to investigations, or attributes a delay to an extension. The new timing block is bounded to 1 KiB. Qualification requires isolated-world feasibility and a measured 5 ms p95 synchronous collector budget on controlled fixtures, separately from browser injection latency and with clock precision recorded.

## Approved optional timing comparison

On 2026-10-23 the user approved [P2B-01 through P2B-16](plans/phase2-timing-comparison.md), including implementation, tests, independent review, and signed private delivery. A deliberate popup page capture may be explicitly attached to one chosen investigation and side. Inventory captures stay separate and optional timings never imply synchronized conditions.

Before timing must be attached before starting the After inventory capture. Both timing slots stay fixed until Start over; After timing requires the same numeric browser-tab ID. Its URL/title are never collected, and a tab match does not verify the page or document. Display Before, After, and signed millisecond differences only for measured pairs. Either optional-permission revocation resets the whole investigation. Successfully attached values belong to that investigation, independently of popup clearing/closure.

Attachments are limited to verified normal-window views. Private/incognito and unclassifiable contexts fail closed without disabling existing local inspection. No permission, host grant, background process, storage, automatic reload, page monitor, percentage score, or culprit verdict is added. The earlier popup-only and inventory-only tables describe their original slice contracts; this approved extension supplies the deliberate transfer boundary.

## Approved current-document page-error check

On 2026-10-24 the user approved [P2C-01 through P2C-18](plans/phase2-page-errors.md), including feasibility-first implementation, tests, independent review, and signed private delivery. Each fresh check tab holds one bounded observation of future uncaught JavaScript error and unhandled-rejection events from the original selected tab's top-frame document. Start is explicit, Stop keeps confirmed partial counts, the window is 30 seconds, and the total event cap is 200. One final summary stays fixed until Start over; interruption is not a zero-error result.

The popup binds only the original tab's numeric ID, without a URL/title or automatic source replacement. Checks participate only in verified normal windows. Firefox uses an isolated observer; Chrome uses a page-side observer with its interference limit disclosed. No raw messages, errors/reasons, stacks, filenames, event objects, page content, absolute timestamps, live counters, history/export, cross-load recording, extra permission, host grant, or background coordinator is added. The timing collector keeps its existing isolated execution on both targets.

The approved new bounds are 1 KiB per final summary and measured 5 ms p95 for synchronous setup, event handling, and finalization on controlled fixtures with clock limitations recorded. Actual source bootstrap, selected-world control, cleanup on owner teardown/revocation, navigation/BFCache behavior, and the full duration/count limits must pass browser feasibility before product wiring. A failed essential gate requires a revised plan rather than wider authority. Preliminary visibility fixtures do not qualify the production check.

## Out of scope for Phase 0

Continuous recording, network collection, page-world instrumentation, console interception, automatic culprit ranking, automated extension state changes, theme management, report export, persistent history, mobile support, additional Chromium browsers, accounts, sync, AMO publication, and a native companion implementation.

## Important edge cases

- An enabled extension may have permission to access a site without having executed there.
- A disabled extension can have unavailable permission metadata.
- A user may revoke optional permissions while the interface is open. Clear affected results and require a new explicit action.
- A navigation can remove the temporary page grant. Do not silently broaden host access or retry against another tab.
- Page-provided values are untrusted even when they arrive through a browser scripting result.
- A failed comparison can be caused by page variability, browser protections, caches, or an interaction among extensions.
