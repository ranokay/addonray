# Saved-investigation product slice

Status: bounded #6 save, list, read-only reopen and single-record delete are
implemented in signed local `41d3af4409ca82ebecaff7cee1b104c561239306` and
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

The full suite at `41d3af4` passes **509 tests / 2,022,318 assertions across 35
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
IndexedDB adapter on the four pins. Each report passes eight checks:

| Target                           | Raw report                                     | SHA-256                                                            |
| -------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| Firefox 140.0                    | `.scratch/saved-store-checks-firefox-140.json` | `2be4255a2bdfc8744ca9f33258014077f58939fbdb9f152f07283c97b00116a5` |
| Firefox 153.5.1esr               | `.scratch/saved-store-checks-firefox-153.json` | `07dd0fd1d08dcd6d96b3b61592c8b07800436b907bd78fa443a8b515b79a329f` |
| Firefox 158.0.1                  | `.scratch/saved-store-checks-firefox-158.json` | `5f564db7af3f1506b4ada6b4f122b60fd54edc1776cfae93503ec61e655efdfb` |
| Chrome for Testing 156.0.8078.47 | `.scratch/saved-store-checks-chrome.json`      | `b94523e62483cf96da0a8704e919a8ce78047a520003893092fd3bd87476bfed` |

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
| Firefox 140.0                    | passed-with-qualification-gaps | 87              | `.scratch/firefox-evidence-140.0.json`      | `c5742e435c3583bd5aa61d6cd03e382409ae3009df8c7541648025d70e155880` |
| Firefox 153.5.1esr               | passed-with-qualification-gaps | 87              | `.scratch/firefox-evidence-153.5.1esr.json` | `95042e9c9b4ddd60507e865384a745f51681af782dfb37e617df72a03b6c6345` |
| Firefox 158.0.1                  | passed-with-qualification-gaps | 87              | `.scratch/firefox-evidence-158.0.1.json`    | `ec0eed6d0f47867db65c347686054ab475c8ed1164e8b4eeecee34ae0cb699f0` |
| Chrome for Testing 156.0.8078.47 | passed-with-qualification-gaps | 81              | `.scratch/chrome-evidence.json`             | `6d9751c03129da807b130ea437f21df79a4256616dfdd6dd45913841668ea095` |

All four reports record source commit
`41d3af4409ca82ebecaff7cee1b104c561239306` and `sourceDirty:false`.

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
product assets and runs at clean commit `41d3af4`. Each target performs
three bounded processes: explicit product Save with a completed live pair;
restart with the retained profile/origin; and a second restart after single
delete.

| Target                           | Checks   | Raw report                                       | SHA-256                                                            |
| -------------------------------- | -------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| Firefox 140.0                    | 5 passed | `.scratch/saved-restart-firefox-140.0.json`      | `43afa67c2d9d294e6b1d235f7b05118e248423dea821281005e76b5eccf22a2d` |
| Firefox 153.5.1esr               | 5 passed | `.scratch/saved-restart-firefox-153.5.1esr.json` | `730c813c297c8b7dfba32a3d27c3fb94f1a5514a6eb62b4d0472185f1c9f2fe7` |
| Firefox 158.0.1                  | 5 passed | `.scratch/saved-restart-firefox-158.0.1.json`    | `22a6adec6efc0752e75cf655b085094c9593d0067aa3dc28036a0d7ff85013e9` |
| Chrome for Testing 156.0.8078.47 | 5 passed | `.scratch/saved-restart-chrome.json`             | `02272af950dc57c0fb8be64b4d13c8a8b81cc7eda46c6369882a31a98cd69ec6` |

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
block, recorded separately from the authentic popup refusal. The library's own
private guard remains unexercised in Chrome because the route cannot load. No
incognito allowance, permission or product mode was broadened.

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
5. **Source state.** Browser reports were produced from clean `41d3af4`. The
   final documentation head and frozen gate are recorded separately.
6. **One OS/architecture.** macOS arm64 only. Linux/Windows, retail installs,
   store distribution and native UI usability are outside this run.
7. **Scope.** No import, JSON export, printable HTML, clipboard, retention
   control, bulk deletion, delete-all, sync, cloud, telemetry or new permission.

## Source and package rebuilds

At `41d3af4`, both source rebuild comparisons pass:

```sh
mise run test-source-build
mise run test-source-build-chrome
```

Each reports `Source archive rebuild matches every packaged extension file.` The
evidence files are `.scratch/source-build-evidence.json`
(SHA-256 `59a3838a556afc2fb7cf7fa3898fc00a3e481f81504ee5c64dc2f28574cba330`)
and `.scratch/source-build-evidence-chrome.json`
(SHA-256 `c164bb86ee763a15f30b7bc93f2f7b6a76986ac1490d689febe007396b02a446`).
The shared gate independently packages and validates both targets and writes
their SHA-256 identities. No signed distribution or retail installation is
claimed.

## Release boundary

This is a locally qualified implementation report, not a shipping approval. The
browser reports and local frozen gate are recorded; independent review and the
remaining release matrix are required before any claim of completed #6 release
qualification. Push and PR creation remain prohibited by the current task.
