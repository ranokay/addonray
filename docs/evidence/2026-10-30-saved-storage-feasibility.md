# Saved-investigation storage feasibility

Status: Stage 1 candidate evidence, revised after review F1 through F6. The
product runtime, schema, storage adapter and UI are not implemented. Product
wiring remains stopped.

The candidate commit named by the final browser reports is signed
`1a3af32f838534d07a5b2d42896d3d8959ac929c`, based on integration
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
| `scripts/saved-storage-checks.mjs`   | SHA-256 `d234a95b928ada1abdc83977060b263c5dd75952533416bf457a28afbc89e488`          |
| `scripts/saved-storage-candidate/**` | combined SHA-256 `3e8701c26e11348f47be0d81faa4af3aaff8a0fc5ce8d576a50d42d85108a283` |
| `scripts/saved-content-fixture/**`   | combined SHA-256 `6c9c59e5fa6d08a66d4a48f6a249ca8bdb9fbcc7f9d7deaf53a0e8b62869e41c` |

The storage candidate declares no `permissions`, `optional_permissions`,
`host_permissions` or content scripts. The content-boundary fixture is a
separately identified test-only extension with one declared loopback
`content_scripts` match and host permission. It is not the product and is not
the zero-permission candidate. The fixture extension page owns the
extension-origin archive sentinel; its content script attempts the same-named
database from the loopback page origin. Candidate-only hooks provide readiness
delays, a pending-save gate, synchronous aborts, metadata corruption and the
deletion-epoch comparison. They do not enter the product or source archives.

Browser restart uses a retained copy of the session-1 Firefox profile or the
same Chrome user-data directory. Firefox temporary extensions are reinstalled
with a fixed `extensions.webextensions.uuids` mapping so the extension origin is
unchanged. This is a test harness, not an installed product.

## Gate outcome

- Firefox 140.0, 153.5.1esr and 158.0.1: every essential check passed; the
  command exits `0`. The non-essential `persistence-grant` and
  `forced-clear` checks are `unavailable` and remain gaps.
- Chrome for Testing 156.0.8078.47: every mechanism check except the authentic
  incognito route passed; `private-context` is essential, browser-blocked and
  marked `unavailable`. `report.incomplete` is `["private-context"]` and the
  command exits `2`. This is an incomplete gate, not a pass.
- Overall: the ordinary IndexedDB mechanism and the reviewed boundary/race/
  isolation checks passed. The gate remains incomplete pending supervisor
  disposition of the gaps below.

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
| Quota estimate / bounded observation             | P (n/e)  | P (n/e)       | P (n/e)    | P (n/e)              |
| Forced browser-origin clear                      | U (n/e)  | U (n/e)       | U (n/e)    | P (n/e)              |
| Content-script boundary                          | P        | P             | P          | P                    |
| Cross-view deletion epoch                        | P        | P             | P          | P                    |
| Missing/corrupt/exhausted epoch fail-closed      | P        | P             | P          | P                    |
| First-save readiness race                        | P        | P             | P          | P                    |
| Delete / expiry / unsupported                    | P        | P             | P          | P                    |
| Authentic private/incognito                      | P        | P             | P          | U                    |
| Restart persistence                              | P        | P             | P          | P                    |
| Uninstall/reinstall observation                  | P (n/e)  | P (n/e)       | P (n/e)    | P (n/e)              |
| Negative fixtures / failure retention            | P        | P             | P          | P                    |

## Review corrections

### F1 — exact boundaries and atomic refusal

Serialized accounting is canonical sorted-key JSON encoded as UTF-8. The
candidate built and stored a 50-record set whose complete records sum to exactly
`5,242,880` bytes, and a separate record of exactly `1,048,576` bytes. Both were
read back; every record's byte count and SHA-256 matched the independently
expected build. The set included 18 records with non-ASCII `é中` payloads
(`cap-0`, `cap-3`, …, `cap-large`). The measured 1 MiB record SHA-256 is
`b0d7a1baca76ca0b30d0f6e88dea90c8a31b40c3e0cc35e4156d973d12ef2217`.

Atomic candidate-level refusal was exercised in separate transactions:
a 51st record was refused with `records` while all 50 records and 5,242,880
bytes remained; a 49-record set totalling 5,242,780 bytes refused a 101-byte
record with `total-bytes`; an empty store refused a 1,048,577-byte record with
`per-record`. Refusals wrote no record, truncated nothing and evicted no
unexpired record. Raw storage-headroom writes are a separate non-essential
check and are not labelled as the product boundary.

### F2 — positive evidence and negative fixtures

The content check now requires a successful page-origin read (`pageReady`,
`error: null`, `page` sentinel present), a matching content-script runtime ID,
and extension-origin sentinels still readable after the content-script attempt.
The content script read only `page`; the fixture and candidate extension pages
still read `fixture-extension` and `extension-candidate` respectively.

Restart checks assert the exact `restart-sentinel` ID and `restart` payload on
both engines. Delete/expiry checks assert expired removal, malformed visibility,
unsupported visibility and explicit deletion on both engines. Uninstall checks
seed `uninstall-seed`, assert it exists before uninstall, and assert it is
absent after a successful reinstall. Nine negative fixtures plus one private
shape fixture demonstrate that empty reads, leaked sentinels, missing/wrong
restart sentinels, surviving uninstall seeds, expired availability and failed
unsupported deletion are rejected. A synthetic assertion failure proves `run()`
retains observations and a failure snapshot.

### F3 — deletion epoch fail-closed

A new database creates `deletionEpoch: 0` only during its upgrade. Existing
metadata is never repaired or normalized. Missing metadata returns
`missing-deletion-epoch`; corrupt, negative, fractional, string and unsafe
values return `invalid-deletion-epoch`; `Number.MAX_SAFE_INTEGER` returns
`barrier-exhausted` for both save and delete. Those transactions abort without
writing a record or deleting one, and the raw exhausted epoch is retained.
Pending-save metadata loss, corruption, unsafe values and exhaustion were
exercised; idempotent deletes advanced the epoch, invalidated a pending save,
and the pending record was not written. `record-a` remained the only record at
the final invalid-state check.

### F4 — ordinary prompt checkpoints

The Firefox ordinary check now opens a fresh database with `guardOnly=1` and
inspects both the notification box and the actual `PopupNotifications` route
before open/upgrade, after open/upgrade, after a small write, after a 1 MiB
write, and after readback. Each route reports inspection availability; a route
failure makes the check `unavailable` (and therefore an incomplete gate), not
prompt-free. A popup-only fixture proves a `persistent-storage` popup is
detected even when the notification box is empty. The optional `persist()`
probe still produces the separate `persistent-storage` prompt; ordinary DB
open/write/read checkpoints produced no prompt, so that optional probe is not
treated as an ordinary-use failure.

### F5 — Chrome private gate accounting

The reachable private branch now unwraps the context and guard results once and
asserts the actual `incognito`, `blocked`, `reason` and `storageAccessed` values;
a negative fixture rejects the old double-unwrapped shape. The authentic Chrome
incognito extension page remains blocked by Chromium with
`ERR_BLOCKED_BY_CLIENT`; the route is recorded unavailable. Essential checks are
declared before execution, so an early failure cannot omit later accounting.
`report.incomplete` now includes essential `unavailable` and `not-run` checks;
exit `2` distinguishes an incomplete gate from exit `1` assertion failure. The
Chrome command exits `2` with `private-context` incomplete.

### F6 — observation retention and quota errors

The quota attempt records `stage`, filled bytes, record count and any observed
error without overwriting it with `null`. Real quota exhaustion was not induced
because the estimate is about 10 GiB, above the fixed 64 MiB pressure cap; the
estimate and the simulated transaction abort are separate outcomes. `run()`
passes an observations object to every check and stores it on assertion failure,
together with a page-state failure snapshot. A synthetic failure retains its
counter and stage, proving the failure path. No unbounded disk-pressure
experiment was run.

## Gaps and disposition

1. **Eviction is unobserved.** Firefox `persisted()` was `false`; Chrome
   `persisted()` was `false`. Natural pressure eviction was not induced. The
   30-day retention rule remains a product-level refusal/cleanup rule, not
   proof that best-effort storage survives pressure. No `storage` or
   `unlimitedStorage` permission was requested or approved.
2. **Real quota exhaustion is unobserved.** The estimate is about 10 GiB on both
   engines, above the fixed pressure cap. Only the estimate and a controlled
   transaction abort exist.
3. **Firefox forced browser-origin clearing is unavailable** through the exposed
   quota-manager methods (`clearStoragesForOrigin` absent; `qms.clear()` returned
   `NS_ERROR_UNEXPECTED`).
4. **Chrome authentic incognito is browser-blocked.** The extension page route
   is unavailable; no reachable product popup/library entrypoint guard was
   observed. Stage 2 must test those reachable entrypoints and stop if the
   guard cannot be observed.
5. **Uninstall behavior** is observed for temporary/unpacked test installs, not
   retail installation, signed distribution or every OS.
6. **Scope.** One OS/architecture, local browsers only. No Linux, Windows,
   store, privacy-policy or native-platform qualification follows.

The required ordinary IndexedDB mechanism, exact bounds, transactional deletion
barrier, content-script isolation, restart sentinel and private/unknown guard
logic passed on the tested targets. The gate remains incomplete because the
Chrome authentic incognito route is unobservable and the eviction/quota gaps are
not resolved. Product wiring is stopped.

## Retained raw reports

All paths are under ignored `.scratch/`:

| Target                           | Report                                                                            | SHA-256                                                            |
| -------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Firefox 140.0                    | `.scratch/saved-storage-firefox-140-0-20261030T104853Z-5wRozl/report.json`        | `34ec2f0a0382eceeba59aa98217072b13034890b8f86c865d935688309c4c9a2` |
| Firefox 153.5.1esr               | `.scratch/saved-storage-firefox-153-5-1esr-20261030T104915Z-tFV1io/report.json`   | `a9d5b3885ae6ccedf025bad09e40b84e233be0d4fce5f3d69c048b3dee74ae9b` |
| Firefox 158.0.1                  | `.scratch/saved-storage-firefox-158-0-1-20261030T104831Z-9YH6Df/report.json`      | `f8108c4a33c0973a0bc3ae520f98e1bd80330b10a96a346dce5cfba8f97819cc` |
| Chrome for Testing 156.0.8078.47 | `.scratch/saved-storage-chrome-156-0-8078-47-20261030T104942Z-lqdvhi/report.json` | `49864ad8f7cfe11a931d5d37561bff9a348f0b0c88a42c6c63c563d032aa4887` |

Each report has a `report.sha256` sidecar. The reports retain source commit
`1a3af32f838534d07a5b2d42896d3d8959ac929c`, `dirty: false`, candidate and fixture
hashes, exact browser/driver versions, stages, observations, negative fixtures,
incomplete reasons and cleanup. Raw evidence is not committed.

Earlier v1 and v2 attempts remain under the same ignored directory and were not
deleted or relabelled. The v2 development report with the canonical-hash
mismatch, the report with the synthetic failure printed, and the Chrome report
before the final private/unwrap assertions are retained separately from the
selected reports above.

## Gate

The shared check runs through the receipt runner before signed local commits.
The candidate commit's pre-commit hook ran the full native gate. The final frozen
receipt for the documentation head is recorded outside the repository. No push,
pull request, permission change, product UI or runtime is included.
