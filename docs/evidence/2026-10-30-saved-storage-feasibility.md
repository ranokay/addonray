# Saved-investigation storage feasibility

Status: Stage 1 candidate evidence only. The product runtime, UI, schema and
storage adapter are not implemented and no product wiring is authorized by this
record. This gate tests the #6 candidate — extension-origin IndexedDB without a
new manifest permission — on the four pinned local targets. The source identity
is signed candidate commit `0a535c5ef8895015ef023275e8ecf360faa2d505` on
`feat/saved-investigation`, based on integration `512f36ca9c8caa0b6c37f739b509009e897a3238`.
The parent checkout was not modified.

Observed on macOS 27.2 arm64 with the pinned Bun
`1.4.4-canary.1+963452075`. Firefox used geckodriver `0.37.1`; Chrome for
Testing and ChromeDriver were `156.0.8078.47`. All runs used disposable
profiles under ignored `.scratch/`; no user profile was opened.

## Candidate and authority

| Input                                | Identity                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `scripts/saved-storage-checks.mjs`   | SHA-256 `a81221b8595b857826c413749d525dd247c322d2da5d646a45d09a42be5dbae0`          |
| `scripts/saved-storage-candidate/**` | combined SHA-256 `340da8382102917f1602be04156fecf38a4fa2d9507147bf774945f2a729d853` |
| `scripts/saved-content-fixture/**`   | combined SHA-256 `6c9c59e5fa6d08a66d4a48f6a249ca8bdb9fbcc7f9d7deaf53a0e8b62869e41c` |

The storage candidate declares no `permissions`, `optional_permissions`,
`host_permissions` or content scripts. The content-boundary fixture is a
separately identified test-only extension with one declared loopback
`content_scripts` match and host permission. It is not the product and is not
the zero-permission candidate. The fixture extension page owns the
extension-origin archive sentinel; its content script attempts the same-named
database from the loopback page origin.

Candidate-only test hooks expose controlled readiness delays, a pending-save
gate, a synchronous transaction abort, deferred connection opening and the
deletion-epoch comparison. These hooks do not enter the product or source
archives. Browser restart uses a retained copy of the session-1 Firefox profile
or the same Chrome user-data directory. Firefox temporary extensions are
reinstalled with a fixed `extensions.webextensions.uuids` mapping so the
extension origin is unchanged. This is a test harness, not an installed
product.

## Results matrix

Legend: **P** passed, **U** unavailable (retained as a gap, not a pass), **–**
not applicable to this target.

| Check                               | Firefox 140.0               | Firefox 153.5.1esr          | Firefox 158.0.1             | Chrome 156.0.8078.47        |
| ----------------------------------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- |
| Availability / round trip           | P                           | P                           | P                           | P                           |
| Ordinary DB operation prompts       | P (none)                    | P (none)                    | P (none)                    | P (none exposed)            |
| 50 records, 5 MiB set, 1 MiB record | P                           | P                           | P                           | P                           |
| Separate `persist()` probe          | U (prompt)                  | U (prompt)                  | U (prompt)                  | P (resolved false)          |
| Quota observation                   | P (estimate; no exhaustion) | P (estimate; no exhaustion) | P (estimate; no exhaustion) | P (estimate; no exhaustion) |
| Forced browser-origin clear         | U                           | U                           | U                           | P (CDP)                     |
| Content-script boundary             | P                           | P                           | P                           | P                           |
| Cross-view deletion epoch           | P                           | P                           | P                           | P                           |
| First-save readiness race           | P                           | P                           | P                           | P                           |
| Delete / expiry / unsupported       | P                           | P                           | P                           | P                           |
| Authentic private/incognito context | P                           | P                           | P                           | U (blocked route)           |
| Restart persistence                 | P                           | P                           | P                           | P                           |
| Uninstall/reinstall observation     | P                           | P                           | P                           | P                           |

All essential mechanism checks passed on every target except the Chrome
authentic incognito route, which is recorded as unavailable, not passed. The
gate completed with no essential failure and no not-run essential check.

## Observed evidence

### Ordinary operations and prompts

Opening the database, creating its object stores, and writing records up to
1 MiB completed with no notification-box or popup notification on all three
Firefox versions. Chrome exposes no ordinary storage-prompt route for extension
IndexedDB and recorded none. The candidate requested no permission.

Calling `navigator.storage.persist()` separately, after ordinary DB use,
produced a Firefox `persistent-storage` popup with the exact message
`Allow <> to store data in persistent storage?`. The promise remained unresolved
for 5 s; the test dismissed the prompt without granting and `persisted()`
remained `false`. This prompt belongs to the optional `persist()` probe, not to
ordinary database creation or to the required product mechanism. The product
must not call `persist()`. Chrome resolved `persist()` to `false` without a
prompt.

### Bounds and quota

The candidate stored 50 small records plus one 1,000,000-character record:
`5,001,790` serialized bytes for the 50-record set and `1,000,035` for the
large record. All records read back. `navigator.storage.estimate()` reported a
quota of `10,737,418,240` bytes on Firefox and about `10,737,500,160` bytes on
Chrome. That is above the fixed 64 MiB pressure cap, so no natural quota
pressure was induced and no real `QuotaExceededError` exists for these targets.
A synchronous transaction abort was recorded as a controlled failure; it is not
a quota observation. The 50/5 MiB/1 MiB product limits are not browser quota
promises.

### Cross-view deletion epoch

The candidate stored one record, captured epoch `0` at a pending save's
readiness, then deleted a different record from a second tab. The delete
advanced the epoch to `1`. The pending save, whose record ID differed from the
deleted record, found the mismatch inside the same readwrite transaction and
finished `stale` with no write. No BroadcastChannel was created; notification
was withheld. An idempotent delete of an absent record advanced the epoch to
`2` and stale-failed the next pending save. A save queued before a later delete
finished `saved` first; the subsequent delete left that record present, which
is the allowed commit-before-delete order. A synchronous abort left no record
and retained its transaction events. The readiness case returned `not-ready`
before the delayed connection opened; after the other tab deleted, the newly
ready save read the post-delete epoch and succeeded.

The transactions' `completeAt`, `transactionCreatedAt`, `epochReadAt`,
`putQueuedAt` and `abortAt` timestamps are retained in the raw reports. A
transaction is not treated as committed until `oncomplete`; no asynchronous
permission check runs inside an active transaction.

### Content-script boundary

The content fixture's extension page wrote `fixture-extension`; the candidate
page wrote `extension-candidate`; the loopback page wrote `page`. All three
used the same database name. The content script reported its own runtime ID,
which matched the fixture extension ID, and read only `page`. It did not read
`fixture-extension` or `extension-candidate`. The fixture page still read its
own sentinel and the candidate page still read its own sentinel. This is the
same-extension content-script origin boundary, not merely a separate web page.

### Private, unknown and restart

Firefox opened the candidate page in an authentic private window after a
test-only `internal:privateBrowsingAllowed` grant. `tabs.getCurrent()` reported
`incognito: true`. Guarded reads with `true`, `null` and `'false'` all returned
`blocked` with `storageAccessed: false` before any database open. A positive
control in private reached the private storage and failed with
`InvalidStateError` on store mutation; that error is retained and is not a
product guard pass. Chrome's authentic incognito extension page was blocked by
Chromium with `ERR_BLOCKED_BY_CLIENT`; the exact URL, title and body are
retained. No reachable Chrome incognito entrypoint guard was observed.

A Firefox sentinel survived a real process restart using a retained copy of
the session-1 profile and the same extension origin (UUID
`3f2fdb1e-9f7a-4d8a-9f27-5f2f4e0c9a11`). A Chrome sentinel survived a restart
with the same user-data directory and unpacked path. The retained records
include valid, malformed and unsupported fixtures; nothing was auto-migrated.

### Delete, expiry, unsupported and uninstall

The candidate list removed an expired version-1 record, kept a version-2
record visibly listed as unsupported, kept a malformed version-1 record
visible, and allowed explicit deletion of the unsupported record. No
auto-migration or silent deletion occurred. Firefox `AddonManager` uninstall
and Chrome `management.uninstallSelf` both cleared extension storage on
reinstall; this is test-authority uninstall behavior, not a retail
distribution claim.

Chrome forced browser-origin clearing passed through a page-target CDP
`Storage.clearDataForOrigin`; no records remained. Firefox's quota-manager
`clearStoragesForOrigin` was unavailable and `qms.clear()` returned
`NS_ERROR_UNEXPECTED`, so forced browser-origin clearing is unavailable on
Firefox. Product-level deletion is covered by the epoch tests; browser-level
clearing is not claimed for Firefox.

## Gaps and disposition

These are retained gaps, not converted passes. They require supervisor
disposition before product wiring:

1. **Eviction is unobserved.** Firefox `persisted()` was `false` before and
   after the separate `persist()` probe; Chrome `persisted()` was `false`.
   Natural pressure eviction was not induced. The 30-day retention promise is a
   product-level refusal/cleanup rule, not a guarantee that a best-effort
   browser store survives pressure. No `storage` or `unlimitedStorage`
   permission was requested or approved.
2. **Real quota exhaustion is unobserved.** The estimate is about 10 GiB on
   both engines, above the fixed pressure cap. Only the estimate and a
   simulated transaction abort are recorded.
3. **Firefox forced browser-origin clearing is unavailable** through the
   exposed quota-manager methods. The candidate did not inspect or remove
   profile files.
4. **Chrome authentic incognito is browser-blocked** for an extension page
   under this test setup. Stage 2 must test the reachable popup launcher and
   library entrypoints; if a reachable entrypoint cannot be observed, that
   remains incomplete.
5. **Uninstall behavior** is observed for temporary/unpacked test installs, not
   retail installation, signed distribution or every OS.
6. **Scope.** One OS/architecture, local browsers only. No Linux, Windows,
   store, privacy-policy or native-platform qualification follows.

The required ordinary IndexedDB mechanism itself was available without a new
manifest permission, held the product bounds and restart sentinel, enforced
the transactional deletion barrier, and kept content scripts out of the
extension-origin archive on all four targets. The gate did not establish
durable persistence against eviction or a reachable Chrome incognito guard.
Product wiring remains stopped pending review.

## Retained raw reports

All paths are under ignored `.scratch/`:

| Target                           | Report                                                                            | SHA-256                                                            |
| -------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Firefox 140.0                    | `.scratch/saved-storage-firefox-140-0-20261030T103055Z-44RYdZ/report.json`        | `eca167055f554b9acf4411bbc8fef5d764f00644dfd22b57bd7dfdaa06cd2d84` |
| Firefox 153.5.1esr               | `.scratch/saved-storage-firefox-153-5-1esr-20261030T103120Z-ga9e7Y/report.json`   | `ef9f8104a2215998ed8bd25cc08588f4e1c905bf9b57fc8de52fba46f9d8aa0e` |
| Firefox 158.0.1                  | `.scratch/saved-storage-firefox-158-0-1-20261030T103025Z-eTvsRH/report.json`      | `6668682d518f98f72e67f195965b5c045b7ebba3a5d6e98bdfc8b328d09dc21f` |
| Chrome for Testing 156.0.8078.47 | `.scratch/saved-storage-chrome-156-0-8078-47-20261030T103139Z-b0Uezh/report.json` | `48f738ec530c722fa3a1ed36de622c86fc3e9bfb7706dd04201590bd8ef0cb54` |

Each report has a `report.sha256` sidecar. The reports retain the source commit
`0a535c5ef8895015ef023275e8ecf360faa2d505` with `dirty: false`, candidate and
fixture file hashes, exact browser/driver versions, check stages, partial
details, gaps and cleanup. Raw evidence is not committed.

Earlier candidate attempts remain under the same ignored directory. They were
not deleted or relabelled: the Services-import failure, the 30-second
`persist()` timeout, the discarded browsing contexts, the deleted Firefox
profile path and the early Chrome report missing browser identity are retained
in their original reports. The selected reports above are the final clean
attempts at the candidate commit.

## Gate

The shared check runs through the receipt runner before signed local commits.
The candidate commit's pre-commit hook ran the full native gate; the final
frozen receipt for the documentation head is recorded outside the repository.
No push, pull request, permission change, product UI or runtime is included.
