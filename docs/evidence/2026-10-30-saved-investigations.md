# Saved-investigation product slice

Status: bounded #6 save, list, read-only reopen and single-record delete are
implemented in signed local `e0d129346aacbb54461fe0a581e43d9d8c9fafa8` and
locally qualified on the pinned macOS browsers. Product browser restart and
deletion persistence now pass separately. Natural eviction, an actual Chrome
engine quota error, a reachable Chrome private main-frame library route, the
exact-OS and hosted matrix, and independent review remain open. The local frozen
gate passed at the implementation boundary. No push, PR, permission,
publication or durability claim is included.

This record follows the accepted Stage 1 mechanism in the
[storage feasibility record](2026-10-30-saved-storage-feasibility.md). The prior
reviewed boundary is `a5d2b8accc7fa2e0fc6ac551ed7d172868976c64`.

## Implemented boundary

| Area              | Implemented behavior                                                                                                                                                                                                                                                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save              | One explicit Save from a completed, idle investigation with both inventories successful and a verified normal own tab. No autosave; each save creates a new immutable record.                                                                                                                                                                                                    |
| Record            | Schema version 1 with local record ID, origin, `savedAt`, `expiresAt` and the approved report fields. No extension IDs, source/live/document/attempt/transfer IDs, permission or host metadata, URLs, titles or page content.                                                                                                                                                    |
| States            | Measured, unrecorded, unavailable and null states are preserved exactly. Duplicate names are retained. Changes are the precomputed ID-based result from the capture.                                                                                                                                                                                                             |
| Bounds            | 30-day default, 50 records, 5 MiB aggregate, 1 MiB complete stored record including envelope, exact would-be JSON ≤1 MiB, 1,000 inventory rows per side, 2,000 changes, 4,096 code points per string, depth 8. No truncation.                                                                                                                                                    |
| Store             | Extension-origin IndexedDB, no new permission. Private store-instance ID and deletion epoch are checked inside one readwrite transaction; success follows transaction completion. Missing/corrupt/exhausted metadata and recreated connections fail closed. Open/blocked/transaction waits are bounded.                                                                          |
| Save races        | Exclusive save lease at capture/attachment/report/save seams. The save binds snapshot reference, reset generation, store state, normal context and current permissions through the last abortable point. Reset, assessment/attachment change, permission removal or context loss aborts the pending write. Ordinary storage/quota/size failure preserves the live investigation. |
| Library           | Separate normal-window document with list and inline read-only detail. No collection API, permission prompt, collector or source-tab reattachment. Remains usable after management/scripting removal. Every read/action rechecks context and re-reads storage.                                                                                                                   |
| Expiry / delete   | Valid expired rows are refused and removed lazily. Single delete is confirmed and increments the deletion epoch. Unsupported and unreadable rows stay visible for explicit deletion; no migration or unexpired eviction.                                                                                                                                                         |
| Multi-view        | Deletion/epoch invalidation is authoritative. A BroadcastChannel message is only a hint; a stale or suspended view fails its next action and refreshes to the deleted state.                                                                                                                                                                                                     |
| UI                | All approved storage/privacy disclosures before Save. Stored names/versions render as text. The existing live Markdown preview/download is unchanged.                                                                                                                                                                                                                            |
| Private / unknown | The popup launcher queries the active tab of the current window and requires `incognito === false`. The library and save controller fail closed before storage/records for private or unknown contexts.                                                                                                                                                                          |

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

The full suite at `e0d1293` passes **500 tests / 2,022,284 assertions across 35
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
| Firefox 140.0                    | passed-with-qualification-gaps | 87              | `.scratch/firefox-evidence-140.0.json`      | `e538cf7b6447d09671b862f39db05fbee54c0496c60cf68c92c1cf10c83bb561` |
| Firefox 153.5.1esr               | passed-with-qualification-gaps | 87              | `.scratch/firefox-evidence-153.5.1esr.json` | `a057e466c2a8fa1dc974bbedf008121e440897723f6c0e1b90f6ac7a9e5d19da` |
| Firefox 158.0.1                  | passed-with-qualification-gaps | 87              | `.scratch/firefox-evidence-158.0.1.json`    | `373dfd9f698bd5a462e5630034d03039856171af6d9a274331f01b401def0c61` |
| Chrome for Testing 156.0.8078.47 | passed-with-qualification-gaps | 81              | `.scratch/chrome-evidence.json`             | `924df2c06ddcde53f42c87e014c2fbd4c0196f9b862d8c5f8147c386a67b5961` |

All four reports record source commit
`e0d129346aacbb54461fe0a581e43d9d8c9fafa8` and `sourceDirty:false`.

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
- Chrome: a simulated `QuotaExceededError` from a patched
  `IDBObjectStore.prototype.put` produces the bounded quota message and preserves
  the live pair. This is not an observed Chrome engine quota failure.

## Product browser restart

The restart probe is `scripts/saved-restart-checks.mjs`. It uses the packaged
product assets and runs at clean test commit `f235f34`. Each target performs
three bounded processes: explicit product Save with a completed live pair;
restart with the retained profile/origin; and a second restart after single
delete.

| Target                           | Checks   | Raw report                                       | SHA-256                                                            |
| -------------------------------- | -------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| Firefox 140.0                    | 5 passed | `.scratch/saved-restart-firefox-140.0.json`      | `216895cc893b882788829857d870070318e02ca86dbff7c329467ebe88a351ed` |
| Firefox 153.5.1esr               | 5 passed | `.scratch/saved-restart-firefox-153.5.1esr.json` | `f1a2e8980a024313869663145d3c9ef04e704323d9d29af539ffda231c3ad6d3` |
| Firefox 158.0.1                  | 5 passed | `.scratch/saved-restart-firefox-158.0.1.json`    | `3d423a34fd574c83d7fe1c696fd93e5740f0752fb397299d32bc5eb7791f5aad` |
| Chrome for Testing 156.0.8078.47 | 5 passed | `.scratch/saved-restart-chrome.json`             | `c05dd6dc474a6ade65e696cba6ae8d4bf3ccc2feff4cb68f1403215a5cd9497e` |

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

## Gaps and limits

1. **Chrome private main-frame library route.** Creating or navigating an
   extension page in the incognito browser context was blocked by the test
   protocol (`Failed to find browser context` / `ERR_BLOCKED_BY_CLIENT`). The
   authentic incognito popup launcher refusal is observed; the library page's
   private refusal is observed in Firefox only. The Stage 1 candidate observed the
   same Chrome main-frame boundary.
2. **Chrome test authority.** Chrome product checks use the explicitly named
   pre-granted UI fixture with unchanged production assets. They do not exercise
   unmodified optional-management consent or management removal.
3. **Firefox private allowance.** The private product check adds the test-only
   `internal:privateBrowsingAllowed` permission and reloads the extension in a
   disposable profile. It does not claim private-window product support.
4. **Natural eviction and engine quota.** Natural pressure eviction is unobserved.
   Firefox's real low-quota failure is Stage 1 candidate evidence; Chrome's
   product quota path is simulated only.
5. **Source state.** Browser reports were produced from clean `e0d1293`. The
   final documentation head and frozen gate are recorded separately.
6. **One OS/architecture.** macOS arm64 only. Linux/Windows, retail installs,
   store distribution and native UI usability are outside this run.
7. **Scope.** No import, JSON export, printable HTML, clipboard, retention
   control, bulk deletion, delete-all, sync, cloud, telemetry or new permission.

## Source and package rebuilds

At `4b9fcc6`, both source rebuild comparisons pass:

```sh
mise run test-source-build
mise run test-source-build-chrome
```

Each reports `Source archive rebuild matches every packaged extension file.` The
evidence files are `.scratch/source-build-evidence.json`
(SHA-256 `98014eb1a3c73dec0341189974804afa4ecfa1329e125ed7229dc28ef8952d5f`)
and `.scratch/source-build-evidence-chrome.json`
(SHA-256 `522b444a5a41015081df92b4cc60d4b61fdc9cb929085b0e5f4029dd7685b66f`).
The shared gate independently packages and validates both targets and writes
their SHA-256 identities. No signed distribution or retail installation is
claimed.

## Release boundary

This is a locally qualified implementation report, not a shipping approval. The
browser reports and local frozen gate are recorded; independent review and the
remaining release matrix are required before any claim of completed #6 release
qualification. Push and PR creation remain prohibited by the current task.
