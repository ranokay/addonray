# Delivery phases

Each phase ends with its own acceptance evidence. A later phase needs an explicit scope decision. The [expanded v1 contract](v1-contract.md) fixes the finite ticket set and final release acceptance. The phase descriptions below record the original delivery shape; the v1 notes show how the approved backlog extends them.

## Phase 0: prove the API boundary

Deliver the WXT/TypeScript/React Firefox MV3 project, explicit optional permission flow, inventory adapter, minimal isolated page probe, capability explanations, automated tests, manifest checks, and a disposable-profile Firefox probe record.

Exit when P0-01 through P0-10 in [requirements](requirements.md) have evidence or a clearly recorded qualification blocker. A blocker is an incomplete exit gate, not a pass. Stop before continuous diagnostics or a native implementation.

## Phase 1: useful guided troubleshooting

Add inventory search and permission explanations, instructions for changing settings through the browser, and user-recorded before/after comparisons. Design the investigation lifetime before moving beyond the popup. Distinguish the user's stated conditions from browser-observed metadata.

Exit when a user can reproduce a comparison, recover from denied access, and understand why AddonRay does not present an automatic culprit verdict. Test keyboard use and screen-reader labels. Recheck privacy and release/ESR support.

The approved [Chrome MV3 continuation](plans/chrome-mv3.md) fits within the inventory slice. It retains Firefox MV3 and adds Chrome-specific builds, capability explanations, and qualification before comparison planning. All MV2 builds and other browser targets remain deferred.

The approved [manual comparison slice](plans/phase1-comparison.md) adds one temporary Before/After pair per independent investigation tab and an explicit page assessment. Its [evidence](evidence/2026-10-23-phase1-comparison.md) separates automated checks from observed native consent and remaining accessibility/desktop release gates. Phase 2 still needs a collector scope decision.

## Phase 2: bounded diagnostics

Propose collectors separately. Candidates include page error observations, supported performance entries, and aggregate mutation counts. Every collector needs permission justification, sampling bounds, overhead measurements, stop/clear behavior, navigation semantics, and an uncertainty explanation. Network observation and page-world instrumentation require additional review.

Exit when tests prove the collector lifecycle, spoofed data is handled, caps hold, and measured overhead meets an agreed budget. No extension attribution claim without an independently validated mechanism.

The approved [optional timing comparison](plans/phase2-timing-comparison.md) extends the Phase 2 popup snapshot into the existing investigation through a deliberate handoff. It adds no history or export. Its own qualification distinguishes candidate/source fixtures, packaged integration, native UI, and remaining context/platform gates.

The approved [current-document page-error check](plans/phase2-page-errors.md) observes two JavaScript event kinds after an explicit Start, with one counts-only summary per separate check tab. Its 30-second/200-event limits, Firefox-isolated/Chrome-page-side split, and close/revocation/navigation cleanup require their own feasibility and qualification. Basic visibility evidence is separate from product wiring, native consent/UI, and the new collector's overhead. Cross-load recording remains a later decision. Comparison attachments have their own approval below.

The approved [optional page-error comparison](plans/phase2-page-error-comparison.md)
is implemented through completed check summaries and fixed investigation slots.
The essential candidate gate passed before product wiring. Timing and error
attachments share one numeric source-tab binding; accepted copies survive donor
reset/closure. No collector, error arithmetic, history or export is added.
[Qualification](evidence/2026-10-26-phase2-page-error-comparison.md) separates
production-source tests, native observations, hosted results and remaining gaps.
Stop after private delivery of this slice; the next phase needs a new decision.

## Phase 3: user-controlled reports and better comparisons

Add previewed, minimized export and reproducible comparison records. Decide what may persist and for how long before introducing history. Explore comparison guidance without automatic changes to other extensions.

Exit when export tests cover sensitive fields and a user can inspect exactly what leaves the session. Update the Firefox data declaration if the behavior requires it.

The approved v1 backlog extends this phase through #5 to #12. #5 settles persistence and exchange rules before #6 to #11 implement them. #12 adds guided trials on top of the approved history contract.

## Phase 4: optional Rust companion feasibility

Select a concrete capability ordinary WebExtensions cannot provide. Research supported OS/browser mechanisms and obtain approval for the additional access. Define protocol, extension allowlist, installer ownership, updates, failure modes, and uninstall behavior.

Exit feasibility only with real OS/browser evidence and a narrow capability proposal. A working native message round trip alone does not qualify browser control.

The approved v1 backlog makes this phase concrete through #20 to #28: select one operation, prove it per intended OS, deliver it, install and remove it, and handle upgrades.

## Distribution gate

AMO and Chrome Web Store publication are separate from pushing source to the private repository. It requires a license decision, final extension identity, privacy review, current store policy checks for each target, browser/distribution qualification, packaging evidence, and approval to publish.

The v1 release path is #4, #39 and #40 to #46. Backlog approval does not grant license, visibility, signing or publication authority.
