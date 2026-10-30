# Saved-investigation storage feasibility

Status: Stage 1 candidate evidence after review rounds F1 through F7. The
product runtime, schema, storage adapter and UI are not implemented. Product
wiring remains stopped.

The candidate commit named by the final browser reports is signed
`ddc31a88f9293884d984075b4562d4ce7f8de5e7`, based on integration
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
| `scripts/saved-storage-checks.mjs`   | SHA-256 `feedc251d5c0dede23bf947ce7ba05496d780be1a4bab1cf7ec219308777ad67`          |
| `scripts/saved-storage-candidate/**` | combined SHA-256 `f1186ac909a4e54741af1be677fa6db923ef42776936b5e9d3d3b8ea101cfd28` |
| `scripts/saved-content-fixture/**`   | combined SHA-256 `b5edcdc86ed08fbf3cd335230be1a981a71c4b16f97cc1a2dc93c1b256fa243f` |
| `scripts/saved-popup-candidate/**`   | combined SHA-256 `ab562e9ddeab9f110fb9405671e5ac28a6d2299a653bc88efc4261149faef8b2` |

The storage candidate declares no `permissions`, `optional_permissions`,
`host_permissions` or content scripts. The content-boundary fixture is a
separately identified test-only extension with one declared loopback
`content_scripts` match and host permission. The popup candidate is a separate
zero-permission action-popup extension with no host permissions. Candidate-only
hooks provide readiness delays, a pending-save gate, synchronous aborts,
metadata corruption and the deletion-epoch comparison. They do not enter the
product or source archives.

Browser restart uses a retained copy of the session-1 Firefox profile or the
same Chrome user-data directory. Firefox temporary extensions are reinstalled
with a fixed `extensions.webextensions.uuids` mapping so the extension origin is
unchanged. This is a test harness, not an installed product.

## Gate outcome

- Firefox 140.0, 153.5.1esr and 158.0.1: every essential check passed; each
  command exits `0`. Non-essential gaps: `persistence-grant` (optional
  `persist()` prompt) and `forced-clear` (scoped Firefox clear lost the driver
  session). These are not relabelled as passes.
- Chrome for Testing 156.0.8078.47: the reachable action-popup guard passed, but
  the authentic main-frame extension-page route remains browser-blocked.
  `private-context` is essential and `unavailable`; `report.incomplete` is
  `["private-context"]`; the command exits `2`. This is an incomplete gate.
- Overall: the ordinary IndexedDB mechanism, exact bounds, transactional
  deletion barrier, content-script isolation, restart sentinel and the
  Firefox/Rich Chrome popup private guards passed where observable. The gate
  remains incomplete pending supervisor disposition of the remaining gaps.

## Results matrix

Legend: **P** passed, **U** unavailable (not a pass), **n/e** non-essential.

| Check                                            | FF 140.0 | FF 153.5.1esr | FF 158.0.1 | Chrome 156.0.8078.47 |
| ------------------------------------------------ | -------- | ------------- | ---------- | -------------------- |
| Availability / round trip                        | P        | P             | P          | P                    |
| Ordinary operation prompt checkpoints            | P        | P             | P          | P                    |
| Raw storage headroom (separate)                  | P        | P             | P          | P                    |
| Exact 5,242,880-byte set / 1,048,576-byte record | P        | P             | P          | P                    |
| Atomic 51st / total-byte / per-record refusal    | P        | P             | P          | P                    |
| Separate `persist()` probe                       | U (n/e)  | U (n/e)       | U (n/e)    | P (n/e)              |
| Quota estimate observation                       | P (n/e)  | P (n/e)       | P (n/e)    | P (n/e)              |
| Test-only low-quota override                     | P        | P             | P          | P (no error)         |
| Forced browser-origin clear                      | U (n/e)  | U (n/e)       | U (n/e)    | P (n/e)              |
| Content-script boundary                          | P        | P             | P          | P                    |
| Cross-view deletion epoch                        | P        | P             | P          | P                    |
| Missing/corrupt/exhausted epoch fail-closed      | P        | P             | P          | P                    |
| First-save readiness race                        | P        | P             | P          | P                    |
| Delete / expiry / unsupported                    | P        | P             | P          | P                    |
| Authentic private/incognito main frame           | P        | P             | P          | U                    |
| Authentic incognito action popup                 | n/a      | n/a           | n/a        | P                    |
| Restart persistence                              | P        | P             | P          | P                    |
| Uninstall/reinstall observation                  | P (n/e)  | P (n/e)       | P (n/e)    | P (n/e)              |
| Negative fixtures / failure retention            | P        | P             | P          | P                    |

## Review corrections

### F2 — no reseeding and exact sentinels

The content fixture now supports a read-only query (`?readOnly=1`) that reads
the database without writing. After the content-script attempt, the runner reads
the candidate page's own extension origin without reloading it, then opens the
fixture page read-only. It verifies the exact `candidate-sentinel` /
`extension-candidate` payload, the exact `archive-sentinel` /
`fixture-extension` payload, the read-only flag, the page-origin `page` sentinel,
the matching content-script runtime ID, and both extension sentinels still
readable after the attempt. A wrong candidate payload is a negative fixture.
The content script still sees only `page`, never either extension sentinel.

### F4 — positive route presence

The Firefox prompt detector now requires the notification box and
`PopupNotifications` object to exist, requires both notification lists to be
real arrays, and records explicit route errors. `classifyStoragePrompt` returns
`missing-inspection-route` for absent routes and `inspection-unavailable` for
route errors; `{}` is no longer prompt-free. The ordinary check opens a fresh
`guardOnly` database and inspects both routes before open/upgrade, after
open/upgrade, after a small write, after a 1 MiB write and after readback. A
popup-only negative fixture detects a `persistent-storage` popup, and a
missing-route negative fixture returns unavailable. The optional `persist()`
prompt remains separate and does not fail ordinary DB use.

### F6 — shared observations and retained failures

Run callbacks populate the shared observations object before assertions for
availability, exact capacity, refusal, content boundary, epoch races, epoch
fail-closed, readiness, deletion/expiry, restart, uninstall and clearing. The
content check no longer shadows the run observations. Helpers record open/read
and save replies before asserting. `run()` stores the observations plus a page
state failure snapshot on assertion failure. A synthetic failure retains its
counter and stage; the content and epoch checks retain their actual probe and
transaction details on the same path. Quota observations retain the request
name/message and counters. The Firefox low-quota report now records a real
`QuotaExceededError`; the earlier generic transaction error remains in the
retained failed attempts.

### F7 — incognito popup and engine-specific probes

**Chrome action popup.** A separate zero-permission action-popup candidate was
loaded with `--load-extension` into a disposable profile. The runner used the
actual `chrome://extensions/?id=...` detail toggle to set **Allow in Incognito**
(test-only browser configuration) and verified the toggle; after restart
`chrome.extension.isAllowedIncognitoAccess()` returned `true`. It created an
authentic incognito window with `chrome.windows.create({incognito:true})`,
triggered the action popup with the existing CDP `Extensions.triggerAction`
authority on an incognito tab target, attached to the popup target, and
evaluated the candidate probe.

The popup reported: `allowed: true`; `tabs.getCurrent()` returned
`{status:"unknown", tabFound:false}`; `tabs.query({active:true,currentWindow:true})`
returned `{status:"success", incognito:true}`; the guard returned
`{status:"blocked", reason:"private-or-unknown-context", storageAccessed:false}`;
`chrome.extension.inIncognitoContext` was `false` in the popup. The guard uses
the explicit tab query only as a classification source and treats the undefined
`getCurrent()` result as unknown, never as normal. The page route
`chrome-extension://.../page.html` remained blocked with
`ERR_BLOCKED_BY_CLIENT` even with the allowance; that blocked route is retained
separately and is not counted as a pass.

**Firefox clearing.** Primary source: the pinned `nsIQuotaManagerService` IDL
exposes `clearStoragesForPrincipal(in nsIPrincipal, [optional] ACString
persistenceType)`, not `clearStoragesForOrigin`. The candidate closed its DB
handles, navigated the candidate tab to `about:blank`, then called
`Services.qms.clearStoragesForPrincipal(policy.principal)` from the chrome
context. The FirefoxDriver session was lost (`NoSuchSessionError`) before the
post-clear read; the method, authority, seed and closed-handle stages are
retained. Forced browser-origin clearing remains unavailable on Firefox. The
earlier guessed `clearStoragesForOrigin`/`qms.clear` failures remain retained.

**Firefox low quota.** `dom.quotaManager.temporaryStorage.fixedLimit` is a
documented test-only override in KiB (`StaticPrefList.yaml`, value `-1` by
default). A fresh disposable profile set it to `2048` with
`dom.quotaManager.testing=true`. The candidate wrote a 1 MiB random record, then
the next write failed with
`QuotaExceededError: The current transaction exceeded its quota limitations.`;
clearing and a 64 KiB recovery write succeeded. This is a real observed
`QuotaExceededError`, not a simulated abort.

**Chrome low quota.** `Storage.overrideQuotaForOrigin` was accepted and
`Storage.getUsageAndQuota` reported `overrideActive:true` with a 2,000,000-byte
quota, but five 1 MiB random writes still succeeded and no
`QuotaExceededError` was observed. The override is active but not enforced for
this extension origin in this build; the gap is recorded rather than claiming a
quota observation.

## Gaps and disposition

1. **Eviction is unobserved.** Firefox and Chrome `persisted()` were `false`;
   natural pressure eviction was not induced. The 30-day retention rule remains
   a product-level refusal/cleanup rule, not proof that best-effort storage
   survives pressure. No `storage` or `unlimitedStorage` permission was
   requested or approved.
2. **Chrome low quota is not enforced** despite an active CDP override.
   Firefox has a real `QuotaExceededError`; Chrome does not.
3. **Firefox forced browser-origin clearing remains unavailable.** The correct
   scoped principal method lost the driver session after handles were closed.
4. **Chrome authentic incognito main-frame route remains blocked.** The
   reachable action popup guard passed; the product library page would need its
   own reachable-route test and stop condition in Stage 2.
5. **Uninstall behavior** is observed for temporary/unpacked test installs, not
   retail installation, signed distribution or every OS.
6. **Scope.** One OS/architecture, local browsers only. No Linux, Windows,
   store, privacy-policy or native-platform qualification follows.

The ordinary IndexedDB mechanism, exact bounds, atomic refusal, content-script
isolation, restart sentinel, fail-closed epoch and private/unknown guard logic
passed where observable. Product wiring is stopped; the remaining gate frontier
is the best-effort eviction risk, Chrome enforcement/clearing limits, and the
Chrome main-frame incognito route.

## Retained raw reports

All paths are under ignored `.scratch/`:

| Target                           | Report                                                                            | SHA-256                                                            |
| -------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Firefox 140.0                    | `.scratch/saved-storage-firefox-140-0-20261030T111831Z-gLuDiW/report.json`        | `a6391c2af86b51a73f314acfb445484d7e9d7c842fe6780f764af510c6671d9e` |
| Firefox 153.5.1esr               | `.scratch/saved-storage-firefox-153-5-1esr-20261030T111855Z-oX8Ute/report.json`   | `7eee0fb5dec646e11086192d7bfbefbfd1af75c15f717173db2358cc0e27c160` |
| Firefox 158.0.1                  | `.scratch/saved-storage-firefox-158-0-1-20261030T111807Z-4r9lH7/report.json`      | `b46e4a3a5aff59575226b05fc544504adfa6b7c01fa68664cd9a23cfaeadfe68` |
| Chrome for Testing 156.0.8078.47 | `.scratch/saved-storage-chrome-156-0-8078-47-20261030T111919Z-JktVNo/report.json` | `56e566a695a5b4707b2fd7f6c2417f699dd5c1dc4c5be72e9675e0245dc3eea7` |

Each report has a `report.sha256` sidecar. The reports retain source commit
`ddc31a88f9293884d984075b4562d4ce7f8de5e7`, `dirty: false`, candidate/fixture/
popup hashes, exact browser/driver versions, stages, observations, negative
fixtures, incomplete reasons and cleanup. Raw evidence is not committed.

Earlier v1, v2 and v3 attempts remain under the same ignored directory and were
not deleted or relabelled. They include the canonical-hash mismatch, the
synthetic-noise report, the double-unwrapped private branch, the missing
inspection-route reports, the failed Firefox clearing attempts and the
Chrome-only reports that predate the popup allowance.

## Gate

The shared check runs through the receipt runner before signed local commits.
The candidate commit's pre-commit hook ran the full native gate. The final frozen
receipt for the documentation head is recorded outside the repository. No push,
pull request, permission change, product UI or runtime is included.
