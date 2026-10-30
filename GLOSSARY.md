# AddonRay

The language used to discuss extension troubleshooting and its evidence.

## Language

**Inventory**:
The extensions the selected browser exposes to AddonRay, including their reported enabled state and available metadata.
_Avoid_: Complete browser audit, active-on-page list.

**Capability**:
An action AddonRay can explain as available, permission-dependent, unavailable, or unsupported in the current environment.
_Avoid_: Feature detection as proof of authority.

**Probe**:
A bounded, user-requested check of one browser capability or one page observation.
_Avoid_: Continuous monitoring.

**Observation**:
A measured or reported fact with its source and limitations attached.
_Avoid_: Culprit, proof of a conflict.

**Comparison**:
Two or more observations taken under conditions the user records, such as a manually changed extension state.
_Avoid_: Automatic isolation, causal proof.

**Inventory snapshot**:
The inventory reported by the browser at one deliberate capture, used as a before or after observation in a comparison.
_Avoid_: Extensions active on the page, complete browser state.

**Investigation**:
A temporary, user-directed examination of a page problem using a comparison of observations.
_Avoid_: Automatic diagnosis, saved report.

**Page assessment**:
The user's judgment that the page is better, unchanged, worse, or uncertain after a manual change. It does not establish the cause of that result.
_Avoid_: Measured improvement, culprit verdict.

**Timing snapshot**:
A small set of loading milestones for the current document, reported at one deliberate capture. It records available observations, not a speed rating or proof of extension impact.
_Avoid_: Performance score, extension overhead measurement.

**Timing attachment**:
A timing snapshot deliberately added to one side of an investigation. It is a separate observation from that side's inventory snapshot.
_Avoid_: Synchronized capture, automatic measurement.

**Page-error check**:
A deliberate, bounded observation of JavaScript error and unhandled-rejection events while the user reproduces a page problem. It reports counts with visibility limits, rather than a diagnosis.
_Avoid_: Console feed, complete error audit, culprit detector.

**Page-error attachment**:
A confirmed page-error summary deliberately added to one side of an investigation. It is a separate observation from that side's inventory and timing data.
_Avoid_: Synchronized capture, causal evidence, error-rate measurement.

**Session**:
The lifetime of the visible investigation and its temporary diagnostic data.
_Avoid_: Browsing history, retained report.

**Report**:
A human-readable account of one investigation's existing observations and their limits, prepared for the user to review and download deliberately.
_Avoid_: Diagnosis, automatic submission, saved investigation history.

**Report preview**:
The exact report text offered for the user's review before a download. It belongs to the current investigation and becomes outdated when its observations change.
_Avoid_: Editable report, live recorder, completed download.

**Saved investigation**:
An immutable local archive of one completed investigation, reopened read-only without collecting new observations or resuming collectors.
_Avoid_: Editable record, live session, automatic history.

**Saved record**:
A local library entry that holds one saved investigation or imported report, its record ID, schema version, origin and save or expiry times.
_Avoid_: Live session, browser tab, cache entry.

**Imported report**:
A report read from a user-selected file, always untrusted and shown read-only. It never becomes a live investigation or a locally captured observation.
_Avoid_: Verified report, restored session, trusted provenance.

**Report exchange**:
User-initiated export or import of reviewed report content under the approved versioned schema. Imported content is untrusted and never authenticated as local capture.
_Avoid_: Cloud sharing, automatic submission, sync.

**Report schema**:
The explicit versioned field contract for saved records and exchanged reports. It fixes which fields may exist and how unknown or missing values are represented.
_Avoid_: Best-effort JSON, implicit format.

**Archive expiry**:
The point after which AddonRay refuses to use a saved record and lazy cleanup may remove it. It is not a promise of physical erasure.
_Avoid_: Hard deletion deadline, forensic erasure.

**Delete-all**:
A confirmed library action that removes every saved record. It is distinct from clearing a live investigation.
_Avoid_: Clear session, automatic cleanup.

**Mutation check**:
A deliberate, bounded count of DOM mutation notifications for one selected source during an approved observation window. It does not retain DOM content or identify a cause.
_Avoid_: Page recorder, conflict detector.

**Request-failure check**:
A deliberate, bounded count or summary of failed requests for one selected source during an approved observation window. It does not retain request details or attribute failure to an extension.
_Avoid_: Network log, culprit evidence.

**Support matrix**:
The finite list of intended and qualified browser, distribution, operating-system and architecture combinations, each with its evidence state.
_Avoid_: All-browser support claim.

**Candidate**:
The exact signed source and artifact set proposed for v1 release before publication. A changed source or artifact creates a new candidate.
_Avoid_: Latest build, published release.

**Release receipt**:
The post-publication record that ties downloaded extension and companion artifacts to approved source, signatures, checksums, the support matrix and known limits.
_Avoid_: Announcement, store listing.

**Companion**:
An optional, separately installed local application whose capabilities require their own consent and evidence.
_Avoid_: Privileged browser backdoor.

**Qualification**:
Recorded evidence for named behaviors on an exact browser distribution, version, operating system and architecture. A build alone does not establish it.
_Avoid_: Blanket browser support, feature detection as a passing result.
