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
| License             | Decide later. No license grant in the initial source.                                                                                                                      |

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
