# Saved-history retention and bulk deletion

Status: bounded #7 implementation committed at
`439553300770580252659659179ff3aec641ec94`. Deterministic tests and native type
checking pass at that source. Browser and production-adapter qualification were
pending when this record was created; this file is updated only with observed
results. Do not read unlisted cases as passing.

This record covers the approved
[saved-investigation data contract](../plans/saved-investigation-data-rules.md)
and [issue #7](https://github.com/ranokay/addonray/issues/7). It adds no
permission, dependency, background owner, sync path or report format.

## Implemented boundary

| Area             | Behavior                                                                                                                                                                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retention choice | Each new archive offers 7, 30 or 90 days, default 30. `expiresAt` is computed from the save time and is never more than 90 days later. Existing records keep their stored expiry; there is no global retention setting or record rewrite.                                                                                  |
| Expiry           | Expired valid records are unavailable and removed lazily with one bulk-delete transaction. There is no background timer and no automatic eviction of unexpired records.                                                                                                                                                    |
| Single delete    | Existing confirmed single-record delete remains unchanged and advances the deletion epoch.                                                                                                                                                                                                                                 |
| Bulk delete      | The selected key set freezes when confirmation opens. Refresh cancels the confirmation if any member disappeared. One transaction deletes the frozen keys and advances the epoch.                                                                                                                                          |
| Delete-all       | Explicit confirmation clears the actual IndexedDB records store, including unsupported and not-currently-listed rows. It advances the same epoch even when the visible list is empty and preserves the store identity.                                                                                                     |
| Pending writes   | A save bound to the previous store identity or epoch is rejected with `stale` or `stale-store`. Queued save-versus-selected-delete and save-versus-delete-all ordering is exercised on both sides of commit with the production adapter.                                                                                   |
| Views and states | Selection, single-delete confirmation and bulk confirmation clear on denied, unavailable and suspended transitions. Refresh and resume re-read storage and expiry before an archive is actionable. A cross-view `BroadcastChannel` message remains a hint only.                                                            |
| Boundaries       | Normal-window guards are unchanged. Saved archives remain usable after management or scripting revocation; live revocation still clears the investigation and cancels a pending save. Unsupported schema versions remain listed for explicit deletion and are never migrated. No new permission or collection API is used. |

## Deterministic tests

At `4395533`, the full suite passes **539 tests / 2,022,433 assertions across 36
files** and native type checking passes **83 files**. Focused coverage includes:

- default 30-day and exact 7/90-day record creation, unapproved-choice refusal,
  90-day validation and expiry boundaries;
- save-controller retention state and preservation of the live pair;
- frozen bulk selection, confirmation cancellation when a member disappears,
  unsupported-row bulk deletion, delete-all clearing a row saved after the list,
  empty-list delete-all epoch advancement, and a fresh library instance seeing
  no records after delete-all;
- selection and confirmation clearing on suspend, denied and unavailable
  transitions;
- save-selector default/options/disclosure and library expiry, bulk and
  delete-all confirmation rendering without mutation;
- the existing normal/private/unknown guards, single delete and lazy cleanup.

UI SSR tests are not native interaction evidence.

## Production-adapter checks

Pending execution. `scripts/saved-store-checks.mjs` now adds four queued
save-versus-delete ordering cases and an empty-list delete-all case to the
existing nine checks. Each run is expected to write
`.scratch/saved-store-checks-<target>.json`; only inspected results will be
recorded here.

## Product browser checks

Pending execution. `scripts/saved-checks.mjs` now also verifies the stored 7-day
retention delta, a frozen two-record bulk deletion and confirmed delete-all that
removes an unsupported row from the actual store. The shared Firefox and Chrome
probe reports are the source for exact versions, counts and gaps.

## Preserved limits

Chrome private main-frame library navigation remains an observed
`ERR_BLOCKED_BY_CLIENT` policy block; the library's private guard remains
unexercised there. Chrome product checks use the named pre-granted UI fixture,
so native optional consent remains unqualified. Firefox private/restart checks
use disclosed disposable-profile authority. Natural eviction, an actual Chrome
engine quota error, verified Firefox post-clear emptiness, retail installs, other
architectures and native desktop usability remain outside these results.
Deletion and expiry are product-level actions; browser and OS backups, profile
copies and already handed-off output remain outside recall.

The #6 product and feasibility evidence is preserved unchanged. This record
supersedes no prior failed assertion.
