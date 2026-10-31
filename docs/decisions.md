# Decisions and interview record

Date: 2026-10-22, Europe/Bucharest.

## Confirmed by the user

| Decision            | Answer                                                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product audience    | Firefox desktop power users, guided troubleshooting first. Developer profiling later.                                                                                      |
| Desktop targets     | macOS, Linux, and Windows, each qualified separately. Automated API checks and native-popup usability have separate evidence.                                              |
| Privacy             | No telemetry or cloud service. Diagnostics stay in the current session. Inventory/page inspection require explicit consent. Saved/exported reports need a separate action. |
| Product name        | AddonRay.                                                                                                                                                                  |
| Repository identity | `ranokay/addonray`, under the authenticated user account.                                                                                                                  |
| Initial visibility  | Private.                                                                                                                                                                   |
| License             | Initially deferred; superseded by the 2026-10-31 Apache-2.0 decision below.                                                                                                |

## Fixed by the request

WXT, TypeScript, React; phased feasibility tests; honest inventory/capability explanations; diagnostics later; optional Rust companion eventually; no implication of arbitrary global or per-site extension toggling.

## Implementation choices confirmed in the final scope review

- A small popup with inventory and minimal selected-page probes.
- Firefox desktop MV3, initial manifest minimum 140. Actual platform support follows evidence.
- Required `activeTab`; optional `management` and `scripting`; no broad host permissions.
- Popup memory only. Closing or clearing discards results. Browser permission grants may persist independently.
- Phase 0 stops before continuous recording, export, background coordination, and native implementation.
- A stable development extension ID derived from the approved product/repository identity. Final distribution identity remains a release decision.
- Local deterministic checks and disposable-profile Firefox tests, with qualification gaps visible.

## Interview status

All three rounds are answered. The user confirmed shared understanding and authorized Phase 0 implementation, tests, a signed initial commit, and a push to private `ranokay/addonray`. Technical details within those boundaries are delegated to the implementing agent. Further product phases and publication remain separate decisions.

Independent review added two acceptance details: bind the selected tab before waiting for consent, and verify the actual popup lifetime around permission prompts. The first is implemented and tested. Follow-up [native-popup evidence](evidence/2026-10-22-qualification.md) covers the second on Firefox 140.0, 153.5.1esr, and 158.0.1 on macOS arm64. The tested prompts left the popup open. Other browser/OS combinations and closure while consent is pending remain unobserved.

## Earlier conversation limitation

The referenced ChatGPT conversation could be retrieved, but its assistant replies contain reference markers rather than architecture text. This plan uses the user's explicit restatement and current interview answers. No unseen detail is treated as agreed.

## Toolchain continuation

The user requested migration from pnpm and Prettier to Bun's ecosystem, including native formatting, linting, type checking, and tests, and explicitly requested hk and jactionlint. After reviewing stable versus canary availability, the user chose a pinned Bun canary with native fmt/lint. [Toolchain setup](toolchain.md) records the exact revision, installation, verification, and rollback. This changes development tooling within Phase 0; it does not authorize Phase 1 or alter product permissions and data retention.

## Engineering skill configuration

The user approved GitHub Issues in private `ranokay/addonray`, the five default triage labels, and the complete setup draft on 2026-10-22. [Tracker configuration](agents/issue-tracker.md), [label vocabulary](agents/triage-labels.md), and [domain rules](agents/domain.md) are the engineering skills' configuration. `docs/status.md` remains the delivery checklist. The existing root glossary and `docs/adr/` keep the single-context layout.

## Phase 1 planning continuation

On 2026-10-22 the user chose to start Phase 1 planning for the private build while retaining native Linux/Windows popup usability and signing as open release gates. The [Phase 0 evidence map](evidence/2026-10-22-phase0-readiness.md) records the accepted evidence and its remaining limits. This decision authorizes planning; implementation needs a concrete agreed slice and acceptance criteria.

The user then selected inventory search/filtering, plain-language permission explanations, and manual Firefox-settings guidance as the first slice, retaining the existing popup. Manual comparisons follow in a separate slice after an investigation-lifetime decision. The user explicitly invoked the prototype skill to explore the UI. The [slice plan](plans/phase1-inventory.md) records acceptance criteria and the pending visual decision.

On 2026-10-23 the user chose A, Quick list, with a dark/black theme by default and the documented first-slice acceptance criteria. This authorizes the production rewrite of that slice. Search and filter controls operate on the loaded inventory in popup memory. The original three-variant experiment stays on its throwaway branch, linked from [issue #1](https://github.com/ranokay/addonray/issues/1).

## Tooling and browser-target continuation

On 2026-10-23 the user asked about Bun 1.4.4 and additional browser/manifest targets. The official stable binary now has native formatting and type checking, but no native lint command. After reviewing this distinction, the user chose to retain the pinned native-tool canary.

The user approved Chrome MV3 first, qualified against the current desktop release, with Firefox MV3 retained. Edge is a later target; Safari and MV2 are deferred. The [Chrome slice contract](plans/chrome-mv3.md) records the scope and evidence requirements. Current private visibility, deferred licensing/publication, inspection-only behavior, and popup-memory rules continue. No tracker issue was requested for this slice; this checklist and plan remain its local work record.

## Manual comparison interview

On 2026-10-23 the user chose an investigation that survives switching between the page and browser settings, while losing all results when its investigation view closes or reloads. Data stays in memory, with no saved history or restoration after browser restart. The existing popup behavior remains the implemented baseline until the new slice is agreed and built.

The user selected two deliberate inventory snapshots around a manually performed change. The comparison shows extensions added, removed, enabled, or disabled, and records the user's assessment of the page as better, unchanged, worse, or uncertain. Measured page performance and automatic culprit identification are outside this proposed slice.

The user then chose a fresh independent browser tab for each New investigation action. Existing investigations remain reachable through the browser's tabs. The popup keeps its existing quick inspection tools; no popup results transfer into an investigation. Each investigation holds one Before/After pair. Start over discards both snapshots and the page assessment. Closing, reloading, or the browser unloading the investigation loses its memory.

The [manual comparison plan](plans/phase1-comparison.md) captures the proposed acceptance criteria and technical findings. The user confirmed shared understanding and authorized implementation, testing, independent review, and a signed private push of this slice on 2026-10-23. No additional browser target, measured-performance collector, persisted data, issue-tracker write, or publication was requested.

## Phase 2 timing interview

On 2026-10-23 the user selected slow-page troubleshooting through a small, explicitly requested page-timing snapshot as the first diagnostic slice. Page-error observations remain a later collector. Timings cannot reliably identify a responsible extension.

The user chose the existing selected-page popup action and its current memory lifetime. Closing or clearing the popup discards timing results. Adding timings to investigation comparisons is separate because it requires a page-selection and result-transfer design.

The snapshot will read timing information already available for the current document's load. It will neither reload the page nor start a recorder. Later scrolling, typing, and other interaction responsiveness remain outside this slice.

The user selected three milestones: DOM content loaded, load event completed, and first content displayed. Each has a short explanation and an elapsed value in milliseconds since navigation began when reported. Missing and incomplete observations remain explicit. No speed score or extension ranking is introduced.

The selected tab is bound at the click. If that tab navigates during consent, the check reads the document loaded there when collection executes, subject to the browser's access restrictions. It never switches to another tab or retries automatically. Exact click-time document identity is outside this scope. [The timing plan](plans/phase2-timing.md) records the acceptance criteria, overhead budget, and staged browser qualification. The user confirmed shared understanding and authorized implementation, tests, independent review, and signed private delivery of this slice on 2026-10-23. The approved qualification gates include isolated-world feasibility first, a 1 KiB timing-block limit, and a 5 ms p95 synchronous collector budget on controlled fixtures.

## Timing comparison interview

On 2026-10-23 the user selected optional Before/After page-loading snapshots in the existing investigation tabs as the next slice. Every capture remains deliberate, with no automatic reload or extension-blame verdict. Page-error diagnostics remain deferred.

The user chose to attach timings separately to the existing fixed Before/After inventory snapshots. Capture happens through the source page's popup, followed by an explicit choice of investigation and side. Inventory-only comparisons remain usable; a failed timing capture preserves their inventories. Browser feasibility must establish this handoff before implementation. An inventory capture and its attached timing are separate observations, not an atomic measurement of identical conditions.

The user accepted all four remaining design rules together. Each milestone shows Before, After, and After minus Before in milliseconds only when both values are measured. Missing states remain visible, with no causal claim or percentage score. Each side holds one fixed timing attachment. Before timing must be attached before capturing the After inventory; After timing follows that inventory. Start over is required for another attempt.

Both timings must come from the same browser tab. Retain only its numeric ID in the investigation's memory, without collecting its URL or title. A tab can navigate to another page, so matching its ID does not verify page identity. Revoking either management or scripting permission clears the entire investigation. Ordinary timing failures preserve inventory observations. Clearing the popup affects only the popup.

The [plan](plans/phase2-timing-comparison.md) records these six decisions, the transfer boundary, scratch feasibility, and the implementation/qualification checklist. The user confirmed shared understanding and authorized implementation, tests, independent review, and signed private delivery on 2026-10-23. The confirmation includes attachments only between verified normal-window views, with private/incognito and unclassifiable contexts excluded. Existing local inspection remains available; no new permissions, background process, storage, automatic reload, or culprit verdict is authorized.

## Page-error diagnostic interview

On 2026-10-24 the user selected page-error diagnostics for broken-page troubleshooting as the next planning focus. The proposed first check is small and explicitly started. API feasibility, privacy, and lifecycle must be settled before implementation; observations must not identify an extension as the culprit.

The user chose counts by error kind only. The first check must not retain raw messages, stack traces, filenames, URLs, or rejected values. Detailed error logs would need a separate privacy design. This is a planning decision, not approval of a collector implementation.

The user chose to observe events occurring after an explicit Start while reproducing the problem in the currently loaded document. Reloading or leaving that document ends the attempt. Historical console retrieval and observation across page loads are outside this first scope. [Initial API research](evidence/2026-10-24-page-error-api-research.md) records documentation findings and the browser feasibility still required.

The user selected two event kinds: uncaught JavaScript error events and promise rejections that are unhandled when observed. Resource-load failures, handled exceptions, console calls, and other extensions' private errors are outside the slice. Zero observed events must not imply an error-free page.

Each check will have a fresh separate diagnostic tab that owns its results in memory while the user interacts with the source page. Closing or reloading that check tab discards its data. Integration with Before/After investigations is separate. The user chose a 30-second observation window, a 200-event total cap, and a Stop action that retains partial counts. Completion explains its reason and never restarts automatically. Clear discards results. Cleanup and timer behavior require feasibility evidence.

The launch action belongs in the source page's toolbar popup. It opens a fresh check without starting collection; an explicit Start in the check tab begins the attempt. Bind only the originally selected tab's numeric ID, retain no URL/title, and never select a replacement source automatically. This first workflow is limited to verified normal windows.

The user selected one final summary per attempt, with counts shown when observation stops. Start over erases that result before another explicit Start on the original tab. No live counter updates or history are added. Reload/navigation, a closed source tab, or failed observation produces interrupted/unavailable state rather than fabricated zero counts. The final implementation scope and budgets were confirmed after the execution-world decision below.

The user accepted the browser-specific execution choice: use an isolated observer on Firefox and a page-side observer on Chrome, as indicated by the controlled visibility tests. Chrome pages can interfere with that observer or its counts, so the UI must explain this limitation. The choice adds no browser permission and authorizes no raw error details. Control/cleanup, consent, privacy, overhead, and production qualification remain required. [ADR 0004](adr/0004-page-error-execution-worlds.md) records the trade-off; the [concrete plan](plans/phase2-page-errors.md) defines the implementation and qualification gates.

The user confirmed the concrete plan and authorized feasibility-first implementation, tests, independent review, and a signed push to private ranokay/addonray on 2026-10-24. This includes a 1 KiB summary limit and a measured 5 ms p95 budget for synchronous setup, event handling, and finalization. Source binding, existing-connection cleanup on owner close/revocation, navigation, and the actual duration/count limits must pass browser feasibility before product wiring. An essential failure requires a revised plan, without new permissions or a background coordinator.

## Page-error comparison interview

The user selected optional Before/After page-error counts in the existing
investigation tabs as the next planning focus. Each observation stays deliberate,
temporary and counts-only. No automatic extension changes or causal verdict is
introduced. Previewed report export remains a separate decision.

The user chose an explicit Attach to investigation action on a completed check.
It will require selecting the investigation and Before/After side, followed by
confirmation. Inventory-only and timing-only comparisons keep working. The
existing timing handoff accepts only popup senders, while page-error checks
currently have no attachment contract. This new path needs its own browser
feasibility and qualification before implementation.

Any confirmed summary may be attached, including manual Stop, the 30-second
timeout and the 200-event cap. Denied, interrupted, cancelled and invalid
observations are ineligible. The comparison shows Before/After counts,
observation durations and completion reasons side by side. It adds no arithmetic
count differences, automatic improvement rating or rate calculation. The
existing manual page assessment remains separate, and neither display identifies
a culprit.

The user accepted the four remaining design rules together. Each side holds one
fixed error attachment. Before must attach before After inventory capture
starts; After requires its successful inventory and the Before error attachment.
Start over is required to replace attachments.

All timing and error attachments in an investigation must share the numeric
source-tab ID established by its first attachment. No URL/title is collected;
a matching tab does not verify the same page or document. This intentionally
tightens the timing Before rule when an error attachment established the source
first, while preserving timing-only comparisons.

Each completed check can attach successfully once. Its local result remains
visible until that check resets or closes. The investigation receives an
independent copy that survives donor reset or close. Investigation Start over,
either optional-permission revocation, or destination close/reload discards the
whole investigation. Failed or stale transfers preserve existing observations.

The [concrete plan](plans/phase2-page-error-comparison.md) defines the acceptance
criteria and feasibility gates. Independent read-only planning review found no
material issue; no new browser execution was performed. The user then confirmed Q9 and authorized feasibility-first implementation,
tests, independent review and a signed push to private ranokay/addonray on
2026-10-24. Essential new handoff and lifetime behavior must pass browser
feasibility before product wiring. A failed essential gate returns to a revised
plan without new permissions, storage, a background process or a collector.

## Report export interview

On 2026-10-27 the user selected previewed, minimized export as the next slice
and accepted the following decisions. The [report plan](plans/phase3-report-export.md)
defines P3A-01 through P3A-18. Implementation and export qualification are pending.

| Question | Accepted answer                                                                                                                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1       | Plan previewed, minimized report export next, while existing release checks remain open.                                                                                                                                                              |
| Q2       | Prepare one human-readable Before/After investigation report for someone helping troubleshoot. Popup inventories and standalone checks are outside this export slice.                                                                                 |
| Q3       | Include both inventories, their changes, the manual assessment and optional attached timing/error summaries from existing observations only. Preserve explicit missing states and observation limits.                                                 |
| Q4       | Include extension names and versions, with enabled states needed by the inventories. Omit extension-ID fields and internal tab/transfer identifiers or labels. Names and versions remain potentially identifying.                                     |
| Q5       | Download a Markdown `.md` file only after an exact preview. Other formats and clipboard actions remain separate.                                                                                                                                      |
| Q6       | Show read-only exact Markdown with explicit download and Cancel controls, plus a warning that extension names and versions are included. Q10 names the download action.                                                                               |
| Q7       | Require two successful inventory captures and an idle investigation. Assessment and diagnostic attachments may be absent and must be labelled accordingly.                                                                                            |
| Q8       | Require a fresh preview after assessment or attachment changes. Reset, actual permission revocation, close and reload erase unsaved preview data. A downloaded file remains outside AddonRay on disk.                                                 |
| Q9       | Allow report preparation and download only in verified normal windows. Private/incognito and unclassifiable contexts fail closed.                                                                                                                     |
| Q10      | Use the browser's normal download with unchanged permissions and the action label Download report. The browser may auto-save. AddonRay makes no completed-save claim and cannot retract a handed-off file, including a pending download, after reset. |
| Q11      | Confirm the complete scope, including a 1 MiB UTF-8 document limit with no truncation, and authorize the plan, feasibility-first implementation, checks, independent review and signed private delivery to `main`.                                    |

The report preserves measured-only timing differences and adds no error
differences, rates or culprit verdict. Its preparation and download validate the
source observation revision and reset generation across asynchronous context and
permission checks. Never-granted scripting does not block an inventory-only
report; actual removal retains the existing whole-investigation reset. No new
context, timestamps, notes, collection, history or longer session is authorized.

The accepted local-only download keeps a generic filename and the existing
permission budget. [Privacy](privacy.md#approved-report-export) records the
Firefox declaration reassessment and its limited rationale. Essential browser
download or lifetime failure requires a revised plan rather than broader
permissions or retention. Tests, native observations, packaged browser results
and final delivery evidence must be reported separately.

### Accepted Q12 lifetime revision after candidate failure

An essential initial Firefox 158 candidate gate failed. Small and 1 MiB exact
downloads passed for both Blob and data URLs, but closing the owning tab in the
same task immediately after `anchor.click()` could preempt the request and leave
no file. Firefox 140 repeated the Blob failure, while Chrome for Testing
156.0.8078.47 passed the same six candidate cases. ESR was not run. The failed
lifetime assertions remain failed; no production behavior is qualified. See the
[feasibility record](evidence/2026-10-27-report-export-feasibility.md).

Q11 remains the original accepted approval. The user accepted Q12 on 2026-10-27.
The revised contract distinguishes requesting a download from the browser
accepting it. Tell the user to keep the investigation open until the browser
shows the download and warn that close/reload can cancel an unaccepted request.
Browser-accepted bytes or files can still remain after clearing. Permissions and
the investigation's memory lifetime remain unchanged. P3A-14 and P3A-16 now
state this revised boundary explicitly; the original immediate-close failures
are not converted into passes.

Product wiring stopped under the approved essential-gate rule. Draft serializer
tests passed 32 tests with 128 assertions and draft controller tests passed 22
tests with 85 assertions; their unwired, uncommitted code is not product
qualification. The lifetime decision is settled, but renewed candidate
qualification, including the missing ESR run, is still required before wiring
resumes.

## Expanded v1 approval

On 2026-10-29 the user approved the private GitHub milestone `v1.0.0` as the
finite expanded v1 target. It contains 45 tickets, #2 through #46: saved
investigations and report exchange, guided manual comparisons, mutation and
request-failure diagnostics, an optional Rust companion, brand assets,
qualification and release work. The milestone description and ticket bodies are
the scope record. [The v1 contract](v1-contract.md) records the support matrix,
supersession map, release acceptance and exclusions.

The approval fixes scope. It does not answer #4 (license, visibility,
identities, publisher and pre-release route), #13 (mutation and request-failure
collector contracts) or #20 (companion capability). Those remain decision gates.
It also does not authorize signing, publication, a license grant or a visibility
change. The #5 saved-data decision was answered on 2026-10-30; see the
saved-investigation and report-exchange interview below.

The user also agreed in the same conversation that macOS arm64, Windows x64 and
Linux x64 are the intended v1 operating-system and architecture targets. Exact
OS versions remain a release-planning gate. Linux distribution selection and
the exact release and OS combinations must be settled before candidate
qualification. Existing macOS, Ubuntu and Windows Server evidence does not
establish a minimum OS version or full-v1, native or retail qualification.

## Brand asset selection

On 2026-10-29 the user selected **Aperture** from the three prototype directions
(Aperture, Prism and Frame) after the inline picker review. The selected form is
a broken lens ring around a solid center. The user later explicitly authorized
removal of only `docs/prototypes/brand-assets/index.html`; that file was removed.
The existing inventory prototype, asset kit, package proof, both evidence
documents, the plan and all local scratch evidence remain preserved. The
[historical GitHub blob](https://github.com/ranokay/addonray/blob/6b0f38eeff2081f9b869eb2e9794afcc98d7702e/docs/prototypes/brand-assets/index.html) pins the removed prototype at `6b0f38e`.

The package icon is one static asset set for both Firefox and Chrome. It uses a
mid-green primary (`#2f8f63`) and a mint accent center (`#b6e4ca`) rather than
the prototype's theme-specific palettes. This keeps the toolbar mark legible on
both light and dark chrome without theme-specific manifest entries, new
permissions or session changes. The 16 px export uses an optical master with a
heavier ring and larger accent center.

Store and companion compositions in the kit are reusable material. This
decision does not approve a companion package identity, store listing,
publisher, license, publication or support claim. Those remain with #4 and the
release tickets.

## Saved-investigation and report-exchange interview

On 2026-10-30 the user approved Q1 through Q16 for
[issue #5](https://github.com/ranokay/addonray/issues/5). The
[saved-investigation and report-exchange data contract](plans/saved-investigation-data-rules.md)
records the lifecycle and trust boundaries. This is a documentation-only
decision. It authorizes no saved-data runtime, storage permission, JSON
exchange, import, printable HTML, clipboard action or browser qualification.
The current session-only investigation, Markdown-only report and permission
limits remain effective until #6 through #11 pass their feasibility gates and are
implemented and qualified.

| Question | Approved answer                                                                                                                                                                                                                                                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1       | Saved investigations are immutable, read-only archives. Reopening never starts collection automatically.                                                                                                                                                                                                                                                                           |
| Q2       | Saves stay within the current browser profile with disclosure before saving. No automatic sync, cloud or companion transfer.                                                                                                                                                                                                                                                       |
| Q3       | Saved-data and exchange actions require a verified normal window. Private and unknown contexts are blocked.                                                                                                                                                                                                                                                                        |
| Q4       | v1 includes Markdown, JSON export and import, printable HTML using the browser Print/Save-as-PDF path, and explicit clipboard copy.                                                                                                                                                                                                                                                |
| Q5       | Saving and exchange use fixed approved field sets without per-field editing or redaction controls.                                                                                                                                                                                                                                                                                 |
| Q6       | Saved records and exchanged reports carry explicit schema versions.                                                                                                                                                                                                                                                                                                                |
| Q7       | Save only completed, idle investigations. Keep both inventories, changes, assessment, optional timing and error summaries and observation limits. Each explicit save creates a new archive.                                                                                                                                                                                        |
| Q8       | Compute inventory changes before saving with the existing ID-based comparison. Retain those changes, but omit extension IDs and live tab or session identifiers. Give each archive a new local-only record ID.                                                                                                                                                                     |
| Q9       | Use generated labels and local save and expiry times. Include no user notes, custom titles, page context or browser or OS context. Keep local timestamps and record IDs out of exchanged reports.                                                                                                                                                                                  |
| Q10      | Use 30-day default retention, with 7, 30 or 90-day choices; 50 records, 5 MiB total and 1 MiB per record. Expired records become unavailable, with cleanup when AddonRay next accesses storage. When full, refuse the save rather than evict unexpired records.                                                                                                                    |
| Q11      | Keep saved archives accessible after inventory and page permissions are revoked. Revocation still cancels pending live saves; saving also fails if its source changes or resets.                                                                                                                                                                                                   |
| Q12      | Make deletion apply across AddonRay views, invalidating pending actions and preventing resurrection. Confirm delete-all. Explain that deletion cannot erase browser backups or recall already handed-off files, prints or clipboard content.                                                                                                                                       |
| Q13      | Open imports as explicitly labelled, untrusted, read-only reports. Saving an import requires a separate action. Retain its imported provenance on re-export; store neither its filename nor path.                                                                                                                                                                                  |
| Q14      | Start with schema version 1 and strict validation. Reject unsupported versions, unknown fields, duplicate keys and malformed values. Apply matching save, export and import bounds: 1 MiB, 1,000 inventory entries per side, 2,000 changes, 4,096 characters per string and nesting depth 8. Preserve unknown states. Keep unsupported saved records listed for explicit deletion. |
| Q15      | Try IndexedDB without new permissions in #6, behind Firefox and Chrome feasibility checks. Return with evidence before proposing additional permissions if that fails.                                                                                                                                                                                                             |
| Q16      | Preview each output in its own format. Download or copy the reviewed content; use self-contained printable HTML without scripts or remote resources. Report clipboard success only after a successful write, and avoid claiming completed downloads or printing from request dispatch.                                                                                             |

The contract applies these drafting clarifications, which do not add product
scope. The size and count limits are product bounds, not IndexedDB or browser
quota promises. The 5 MiB bound does not derive headroom from `storage.local`'s
unrelated quota. Unknown, missing and unrecorded values stay distinct, including
duplicate extension names. Archived changes are never recomputed from names.
Expiry is product-level refusal plus lazy cleanup, not a hard physical on-disk
deletion deadline. Unsupported saved records stay listed for explicit deletion.
Deletion and expiry block further AddonRay use across views and pending actions,
but browser-accepted files, prints and clipboard content remain outside recall.
Normal-window guards apply to archives and imports regardless of collection
permission. Imported files are always untrusted regardless of any self-asserted
origin. Each format preview matches its representation. Clipboard success is
reported after a successful write. The shared save, JSON export and import bounds
must permit an accepted export to re-import without truncation.

These answers settle #5. They do not authorize #6 through #11 implementation,
storage permission, output mechanism or any support, publication or licensing
change. Future feasibility remains unperformed.

## Publication preparation (2026-10-31)

The owner approved Apache-2.0 for owned source code and documentation, with
copyright 2026 ranokay. Upstream terms remain effective for third-party material;
project names and logo artwork are reserved for official branding as described
in NOTICE. Existing Git authorship, development paths in history and normal
issue/PR discussion remain intact. Current setup instructions should be portable.

This approval authorizes the licensing, notice, packaging and documentation
preparation. Repository visibility remains private until a separately authorized
change. Store identities, signing, native/runtime qualification and publication
remain separate release decisions. This settles the license choice within #4,
not that ticket's remaining distribution responsibilities. Package metadata keeps
`private: true`; npm publication is not authorized.
