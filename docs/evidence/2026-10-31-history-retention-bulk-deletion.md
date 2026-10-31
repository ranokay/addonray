# Saved-history retention and bulk deletion

Status: bounded #7 implementation qualified from clean
`bdae3cd3502feced42d80b94bbc3ddd9ba208cb9`. Deterministic tests, native type
checking, four local browser product probes, four production-adapter runs and two
restart probes pass. The final frozen shared gate is run on the final committed
head; its receipt is reported in the task handoff rather than committed, so the
qualified source head does not move after the frozen run. Earlier failed attempts
are preserved separately below; they are not converted into passes.

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

At `bdae3cd`, the full suite passes **539 tests / 2,022,433 assertions across 36
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

`scripts/saved-store-checks.mjs` compiles the production `lib/saved-store.ts` and
`saved-record.ts` into a test-only extension and exercises the actual IndexedDB
adapter. Each target passes fourteen checks, including the four new queued
save-versus-selected-delete and save-versus-delete-all cases on both sides of
commit, and delete-all advancing the epoch with no remaining records.

All four reports record clean `bdae3cd3502feced42d80b94bbc3ddd9ba208cb9`,
`source.dirty: false`, macOS 27.2 (build 26B5091g) arm64, geckodriver 0.37.1 for
Firefox and ChromeDriver 156.0.8078.47 for Chrome.

| Target                           | Outcome | Checks | Report                                                | SHA-256                                                            |
| -------------------------------- | ------- | ------ | ----------------------------------------------------- | ------------------------------------------------------------------ |
| Firefox 140.0                    | passed  | 14     | `.scratch/saved-store-checks-firefox-140.0.json`      | `db2db66a721c7131acbb72feb9c46f4b5046ed87bb02fb9db47dc63bbfe1bef7` |
| Firefox 153.5.1esr               | passed  | 14     | `.scratch/saved-store-checks-firefox-153.5.1esr.json` | `c85e814adaa1b8a19b1793a6cca7d130e57c1d0e8d8ef42929d9eede0b253e79` |
| Firefox 158.0.1                  | passed  | 14     | `.scratch/saved-store-checks-firefox-158.0.1.json`    | `c1b0c6adb79502a48867a10bf6d5cb446302115e557f2ffebcf25b9e9ff923b2` |
| Chrome for Testing 156.0.8078.47 | passed  | 14     | `.scratch/saved-store-checks-chrome.json`             | `a0b9f86437088abf73f72d91d226b5c380f22a6e6fc54c1806ca703f9c03aaa3` |

The probe is test-only; it is not a product package or native-UI observation.

## Product browser checks

The shared product probes pass from clean `bdae3cd`. Firefox reports 92 observed
checks on each pin and Chrome reports 86. The added checks verify the stored
7-day retention delta from `savedAt`, a frozen two-record bulk deletion leaving
the unselected archive, and confirmed delete-all removing an unsupported row
from the actual IndexedDB store. Existing save/list/open/single-delete,
management-removal, private-window, stale-view, reload and report checks remain
in the same reports.

| Target                           | Outcome                        | Checks | Report                                      | SHA-256                                                            |
| -------------------------------- | ------------------------------ | ------ | ------------------------------------------- | ------------------------------------------------------------------ |
| Firefox 140.0                    | passed-with-qualification-gaps | 92     | `.scratch/firefox-evidence-140.0.json`      | `77865160f0fa97cb0ada3e9fc41224b539670353eece82d0acda03bb26599086` |
| Firefox 153.5.1esr               | passed-with-qualification-gaps | 92     | `.scratch/firefox-evidence-153.5.1esr.json` | `6853d5f324151aaf92c85a73d9d10ffdc3f7f0e68b220c71be7c121fa6221e8c` |
| Firefox 158.0.1                  | passed-with-qualification-gaps | 92     | `.scratch/firefox-evidence-158.0.1.json`    | `ec32c3f293886737a1f9e677fbaea8c85a41634840ad2d3a49bb7487fb631cb9` |
| Chrome for Testing 156.0.8078.47 | passed-with-qualification-gaps | 86     | `.scratch/chrome-evidence.json`             | `e77fd7466a543fd26f04aa0ed413b27877fee13b3b667c2f37fb29a8f2ee6ef9` |

Commands:

```sh
FIREFOX_VERSION=140.0 mise run test-firefox
FIREFOX_VERSION=153.5.1esr mise run test-firefox
FIREFOX_VERSION=158.0.1 mise run test-firefox
mise run test-chrome
```

All four reports record `sourceCommit` `bdae3cd...` and `sourceDirty: false`.
Firefox reports record geckodriver 0.37.1; the Chrome report records ChromeDriver
156.0.8078.47. All use disposable profiles and macOS 27.2 arm64. `5d04fca` changes
only the restart probe and documentation after those product runs; product source
is unchanged.

## Product restart checks

From the same clean source, the product restart probe passes six checks on
Firefox 158.0.1 and Chrome for Testing 156.0.8078.47. It covers explicit Save,
full browser process restart with a retained profile/origin, read-only reopen,
unsaved live-state loss, single-delete persistence and a confirmed delete-all of
a seeded unsupported record, all followed by another restart:

| Target                           | Outcome | Checks | Report                                        | SHA-256                                                            |
| -------------------------------- | ------- | ------ | --------------------------------------------- | ------------------------------------------------------------------ |
| Firefox 158.0.1                  | passed  | 6      | `.scratch/saved-restart-firefox-158.0.1.json` | `e53c78b21355d446b693a71ef33afd6c950430e45984f1ce85fa3daf1ac2da64` |
| Chrome for Testing 156.0.8078.47 | passed  | 6      | `.scratch/saved-restart-chrome.json`          | `380214b8c6bfb2b3e3c8350a133c00bdce68eb0195b88631129b09ce6349cceb` |

Commands:

```sh
FIREFOX_VERSION=158.0.1 bun run test:saved-restart:firefox
bun run test:saved-restart:chrome
```

Both reports record clean `5d04fcaadd8fcd3767f5800035403b17f32f5620` and
`source.dirty: false`. The final empty restart verifies that both the
single-record deletion and the later delete-all remain deleted. The seeded
unsupported record is test-only data, not a migrated or supported schema.

## Failed attempts and corrections

These failed runs remain failed. Their raw files were replaced by later passing
runs, so the original assertions are recorded here rather than as hashes.

1. The first production-adapter attempt stopped at import time because
   `scripts/saved-store-checks.mjs` imported a `chromeExtensionId` export that
   `chrome-session.mjs` no longer provided. The export was restored in
   `c947dcd`; no product behavior changed.
2. The next adapter attempt passed six checks, then failed
   `deleteAllThenSave.deleteResult`: the asynchronous harness serialized
   `undefined` as `null`. The assertion was corrected to `null`.
3. The following attempt passed six checks, then failed because
   `deleteAllThenSave.saveResult` was `saved`, not `stale`. The delete transaction
   was being created after an `await`, allowing the save transaction to queue
   first. `lib/saved-store.ts` now creates the deletion transaction synchronously
   when the connection is ready, matching the save barrier, and the four ordering
   checks pass on both pins.
4. The first Firefox 158 product run passed the new retention, bulk-delete and
   delete-all checks, then failed the later management-revocation fixture with
   `Exactly one saved record must be listed: 0 !== 1`. The qualification flow
   intentionally removed every record before that later check expected one. The
   probe now saves and verifies one archive after delete-all, and the clean rerun
   passes.

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
