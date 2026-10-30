# Product requirements

Status: Phase 0 scope approved on 2026-10-22 and scaffold implemented. The user approved the [first Phase 1 slice](plans/phase1-inventory.md), layout A with a dark/black default theme, on 2026-10-23. See [decisions](decisions.md) and [observed evidence and gaps](evidence/2026-10-22-firefox.md).

## Approved expanded v1 target

On 2026-10-29 the user approved private milestone `v1.0.0`, tickets #2 through #46, as the finite v1 target. [The v1 contract](v1-contract.md) records the dated scope snapshot, intended support, existing exact evidence, supersession map, release acceptance and exclusions. This file describes implemented or individually approved behavior. It is not the complete v1 promise.

Current runtime limits remain effective until a future contract is approved, recorded, its applicable feasibility gates pass and its implementation is qualified. #5 is approved and recorded. #4, #13 and #20 remain decision gates.

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

## Approved optional page-error comparison

The user settled Q1–Q8 for [P2D-01 through P2D-19](plans/phase2-page-error-comparison.md).
The user confirmed Q9 and approved feasibility-first implementation and private
delivery on 2026-10-24. The slice is implemented, with
[qualification and remaining gaps](evidence/2026-10-26-phase2-page-error-comparison.md).
A confirmed check attaches once through
explicit investigation/side selection and confirmation. Stop, timeout and capped
summaries qualify; failed or in-flight observations do not.

Each side is fixed. Before attaches before After inventory begins; After requires
its successful inventory and the Before error attachment. All timing and error
attachments share one source-tab ID established by the first attachment. Display
counts, durations and completion reasons side by side without arithmetic error
differences, rates or automatic assessments. The investigation owns a copy after
donor reset/close, and its existing reset/revocation/teardown clears all data.
The evidence separates candidate feasibility, production source fixtures, native
observations, clean builds and hosted qualification. Private-build delivery does
not close the remaining release gates.

## Approved previewed investigation report export

On 2026-10-27 the user accepted Q1 through Q11, then Q12's revised lifetime
boundary, for [P3A-01 through P3A-18](plans/phase3-report-export.md). Authorization
includes feasibility-first implementation, tests, independent review and signed
private delivery to `main`.
One investigation with two successful inventory captures may prepare a report
while idle. Assessment and diagnostic attachments remain optional and their
absence stays explicit. Use existing observations only, including both
inventories/changes, allowed extension names/versions/states, the assessment,
optional timing/error summaries and their limits. Exclude extension-ID fields,
internal labels/identifiers, extra context, timestamps and user notes.

The user reviews the exact read-only Markdown text before choosing Download
report. The complete UTF-8 document is limited to 1 MiB without truncation.
Preview preparation and download check the current observation revision, reset
generation, permission state and verified normal-window context; private and
unknown contexts fail closed. Changed observations require a new preview.
Never-granted scripting does not block an inventory-only report. Actual optional
permission revocation resets the investigation and its unsaved preview.

The browser controls a generic `.md` download under the existing permission
budget and may save automatically. Request dispatch is not browser acceptance.
Keep the investigation open until the browser shows the download; closing or
reloading may cancel an unaccepted request. AddonRay reports no final disk
completion and cannot recall browser-accepted bytes or files. Preview state keeps
the existing owning-view memory lifetime. No history, new collection, remote
transmission, support expansion or publication is authorized. Firefox's
local-export declaration rationale and pending qualification are recorded in
[privacy](privacy.md#approved-report-export). Implementation and browser evidence
for this new path are pending. The original immediate-owner-close candidate
failures remain failed; revised feasibility, including ESR, must pass before
product wiring.

## Saved-investigation and report-exchange boundaries

On 2026-10-30 the user approved Q1 through Q16 and the [saved-data contract](plans/saved-investigation-data-rules.md). The bounded #6 slice now implements explicit Save, local list, read-only reopen and single-record delete. Report exchange (#8 through #11), retention choices/bulk deletion (#7) and imported records are not implemented. The current investigation remains session-only apart from an explicit saved archive, and the Markdown download remains the only report output.

An explicit Save creates an immutable, read-only local archive of one completed, idle investigation with both inventories successful. Each save creates a new record; there is no autosave or update. The archive keeps both inventories, precomputed ID-based changes, the assessment, optional timing and page-error summaries and observation limits. It omits extension IDs, live or ephemeral identifiers, page and browser context, user notes and exchanged timestamps. Reopening collects no inventory or page data, prompts for no collection permission and resumes no collector. It performs only the narrow current-view context and storage eligibility checks needed for the approved normal-window boundary.

Saved records stay in extension-origin IndexedDB in the current browser profile with disclosure before the first save. There is no sync, cloud, telemetry or companion transfer and no new storage permission. The default retention is 30 days. The library allows 50 records, 5 MiB total and 1 MiB per complete stored record including the local envelope. It refuses a save when full and never evicts unexpired records; only valid expired rows are cleaned lazily. An ordinary save failure preserves the current valid live investigation; reset or permission revocation keeps its existing clearing behavior and cannot be undone by a pending save. Pending writes bind store-instance identity and deletion epoch, and success is reported only after transaction completion.

Saved archives remain available after management or scripting revocation. Revocation still clears live investigations and cancels pending live saves. Single-record deletion applies across views and prevents resurrection; bulk deletion and delete-all remain #7. A deleted or expired record cannot be reopened or used, while browser backups and already handed-off files, prints or clipboard content remain outside recall. Unsupported and unreadable records stay listed for explicit deletion.

Every saved-data action requires a verified normal window. Private, incognito and unknown contexts expose no saved data. The approved exchange formats remain future work: Markdown, schema version 1 JSON export and import, self-contained printable HTML through browser Print/Save as PDF, and explicit clipboard copy. Each has its own exact preview. Imports are untrusted, read-only and persist only after a separate save. Save imported report applies the stored-record bound including the local envelope, so a maximum-size import is view-only if the envelope would exceed that bound. Strict validation rejects malformed, negative and above-range duration values. The shared bounds are 1 MiB, 1,000 inventory entries per side, 2,000 changes, 4,096 characters per string and nesting depth 8. Accepted JSON exports re-import for read-only inspection without truncation. No runtime, permission, dependency or support change beyond the bounded #6 slice is authorized by this contract.

## Out of scope for Phase 0

Continuous recording, network collection, page-world instrumentation, console interception, automatic culprit ranking, automated extension state changes, theme management, report export, persistent history, mobile support, additional Chromium browsers, accounts, sync, AMO publication, and a native companion implementation.

That list was the Phase 0 boundary. The later expanded v1 target approves report exchange, local saved investigations and an optional companion as future work under [the v1 contract](v1-contract.md). The [#5 saved-data contract](plans/saved-investigation-data-rules.md) records the saved-data rules. The bounded #6 save/list/reopen/delete slice is implemented; the remaining exchange and retention work still requires its own implementation and qualification.

## Important edge cases

- An enabled extension may have permission to access a site without having executed there.
- A disabled extension can have unavailable permission metadata.
- A user may revoke optional permissions while the interface is open. Clear affected results and require a new explicit action.
- A navigation can remove the temporary page grant. Do not silently broaden host access or retry against another tab.
- Page-provided values are untrusted even when they arrive through a browser scripting result.
- A failed comparison can be caused by page variability, browser protections, caches, or an interaction among extensions.
