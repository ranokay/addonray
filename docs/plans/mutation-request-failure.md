# Mutation and request-failure checks

## Status

Approved by the user on 2026-11-06 as the #13 collector contract. This document
authorizes no runtime implementation, permission grant, browser evidence or
support claim. The current runtime has no mutation or request-failure collector.
[The v1 contract](../v1-contract.md) keeps existing runtime limits effective until
the feasibility gates and product qualification below pass.

## Problem and result

AddonRay needs two separate, bounded observations for troubleshooting: changes to
the current document's DOM and failures among the current page's own requests. A
count is evidence of what was observed, not proof that an extension, the network
or the page caused a problem.

The result is:

- **MUT-1**, a top-document mutation-notification count with no DOM content and
  no new permission;
- **REQ-1**, a selected-tab, selected-origin request-outcome count using optional
  `webRequest` access and a temporary host grant;
- a versioned way to attach either summary to an investigation, save it and
  represent it in reports without changing schema version 1.

## Approved choices

| ID    | Approved choice                                                                                                                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MUT-1 | Count top-document `MutationRecord` notifications by type for up to 30 seconds or 2,000 notifications, with a 1 KiB summary. Read no targets, attribute names or values, text or HTML. Add no permission.             |
| MUT-2 | The product calls the metric “mutation notifications observed.” A record is a batch notification, not one DOM operation.                                                                                              |
| MUT-3 | Proposed collector-work limits are setup 10 ms, callback 5 ms and aggregation/finalization 5 ms p95, with 100 ms total measured collector work per check. They are feasibility gates, not accepted CPU measurements.  |
| REQ-1 | Use optional `webRequest` plus temporary host access for the selected page's exact scheme and host. Collect only the selected tab and exact origin, including port.                                                   |
| REQ-2 | Count terminal observations only: completed requests (including HTTP 4xx/5xx) and network failures. Do not count started requests. Cap at 500 terminal observations or 30 seconds, with a 1 KiB summary.              |
| REQ-3 | Proposed collector-work limits are setup 10 ms, event 2 ms and aggregation/finalization 5 ms p95, with 100 ms total measured collector work per check. They are feasibility gates, not accepted CPU measurements.     |
| REQ-4 | Third-party requests, cross-origin frames and incomplete blocked-request coverage stay explicit. No causal or attribution claim is made.                                                                              |
| ATT-1 | A confirmed summary may be attached once to one investigation side. The investigation owns an independent copy and the same source-tab binding used by timing and page-error attachments.                             |
| SCH-1 | Schema version 1 stays unchanged. Schema version 2 adds optional mutation and request-failure blocks, and is used only when at least one is present. Version 1 reports remain importable; no field is added silently. |

## Common check model

Both checks follow one lifecycle:

1. The user opens a check from the selected page's popup.
2. The check tab owns the attempt and binds the original source tab's numeric ID.
3. An explicit Start begins observation. Opening the check collects nothing.
4. The check runs until Stop, the 30-second window, the count cap, or an abort.
5. One confirmed summary is produced. Clear or Start over discards it.
6. The check closes without retaining results.

Rules:

- At most one active mutation check and one active request-failure check may run
  per browser profile. A second Start fails closed until the active check is
  stopped or discarded.
- Only verified normal windows participate. Private, incognito and unknown
  contexts fail closed. Source and owner tabs use the existing normal-window
  classification.
- The timer is advisory. Each event and finalization compares monotonic elapsed
  time against the window. Events at or after 30,000 ms are excluded. A delayed
  timer may delay the summary; it cannot add late counts. Summary duration is
  clamped to the approved window.
- A count cap is authoritative. At the cap the check finalizes and ignores later
  events. A callback that receives more records or events than the remaining
  quota counts only the remaining quota.
- The summary is a fixed object, at most 1 KiB. No per-event list, queue, ring
  buffer, target, request ID, URL, header, body or timing list is retained.
- Teardown on owner-tab close (port disconnect), source-tab close or navigation,
  `pagehide` with back-forward-cache persistence, **external** permission removal,
  extension reload or context loss, and worker/event-page restart.
- A restored back-forward-cache document never resumes the old check. A restarted
  worker/event page makes the attempt `interrupted`; it never becomes an observed
  zero.
- Results and pending actions are invalidated by Clear, Start over, teardown,
  external permission removal, reset of the receiving investigation, or a stale
  generation. Expected operation-owned permission cleanup is not an external
  removal and does not invalidate a sealed result or an attached copy.

## MUT-1: mutation notifications

### Observation

Inject one isolated-world `MutationObserver` into the source tab's top document
with `childList`, `attributes`, `characterData` and `subtree: true`. Count the
`MutationRecord` notifications delivered while the check is active. Same-origin
iframes are not observed in v1; cross-origin frames are never observed. No new
host permission is added; existing optional `scripting` and the source grant are
used.

### What the count means

A `MutationRecord` is not one DOM operation:

- one `childList` record may describe several added or removed nodes;
- one `attributes` record describes one changed attribute on one element;
- one `characterData` record describes one text change;
- CSSOM changes, canvas drawing, property writes and internal browser work may
  produce no record at all.

The count therefore describes **mutation notifications**, not the number of DOM
changes made by a page or extension. The UI, saved record and report use that
wording. V1 does not add an affected-node count, which would be a different
metric with a different cap.

### Summary

```json
{
  "total": 0,
  "childList": 0,
  "attributes": 0,
  "characterData": 0,
  "finish": "stop",
  "observedMs": 0
}
```

Rules:

- `total = childList + attributes + characterData`.
- All counts are safe integers from 0 through 2,000.
- `finish` is `stop`, `timeout` or `limit`.
- `observedMs` is finite, from 0 through 30,000.
- `finish: "limit"` requires `total = 2,000`.
- `finish: "timeout"` requires `observedMs = 30,000`.
- `finish: "stop"` requires `observedMs` below 30,000.
- The serialized summary is at most 1 KiB.

Unavailable, denied, interrupted or invalid attempts produce no summary and
cannot be attached.

### Proposed collector-work limits

| Stage                        | Proposed p95 | What is measured                                                                     |
| ---------------------------- | ------------ | ------------------------------------------------------------------------------------ |
| Setup                        | 10 ms        | Observer installation through Start acknowledgement; permission prompt wait excluded |
| Callback                     | 5 ms         | Record counting, cap check and elapsed-time check                                    |
| Aggregation and finalization | 5 ms         | Summary validation, copy and message                                                 |
| Total per check              | 100 ms       | Sum of setup, callback and finalization elapsed collector work                       |

These are elapsed collector-instrumentation measurements, not a CPU profile. The
#14 feasibility record must reconcile the total with the worst-case callback
load, the browser's timer resolution and event-loop delay. If the bounded fixture
cannot meet the total because of those effects, the result is a failed feasibility
gate returned to the user, not a silently relaxed limit.

Measurement protocol:

- 30 samples per stage per target, nearest-rank p95.
- The existing shared budget helper's two-clock-step guard may be reused; its
  page-error limits are not.
- Retain raw arrays in ignored scratch space. Preserve failed attempts; do not
  substitute a later passing sample.
- Controlled cases: 0, 1, 100 and 2,000 notifications; one callback carrying a
  large batch; a delayed timer after a blocked event loop; a second concurrent
  check; owner close; source navigation; back-forward-cache entry and restore;
  optional-permission removal; worker/event-page restart.
- Record exact source revision, browser distribution and version, OS and
  architecture.

## REQ-1: request failures

### Permission model

The manifest adds `webRequest` to optional permissions and an optional host
template (`*://*/*`) that permits requesting a runtime origin. The template grants
nothing by itself and creates no install-time host access. At Start, inside the
user gesture, request together:

- `webRequest`;
- the selected source page's exact scheme and host as a host pattern
  (`scheme://host/*`, path ignored);
- no broader host pattern.

The host permission may cover multiple ports on that host because Firefox host
permissions do not support ports and Chrome treats an omitted port as a wildcard.
The **runtime filter** is stricter than the grant: a request is counted only when
all of the following match the selected page origin:

- `details.tabId` equals the bound source tab ID;
- the request URL's scheme is `http` or `https`;
- the request URL's hostname equals the selected hostname;
- the request URL's effective port equals the selected effective port;
- the initiator is present and its scheme, hostname and effective port equal the
  selected origin.

The effective port is the explicit URL port, or 80 for HTTP and 443 for HTTPS.
This prevents a scheme+host grant from collecting traffic on other ports. Opaque,
missing or unparsable initiators are excluded.

### Cleanup ownership, ordering and ledger

The check tab owns permission cleanup; the background collector does not. This
keeps the ownership snapshot alive when the background worker/event page restarts.
Before requesting any new permission, the check tab writes a small bounded
**permission-cleanup ledger** record to extension-origin IndexedDB:

```json
{
  "attemptId": "opaque-attempt-id",
  "originPattern": "https://example.com/*",
  "webRequestWasPreexisting": false,
  "originWasPreexisting": false,
  "state": "active"
}
```

The ledger contains no request, page or result data and adds no permission. It is
not a saved investigation or report. `state` is `active`, `sealed`, `cleaning`,
`done` or `failed`. A `done` record is retained for the current extension session
only to classify a late removal event; it is deleted on the next browser start.
A `failed` record remains until the user resolves the retained grant. A missing or
corrupt ledger record means cleanup ownership is unknown: the check fails closed
without requesting a new permission and no automatic removal is attempted.

Ordering:

1. The check tab snapshots whether `webRequest` and the exact origin grant already
   exist.
2. It writes the ledger `active` record before calling `permissions.request`. If
   that write fails, it does not request new permissions.
3. It requests only the missing permission pieces and collects the observation.
4. On finalization, the check tab validates and seals the summary, writes
   `sealed`, and publishes the confirmed result as eligible for attachment. The
   visible status is “temporary access cleanup pending.”
5. It writes `cleaning`, then removes only the permissions recorded as newly
   granted for this attempt. The ledger write must commit before
   `permissions.remove`.
6. On success it writes `done`; the result and any independent attached copy
   remain. The UI reports that temporary access was removed.
7. On failure it writes `failed`; the result remains, the UI reports that the
   exact grant remains, and it offers retry and user-controlled revoke. A retry
   returns to `cleaning`. Pre-existing grants are never removed.

Expected operation-owned cleanup is identified by the ledger record for the
attempt: the removal must be in state `cleaning` (or a same-session `done` record
matching the attempt), match the exact origin/API permission set, and concern a
permission recorded as newly granted. A pre-existing grant never matches expected
cleanup. Every other removal is **external**. A `done` record is invalidated when
a new check for the same origin starts or the same permission is granted again,
so a later external revocation cannot reuse an old cleanup identity. This rule is
checked from the ledger, not from message ordering, so a late
`permissions.onRemoved` event cannot erase a sealed result or an attached copy by
itself.

If a ledger transition write fails, the check does not perform automatic removal.
It keeps the confirmed result, reports cleanup as unverified, and leaves
reconciliation to the next extension open. Only a verified `cleaning` record
permits removal.

A user revocation that races the exact cleanup call is indistinguishable from
expected cleanup for that permission set. The small `cleaning` window is therefore
treated as operation-owned; a sealed result or attached copy may survive that
race. The UI never claims the grant remains after the permission is already gone.
#17 must record this bounded race; it is not a general permission-revocation
exemption.

Abrupt loss is explicit:

- a background worker/event-page restart interrupts collection; the check tab, if
  alive, still owns cleanup from the ledger;
- if the check tab is also lost, no result is published. On the next extension
  open, the ledger is reconciled against `permissions.contains`: newly granted
  pieces are removed, pre-existing pieces are preserved, and a failed removal is
  reported as a retained grant;
- if the ledger is absent or unreadable, the product does not guess. It leaves the
  grant in place and points the user to the browser's extension permission
  controls for user-controlled review; it does not remove an origin on an
  unverified ownership record. This is a feasibility limitation, not a claim of
  guaranteed cleanup after abrupt loss.

A denied optional permission leaves the check unavailable. There is no fallback
to a broader grant, a different tab or another origin.

### Observation

Use extension-side `webRequest.onCompleted` and `webRequest.onErrorOccurred`
listeners, registered at the top level of the background event page/service
worker. Listeners ignore all events unless an active check matches the generation
and source tab. Do not use `onBeforeRequest` and do not count started requests.

Count one terminal event per request:

- `onCompleted` with status 200–599 terminates the observation; 400–599 is an
  HTTP error, 200–399 contributes only to the observed total;
- `onErrorOccurred` is a terminal failure; it may describe a network fault or
  a browser block, and the product does not attribute it;
- redirect hops are not separate observations; #17 must prove no double count for
  redirected requests.

What is visible:

- same-origin requests and same-origin subframes whose request URL and initiator
  match the selected origin;
- HTTP 4xx/5xx responses, because those are completed requests;
- network, DNS, connection and TLS failures reported by `onErrorOccurred`;
- some blocked requests, when the browser emits `onErrorOccurred` for them.

What is not visible:

- third-party, CDN and cross-origin-frame requests;
- blocked requests that the browser does not expose to `webRequest`;
- request headers, bodies, response content, cookies, credentials or status text;
- a guaranteed distinction between a network failure and a blocked request.
  Chrome's error string is not stable and must not be parsed into a product
  verdict.

The check reports observed evidence for the selected origin. It never says that
an extension, proxy, network or server caused a failure. “No failures observed”
is qualified by the origin, terminal-event and blocked-coverage limits.

### Background lifetime

This contract adds a background event page (Firefox) or service worker (Chrome)
that is registered at extension load but counts only during an active check.
Listeners are top-level and event-driven; no ambient collection occurs.

Chrome service workers may terminate after about 30 seconds without activity.
The check tab keeps the active attempt alive with a bounded heartbeat/connection
and fails closed to `interrupted` if the worker restarts. Firefox event pages may
unload similarly. #17 must prove the 30-second window, keepalive, termination
detection and cleanup on Chrome 156 and the pinned Firefox versions. If the
window cannot be held without a wider permission or a persistent background
page, the result returns to the user with a shorter window or a different
mechanism.

### Summary

```json
{
  "observed": 0,
  "httpErrors": 0,
  "networkFailures": 0,
  "byType": {
    "document": 0,
    "stylesheet": 0,
    "image": 0,
    "media": 0,
    "font": 0,
    "script": 0,
    "xhr": 0,
    "fetch": 0,
    "websocket": 0,
    "other": 0
  },
  "finish": "stop",
  "observedMs": 0
}
```

Rules:

- `observed` is the number of terminal observations, from 0 through 500. It
  includes completed 2xx/3xx responses and all errors; it is the coverage
  denominator, not a success metric.
- `httpErrors` counts completed 4xx/5xx responses.
- `networkFailures` counts terminal `onErrorOccurred` observations. Some
  browser-blocked requests also surface through that event, so the field is a
  terminal-failure count, not proof of a network fault.
- `httpErrors + networkFailures` is at most `observed`.
- Each `byType` value counts terminal failures of that resource type, and their
  sum equals `httpErrors + networkFailures`.
- `finish` is `stop`, `timeout` or `limit`.
- `observedMs` is finite, from 0 through 30,000.
- `finish: "limit"` requires `observed = 500`.
- `finish: "timeout"` requires `observedMs = 30,000`.
- `finish: "stop"` requires `observedMs` below 30,000.
- The serialized summary is at most 1 KiB.
- No request ID, URL, initiator, status text, error string, IP or header is
  retained.

### Proposed collector-work limits

| Stage                        | Proposed p95 | What is measured                                                                                                      |
| ---------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------- |
| Setup                        | 10 ms        | Listener registration and active-check record through Start acknowledgement; permission prompt and user wait excluded |
| Event                        | 2 ms         | Origin/tab filter, terminal classification, counter and cap/elapsed check                                             |
| Aggregation and finalization | 5 ms         | Summary validation, copy and message                                                                                  |
| Total per check              | 100 ms       | Sum of setup, event and finalization elapsed collector work                                                           |

The same elapsed-work caveat and measurement protocol as MUT-1 apply. The
worst-case fixture must include 500 terminal events arriving in bursts, a delayed
timer, a service-worker restart attempt, and redirects. The 100 ms total is not a
claim that the collector uses 100 ms of CPU.

## Attachments, saved history and reports

### Investigation attachment

A completed, confirmed MUT-1 or REQ-1 summary may be attached to one explicit
Before/After side after destination and side confirmation. The rules match the
existing page-error attachment contract:

- only a confirmed summary is eligible; denied, interrupted, invalid, closed or
  discarded checks are not;
- one attachment per side and observation kind;
- Before must be attached before the After inventory capture begins; After
  requires its successful inventory;
- a successful check can attach once after sealing, including while
  operation-owned cleanup is pending or has reported a retained grant; its
  standalone result remains until the check resets or closes;
- the investigation owns an independent bounded copy that survives donor reset,
  donor close and expected operation-owned cleanup;
- all timing, page-error, mutation and request attachments in one investigation
  share the numeric source-tab ID of the first attachment;
- a matching tab ID does not prove the same page or document;
- investigation Start over, **external** permission revocation, or destination
  close/reload discards the copy and invalidates pending transfers. The
  permission-cleanup ledger is consulted to distinguish expected operation-owned
  cleanup from external revocation, including for a late `onRemoved` event;
- stale, duplicate, wrong-side or wrong-generation transfers fail without
  changing existing observations.

No attachment resumes collection, reloads the page or changes an extension.

### Schema compatibility

Schema version 1 is frozen. Its existing fields and strict validation do not
change, and existing version 1 exports and saved records remain readable and
importable. No silent field is added to version 1.

Schema version 2 adds two required maps and extends the fixed observation limits:

```json
{
  "schemaVersion": 2,
  "provenance": "captured",
  "report": {
    "before": { "extensions": [] },
    "after": { "extensions": [] },
    "changes": [],
    "assessment": null,
    "timing": { "before": null, "after": null },
    "pageErrors": { "before": null, "after": null },
    "mutations": { "before": null, "after": null },
    "requestFailures": { "before": null, "after": null },
    "observationLimits": {
      "pageErrorWindowMs": 30000,
      "pageErrorEvents": 200,
      "pageErrorSummaryBytes": 1024,
      "mutationWindowMs": 30000,
      "mutationNotifications": 2000,
      "mutationSummaryBytes": 1024,
      "requestWindowMs": 30000,
      "requestObservations": 500,
      "requestSummaryBytes": 1024
    }
  }
}
```

Rules:

- A new export uses version 1 when both `mutations` and `requestFailures` contain
  only nulls. It uses version 2 when either map contains a summary.
- Version 2 requires both maps and all new observation-limit keys. Null means
  “not attached”; a summary is validated by the MUT-1 or REQ-1 rules.
- Version 1 reports remain importable. When the import path adds version 2
  support, imports of version 1 and version 2 both produce the same in-memory
  optional maps, with version 1 maps set to null.
- An older product that receives version 2 reports an unsupported version. It
  does not downgrade, drop fields or reinterpret the report.
- A saved record created from a version 2 report carries `schemaVersion: 2` and
  the same report shape. Existing version 1 records remain listed and readable.
  Unsupported versions remain listed for explicit deletion, as before.
- Version 2 keeps the 1 MiB complete JSON bound, 1,000 inventory entries per
  side, 2,000 changes, 4,096 code points per string and depth 8. A summary that
  makes the document exceed 1 MiB fails without truncation.
- Markdown and printable HTML add “Mutation notifications” and “Request-failure
  observations” sections only when the corresponding block is present. They show
  both sides, explicit “Not attached” states, counts, duration and completion
  reason. They add no difference, rate, ranking or causal verdict.
- Imported version 2 content remains untrusted and read-only. Re-export keeps its
  imported provenance.

No migration rewrites version 1 records. No schema field is recomputed from names
or current page state.

## Privacy and permission boundary

- MUT-1 adds no permission and retains no page content.
- REQ-1 adds optional `webRequest` and a temporary exact-origin host grant. Install
  time gains no host access. The background context counts only during an active
  check and retains fixed counters only. The small permission-cleanup ledger
  stores only attempt IDs, the exact origin pattern, pre-existing/newly granted
  flags and cleanup state. It stores no request, page or result data and is
  deleted when its cleanup lifetime ends.
- Neither check runs continuously, survives navigation or resumes from a saved
  record.
- Neither check reads request details, DOM content, extension IDs, URLs, titles,
  cookies or credentials into results.
- Results are memory-only until an explicit attachment or Save. Attachments and
  saved records follow the existing saved-data contract.
- A failed permission request, origin mismatch, unsupported page or absent
  background context produces an unavailable result, not a broader fallback.

## Feasibility and qualification gates

| Gate                     | Required proof                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #14 mutation feasibility | Controlled positive/negative fixtures on intended Firefox and Chrome versions; 0/1/100/2,000 notifications; setup/callback/finalization elapsed p95 and total; delayed timer; second check; owner close; source navigation; BFCache; permission removal; worker restart; exact source/browser/OS.                                                       |
| #17 request feasibility  | Terminal-event visibility for 2xx/3xx/4xx/5xx, network failure and observable blocked cases; exact origin including port filter; third-party/cross-origin exclusion; initiator rule; cleanup ledger and grant ownership; 30-second window; heartbeat and worker restart; redirect double-count check; 0/1/100/500 observations; budgets; exact targets. |
| #15 mutation product     | Implement only the qualified MUT-1 contract; deterministic and browser evidence separate.                                                                                                                                                                                                                                                               |
| #18 request product      | Implement only the qualified REQ-1 contract, permission disclosure and background lifetime.                                                                                                                                                                                                                                                             |
| #16/#19 attachment       | Independent copies, source binding, one-use, stale/duplicate/reset/revocation/donor-close behavior, schema compatibility and privacy.                                                                                                                                                                                                                   |
| #29/#30/#31/#34/#38      | Private/unknown guards, navigation/BFCache cleanup, download/print interaction where relevant, accessibility and security review.                                                                                                                                                                                                                       |

Request cleanup and revocation proof must cover:

- normal completion: seal, publish, ledger `cleaning`, remove only newly granted
  permissions, ledger `done`, result remains and attachment succeeds;
- late `permissions.onRemoved`: a matching event after `done` does not clear the
  result or attached copy; a removal outside a matching ledger state does;
- external revocation during `active`, `sealed`, `cleaning` for a different
  permission, `failed` and after attachment: live results and pending transfers
  clear, and an attached copy clears per the investigation rule;
- pre-existing `webRequest` or origin grants: they are not removed, and an
  external removal of them is treated as external;
- cleanup failure and retry: result remains, retained grant is disclosed, and a
  later external removal clears;
- worker restart with the check tab alive: no result, cleanup still possible;
- owner-tab loss before/after sealing: ledger reconciliation on next open removes
  only newly granted permissions; a missing/corrupt ledger performs no automatic
  removal and reports unverified cleanup;
- ledger write failure before request: no new permission is requested.

An essential failure in #14 or #17 returns to the user with a revised plan. It
does not widen permission, lengthen retention or claim unsupported coverage.

## Current runtime

The current runtime has no mutation or request-failure collector, no background
service worker/event page for these observations, no `webRequest` permission, no
optional host grant, no permission-cleanup ledger and no schema version 2.
Existing page-error, timing, inventory, saved-data and report behavior is
unchanged.

## Issue map

| Issue                   | Contract use                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| #13                     | This document records the MUT-1 and REQ-1 decision.                                        |
| #14                     | Prove MUT-1 on controlled fixtures before product wiring.                                  |
| #15                     | Implement the qualified MUT-1 product check.                                               |
| #16                     | Attach MUT-1 summaries and extend saved/report representation.                             |
| #17                     | Prove REQ-1 visibility, permission, lifetime and budget behavior.                          |
| #18                     | Implement the qualified REQ-1 product check.                                               |
| #19                     | Attach REQ-1 summaries and extend saved/report representation.                             |
| #29, #30, #31, #34, #38 | Qualify guards, cleanup, outputs, accessibility and claims against the implemented checks. |
