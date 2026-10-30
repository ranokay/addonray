---
status: accepted
---

# Keep saved investigations as immutable local archives

On 2026-10-30 the user chose immutable read-only archives over editable saved
investigations. A save captures one completed, idle investigation's approved
observations in the current browser profile. Reopening shows that record read-only
and never resumes a collector, reattaches a source tab, prompts for collection
permission or accepts new observations. The user can export, print, copy or delete
the record.

The alternative was an editable or resumable saved investigation. That would need
durable source identifiers, conflict handling and a live-versus-saved permission
model. The archive model avoids those boundaries and keeps saved data a bounded
record of what was observed.

Consequences: each save creates a new record, and later observations need a new
live investigation. Saved records survive management and scripting revocation.
Deletion and expiry make records unavailable to AddonRay, while browser backups,
profile copies and already handed-off files, prints or clipboard content remain
outside recall. Storage and output mechanisms still need separate feasibility and
qualification. See the [data contract](../plans/saved-investigation-data-rules.md).
