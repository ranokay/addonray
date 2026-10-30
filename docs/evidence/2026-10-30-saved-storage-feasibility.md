# Saved-investigation storage feasibility

Status: Stage 1 candidate evidence after review rounds F1 through F7. The Stage 1
mechanism was accepted for the bounded #6 implementation on 2026-10-30. Stage 2
product save/list/reopen/delete code is implemented in signed local `41d3af4` and
locally qualified; see the separate
[product evidence](2026-10-30-saved-investigations.md). This record preserves the
candidate gate, its exact raw reports and its explicit qualification gaps. No
storage permission, sync, cloud or durability promise is approved.

The candidate commit named by the final browser reports is signed
`e9fa95848d876a339bfc48168c45af91d37daaab`, based on integration
`512f36ca9c8caa0b6c37f739b509009e897a3238` on `feat/saved-investigation`.
The parent checkout was not modified. No product `lib/` or `entrypoints/` file
changed.

Observed on macOS 27.2 (build 26B5091g) arm64 with pinned Bun
`1.4.4-canary.1+963452075`. Firefox used geckodriver `0.37.1`; Chrome for
Testing and ChromeDriver were `156.0.8078.47`. All runs used disposable
profiles under ignored `.scratch/`; no user profile was opened.

## Candidate and authority

| Input                                | Identity                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `scripts/saved-storage-checks.mjs`   | SHA-256 `7b079fe178c33833bffed899179529fc8dd0de3ff9daa94a38e2fdc196bb778e`          |
| `scripts/saved-storage-candidate/**` | combined SHA-256 `46ce9efbb5f851c27417344bc61ebaea9d51ea2b22f75d3a304e56c621a0a9f1` |
| `scripts/saved-content-fixture/**`   | combined SHA-256 `b5edcdc86ed08fbf3cd335230be1a981a71c4b16f97cc1a2dc93c1b256fa243f` |
| `scripts/saved-popup-candidate/**`   | combined SHA-256 `ab562e9ddeab9f110fb9405671e5ac28a6d2299a653bc88efc4261149faef8b2` |

The storage candidate declares no `permissions`, `optional_permissions`,
`host_permissions` or content scripts. The content-boundary fixture is a
separately identified test-only extension with one declared loopback
`content_scripts` match and host permission. The popup candidate is a separate
zero-permission action-popup extension with no host permissions. Candidate-only
hooks provide readiness delays, a pending-save gate, synchronous aborts,
metadata corruption, store identity and the deletion-epoch comparison. They do
not enter the product or source archives.

Browser restart uses a retained copy of the session-1 Firefox profile or the
same Chrome user-data directory. Firefox temporary extensions are reinstalled
with a fixed `extensions.webextensions.uuids` mapping so the extension origin is
unchanged. This is a test harness, not an installed product.

## Gate outcome

- Firefox 140.0, 153.5.1esr and 158.0.1: every essential check passed; each
  command exits `0`. Non-essential gaps: `persistence-grant` (optional
  `persist()` prompt) and `forced-clear` (scoped clear returned `NS_OK` but the
  post-clear page navigation timed out).
- Chrome for Testing 156.0.8078.47: the reachable action-popup guard passed, but
  the authentic main-frame extension-page route remains browser-blocked.
  `private-context` is essential and `unavailable`; `report.incomplete` is
  `["private-context"]`; the command exits `2`. The Chrome low-quota override
  is active but unenforced and is `unavailable`, not a quota-error pass.
- Overall: the ordinary IndexedDB mechanism, exact bounds, atomic refusal,
  transactional deletion barrier, store-loss handling, content-script
  isolation, restart sentinel and the Firefox/Chrome popup private guards
  passed where observable. The gate remains incomplete pending disposition of
  the remaining gaps.

## Results matrix

Legend: **P** passed, **U** unavailable (not a pass), **n/e** non-essential.

| Check                                            | FF 140.0 | FF 153.5.1esr | FF 158.0.1 | Chrome 156.0.8078.47          |
| ------------------------------------------------ | -------- | ------------- | ---------- | ----------------------------- |
| Availability / round trip                        | P        | P             | P          | P                             |
| Ordinary operation prompt checkpoints            | P        | P             | P          | P                             |
| Raw storage headroom (separate)                  | P        | P             | P          | P                             |
| Exact 5,242,880-byte set / 1,048,576-byte record | P        | P             | P          | P                             |
| Atomic 51st / total-byte / per-record refusal    | P        | P             | P          | P                             |
| Separate `persist()` probe                       | U (n/e)  | U (n/e)       | U (n/e)    | P (n/e)                       |
| Estimate-only quota observation                  | P (n/e)  | P (n/e)       | P (n/e)    | P (n/e)                       |
| Real low-quota error + recovery                  | P        | P             | P          | U (active override, no error) |
| Forced browser-origin clear                      | U (n/e)  | U (n/e)       | U (n/e)    | P (n/e)                       |
| Content-script boundary                          | P        | P             | P          | P                             |
| Cross-view deletion epoch                        | P        | P             | P          | P                             |
| Missing/corrupt/exhausted epoch fail-closed      | P        | P             | P          | P                             |
| First-save readiness race                        | P        | P             | P          | P                             |
| Delete / expiry / unsupported                    | P        | P             | P          | P                             |
| Controlled store loss / recreation               | P        | P             | P          | P                             |
| Authentic private/incognito main frame           | P        | P             | P          | U                             |
| Authentic incognito action popup                 | n/a      | n/a           | n/a        | P                             |
| Restart persistence                              | P        | P             | P          | P                             |
| Uninstall/reinstall observation                  | P (n/e)  | P (n/e)       | P (n/e)    | P (n/e)                       |
| Negative fixtures / failure retention            | P        | P             | P          | P                             |

## Review corrections

### F2/F4/F6 — retained from the previous round

Read-only content-fixture queries verify exact sentinel IDs and payloads without
reseeding after the content-script attempt. Prompt detection requires both
notification routes to exist and be readable; missing routes are unavailable,
and a popup-only negative fixture detects the `persistent-storage` popup. Run
callbacks populate shared observations before assertions and retain a failure
snapshot. These remain implemented in the current candidate.

### F7.1 — quota verdicts match observations

The Firefox low-quota check requires a real `QuotaExceededError` and a
successful recovery write. Its final result is
`QuotaExceededError: The current transaction exceeded its quota limitations.`
with one record before recovery and a successful 64 KiB recovery write.

Primary sources for the low-quota mechanisms:
`dom.quotaManager.temporaryStorage.fixedLimit` in
`modules/libpref/init/StaticPrefList.yaml`, revision `86136a5f`
(<https://searchfox.org/mozilla-central/source/modules/libpref/init/StaticPrefList.yaml>);
Chrome DevTools Protocol `Storage.overrideQuotaForOrigin`
(<https://chromedevtools.github.io/devtools-protocol/tot/Storage/#method-overrideQuotaForOrigin>)
on Chrome for Testing `156.0.8078.47`.

The Chrome check is explicitly named "Test-only quota override observation:
active override but no enforced error". `Storage.overrideQuotaForOrigin` was
accepted, `Storage.getUsageAndQuota` reported `overrideActive:true` with a
2,000,000-byte quota, but five 1 MiB random writes succeeded. The override was
reset and recovery succeeded. The check is `unavailable`, with the exact active
override retained; it is not a quota-error pass. A helper setup/transport error
becomes an unavailable check, never a pass. Negative fixtures reject a false
quota flag, a non-`QuotaExceededError` name and a failed recovery.

### F7.2 — Firefox scoped clear target and completion

The scoped API is
`clearStoragesForPrincipal(in nsIPrincipal, [optional] ACString persistenceType)`
in `dom/quota/nsIQuotaManagerService.idl`. Its request is `nsIQuotaRequest` with
a callback `onComplete(in nsIQuotaRequest)` in
`dom/quota/nsIQuotaCallbacks.idl`; the callback receives `resultCode` and
`resultName`. The candidate no longer awaits a non-Promise request object and
never falls back to global `qms.clear()`.

The candidate closes its DB handles, navigates the candidate tab to
`about:blank`, then resolves the actual pinned extension principal. The raw
result is stored before context restoration. In all three Firefox reports the
principal was concrete and exact (`principalOrigin` equal to the extension
origin; `extensionPrincipalURI` matching; `hasPrincipal:true`), and the callback
returned `resultCode:0`, `resultName:"NS_OK"`, `cleared:true`. Context
restoration succeeded, but reopening the candidate page then timed out
(`Navigation timed out after 30000 ms`). The check is therefore `unavailable`:
the API call completed successfully, but the emptied store was not verified by
a post-clear read. No global clear was attempted. The earlier guessed-method
attempts and session-loss attempts remain retained.

Primary sources:

- `dom/quota/nsIQuotaManagerService.idl`, revision `86136a5f`:
  <https://searchfox.org/mozilla-central/source/dom/quota/nsIQuotaManagerService.idl>
- `dom/quota/nsIQuotaRequests.idl` and `nsIQuotaCallbacks.idl`, revision
  `86136a5f`:
  <https://searchfox.org/mozilla-central/source/dom/quota/nsIQuotaRequests.idl>,
  <https://searchfox.org/mozilla-central/source/dom/quota/nsIQuotaCallbacks.idl>

### F7.3 — controlled store loss

Each new database creates a `storeId` with `deletionEpoch:0`. A pending save
captures both the expected epoch and the expected `storeId`; the put transaction
compares both inside the same readwrite transaction. A controlled
`deleteDatabase` closes the candidate handles and recreates a database whose
epoch is again `0` but whose `storeId` differs. Releasing the old pending save
returns `stale-store`; the new store remains empty and a fresh save succeeds.
The check is explicitly labelled controlled loss handling, not natural
eviction. Negative fixtures reject a reused store identity and an accepted
pending save.

### F7.4 — private-context disposition

The Chrome popup candidate was loaded with `--load-extension`, **Allow in
Incognito** was set through the actual `chrome://extensions/?id=...` detail
toggle, and `chrome.extension.isAllowedIncognitoAccess()` returned `true` after
restart. An authentic incognito window was created with
`chrome.windows.create({incognito:true})`; the action popup was opened with
`Extensions.triggerAction` on a real incognito tab target.

Popup observations: `allowed:true`; `tabs.getCurrent()` returned
`{status:"unknown", tabFound:false}`; `tabs.query({active:true,currentWindow:true})`
returned `{status:"success", incognito:true}`; the guard returned
`{status:"blocked", reason:"private-or-unknown-context", storageAccessed:false}`;
`storageAccesses` was `0`. `chrome.extension.inIncognitoContext` was `false` in
the popup, recorded but not used to classify it as normal. The same popup
candidate's main-frame page remained browser-blocked with
`ERR_BLOCKED_BY_CLIENT` even with the allowance. The old main-frame route stays
unavailable; the popup route passes. There is no combined waiver: the gate
remains incomplete and Stage 2 must test every actual product entrypoint.

## Supervisor disposition, 2026-10-30

The supervisor reviewed the complete delta and all four raw reports after four
rounds. F1 through F7 are closed. The four raw report hashes and the frozen gate
receipt verified. Stage 1 is **accepted for the bounded #6 implementation**. This
is not a four-browser qualification pass and does not alter any raw verdict.

Accepted basis:

- Exact capacity/refusal, restart, same-extension content isolation,
  transactional deletion/epoch/store-instance barriers and controlled store-loss
  recovery were observed on Firefox 140.0, 153.5.1esr, 158.0.1 and Chrome
  156.0.8078.47.
- Firefox produced a real low-quota `QuotaExceededError` and recovered.
- Chrome's authentic action popup rejected private access with zero storage
  reads. Its allowed main-frame route was browser-blocked. This supports the
  private-access mechanism boundary, not a main-frame passing verdict.
- Natural pressure eviction, an actual Chrome `QuotaExceededError` and a verified
  empty Firefox origin after scoped clear remain explicit gaps. The Firefox
  scoped request returned `NS_OK`; its post-clear navigation timed out.
- Store loss/recreation is controlled evidence, not natural eviction. No
  persistence grant, storage permission, backup/sync policy or support expansion
  is approved.

The supervisor authorized Stage 2: implement explicit save, list, read-only
reopen and single-record delete end to end, then return a clean committed report
for independent review. Push and PR creation remain prohibited. The final
repository gate and shipping approval remain pending. The prior reviewed
boundary is `a5d2b8accc7fa2e0fc6ac551ed7d172868976c64`.

## Remaining gaps

1. **Eviction unobserved.** Firefox and Chrome `persisted()` were `false`;
   natural pressure eviction was not induced. The 30/90-day rules are
   product-use expiry/max-retention rules, not a minimum physical-survival
   guarantee. No new permission is requested for a durability guarantee.
2. **Chrome low quota remains unenforced** despite an active CDP override;
   Firefox has a real `QuotaExceededError`. Controlled store loss/recreation is
   covered separately.
3. **Firefox scoped clear completion unverified.** The principal and callback
   were valid (`NS_OK`, `cleared:true`) but the post-clear page read timed out;
   forced clearing remains unavailable.
4. **Chrome authentic incognito main-frame route remains blocked.** The popup
   guard passes; the product library page route would need its own reachable
   route test and stop condition.
5. **Uninstall** is observed only for temporary/unpacked test installs.
6. **Scope** is one OS/architecture and local browsers only.

The ordinary IndexedDB mechanism, exact bounds, atomic refusal, content-script
isolation, restart sentinel, fail-closed epoch, controlled store-loss handling
and reachable popup private guard passed where observable. Stage 2 product
implementation is recorded separately; natural eviction, Chrome engine quota,
product browser restart and a reachable Chrome private main-frame library route
remain unqualified. Product wiring for the bounded #6 scope no longer waits on
the accepted mechanism, but release qualification still does.

## Retained raw reports

| Target                           | Report                                                                            | SHA-256                                                            |
| -------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Firefox 140.0                    | `.scratch/saved-storage-firefox-140-0-20261030T114409Z-VYspET/report.json`        | `1d7b12e8a2925b388c182b1e5329b00c1e8978075147f7995e154a092e0ae175` |
| Firefox 153.5.1esr               | `.scratch/saved-storage-firefox-153-5-1esr-20261030T114600Z-YnRFg5/report.json`   | `b79adcd93268f86e32344f4bcc4b08bbb3afbc19d21ffa8a2f497711f90447da` |
| Firefox 158.0.1                  | `.scratch/saved-storage-firefox-158-0-1-20261030T114211Z-L4XPoB/report.json`      | `82bcf8f3d93d62f8b33a16904df4555b9aaf7bf3d50219efeb78680b145cdc24` |
| Chrome for Testing 156.0.8078.47 | `.scratch/saved-storage-chrome-156-0-8078-47-20261030T114747Z-bOrDph/report.json` | `328b4303232a781848443ae24b1affd9fcc9042ac2858d9233b650dc4e0cee10` |

Each report has a `report.sha256` sidecar. The reports retain source commit
`e9fa95848d876a339bfc48168c45af91d37daaab`, `dirty:false`, candidate/fixture/
popup hashes, exact browser/driver versions, stages, observations, negative
fixtures, incomplete reasons and cleanup. Earlier attempts remain under the
same ignored directory and were not deleted or relabelled.

## Gate

The shared check runs through the receipt runner before signed local commits.
The candidate commit's pre-commit hook ran the full native gate. The final
frozen receipt for the documentation head is recorded outside the repository.
The Stage 2 product change adds no permission, dependency or native integration.
Its final local gate and product browser reports are recorded in the
[product evidence](2026-10-30-saved-investigations.md). No push, pull request,
permission change or release approval is included.
