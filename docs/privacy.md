# Privacy and permissions

Approved on 2026-10-22: no telemetry, no cloud service, session-only diagnostics, and explicit consent before inventory or selected-page inspection.

The boundaries below describe the implemented runtime. The expanded v1 target may replace specific limits only through [the v1 contract](v1-contract.md) and the named data contract. #5 (saved and exchanged data) was approved and recorded on 2026-10-30. #13 (mutation and request-failure collectors) and #20 (companion) remain open decisions. Until each approved contract's feasibility gates pass and its implementation is qualified, the current session-only, permission and export limits stay effective.

## Phase 0 and first Phase 1 slice data lifecycle

| Data                                                                 | Trigger                                             | Retention                            | Destination                 |
| -------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------ | --------------------------- |
| Extension names, IDs, versions, states, available permission strings | Inventory click and optional permission approval    | Visible popup session only           | React memory                |
| Document readiness and supported performance entry types             | Inspect-page click and optional permission approval | Visible popup session only           | React memory                |
| Capability outcomes                                                  | Related action or documented capability explanation | Visible popup session only           | React memory                |
| Optional permission grant                                            | Browser permission prompt                           | Managed by the browser until revoked | Browser permission settings |

Outside an explicit saved-investigation Save, no diagnostic data enters local storage, sync storage, logs, analytics, or a remote endpoint. The saved archive boundary is described below. The extension does not read page URLs or DOM content for the Phase 0 report. Clear removes results immediately. Closing the popup destroys its session. A retained browser permission does not imply retained diagnostic data.

Revocation clears affected results. Clear and revocation invalidate in-flight actions so late responses cannot restore discarded data. Denial must leave the interface usable.

The first inventory slice keeps search text, state filters, and expanded details in the same popup's memory. Display filtering makes no browser calls. Refreshing inventory discards these controls and their state before loading the new result. The default dark theme is static and adds no stored preference.

## Manifest budget

- `activeTab` supports a temporary selected-tab grant after the user opens the extension.
- Optional `management` supports inventory only after an inventory action.
- Optional `scripting` supports the minimal selected-page probe only after an inspect action.
- No broad host access, network observer, persistent storage, or native messaging in Phase 0.
- Declare Firefox data collection permission `none` for the local-only initial scope. Reassess that declaration before any export, native transmission, or new integration.

The current runtime retains this budget. v1 changes require the explicit contract named in the [supersession map](v1-contract.md#supersession-map). No backlog item widens permissions by itself.

## Chrome permission disclosure

Chrome's `management` permission includes API authority to change other extensions, even though AddonRay uses it only for inventory. The Chrome popup explains this before requesting consent. AddonRay's product API boundary contains no extension-state mutation methods. Firefox's ordinary switching restriction must not be presented as a Chrome API restriction.

Both builds retain the same required/optional permission budget, explicit actions, popup-only memory, and minimal page result. Chrome omits the Firefox-only data declaration. Test controllers with extra permissions and the pre-granted UI copy are disposable fixtures outside both product archives. They do not establish that a user approved an optional permission.

## Manual comparison data lifecycle

The user approved the one-pair manual comparison on 2026-10-23. A deliberate New investigation action opens a fresh independent tab without reading inventory or page data. Each capture requests optional management access from its own click. The comparison retains only extension ID, name, version, and enabled state from the resulting inventory; permission/host metadata is discarded before it enters the comparison state.

Before/After snapshots and the explicit Better/Unchanged/Worse/Uncertain assessment live only in that investigation document's memory. Switching to settings or the page does not end a loaded document. Start over, relevant management revocation, close, reload, browser unloading/restart, or an extension/process reload removes its data. Pending work cannot restore it. There is no recovery or saved comparison history.

The popup remains separate. Clear popup results affects only popup data; Start over affects only its investigation. A browser-wide permission revocation can clear every affected view through each view's own listener. No results transfer between views. No background process, messaging handoff, storage, page identifier, free text, automatic page access, or new manifest permission is added. The page assessment records the user's judgment and makes no browser call.

## Phase 2 timing data lifecycle

The approved [timing snapshot](plans/phase2-timing.md) extends only the deliberate selected-page action. The injected collector constructs three fixed milestone results before returning to the extension. It reads only DOMContentLoaded event end, load event end, and the named first-contentful-paint timestamp. Numeric values describe elapsed time since navigation, accompanied by fixed measured/unrecorded/unavailable statuses. The added timing block cannot exceed 1 KiB.

Never return a whole performance entry: a navigation entry contains the page URL. No entry name, resource list, server timing, request details, page content, absolute time origin, URL, title, or free-form page data enters the extension through this change. Validate the response and copy only canonical fields into popup memory. The selected tab stays bound across consent; a navigation can change the document read or remove access. No page identity or navigation history is collected to resolve that change.

No observer or recorder remains on the page. Clear, popup close, and either existing optional-permission revocation remove popup results and invalidate pending actions. A later explicit page capture replaces the prior result; duplicate actions while busy remain ignored. Investigation tabs retain their independent inventory-only contract. No permission, host access, background process, storage, telemetry, cloud service, export, or result transfer is added.

## Optional timing attachments

The user approved the [timing comparison](plans/phase2-timing-comparison.md) on 2026-10-23. This explicitly extends the earlier popup-only timing contract. A separate Attach timing action discovers only eligible own investigation views, with synthetic labels and opaque document/generation identities. It does not enumerate browsing tabs, read investigations' observations, or broadcast a timing payload. The user chooses both destination and side and confirms transfer.

The destination retains its own canonical copy of only the three milestone results and a numeric source-tab ID. This ID binds After to the same browser tab; it does not verify page identity. No URL, title, content, readiness/support list, absolute time origin, or free-form page data is attached. Protocol IDs and selections remain in visible-document memory and never enter extension URLs, storage, history, logs, or remote services.

Only verified normal-window senders and destinations participate. Private/incognito and unclassifiable contexts cannot list, send, or receive attachments. Context checks use the existing selected tab's incognito flag and the investigation's own current-tab classification; ambiguous classifications fail closed. This does not add private-window feature qualification.

Before timing precedes starting After inventory capture. Each side is fixed until Start over. A successful attachment survives popup close/Clear because the investigation owns an independent copy. Start over, either management/scripting revocation, destination close/reload/unloading, or teardown discards the entire investigation and its source ID. Pending work cannot repopulate it. Ordinary timing failure preserves valid destination observations. One popup capture can be attached successfully once.

## Approved page-error check boundary

The [page-error check](plans/phase2-page-errors.md) was approved on 2026-10-24 with feasibility gates before product wiring. Its visible check tab owns only the original source's numeric tab ID, attempt identity/generation, current status, and one final summary of two event-kind counts, total, fixed completion reason, and bounded elapsed duration. No identifier enters its URL. Opening the check collects no events; Start requests optional scripting access explicitly. Existing permission grants remain separate from diagnostic retention.

Never read or serialize event message/error/reason/filename/stack/target properties, raw event objects, page content, URLs/titles, or absolute timestamps. Keep no per-event list or timeline. The observer counts only notifications received during the eligible current-document window, with a 200-event total cap and 1 KiB summary bound. Results appear after confirmed completion or Stop. Interrupted/unavailable is distinct from an observed zero.

Clear/Start over, either optional-permission revocation, and owner teardown discard results and invalidate pending work. Source navigation/closure ends observation without moving to a replacement document. A Stop action is different from discard and may retain confirmed partial counts. Owner-close/revocation cleanup must use an established control connection and pass feasibility, because access loss is not proof that injected code was removed.

Firefox observation remains isolated. Chrome's new observer shares the page execution environment and its results can be suppressed or altered by that page. It receives no extension-only API authority. Page-visible control data cannot authorize browser actions; validate fixed count/status results and keep extension control in its isolated/visible owners. This boundary does not claim hostile-page tamper-proof observation or create a cross-extension console feed. Normal-window classification remains mandatory. The existing inventory and timing lifetimes continue independently.

## Page-error attachment retention

The [approved comparison](plans/phase2-page-error-comparison.md) extends the
check-only retention contract through explicit destination, side and confirmation.
An investigation owns a canonical copy of counts, duration and completion reason,
plus its source-tab binding shared with timings. Donor Clear/reset or closure
does not retract that copy. Investigation reset, either optional-permission
revocation and destination teardown discard it with all other investigation data.

A transfer grant that was never obtained does not erase the completed standalone
check. Actual permission removal still clears through its existing listener.
Each completed check attaches successfully once. Discovery returns only bounded
normal own-view metadata. No raw event details, URL/title, page content, absolute
time, storage, broadcast summary or extra permission is added. The shared numeric
tab ID does not verify the same page or conditions. The user approved this
boundary in Q9. [Qualification](evidence/2026-10-26-phase2-page-error-comparison.md)
keeps source fixtures, native observations and private-context gaps separate.

## Approved report export

The user approved [previewed investigation export](plans/phase3-report-export.md)
and Q12's revised download lifetime boundary on 2026-10-27. Revised feasibility,
implementation and browser qualification are pending. A report contains one
completed Before/After investigation's existing observations only.
It includes extension names, versions and enabled states, inventory changes, an
optional manual assessment and optional attached timing/error summaries with
their limits. Missing values remain explicit. Omit extension-ID fields, internal
labels and tab/document/attempt/transfer identifiers. Names and versions can still
reveal extension choices, so the preview must disclose that they are included.

Export adds no collection of page URLs/titles, query strings, DOM snippets,
cookies, tokens, raw errors, permission/host metadata, absolute timestamps,
browser/OS context or user notes. Serialize allowed values only and treat names
and versions as literal text. Omitting identifier fields does not anonymize an
inventory. The whole UTF-8 report has a 1 MiB limit; an oversized report fails
without truncation or a partial download.

The exact read-only Markdown preview stays in the owning investigation's memory.
Preparing and downloading require two successful inventory captures, an idle
state, current permission eligibility and a verified normal-window view.
Private/incognito and unknown classifications fail closed. Never-granted
scripting access does not block an inventory-only report; actual removal of
either optional permission retains the existing whole-investigation reset.
Revision and reset-generation checks invalidate stale preparation and download
work after assessment/attachment changes, reset or revocation. Cancel discards
the preview. Close, reload, unloading and teardown erase its unsaved data.

Download report requests a browser download of only the reviewed bytes under a
generic `.md` filename. Request dispatch does not prove browser acceptance. Keep
the investigation open until the browser shows the download; closing or reloading
can cancel an unaccepted request. The browser may save automatically according
to its settings. AddonRay does not claim final disk completion, retry
automatically or send the report to another person or service. Browser-accepted
bytes or a file can remain on disk or pending after reset, revocation or close;
AddonRay cannot recall them. No saved history, restoration, clipboard action,
background owner, longer investigation lifetime, durable storage or additional
permission is introduced.

Firefox's data declaration was reassessed on 2026-10-27. Mozilla's
[policy FAQ](https://extensionworkshop.com/documentation/publish/add-on-policies-faq/)
permits user-initiated local filesystem exports under its local-backup exception,
while remote-server transmission must follow the data collection and consent
rules. Its [built-in consent documentation](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
describes declarations for transmitted data and `none`. The approved rationale
retains `none` for this explicit local-only download with no AddonRay network
transfer. This is a documented interpretation for the selected scope, not
qualified implementation, store approval or publication. Export browser/native
qualification remains pending, and any future transmission needs reassessment.

## Saved-investigation and report-exchange boundaries

The user approved [the saved-data contract](plans/saved-investigation-data-rules.md)
and Q1 through Q16 on 2026-10-30. The bounded #6 slice implements explicit
Save, local list, read-only reopen and single-record delete. #7 adds a per-save
7/30/90-day retention choice, bulk deletion and confirmed delete-all. #8 adds
schema version 1 JSON preview and download for the live investigation and the
saved archive. JSON import (#9), printable HTML (#10) and clipboard (#11) remain
future work. The current investigation stays in the owning view's memory, and
Markdown and JSON are the implemented report outputs.

| Data                                                                                                         | Trigger                                          | Retention                                                                                                                                                   | Destination                                               |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Immutable archive: inventories, precomputed changes, assessment, optional timing and error summaries, limits | Explicit Save of a completed, idle investigation | Default 30 days; the user may choose 7, 30 or 90 days for each new archive, never beyond 90 days from `savedAt`. Existing records keep their stored expiry. | Extension-origin IndexedDB in the current browser profile |
| Local record envelope: record ID, schema version, origin, `savedAt`, `expiresAt`                             | Save                                             | With the record                                                                                                                                             | Extension-origin IndexedDB in the current browser profile |
| Validated imported report                                                                                    | Future #9 explicit file selection, then save     | Future contract                                                                                                                                             | Not implemented                                           |
| Report preview                                                                                               | Explicit prepare action                          | Owning view memory                                                                                                                                          | View memory                                               |
| Markdown download                                                                                            | Explicit download after preview                  | Browser or filesystem controls                                                                                                                              | User-chosen local destination                             |
| JSON preview and download                                                                                    | Explicit format and download action              | Owning view or library-view memory                                                                                                                          | User-chosen local destination                             |
| Printable HTML, print output and clipboard text                                                              | Future #10 and #11                               | Future contract                                                                                                                                             | Not implemented                                           |

The archive is immutable and read-only. Reopening collects no inventory or page
data, prompts for no management or scripting permission, reattaches no source tab
and resumes no collector. It performs only the narrow current-view context and
storage eligibility checks needed for the approved normal-window and availability
boundary. Each save creates a new record. The archive omits extension IDs, source
tab IDs, live investigation identity and label, document, attempt and transfer
IDs, permission and host metadata, page URL, title and content, browser and OS
context, user notes, custom titles and exchanged timestamps. The local record ID
and local times never enter an exchanged report. Extension names can duplicate,
so the archive keeps the ID-based changes computed at save time and never
recomputes them from names.

### Local storage and disclosure

Saved records stay in extension-origin storage in the current browser profile.
There is no sync, cloud, telemetry, companion or cross-device transfer. Any
AddonRay extension page in that profile can read the records. Other extensions
and web pages cannot read AddonRay's extension origin. The chosen mechanism must
keep records unreadable by AddonRay content scripts unless a later approved
contract explicitly allows otherwise. AddonRay adds no encryption layer; browser
and OS encryption of profile storage is outside this contract.

Before the first save, the interface and this document disclose that records
persist on the device and profile, AddonRay pages can read them, no sync or
companion transfer exists, AddonRay adds no encryption, deletion and expiry are
product-level actions, browser and OS backups or profile copies may retain
bytes, uninstall clearing is browser-controlled and can have exceptions, and
exported files, prints and clipboard content leave AddonRay's control.

The #6 mechanism is extension-origin IndexedDB without a new manifest
permission. The Stage 1 candidate gate observed availability, exact bounds,
transactional refusal, deletion epochs, store-instance identity, controlled
store loss, restart persistence and the reachable private popup guard on Firefox
140.0, 153.5.1esr, 158.0.1 and Chrome for Testing 156.0.8078.47. The supervisor
accepted that mechanism for the bounded product slice on 2026-10-30. Natural
eviction, an actual Chrome `QuotaExceededError`, verified post-clear Firefox
emptiness and a reachable Chrome private main-frame route remain unobserved.
The 50-record, 5 MiB and 1 MiB limits are product bounds, not IndexedDB quota or
durability promises. No `storage`, `unlimitedStorage`, sync or backup policy is
approved.

### Implemented #6 and #7 entrypoints

`lib/saved-record.ts` builds one immutable schema-version-1 record from a
completed idle investigation. It copies only the approved inventory rows,
precomputed ID-based changes, assessment, optional timing and page-error
summaries, observation limits, local times and a random local record ID. It
omits extension IDs, live/source/document/attempt/transfer identifiers,
permission and host metadata, URLs, titles and page content. Strings, nesting,
inventory rows, changes, complete stored bytes including the local envelope,
exact would-be exported JSON bytes and the 5 MiB aggregate are checked without
truncation.

`lib/saved-store.ts` is the extension-origin IndexedDB adapter. One private meta
record supplies a store-instance ID and deletion epoch; saves and deletes bind
both inside one readwrite transaction after rechecking metadata and bounds. A
ready connection synchronously enqueues the readonly barrier and the readwrite
transaction before yielding; a missing or invalidated connection refuses the
save. `add` refuses an existing record ID, so saves remain add-only. Missing,
corrupt or exhausted metadata fails closed. The adapter bounds open, blocked and
transaction waits, aborts pending writes on reset, and reports success only after
transaction completion. A store recreation or deletion epoch change rejects a
pending write instead of resurrecting data. `lib/saved-save.ts` holds the
exclusive save lease, checks normal context and current permissions through the
last abortable point (including after permission and record preparation), and
preserves the live investigation on ordinary storage, quota or size failure. `lib/saved-context.ts` fails closed on
missing or non-normal own-tab classification.

`entrypoints/library` lists records and opens one inline read-only archive. It
uses no collection API, permission prompt, collector or source-tab reattachment,
and remains usable after management or scripting removal. Unsupported and
unreadable rows stay visible for explicit deletion. Expiry refuses open and
removes the row lazily. The library and investigation surfaces recheck normal
context before reading or mutating; a cross-view `BroadcastChannel` message is
only a refresh hint, a busy read is invalidated and refreshed, and every action
re-reads storage. `pagehide` clears displayed archive data and a persisted
`pageshow` revalidates before the view is reused. The popup launcher uses
the active tab of the current window and requires a positive
`incognito === false` classification before opening the library. Private,
incognito and unknown contexts expose no saved rows.

The save section shows all approved storage/privacy disclosures before the
explicit Save action. The library and archive render stored names and versions as
text with no HTML injection. The existing live Markdown report remains unchanged.

#7 adds the per-save retention selector and library bulk actions. Selection is
frozen at confirmation, delete-all clears the records store in one transaction,
and both deletion forms advance the epoch. Selection and confirmation are
cleared on denied, unavailable and suspended transitions; no retained archive
remains actionable after a refresh or resume.

### JSON report export

`lib/saved-record.ts` owns the schema version 1 exchange projection. The live
investigation and the saved archive use one serializer. The document contains
`schemaVersion`, `provenance` and the `report` object with both inventories,
precomputed changes, assessment, optional timing and page-error summaries and
observation limits. It carries no extension IDs, record or session identifiers,
source tab, document or attempt IDs, permission or host metadata, URL, title,
save time, page content or browser context. The serializer leaves hostile strings
as JSON string data and rejects invalid diagnostic values, malformed states and
over-limit documents without truncation or repair.

The live report section offers Markdown, its existing default, or JSON. Both
formats keep the idle completed-pair, snapshot and reset-generation checks, the
verified normal-window guard and the current management or scripting guard. JSON
export of a saved archive lives in the library view and uses
`lib/saved-export.ts`. It requests no collection permission, so management or
scripting removal does not block it. Before preparing and again before download,
it rechecks normal context and the selected archive, re-reads IndexedDB and
rejects a record that is missing, expired, unsupported, unreadable or different
from the reviewed content. A selection change, suspension, deletion or context
loss discards the preview. The browser receives a generic
`addonray-investigation.json` download. Dispatch is only a request; the interface
does not claim acceptance or a completed file, and accepted files leave
AddonRay's control.

Concurrent lifecycle and storage reads do not publish a preview after
invalidation. The complete UTF-8 document is checked against 1 MiB, the
inventories against 1,000 rows per side, the change list against 2,000, each
string against 4,096 code points and nesting against depth 8. The output keeps
the future strict-import shape; #9 owns parsing, rejection of unknown or
duplicate keys, prototype-affecting keys and untrusted rendering.

### Retention, deletion and physical limits

The default retention is 30 days from `savedAt`. Each new archive offers a 7, 30
or 90-day choice, with a 90-day maximum from the original save time. Existing
records keep their stored expiry; this is not a global retention setting. An
expired record is not listed as available and cannot be opened, exported,
printed, copied or re-saved. AddonRay removes it when it next accesses storage.
There is no background timer in v1. Expiry is product-level refusal plus lazy
cleanup, not a hard physical on-disk deletion deadline. Browser and OS backups,
profile copies and lower layers may retain bytes. The contract does not claim
that every retained byte disappears at 90 days.

Deleting one record removes it across AddonRay views and invalidates pending
actions. #6 implements single-record delete; #7 adds a frozen multi-record
selection and explicitly confirmed delete-all. Delete-all clears the actual
records store, including unsupported and not-currently-listed rows, and advances
the same deletion epoch even when the visible list is empty. A deleted or expired
record cannot be reopened, exported, printed, copied or resurrected by a pending
write. A view that is suspended may not run code instantly; its next read or
action fails. Deletion removes the product's record, but it cannot erase browser
or OS backups or recall a file, print or clipboard content already handed off.

Unsupported saved records remain listed for explicit deletion. AddonRay does not
auto-migrate, rewrite or silently delete them. A future migration needs its own
approved contract and evidence.

### Permission revocation, pending saves and contexts

Management or scripting revocation clears live investigations and cancels
pending live saves. It does not delete, hide or lock a saved archive. Viewing,
exporting, printing, copying or deleting a saved archive does not request a
collection permission. New live captures still need the existing consent.

A pending live save fails if its source investigation resets, a permission is
removed, the investigation changes or normal context is lost before commit. No
partial or post-revocation save is written. An ordinary storage, quota or size
failure preserves the current valid live investigation. A reset or permission
removal keeps its existing clearing semantics and invalidates the save. A failed
save never restores discarded data.

If a future storage or clipboard mechanism uses a permission, its removal
behavior is not covered by this contract and must be defined and qualified before
implementation.

Every saved-data and exchange action requires a verified normal window. Save,
list, reopen, delete, delete-all, import, save imported report, export, print and
clipboard fail closed in private, incognito and unknown contexts. The guard is
independent of management or scripting permission. Existing local inspection in
private windows stays unchanged.

### Import and exchange

Import requires explicit file selection. AddonRay rejects a file larger than
1 MiB before parsing, then accepts only schema version 1. It rejects unknown
fields, duplicate keys, prototype-affecting keys, malformed values,
negative or above-range duration values and out-of-range values. It preserves
measured, unrecorded, unavailable and null states. A valid import opens as an
explicitly labelled, untrusted, read-only report. It makes no inventory or page
collection call and resumes no collector. It performs only the narrow
current-view context and storage eligibility checks needed for the approved
normal-window and availability boundary. Import alone persists nothing. A
separate Save imported report action stores it under the same library, retention,
deletion and context rules. Save imported report applies the 1 MiB stored-record
bound including the local envelope. A maximum-size import is view-only if
the envelope would exceed that bound. The imported view stays available for
inspection or deletion. The interface discloses that before save; no partial
record is written. AddonRay stores no original filename or path and
keeps the imported provenance on every re-export. A file's self-asserted
provenance is never authenticated as local capture.

The implemented report outputs are exact Markdown for the live investigation and
exact schema version 1 JSON for the live investigation and saved archives. Each
has its own preview. JSON export does not parse files. Import (#9), printable HTML
(#10) and clipboard copy (#11) remain future work; their previews, bounds and
trust rules stay under this contract. JSON export and future import share schema
version 1 and the 1 MiB complete-document cap. The per-record stored cap also
includes the local envelope, so a maximum-size import is view-only if the
envelope would exceed it. The other shared bounds are 1,000 inventory entries per
side, 2,000 changes, 4,096 code points per string and nesting depth 8. Save checks
the exact would-be JSON export, so an accepted export keeps the future import
shape without truncation. No operation truncates, repairs or silently drops
content. A report that fits JSON but whose printable HTML exceeds 1 MiB cannot be
printed.

Download and print are requests, not proof of acceptance or completion. Keep the
view open until the browser shows a download. The print dialog outcome is not
observable. Clipboard success is reported only after the clipboard write
resolves. Accepted files, prints and clipboard content can outlive deletion,
revocation or closing the view and cannot be recalled.

Firefox's data declaration was reassessed for the local report download on
2026-10-27. Saved records add local persistence but no transmission path. The
existing `none` declaration remains for this local-only scope. This is a
documented interpretation, not store approval, implementation qualification or
publication. Reassess the Firefox declaration and Chrome Web Store privacy
disclosure before publication.

## Companion

The optional companion is approved v1 scope under #20 to #28, not an implemented capability. It needs a separate disclosure of local process access and data crossing the native messaging boundary. #20 selects one read-only operation and its consent. #21 to #23 prove it per intended OS and architecture. #24 to #28 deliver, install, remove and upgrade it. Its installation must never become a prerequisite for basic inventory, capability explanations or extension-only inspection. The companion supplies no implicit browser authority.

## References

- [Firefox browser-specific settings and data collection declaration](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)
- [Firefox built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
