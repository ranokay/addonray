# Saved-investigation product slice

Status: bounded #6 save, list, read-only reopen and single-record delete are
implemented in signed local `05ac5ef950f0372bcbf8e710f1bb7dda50aafd88` and
locally qualified on the pinned macOS browsers. Product browser restart,
deletion persistence, the production-adapter ordering/add-only/bounds/abort
regressions and the simulated library lifecycle pass separately. Natural
eviction, an actual Chrome engine quota error, an exercised Chrome private
main-frame library guard, the exact-OS and hosted matrix, and independent review
remain open. The local frozen gate passed at the implementation boundary. No
push, PR, permission, publication or durability claim is included.

This record follows the accepted Stage 1 mechanism in the
[storage feasibility record](2026-10-30-saved-storage-feasibility.md). The prior
reviewed boundary is `a5d2b8accc7fa2e0fc6ac551ed7d172868976c64`.

## Implemented boundary

| Area              | Implemented behavior                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save              | One explicit Save from a completed, idle investigation with both inventories successful and a verified normal own tab. No autosave; each save creates a new immutable record.                                                                                                                                                                                                                                                                               |
| Record            | Schema version 1 with local record ID, origin, `savedAt`, `expiresAt` and the approved report fields. No extension IDs, source/live/document/attempt/transfer IDs, permission or host metadata, URLs, titles or page content.                                                                                                                                                                                                                               |
| States            | Measured, unrecorded, unavailable and null states are preserved exactly. Duplicate names are retained. Changes are the precomputed ID-based result from the capture.                                                                                                                                                                                                                                                                                        |
| Bounds            | 30-day default, 50 records, 5 MiB aggregate, 1 MiB complete stored record including envelope, exact would-be JSON ≤1 MiB, 1,000 inventory rows per side, 2,000 changes, 4,096 code points per string, depth 8. No truncation.                                                                                                                                                                                                                               |
| Store             | Extension-origin IndexedDB, no new permission. A ready connection synchronously enqueues the readonly barrier, and the readwrite save transaction is created synchronously before writing. Private store-instance ID and deletion epoch are rechecked; `add` refuses duplicate record IDs. Missing/corrupt/exhausted metadata and recreated connections fail closed. Open/blocked/transaction waits are bounded.                                            |
| Save races        | Exclusive save lease at capture/attachment/report/save seams. The save binds snapshot reference, reset generation, store state, normal context and current permissions through the last abortable point, including a final context recheck after permission and record preparation. Reset, assessment/attachment change, permission removal or context loss aborts the pending write. Ordinary storage/quota/size failure preserves the live investigation. |
| Library           | Separate normal-window document with list and inline read-only detail. No collection API, permission prompt, collector or source-tab reattachment. Remains usable after management/scripting removal. Every read/action rechecks context and re-reads storage.                                                                                                                                                                                              |
| Expiry / delete   | Valid expired rows are refused and removed lazily. Single delete is confirmed and increments the deletion epoch. Unsupported and unreadable rows stay visible for explicit deletion; no migration or unexpired eviction.                                                                                                                                                                                                                                    |
| Multi-view        | Deletion/epoch invalidation is authoritative. A BroadcastChannel message is only a hint; a busy read is invalidated and a refresh is queued. `pagehide` clears displayed data; a persisted `pageshow` revalidates before use. A stale or suspended view fails its next action.                                                                                                                                                                              |
| UI                | All approved storage/privacy disclosures before Save. Stored names/versions render as text. The existing live Markdown preview/download is unchanged.                                                                                                                                                                                                                                                                                                       |
| Private / unknown | The popup launcher queries the active tab of the current window and requires `incognito === false`. The library and save controller fail closed before storage/records for private or unknown contexts.                                                                                                                                                                                                                                                     |

## Code ownership

- `lib/saved-record.ts`: schema types, record creation, serialization, strict
  validation, expiration/labels and limit planning.
- `lib/saved-store.ts`: IndexedDB adapter, private store state, bounded
  transactions, save/delete/list/get and quota/error mapping.
- `lib/saved-save.ts`: exclusive save flow, context/permission/snapshot/generation
  checks, bounded messages and disposal.
- `lib/saved-library.ts`: guarded list/open/delete controller, lazy expiry,
  unsupported rows and cross-view hint handling.
- `lib/saved-context.ts`: fail-closed normal-own-tab classification.
- `lib/saved-launch.ts`: active-tab popup launcher classification.
- `lib/saved-notifier.ts`: BroadcastChannel hint only.
- `lib/live-activity.ts`: public exclusive save/ordinary action boundary.
- `entrypoints/investigation/SavedInvestigation.tsx`: disclosure, explicit save,
  bounded message and library link.
- `entrypoints/library/**`: list, inline archive, delete confirmation and storage
  disclosures.
- `entrypoints/popup/App.tsx` and `main.tsx`: guarded library launcher.

The page-error comparison test fixture now copies `lib/live-activity.ts` because
the production investigation imports it. This is test-fixture authority only and
does not enter either package.

## Deterministic tests

The full suite at `05ac5ef` passes **518 tests / 2,022,344 assertions across 36
files**. Native type checking passes **81 files**. Focused coverage includes:

- exact archived payload, ID omission, duplicate names, state preservation and
  precomputed changes;
- valid/unsupported/invalid inspection, string/depth/byte/list limits, expiry
  cleanup and unexpired refusal;
- exclusive save/hold leases and reset cancellation;
- private/unknown save refusal before opening storage;
- ordinary failure/quota/timeout/stale messages preserving the live pair;
- library list/open/delete/stale/missing/expired/unsupported rows and context
  loss;
- popup launcher normal/private/unknown classification;
- disclosures, escaped untrusted text, read-only archive rendering and no
  collection on render.

UI SSR tests do not replace the interactive product flows below.

## Production-adapter regressions

`scripts/saved-store-checks.mjs` compiles the production `lib/saved-store.ts` and
`lib/saved-record.ts` into a test-only extension and exercises the actual
IndexedDB adapter on the four pins. Each report passes nine checks, including the bounded barrier timeout:

| Target                           | Raw report                           | SHA-256                                                            |
| -------------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| Firefox 140.0                    | `.scratch/r2-store-firefox-140.json` | `2a939109529a79975686204f9b77c4d82d6f3f7f715ee1711aec833f62b55606` |
| Firefox 153.5.1esr               | `.scratch/r2-store-firefox-153.json` | `8f33405b22e9878f3fb0e0a5fb304b5499489c643d66d1a6ed237b61ded7e374` |
| Firefox 158.0.1                  | `.scratch/r2-store-firefox-158.json` | `162ad6b96557352b87adcb6f8c070bdd6865e66a5338fa1307dfb17d9e8e6983` |
| Chrome for Testing 156.0.8078.47 | `.scratch/r2-store-chrome-run.json`  | `3f2e136fab796c1745d583bfbac1ed4bf531744e201636da80ea6b70677e08f2` |

The checks cover the first/not-ready connection, synchronous metadata-barrier
enqueueing, a deletion after the barrier rejecting the save with distinct record
IDs, idempotent delete and epoch increments, a recreated store identity rejecting
the old permit, duplicate record ID refusal with the original record unchanged,
abort-signal cancellation of a pending write, and an oversized structurally
valid row becoming unreadable. All reports record clean `41d3af4` and
`sourceDirty:false`. The fixture is test-only; it is not a product package.

## Browser runs

Commands:

```sh
FIREFOX_VERSION=140.0 mise run test-firefox
FIREFOX_VERSION=153.5.1esr mise run test-firefox
FIREFOX_VERSION=158.0.1 mise run test-firefox
mise run test-chrome
```

Observed on macOS 27.2 (build 26B5091g) arm64 with pinned Bun
`1.4.4-canary.1+963452075`. Firefox used geckodriver `0.37.1`; Chrome for Testing
and ChromeDriver were `156.0.8078.47`. All profiles were disposable and external
to the user's profile.

| Target                           | Result                         | Observed checks | Raw report                                  | SHA-256                                                            |
| -------------------------------- | ------------------------------ | --------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| Firefox 140.0                    | passed-with-qualification-gaps | 88              | `.scratch/firefox-evidence-140.0.json`      | `aef80c13f0df67b31f2618f34b3d18c689472a48cff1d861abec83a2a5c25289` |
| Firefox 153.5.1esr               | passed-with-qualification-gaps | 88              | `.scratch/firefox-evidence-153.5.1esr.json` | `d67a755cbf732ebc97681c855ba5f106e02d9ca3aa0e9e8f8fc647d4fddbe289` |
| Firefox 158.0.1                  | passed-with-qualification-gaps | 88              | `.scratch/firefox-evidence-158.0.1.json`    | `786549e45c49ac03ad5259b95dade6430f8d3848f07b54308c1cf3807073638f` |
| Chrome for Testing 156.0.8078.47 | passed-with-qualification-gaps | 82              | `.scratch/chrome-evidence.json`             | `c7482a9e13f6e543b36b8a7c8971cceda83b939e7380276eaeabc2947d1ee253` |

All four reports record source commit
`05ac5ef950f0372bcbf8e710f1bb7dda50aafd88` and `sourceDirty:false`.

Product observations:

- The explicit Save action writes one archive and preserves the live Before/After
  pair and assessment.
- The normal popup launcher opens the library. The archive shows both inventories,
  the stored change, assessment, timings/errors and limits, and omits the fixture
  ID and live investigation label.
- A second library view sees the same record. With the cross-view hint suppressed
  to simulate a suspended view, deletion in the first view leaves the stale row
  until its next Open, which fails without rendering an archive; Refresh then
  shows the deleted state.
- A reloaded library lists and reopens the record.
- The normal launcher refuses to open a library from a private/incognito context.
- Firefox: a seeded archive remains listed and readable after actual optional
  management removal, then is deleted explicitly.
- Firefox: an authentic private window with test-only
  `internal:privateBrowsingAllowed` refuses both the popup launcher and the
  library route while a valid sentinel archive is present in the profile. No row,
  archive or sentinel text is rendered.
- Chrome: an authentic incognito action popup refuses the launcher. A sentinel
  record was seeded in the incognito extension partition before the action; no
  library tab opened and no saved row appeared.
- Chrome: a simulated `QuotaExceededError` from patched
  `IDBObjectStore.prototype.put`/`add` produces the bounded quota message and preserves
  the live pair. This is not an observed Chrome engine quota failure.

## Product browser restart

The restart probe is `scripts/saved-restart-checks.mjs`. It uses the packaged
product assets and runs at clean commit `05ac5ef`. Each target performs
three bounded processes: explicit product Save with a completed live pair;
restart with the retained profile/origin; and a second restart after single
delete.

| Target                           | Checks   | Raw report                                       | SHA-256                                                            |
| -------------------------------- | -------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| Firefox 140.0                    | 5 passed | `.scratch/saved-restart-firefox-140.0.json`      | `0efc03fbf7e37e1583c1ab620f21b9b53234bde9939e7711fba6e88db2ac6ae1` |
| Firefox 153.5.1esr               | 5 passed | `.scratch/saved-restart-firefox-153.5.1esr.json` | `7f6983136ed256a96408d894f9eb35fefd4317d75b4354798e03b3d0c57dd124` |
| Firefox 158.0.1                  | 5 passed | `.scratch/saved-restart-firefox-158.0.1.json`    | `96cc97da2b80bf277b35e84080e3940de911ea57c960e67910e135791393a003` |
| Chrome for Testing 156.0.8078.47 | 5 passed | `.scratch/saved-restart-chrome.json`             | `56c4427d7f0ee2db91e0fa3b353fe99456521e190569e3a0f1385aab2f634025` |

Commands:

```sh
FIREFOX_VERSION=140.0 bun run test:saved-restart:firefox
FIREFOX_VERSION=153.5.1esr bun run test:saved-restart:firefox
FIREFOX_VERSION=158.0.1 bun run test:saved-restart:firefox
bun run test:saved-restart:chrome
```

Observed on macOS 27.2 arm64:

- The product UI performed one explicit Save; the live Before/After pair and
  `uncertain` assessment remained before shutdown.
- After a full browser process restart, a fresh investigation page had no
  Before/After snapshots and no assessment. The archived row and inline
  read-only archive were present, and the archive text matched the pre-restart
  archive exactly.
- Firefox kept the same `moz-extension://4f0d9a9e-...` origin after reinstall;
  Chrome kept the same path-derived extension origin. `management` was still
  granted and no permission prompt was visible; the library itself exposes no
  capture controls.
- Deleting the record after restart and restarting again left the library empty
  and the investigation fresh.

Firefox authority: the session profile is copied to a retained directory before
browser shutdown; the product and controlled fixture are reinstalled from the
same directories with a fixed test `extensions.webextensions.uuids` mapping.
The optional `management` grant is supplied by test browser authority, not a
native consent observation. This is a temporary-extension, retained-profile
probe, not an installed-product claim.

Chrome authority: the explicitly named pre-granted UI fixture with unchanged
production assets runs with a controlled ordinary fixture extension. The same
user-data directory and extension path are reused across launches. Required
`management`/`scripting` permissions are test-fixture authority; native optional
consent remains unqualified.

### Chrome private-route correction

The prior `.scratch/chrome-evidence-pre-f13-b34a8fd.json` report
(SHA-256 `924df2c06ddcde53f42c87e014c2fbd4c0196f9b862d8c5f8147c386a67b5961`)
recorded `{"status":"browser-blocked"}` for a CDP `Target.createTarget`
transport failure: `Failed to find browser context`. That was not an observed
browser-policy block and is retained only as a failed attempt.

The current probe attaches to a live incognito page target and navigates it to
the library route. Chrome returns `net::ERR_BLOCKED_BY_CLIENT` and the page text
`This page has been blocked by Chromium`; this is a concrete observed policy
block, recorded separately from the authentic popup refusal. The classifier is
tested against negative fixtures for a loaded page without denial, a denied page
that renders a row, and a denied page that renders the sentinel; all fail the
probe as product guard failures. Transport failures remain `unavailable` and do
not pass. The library's own private guard remains unexercised in Chrome because
the route cannot load. No incognito allowance, permission or product mode was
broadened.

### Library race regressions

The delete failure catch now rechecks `live`, `suspended` and the operation after
its context await, matching refresh/open. Deferred-context tests cover
hint-during-final-open-guard, suspend and close during that guard, delete failure
during suspend/resume, and a held newer refresh whose busy state must survive the
old action.

Local negative controls (not committed) removed the post-await guard, the owner
check, and the delete-catch guard in turn. The relevant tests failed:

- `.scratch/negative-control-post-guard.log` (SHA-256 `44cbb057eb8af7011a73779c067b9188fc915df2fed2baf4f49aa05bbcdf53f7`) — three final-guard tests fail.
- `.scratch/negative-control-owner.log` (SHA-256 `db55ff9ec02965c91fd7781f42089f1e1330d80b2aac63b64197b4f228c7882b`) — newer busy state is cleared.
- `.scratch/negative-control-delete-catch.log` (SHA-256 `a6507f7c8679f7768100c91780b4ea05fe995370558819e6f3784fc2e3fc1c60`) — obsolete delete catch clears newer busy state.

The committed source was restored before each check; no negative control was
committed or amended into history.

## Gaps and limits

1. **Chrome private main-frame library guard.** The current live-incognito page
   navigation returns `net::ERR_BLOCKED_BY_CLIENT` and Chrome's blocked-page
   text. The authentic incognito popup launcher refusal is separately observed.
   The blocked page prevents exercising the library's private guard in Chrome;
   Firefox exercises it. The earlier `Failed to find browser context` attempt is
   preserved separately and is not the current route verdict.
2. **Chrome test authority.** Chrome product checks use the explicitly named
   pre-granted UI fixture with unchanged production assets. They do not exercise
   unmodified optional-management consent or management removal.
3. **Firefox private allowance.** The private product check adds the test-only
   `internal:privateBrowsingAllowed` permission and reloads the extension in a
   disposable profile. It does not claim private-window product support.
4. **Natural eviction and engine quota.** Natural pressure eviction is unobserved.
   Firefox's real low-quota failure is Stage 1 candidate evidence; Chrome's
   product quota path is simulated only.
5. **Source state.** Browser reports were produced from clean `05ac5ef`. The
   final documentation head and frozen gate are recorded separately.
6. **One OS/architecture.** macOS arm64 only. Linux/Windows, retail installs,
   store distribution and native UI usability are outside this run.
7. **Scope.** No import, JSON export, printable HTML, clipboard, retention
   control, bulk deletion, delete-all, sync, cloud, telemetry or new permission.

## Source and package rebuilds

At `05ac5ef`, both source rebuild comparisons pass:

```sh
mise run test-source-build
mise run test-source-build-chrome
```

Each reports `Source archive rebuild matches every packaged extension file.` The
evidence files are `.scratch/source-build-evidence.json`
(SHA-256 `0733431ad42d4e7dfcf2e48f5be5cf0901f93de3ebc1dc1b0178e3d5d60e0376`)
and `.scratch/source-build-evidence-chrome.json`
(SHA-256 `e66673865e0c655cf526b3c44349b0141c3415d8345cebd054b2322879c39f5a`).
The shared gate independently packages and validates both targets and writes
their SHA-256 identities. No signed distribution or retail installation is
claimed.

## Release boundary

This is a locally qualified implementation report, not a shipping approval. The
browser reports and local frozen gate are recorded; independent review and the
remaining release matrix are required before any claim of completed #6 release
qualification. Push and PR creation remain prohibited by the current task.
