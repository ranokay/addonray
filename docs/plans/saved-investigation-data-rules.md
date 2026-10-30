# Saved-investigation and report-exchange data contract

Status: approved by the user on 2026-10-30 after Q1 through Q16. The bounded
#6 slice now implements explicit save, local list, read-only reopen and
single-record delete in extension-origin IndexedDB without a new permission.
Import, JSON exchange, printable HTML, clipboard, retention controls and bulk
deletion remain future #7 through #11 work. See the
[Stage 1 feasibility record](../evidence/2026-10-30-saved-storage-feasibility.md)
and [Stage 2 product evidence](../evidence/2026-10-30-saved-investigations.md).
The existing live Markdown report remains the only report output. See
[the interview record](../decisions.md#saved-investigation-and-report-exchange-interview).

Issue [#5](https://github.com/ranokay/addonray/issues/5) settles the product and
data rules for [#6](https://github.com/ranokay/addonray/issues/6) through
[#11](https://github.com/ranokay/addonray/issues/11). Issue #5 itself authorized
no runtime, manifest, permission, dependency, support, publication or licensing
change. The [v1 contract](../v1-contract.md) records the supersession rules. The
bounded #6 slice is implemented and locally qualified under this contract; the
remaining tickets still need their applicable feasibility gates and behavior
qualification before they become effective.

## Problem and result

The current investigation and its prepared report live only in the owning view's
memory. A downloaded Markdown file can outlive it. The approved v1 scope adds
explicit saved investigations and report exchange. This contract defines what can
be saved, where it lives, how long it lives, who can use it, what leaves the
product, and how imported content is treated. It adds no storage or exchange
behavior by itself.

## Approved choices

The user approved these rules on 2026-10-30. Q1 through Q6 settle the archive
model, local-only boundary, normal-window guard, format set, fixed field sets and
schema versioning. Q7 through Q16 settle the payload, identifiers, timestamps,
retention, bounds, permission revocation, deletion, imports, validation and
output trust. The detailed answers are in the
[interview record](../decisions.md#saved-investigation-and-report-exchange-interview).

## Saved archive model

A **saved investigation** is an immutable, read-only archive created by an
explicit Save action. Save is available only when both inventories succeeded,
no inventory capture, attachment transfer or report action is in progress, and
the owning view is a verified normal window. Optional assessment, timing and
page-error attachments may be absent and stay explicitly not recorded or not
attached.

Each Save creates a new archive with a new local record ID. It never updates an
existing archive and never autosaves. A repeated explicit Save of the same live
investigation creates a separate archive.

Reopening reads the stored record and performs only the narrow current-view
context and storage eligibility checks needed for the approved normal-window and
availability boundary. It does not collect inventory, inspect a page, prompt for
management or scripting, reattach a source tab, resume a collector or accept new
observations. The archive view is read-only. #6 implements review and single
delete; export, print, copy, retention controls and bulk deletion are later
tickets under this contract.

### Local record envelope

| Field           | Stored locally | Exchanged | Rule                                                                     |
| --------------- | -------------- | --------- | ------------------------------------------------------------------------ |
| `schemaVersion` | Yes            | Yes       | Integer. The first approved version is `1`.                              |
| `recordId`      | Yes            | No        | Random, opaque and local only. Never derived from a session or tab.      |
| `origin`        | Yes            | No        | `captured` or `imported`. The exchanged `provenance` is derived from it. |
| `savedAt`       | Yes            | No        | Local save time. Used for retention and the generated library label.     |
| `expiresAt`     | Yes            | No        | Local retention deadline. Never exported.                                |
| `importedAt`    | Yes            | No        | Present only for imported records. Never exported.                       |

The library label is generated from `savedAt`, the assessment and a short
record-ID suffix. It is not user-authored and never enters an exchange.

### Archived observations

| Field              | Exchanged | Rule                                                                                                                                                                                  |
| ------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before inventory   | Yes       | Array of extension rows with `name`, `version` and `enabled`. The report shows the row count.                                                                                         |
| After inventory    | Yes       | Same shape as the Before inventory.                                                                                                                                                   |
| Inventory changes  | Yes       | `added`, `removed`, `enabled` and `disabled` entries with `name`, `version` and `enabled`. Computed before saving with the existing extension-ID comparison and retained as captured. |
| Page assessment    | Yes       | `better`, `unchanged`, `worse`, `uncertain` or `null` for not recorded.                                                                                                               |
| Timing Before      | Yes       | `null` for not attached, or three milestone measurements.                                                                                                                             |
| Timing After       | Yes       | Same shape as Timing Before.                                                                                                                                                          |
| Page errors Before | Yes       | `null` for not attached, or counts, total, completion reason and observed duration.                                                                                                   |
| Page errors After  | Yes       | Same shape as Page errors Before.                                                                                                                                                     |
| Observation limits | Yes       | Fixed numeric limits that applied to the capture. The explanatory limit text is generated from the schema version.                                                                    |

A timing milestone is one of `measured` with milliseconds, `unrecorded`, or
`unavailable`. An absent timing side or page-error side is `null`. Missing,
unknown and not-recorded states are never replaced with zero, empty text or a
default. Inventory rows are as reported. Derived timing differences are computed
for display only and are not stored.

The archive omits extension IDs, source tab IDs, the live investigation identity
and label, document, attempt and transfer IDs, permission and host metadata, page
URLs, titles and content, browser and OS context, user notes, custom titles and
exchanged timestamps. It stores no extension-ID hash and no substitute session
identifier.

Extension names and versions can duplicate. The archive therefore may contain
indistinguishable display rows. The precomputed change list is still the exact
ID-based result from the capture. The Markdown and printable HTML reports must
state this limit. The JSON carries the schema version and observation limits
that imply it. The report must never recompute archived changes from names.

### Storage boundary and disclosure

Saved records live only in extension-origin storage in the current browser
profile. There is no automatic sync, cloud, telemetry, companion or cross-device
transfer. Any AddonRay extension page in that profile can read the records.
Other extensions and web pages cannot read AddonRay's extension origin. The
chosen storage mechanism must keep records unreadable by AddonRay content
scripts unless a later approved contract explicitly allows otherwise. AddonRay
adds no encryption layer. Whether the browser or OS encrypts profile storage is
outside this contract.

Before the first save, the UI and privacy documentation disclose that:

- records persist on this device and browser profile;
- AddonRay extension pages can read them;
- no sync, cloud, telemetry or companion transfer exists;
- AddonRay adds no encryption;
- deletion and expiry are product-level actions, not guarantees about browser
  or OS backups, profile copies or lower storage layers;
- uninstall clearing is browser-controlled and can have documented exceptions;
- exported files, prints and clipboard content leave AddonRay's control.

The #6 implementation uses extension-origin IndexedDB without a new manifest
permission. The Stage 1 candidate gate observed quota behavior, persistence
across restart, controlled store loss, multi-view deletion barriers and the
approved bounds on the pinned Firefox and Chrome targets. The supervisor
accepted the mechanism for the bounded #6 slice on 2026-10-30. Natural eviction,
an actual Chrome quota error, verified Firefox post-clear emptiness and an
exercised Chrome private main-frame library guard remain explicit gaps; the
current Chrome main-frame route is policy-blocked. The
50-record, 5 MiB and 1 MiB limits are product bounds, not IndexedDB or browser
quota promises, and no persistence grant is claimed.

### Save eligibility and failure

Save checks the exact live snapshot reference and reset generation. It rechecks
normal-window context and current live permission state before commit. The save
fails with a bounded result and writes no record when:

- either inventory is missing or unsuccessful;
- a capture, attachment or report action is in progress;
- the owning view is private, incognito or unclassifiable;
- the investigation reset, the source changed, a permission was removed or the
  context became private or unknown after the save began;
- the record would exceed any approved bound;
- storage is unavailable or quota fails.

An ordinary storage, quota, size or output failure preserves the current valid
live investigation. A reset or permission removal keeps its existing clearing
semantics and invalidates the save. A changed source or context invalidates the
save under the existing investigation rules. A failed save writes no partial
record and never restores discarded data. No save prompts for a new permission.

### Retention and expiry

The default retention is 30 days from `savedAt`. #7 may offer 7, 30 or 90 days.
No record may be kept beyond 90 days from its original `savedAt`, and a retention
change cannot extend a record past that 90-day maximum.

An expired record becomes unavailable to product use. It is not listed as an
available archive and cannot be opened, exported, printed, copied or re-saved.
AddonRay removes it when it next accesses storage. There is no background timer
in v1. Expiry is a product-level refusal plus lazy cleanup, not a hard physical
on-disk deletion deadline. Browser and OS backups, profile copies and lower
layers may retain bytes. The contract does not claim that every retained byte
disappears at 90 days.

Unsupported saved records remain listed for explicit deletion even when their
retention metadata cannot be interpreted. They are not auto-migrated, rewritten
or silently deleted.

### Library bounds and accounting

| Bound                      | Value | Accounting rule                                                                      |
| -------------------------- | ----- | ------------------------------------------------------------------------------------ |
| Saved records              | 50    | Captured and imported records share the limit.                                       |
| Total stored bytes         | 5 MiB | Complete serialized records, including the local envelope.                           |
| Per-record stored bytes    | 1 MiB | Complete serialized record, including the local envelope.                            |
| Per-record JSON export     | 1 MiB | Complete UTF-8 JSON document, including keys, punctuation and serializer whitespace. |
| Imported JSON file         | 1 MiB | Complete UTF-8 file before parsing.                                                  |
| Inventory entries per side | 1,000 | Each Before and After inventory.                                                     |
| Inventory changes          | 2,000 | The retained precomputed change list.                                                |
| String length              | 4,096 | Unicode code points per string.                                                      |
| Nesting depth              | 8     | Nested object and array levels.                                                      |
| Markdown document          | 1 MiB | Existing complete UTF-8 report bound.                                                |
| Printable HTML document    | 1 MiB | Complete escaped document, including markup and inline CSS.                          |

Save serializes the exact would-be JSON export and checks both the stored record
and the export against their limits before commit. The local envelope is counted
in the stored record and the 5 MiB total but not in the exported document. The
1 MiB import cap and the 1 MiB stored-record cap apply to different byte sets:
the import cap covers the complete JSON file, while the stored-record cap covers
the complete local record including the envelope. No operation truncates. An
accepted export can be re-imported for read-only inspection without hitting the
file or schema caps. Saving an imported report is a separate operation subject to
the stored-record cap. A maximum-size import is view-only if the local envelope
would exceed the stored-record bound. A future schema or serializer change that
grows the representation must repeat the round-trip check before release.

When the library is full, AddonRay removes expired and deleted records first. If
the new record would still exceed 50 records or 5 MiB, Save fails with a clear
message. Unexpired records are never auto-evicted. The current valid live
investigation stays.

### Delete, delete-all and concurrent views

Deleting one record removes it from the library and across AddonRay views. Open
archive views become deleted views. They cannot be reopened, exported, printed,
copied or saved back into the library. Pending actions fail. Deleting an already
deleted record is idempotent.

Delete-all requires explicit confirmation and removes every saved record with
the same global invalidation. #6 implements single-record delete. #7 implements
bulk deletion and delete-all under this contract.

Multiple views may list and open the same archive read-only. Save is add-only and
deletion is the only mutation. A view that is suspended may not run code
instantly. The contract requires that its next read or action fails and cannot
hand off data. It does not promise instantaneous JavaScript execution inside a
suspended view. A save that began before a delete or delete-all cannot complete
after it, so a pending write cannot resurrect a deleted record.

### Permission revocation and pending saves

Saved archives remain inspectable, exportable, printable, copyable and deletable
after management or scripting permission is revoked. Revocation clears live
investigations and cancels pending live saves. It does not delete, hide or lock a
saved archive. Viewing or exchanging a saved archive does not request a new
management or scripting permission.

A pending live save fails if its source investigation resets, either permission
is removed, the investigation changes or normal context is lost before commit.
No partial or post-revocation save is written. New live captures still need the
existing consent and permissions. Imported records are independent of collection
permission because they came from a file.

If a future storage or clipboard mechanism uses a permission, its removal
behavior is not covered by this contract and must be defined and qualified before
implementation.

### Normal, private and unknown contexts

Every saved-data and exchange action requires a verified normal window. This
includes save, list, reopen, delete, delete-all, import, save imported report,
export, print and clipboard. Private, incognito and unknown contexts fail closed
and expose no saved data.

The guard is independent of management or scripting permission. A saved archive
is not more trusted because its collection permission is gone. AddonRay checks
context at open and again before each output or mutation. If the context becomes
private or unknown, the action fails without exposing more data. Existing local
inspection in private windows stays unchanged; this rule governs saved and
exchanged data.

### Unsupported saved records

A saved record with an unsupported schema version is listed as "Unsupported
saved record." It cannot be opened, exported, printed or copied. The user may
delete it. AddonRay does not auto-migrate, rewrite or silently delete it. A
future migration needs its own approved contract, migration rules and tests.

## Report exchange

### Formats

| Format    | Output                                                                                       | Bound |
| --------- | -------------------------------------------------------------------------------------------- | ----- |
| Markdown  | Exact reviewed Markdown text and generic `.md` download. Existing human-readable format.     | 1 MiB |
| JSON      | Exact reviewed versioned JSON and generic `.json` download. Export and import.               | 1 MiB |
| HTML      | Self-contained printable HTML and browser Print/Save as PDF. No scripts or remote resources. | 1 MiB |
| Clipboard | Exact reviewed Markdown text copied only by an explicit action.                              | 1 MiB |

Each output has its own exact preview in its own representation. There is no
hidden conversion between formats. JSON export and import use schema version 1.
The printable HTML page uses inline CSS only, loads no remote font, image, script
or other resource, and renders all report text as escaped text. It adds no PDF
library or dependency. Clipboard copy is its own reviewed Markdown representation,
not a copy of the JSON or HTML source.

A download or print request is not proof of acceptance or completion. Keep the
view open until the browser shows a download. The print dialog's outcome is not
observable. Clipboard success is reported only after the clipboard write
resolves. Denied or failed clipboard writes are reported as failures.
Browser-accepted files, prints and clipboard content can outlive archive
deletion, permission revocation or closing the view. AddonRay cannot recall
them.

### JSON schema version 1

```json
{
  "schemaVersion": 1,
  "provenance": "captured",
  "report": {
    "before": {
      "extensions": [{ "name": "Example", "version": "1.0", "enabled": true }]
    },
    "after": {
      "extensions": [{ "name": "Example", "version": "1.0", "enabled": true }]
    },
    "changes": [],
    "assessment": "unchanged",
    "timing": {
      "before": null,
      "after": {
        "domContentLoaded": { "status": "measured", "milliseconds": 120.5 },
        "loadEvent": { "status": "unrecorded" },
        "firstContentfulPaint": { "status": "unavailable" }
      }
    },
    "pageErrors": {
      "before": null,
      "after": {
        "scriptErrors": 1,
        "unhandledRejections": 0,
        "total": 1,
        "finish": "stop",
        "observedMs": 12000
      }
    },
    "observationLimits": {
      "pageErrorWindowMs": 30000,
      "pageErrorEvents": 200,
      "pageErrorSummaryBytes": 1024
    }
  }
}
```

A change entry is `{ "kind", "name", "version", "enabled" }` with `kind` one of
`added`, `removed`, `enabled` or `disabled`. An inventory entry is
`{ "name", "version", "enabled" }`.

`provenance` is `captured` or `imported`. It is descriptive and untrusted on
import. The local record origin is always `imported` for a file, regardless of
the file's claim. Re-export uses the local origin. A file that claims `captured`
never becomes a local capture.

`assessment` is one of the four assessment values or `null`. Timing measurements
use `measured`, `unrecorded` or `unavailable`. A measured `milliseconds` value is
a finite number from 0 through `Number.MAX_SAFE_INTEGER`. A page-error
`observedMs` value is a finite number from 0 through 30,000. Page-error
attachments also keep the existing finish, count and duration consistency rules.
The JSON report carries no extension IDs, source tab IDs, record IDs, local
timestamps, page or browser context, user text or derived differences.

### Strict import

Import requires explicit file selection. AddonRay rejects a file larger than
1 MiB before parsing. It then applies strict JSON parsing and schema validation:

- accept only schema version 1;
- reject unsupported versions with a clear result and no migration;
- reject unknown fields at every level;
- reject duplicate keys;
- reject `__proto__`, `prototype` and `constructor` keys;
- reject non-finite numbers, wrong types, negative or above-range `milliseconds`
  and `observedMs` values, out-of-range counts and malformed status values;
- enforce the inventory, change, string, nesting and byte bounds;
- preserve measured, unrecorded, unavailable and null states exactly.

A valid import opens as an explicitly labelled "Imported report" in a read-only
view. It is untrusted text. It makes no inventory or page collection call,
inspects no page, resumes no collector, reattaches no source tab and cannot be
attached to a live investigation. It performs only the narrow current-view
context and storage eligibility checks needed for the approved normal-window and
availability boundary. Import alone does not persist anything.

A separate "Save imported report" action persists the validated content as an
imported record under the same library, retention, deletion, context and bounds
rules. Save imported report applies the 1 MiB stored-record bound including the
local envelope. A maximum-size import that would exceed that bound after the
envelope is added remains view-only. The imported view stays available for
inspection or deletion. The interface must disclose that before the save action.
No operation truncates or writes a partial imported record. The record keeps a
local `importedAt` and imported origin. AddonRay stores neither the original
filename nor path. Every re-export keeps the imported provenance marker and never
presents the content as a local capture.

### Round-trip and oversize behavior

The save, JSON export and import limits share the same numeric 1 MiB cap but
apply to different byte sets. Save checks the exact would-be export before
commit. Any accepted JSON export is re-importable for read-only inspection under
the approved file and schema bounds. Saving the imported record is a separate
operation subject to the stored-record cap. No operation truncates, repairs an
out-of-range value or silently drops content. An oversized save, export, print
preparation, clipboard preparation or import fails with a bounded result. It
preserves the current valid record or live state, subject to the reset,
permission and context invalidation rules above, and never restores discarded
data.

A report that fits the JSON bound but whose printable HTML representation exceeds
1 MiB cannot be printed. Its JSON and Markdown outputs remain available if they
fit their own bounds. This is a presentation limit, not a data-loss path.

## Trust boundaries and exclusions

- No sync, cloud, telemetry, accounts, companion transfer or remote endpoint.
- No automatic save, autosave, automatic history or recovered live session.
- No editable or resumable saved investigation.
- No collector, source tab or browser observation resumes from an archive or
  import. The narrow current-view context and storage eligibility checks do not
  collect observations.
- No per-field redaction, omit-names control, user notes or custom titles.
- No extension IDs, extension-ID hashes, live session identifiers, source tab
  IDs, document or attempt IDs.
- No page URL, title, content, cookie, token, raw error detail, permission or
  host metadata, absolute timestamp, browser or OS context in exchanged content.
- No new permission in #5. `storage`, `unlimitedStorage`, `downloads`,
  `clipboardWrite`, host access or native messaging need their own decision and
  evidence if a later mechanism requires them.
- No PDF library, new dependency, new browser target or support expansion.
- No publication, licensing or visibility change.
- No claim that deletion, expiry or uninstall physically erases every browser
  or OS copy.

## Acceptance criteria

| ID     | Required behavior                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SRD-01 | Save only a completed, idle investigation with both inventories successful and a verified normal window. Each explicit Save creates a new immutable record. No autosave and no update of an existing record.                                                                                                                                                                                                                         |
| SRD-02 | Store both inventories, the precomputed ID-based changes, assessment, optional timing and page-error summaries and observation limits. Omit extension IDs and all live or ephemeral identifiers.                                                                                                                                                                                                                                     |
| SRD-03 | Preserve measured, unrecorded, unavailable and null states. Allow duplicate names. Never recompute archived changes from names.                                                                                                                                                                                                                                                                                                      |
| SRD-04 | Reopen read-only. Never collect inventory or page data, prompt for management or scripting, reattach a source tab, resume a collector or accept new observations. Perform only the narrow current-view context and storage eligibility checks needed for the approved normal-window and availability boundary.                                                                                                                       |
| SRD-05 | Keep records in extension-origin storage in the current browser profile with no sync, cloud, telemetry or companion path. Disclose the access and retention boundary before the first save.                                                                                                                                                                                                                                          |
| SRD-06 | Try IndexedDB without a new permission in #6, behind the approved Firefox and Chrome feasibility checks. Return with evidence before proposing any storage permission.                                                                                                                                                                                                                                                               |
| SRD-07 | Require a verified normal window for every saved-data and exchange action. Private, incognito and unknown contexts expose no saved data. The guard is independent of collection permission.                                                                                                                                                                                                                                          |
| SRD-08 | Apply 30-day default retention, 7/30/90-day choices and a 90-day maximum from `savedAt`. Expiry refuses product use and triggers lazy cleanup, not a hard physical deletion deadline.                                                                                                                                                                                                                                                |
| SRD-09 | Enforce 50 records, 5 MiB total and 1 MiB per record with complete serialized accounting, including the local envelope. Refuse a save when full and never evict unexpired records.                                                                                                                                                                                                                                                   |
| SRD-10 | Fail a save without a partial write when eligibility, bounds, storage, permission or context fails. An ordinary storage, quota, size or output failure preserves the current valid live investigation. A reset or permission removal keeps its existing clearing semantics, and a changed source or context invalidates the save. A pending save cannot outlive those changes, restore discarded data or resurrect a deleted record. |
| SRD-11 | Keep saved archives available after management or scripting revocation. New capture still requires consent.                                                                                                                                                                                                                                                                                                                          |
| SRD-12 | Apply single-record delete and confirmed delete-all across views, invalidate pending actions and prevent resurrection. Do not promise instantaneous execution in a suspended view.                                                                                                                                                                                                                                                   |
| SRD-13 | Disclose that browser backups, profile copies and already handed-off files, prints or clipboard content are outside product recall. No forensic-erasure claim.                                                                                                                                                                                                                                                                       |
| SRD-14 | Keep unsupported saved records listed for explicit deletion. Do not auto-migrate, rewrite or silently delete them.                                                                                                                                                                                                                                                                                                                   |
| SRD-15 | Open an import as an explicitly labelled, untrusted, read-only report. Make no inventory or page collection call, resume no collector and persist nothing until a separate Save imported report action. Perform only the narrow current-view context and storage eligibility checks needed for the approved normal-window and availability boundary.                                                                                 |
| SRD-16 | Keep imported provenance on every re-export. Store no filename or path. Never treat a file's self-asserted provenance as authenticated local capture.                                                                                                                                                                                                                                                                                |
| SRD-17 | Use schema version 1 with strict validation. Reject unsupported versions, unknown fields, duplicate keys, prototype-affecting keys, malformed values, negative or above-range `milliseconds` and `observedMs` values and out-of-range counts.                                                                                                                                                                                        |
| SRD-18 | Enforce matching save, JSON export and import bounds. An accepted JSON export re-imports for read-only inspection without truncation. A maximum-size import is view-only when the local envelope would exceed the stored-record bound. No operation truncates or repairs data.                                                                                                                                                       |
| SRD-19 | Preview each output in its own representation. Generate self-contained printable HTML with no scripts or remote resources.                                                                                                                                                                                                                                                                                                           |
| SRD-20 | Report download and print as requests, not completion. Report clipboard success only after a successful write. Treat accepted outputs as outside recall.                                                                                                                                                                                                                                                                             |
| SRD-21 | Add no runtime, manifest, permission, dependency, toolchain, support, publication, licensing or evidence change in #5.                                                                                                                                                                                                                                                                                                               |
| SRD-22 | Qualify storage, retention, deletion, import, export, print, clipboard, private and unknown contexts and multi-view behavior before claiming implementation.                                                                                                                                                                                                                                                                         |

## Issue #5 acceptance map

| Issue requirement                                                                     | Contract evidence                                                                                                                 |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Settle archive versus resumable investigation, saved fields and cross-session IDs.    | Saved archive model, SRD-01 through SRD-04, SRD-08 through SRD-10.                                                                |
| Choose retention, limits, deletion, disclosure, permission removal and contexts.      | Retention and expiry, library bounds, delete and concurrent views, permission revocation, normal contexts, SRD-07 through SRD-13. |
| Settle formats, schema compatibility, import limits, notes, timestamps and redaction. | Report exchange, strict import, SRD-15 through SRD-20.                                                                            |
| Record lifecycle and trust boundaries in canonical documents.                         | This plan, the interview record, privacy, requirements, status, architecture, API limits, testing, glossary and ADR 0005.         |
| Persist no data in this planning task.                                                | No runtime or storage change. SRD-21.                                                                                             |

## Feasibility and qualification

The #6 IndexedDB feasibility gate has run and its mechanism is accepted for the
bounded implementation. The remaining gates below are future work, not current
evidence:

- #6: natural eviction, an actual Chrome engine quota error, an exercised Chrome
  private main-frame library guard (the current route is policy-blocked), the
  exact-OS/hosted matrix and release review. Page reload, full browser process restart with retained profile/origin,
  deletion persistence, controlled store loss, expiry, stale-view failure,
  permission removal and reachable private popup guards are observed.
- #7: 7/30/90-day retention, 90-day maximum, lazy cleanup, delete-all, stale-view
  invalidation and no resurrection.
- #8: exact JSON serialization, preview, stale-action guards, 1 MiB accounting and
  round-trip re-import.
- #9: explicit file selection, hostile-file rejection, duplicate-key and
  prototype-trick rejection, bounds, imported label, separate save and
  provenance retention.
- #10: self-contained printable HTML, escaping, long names, pagination, empty
  sections, browser Print/Save as PDF, cancellation and exact bound.
- #11: explicit clipboard copy, exact reviewed text, success after write, denial
  and unavailable results.
- #29: private and unknown context qualification for saving, import, export,
  download, print and clipboard.

Keep documentation claims, feasibility results and observed browser evidence
separate. A passing model test does not qualify storage or output behavior. A
fixture does not qualify native use. No implementation is authorized by this
contract alone.

## Current runtime

The bounded #6 slice is implemented. An explicit Save on a completed, idle,
normal-window investigation creates one immutable local record. A separate
library page lists records and reopens one read-only inline archive; single-record
delete is confirmed and applies across views. Records use extension-origin
IndexedDB without a new permission, the 30-day default, 50-record/5 MiB/1 MiB
bounds, a private store-instance identity and deletion epoch. Private, incognito
and unknown contexts expose no saved data. The library uses no collection
permission and remains usable after management or scripting removal. The normal
popup launcher requires a positive normal active-tab classification.

The existing investigation and Markdown download remain in the owning view's
memory. There is no JSON exchange, import, printable HTML, clipboard action,
retention control, bulk delete or delete-all. Natural eviction, product browser
restart, an actual Chrome engine quota error and a reachable Chrome private
main-frame library route remain unqualified; see
[product evidence](../evidence/2026-10-30-saved-investigations.md).

The [v1 supersession map](../v1-contract.md#supersession-map) still requires the
#6 storage, quota, race and private-context gates, followed by implementation and
qualification. A later mechanism that needs `storage`, `unlimitedStorage`,
`downloads` or `clipboardWrite` returns for a separate permission decision. No
permission is approved by this contract.

## Source record

- Issue [#5](https://github.com/ranokay/addonray/issues/5), read live on
  2026-10-30.
- [V1 contract](../v1-contract.md), approved 2026-10-29.
- User answers Q1 through Q16 on 2026-10-30, recorded in
  [decisions](../decisions.md#saved-investigation-and-report-exchange-interview).
- Reviewed current model and report code: `lib/investigation.ts`,
  `lib/comparison.ts`, `lib/investigation-report.ts` and `lib/report-export.ts`.
