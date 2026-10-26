# Phase 2 optional page-error comparisons

Status: approved for feasibility-first implementation, tests, independent review
and signed private delivery on 2026-10-24. The user confirmed Q9 after settling
Q1–Q8 in the [comparison interview](../decisions.md#page-error-comparison-interview).
Essential new handoff/lifetime gates must pass before product wiring; an essential
failure requires a revised plan without wider permissions or a coordinator.
The slice is now implemented privately. [Production qualification and remaining gaps](../evidence/2026-10-26-phase2-page-error-comparison.md) record the subsequent delivery.
The standalone collector remains qualified at `d56b56f`; its
[evidence](../evidence/2026-10-24-phase2-page-errors.md) does not qualify this new
transfer or the shared source-binding rule.

Independent read-only planning review found no material issue in the selected
rules, sender boundaries, shared source binding, reset/copy lifetime or evidence
claims. The reviewer ran no probes or tests. The subsequent [candidate gate](../evidence/2026-10-26-page-error-comparison-feasibility.md)
passed before production wiring. Its synthetic authority does not qualify product
models, UI or delivery.

## Problem and result

The check tab retains counts while a user reproduces a broken interaction, but
an investigation cannot retain those observations beside its manual change.
Add optional fixed Before/After page-error attachments to the existing
investigation. Reuse the completed check and require explicit destination,
side and confirmation. Keep inventory-only and timing-only comparisons usable.

Each error attachment contains the existing two event counts, total, observed
duration and completion reason. Show the two summaries side by side. Add no
count difference, rate, automatic improvement rating or culprit verdict.
Stop can shorten an observation; reaching 200 censors later events. Even two
30-second attempts can reproduce different interactions. The user's existing
page assessment stays separate.

## Selected user flow

1. Open an investigation and explicitly capture Before inventory as today.
   Inventory-only comparisons remain available.
2. From the source page's actual popup, open a separate page-error check. Start
   deliberately, reproduce the interaction, and obtain a confirmed summary.
   Manual Stop, timeout and the event cap are eligible. Interrupted, denied,
   cancelled or invalid attempts are not.
3. Choose Attach to investigation in that completed check. Discover only eligible
   own normal-window investigation metadata. Select both investigation and Before
   explicitly, even when there is only one choice, then confirm.
4. The investigation retains its own canonical summary and source-tab binding.
   The completed check remains readable but cannot attach successfully again.
   Resetting or closing that check does not retract the destination's copy.
5. Make the change manually through the browser, reproduce the page as needed,
   and capture After inventory. Before error attachment must precede starting
   After inventory, even if that inventory request later fails.
6. Run a new explicit check from the same browser tab and attach its confirmed
   result to After. After requires successful After inventory and an existing
   Before error attachment. Reopen the source's popup to renew temporary access
   when necessary. AddonRay never reloads or retargets automatically.
7. Read Before/After counts, durations and completion reasons. A missing optional
   side remains visibly absent, not zero. All timing and error attachments share
   one source-tab ID, established by whichever attachment arrives first. A tab
   can navigate, so this does not establish matching pages or conditions.
8. Investigation Start over clears its inventories, timings, error attachments,
   assessment, source binding and generation. Either optional-permission
   revocation or destination teardown clears the whole investigation. The donor
   check retains its independent lifetime; a failed transfer preserves the
   investigation's existing observations.

A confirmed result is a past observation. Later source navigation or closure
must not trigger fresh inspection during transfer or turn it into zero. Its
original numeric source ID remains the binding; if that tab no longer exists,
a new After check cannot silently use another tab. Start over is the recovery
path for a different source.

Attachment order is not a trusted capture-time history. Because selection
happens after collection, AddonRay does not prove that an observation was taken
after a particular inventory or manual change. No timestamp, page identity,
navigation history or new collector is added to manufacture that claim.

## Acceptance criteria

| ID     | Required behavior                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2D-01 | Preserve both MV3 targets/minima, black default UI, quick inspections, standalone error checks, fixed inventory comparisons, optional timings and manual assessment. Error attachments are optional and start no collection implicitly.                                                                                                                                                                                                                 |
| P2D-02 | Keep required activeTab and optional management/scripting unchanged. Add no hosts, sensitive tab-metadata permission, background coordinator, storage, observer, persistent registration, external receiver, page bridge, web-accessible resource or new dependency.                                                                                                                                                                                    |
| P2D-03 | Only a current confirmed completed check may offer an eligible attachment. Manual Stop, timeout and the 200-event cap qualify. Denied, interrupted, cancelled, malformed and in-flight outcomes never attach or become zero. Keep the existing collector and its budgets unchanged.                                                                                                                                                                     |
| P2D-04 | Require explicit investigation, side and confirmation. Discovery returns bounded copied identity, synthetic label, generation and side eligibility only. It reads no destination observations and sends no summary or source ID to every destination. Retain no foreign Window/function/object/array in UI or model state.                                                                                                                              |
| P2D-05 | Error receivers accept only a verified current own packaged page-error check tab with its bound unused completed attempt. An arbitrary packaged page, unbound/reloaded check, content script, ordinary page, popup or external extension is not an error sender. Preserve the timing receiver's actual-popup boundary. These checks do not isolate compromised documents within the extension trust domain.                                             |
| P2D-06 | Sender and destination must be verified normal contexts. Private/incognito, unknown and failed classifications cannot discover, send or receive. Recheck current own-document context and permissions after awaits and at acceptance. Stored source context comes from the original validated check; no browsing-page enumeration, URL/title read or page-identity claim is added.                                                                      |
| P2D-07 | One fixed error attachment per side. Before requires successful Before inventory, no capture in progress, no existing error Before and After inventory not yet started. After requires successful After inventory, existing error Before, no capture in progress and no existing error After. Start over is required for replacement. Before-only data can remain visible when After inventory fails.                                                   |
| P2D-08 | The first timing or error attachment binds one numeric source-tab ID. Every later timing or error attachment must match it, including a timing Before arriving after an error Before. Preserve the timing pair's own eligibility/order rules and timing-only flow. A mismatch leaves all existing observations intact.                                                                                                                                  |
| P2D-09 | Each completed check may attach successfully once, to one investigation and side. Discovery, validation failure, cancelled selection and stale destination are not successful attachments. Donor reset/new attempt invalidates old selections and pending results. Reject duplicate/concurrent confirmation without filling another side or investigation.                                                                                              |
| P2D-10 | Validate exact existing summary fields, bounded counts/duration/completion invariants and the 1 KiB summary before destination-owned canonical copying. Transfer no raw event details, URL/title, inventory, page content, absolute time or arbitrary source object. Treat Chrome page-side values as untrusted limited observations.                                                                                                                   |
| P2D-11 | Resolve the chosen live document again at confirmation; verify identity, generation, current donor attempt, one-use eligibility, side, source match, context and permissions at commit. Reject reset/reload/close/revocation and never silently choose a replacement. Prevent late work from restoring erased data or consuming a different attempt.                                                                                                    |
| P2D-12 | After confirmed acceptance, retain an independent investigation-owned copy. Donor Clear/Start over, close/reload and later ordinary check failure do not retract it. Failed/stale transfers do not overwrite or discard valid inventories, timings, attachments or assessment. A lost acknowledgment must never permit duplicate committed use; surface a bounded uncertain outcome when appropriate.                                                   |
| P2D-13 | Investigation reset, either management/scripting removal, destination close/reload/unloading and last-subscriber teardown discard all its observations and source binding. Reject pending transfers from older generations. Keep other views independent except the browser-wide effect of grant revocation.                                                                                                                                            |
| P2D-14 | Render each side's two counts, total, duration and fixed completion reason with plain meanings. Explicitly explain shortened/capped intervals, variable interactions, tab-versus-page matching, Chrome interference and no causal diagnosis. No arithmetic error delta, per-second normalization, automatic score or hidden collector is added.                                                                                                         |
| P2D-15 | Keep persistent accessible labels, keyboard destination/side/confirm controls, visible focus, transfer status and recoverable empty/stale/denied states. Keep the completed donor result readable after acceptance. No destination or side is silently preselected.                                                                                                                                                                                     |
| P2D-16 | Before product wiring, prove the own check-tab-to-investigation path, normal-context classification, destination-owned copies, one-use behavior and reset/close/revocation races on disposable exact-version browsers. Declare candidate fixture authority. An essential failure returns to this plan; do not add permissions, background coordination or persistence as a fallback.                                                                    |
| P2D-17 | Deterministic tests cover both targets, all summary finish kinds, invalid payload/getter boundaries, ordering, fixed slots, shared cross-kind source binding in both orders, mixed optional flows, explicit selection, one use/concurrency, stale/reset/dead views, permission/context exceptions and independent lifetimes. Preserve timing and collector regressions.                                                                                 |
| P2D-18 | Independently review production, probes and evidence; pass mise run check and the Firefox/Chrome tasks. Qualify clean source rebuilds, local minimum/ESR/current Firefox and pinned Chrome, all six hosted Firefox/two Chrome jobs, and each head's browser/rebuild reports. Observe native unmodified select/confirm, retained copies, reset/close and actual revocation on available macOS targets. Preserve skipped or unavailable cases explicitly. |
| P2D-19 | Sign and push only to private ranokay/addonray main, record exact source/artifact/browser/authority/results/cleanup and update the resumption checklist. No issue/label, license, public visibility, store publication, new browser/manifest or companion change. Stop after these attachments.                                                                                                                                                         |

## Source facts before implementation

The following facts describe the baseline used to design the candidate. The
implemented ownership and guard changes are documented in the architecture and
qualification evidence.

`lib/investigation.ts` owns fixed inventories, optional timings, a manual
assessment and a source ID that currently binds the timing pair. Its timing
Before path does not test an already-bound source from another diagnostic kind.
The new shared binding therefore needs a guard in both attachment paths, not a
separate unchecked error-only ID. Reset must clear error fields with the rest.

`lib/page-error-check.ts` owns the original source ID, reset generation and final
canonical summary privately. It exposes no attachment/current/consume contract.
Add only the narrow completed-attempt contract needed for explicit handoff,
without exposing source IDs in UI discovery or changing collection/consent.

`lib/timing-handoff.ts` trusts actual popup senders and timing payloads. A check
tab cannot use it unchanged. Reuse appropriate validation, labels and
cross-document ownership principles while retaining distinct sender and payload
checks. Avoid a general transport framework or broader sender allowlist that
weakens the existing timing boundary.

A candidate uses own-view discovery, then resolves one selected investigation
again for transfer. Keep donor attempt freshness and one-use consumption with
its check owner; keep destination generation, source binding, side validation
and canonical storage with its investigation owner. Copy metadata and
acknowledgments into the receiving realm as well. Design acceptance so dead
views, lost acknowledgment and reentrancy cannot duplicate a committed result
or repopulate reset data. No page script controls attachment or gains privileged
browser actions.

[MDN getViews](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/extension/getViews)
documents access to Window objects for the extension's loaded packaged pages,
including tab views. This supports a candidate discovery mechanism, not proof of
this new donor/receiver protocol. Existing Firefox cross-view dead-object
observations in the [timing evidence](../evidence/2026-10-24-phase2-timing-comparison.md)
require independent receiving-realm copies. The subsequent candidate evidence establishes its bounded API feasibility;
production integration remains a separate gate.

## Feasibility and qualification sequence

1. Preserve the user's Q9 confirmation and approved scope. The user authorized
   feasibility-first implementation, tests, review and private push on 2026-10-24.
2. Use disposable normal-window source fixtures with exact production-budget
   permissions and declared authority to exercise the new check-tab sender and
   destination. Test selected delivery, forged/unbound senders, both source
   binding orders, fixed slots, one use, clear/reset/reload/close, permission
   rechecks and pending races. Prove receiving-realm ownership after donor close.
3. If an essential transport/lifetime gate fails, revise this plan before
   product wiring. Existing timing/collector success does not waive the gate.
4. Implement only the narrow model/handoff/UI integration and focused behavior
   regressions, then independently review production and probes. Add no collector
   or new overhead promise. Retain the collector's 1 KiB/5 ms p95 regression gates;
   distinguish injection/transport latency from that collector budget.
5. Pass development checks, sign implementation and qualify clean source
   rebuilds and pinned local browsers. Observe actual unmodified native
   select/confirm, donor close/reset survival, investigation reset and revocation
   where controllable. Keep API/source fixture evidence separate from usability.
6. Push privately, inspect all hosted jobs and revision-bound reports, record
   dated evidence/gaps, then sign/push documentation and verify its final head.

No report export/history, new collector, live counters, automatic reload,
extension-state changes, new target, page identity matching or Rust companion
follows from this slice. Existing native Linux/Windows, accessibility, private
context, BFCache, retail and signing qualification gaps remain separate.
