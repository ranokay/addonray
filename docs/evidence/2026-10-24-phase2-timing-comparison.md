# Optional timing comparison evidence

Recorded on 2026-10-24 in Europe/Bucharest. Local receipt timestamps use UTC and begin with 20261023. Scope is the approved [timing comparison](../plans/phase2-timing-comparison.md), P2B-01 through P2B-16. The user approved implementation, tests, independent review, and signed private delivery after the [requirements interview](../decisions.md#timing-comparison-interview).

## Delivered behavior and source

Signed implementation `efa6bcbd19826b4920d5ce93ec2e02511793b5df` adds optional timing attachments to the existing independent investigation tabs. Signed `3e83d2ae06ff0d2858b06617a7e3e62889ed164c` corrects test readiness and extends native Chrome qualification. Both are pushed to private `ranokay/addonray` on `main`.

The popup deliberately captures a page, lists synthetic investigation labels, and requires the user to choose both destination and side before confirmation. The receiver owns its canonical copy. Before timing precedes starting the After inventory, each timing slot stays fixed, and After requires the same numeric source-tab ID. The comparison displays signed After-minus-Before milliseconds only for measured pairs. Inventory-only comparisons and the user's independent page assessment remain available.

Either optional-permission revocation resets the whole investigation. Start over, close, reload, or unloading discards it. Popup Clear and closure leave an accepted attachment with its investigation. Normal-window classification is required at both ends. No URL/title, new permission, host grant, background process, storage, automatic reload, extension-state mutation, or attribution verdict was added.

## Package identities and rebuilds

| Artifact                      | macOS arm64 and hosted Linux x64 SHA-256                           | Hosted Windows x64 SHA-256                                         |
| ----------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Firefox unsigned XPI          | `4eee64ac3941f6475a30d2d0cd46dd6c260a5798f4fb3cccb7abce16721f5c72` | `fbe1c382825d014a8d4e654a90063a59453a255aaab5c94cb72e1fb7f9c16846` |
| Chrome ZIP                    | `725a2ad55f424860dc87210e58ee0a0b308d891cd90eee1e9a1de4afcda32a55` | `eb4d30e3e606d6f358b5500e3c89dc63f7cadc88eec84cfd659fe33dffa31d52` |
| Each browser-named source ZIP | `94f341236ada08403c5be8f9b6f2c79d3228ae533a734c420cd3d2ce53445628` | `a721cdcc0df8396e4154348eb59c435b1b7321efd0642f043b9462f9b1560c8b` |

Each source archive contains 26 reviewed build inputs. Clean source rebuilds reproduce all eight packaged outputs for their own target and OS. Windows archive identities differ; these results do not establish identical archive bytes across operating systems. Native helpers, generated fixture modules, and browser test authority stay outside product/source archives. Dependency resolutions, Bun revision, and manifest permissions are unchanged. Test-only `3e83d2a` reproduces the product/source archive identities of `efa6bcb` on each observed OS.

## Tests, reviews, and corrected failures

The clean shared gate at `3e83d2a` passes native Bun formatting, linting and type checking, all 165 behavior tests with 525 assertions, both packages/manifests/source allowlists, and strict jactionlint. Tests cover sequence and fixed-slot rules, same-tab matching, missing states and signed differences, current permissions, stale generations, one-use captures, source replacement/clear/close races, independent copies, and normal/private/unknown classification failures.

Independent production, integration-probe, and final test-helper reviews completed without an unresolved material finding. These were static reviews, separate from the execution evidence below. Findings and corrections were:

- Firefox discovery originally copied a foreign array through its own `map` method. The popup now constructs its own array. A foreign-realm regression verifies ownership and use after endpoint teardown.
- The Firefox scripting-revocation callback was initially unused. It is now wired to actual optional-permission removal, starting with an attached Before timing, both inventories, and a pending After selection.
- A row-wide placeholder assertion could miss a retained Before timing. The probe now checks both timing cells and the missing difference independently, plus absence of both inventories.
- The first hosted Linux Chrome run at `efa6bcb` queried a newly created popup before its body existed. Reads now return an explicit pending result until the document is ready. Revocation waits cannot count that pending state as successful clearing.
- Extending the native Chrome helper exposed its assumption that only two investigation tabs existed. Checks now identify the helper's own two investigations and preserve other loaded views.

The original [Linux Chrome failure](https://github.com/ranokay/addonray/actions/runs/40039259485) remains failed evidence. Its Windows job passed. The corrected run below passed both jobs. Earlier Firefox native-popup automation attempts could obtain the toolbar grant but did not reliably operate the actual React popup through the driver's available contexts. They produced no native UI verdict. The declared source fixture and separate native observation address different parts of that gap.

The earlier Bun startup stall did not reproduce in eight bounded trials or subsequent gates. Its cause remains unknown. No toolchain replacement was made.

## Clean local and hosted qualification

All local rows identify clean `3e83d2a`, matching artifact identities above, and successful browser/server cleanup. Firefox uses geckodriver 0.37.1. Chrome for Testing and ChromeDriver both report 156.0.8078.47.

| Browser                            | macOS arm64      | Ubuntu 24.04 x64 | Windows Server 2025 x64 |
| ---------------------------------- | ---------------- | ---------------- | ----------------------- |
| Firefox 140.0                      | 40 checks passed | 40 checks passed | 40 checks passed        |
| Firefox 153.5.1esr, actual 153.5.1 | 40 checks passed | 40 checks passed | 40 checks passed        |
| Firefox 158.0.1                    | 40 checks passed | 40 checks passed | 40 checks passed        |
| Chrome for Testing 156.0.8078.47   | 34 checks passed | 34 checks passed | 34 checks passed        |

At this exact source, the [shared gate](https://github.com/ranokay/addonray/actions/runs/40040168429), [six-job Firefox workflow](https://github.com/ranokay/addonray/actions/runs/40040168400), and [two-job Chrome workflow](https://github.com/ranokay/addonray/actions/runs/40040168410) passed. All 16 downloaded browser/rebuild reports were checked for exact clean source, versions, driver versions, successful checks, per-OS package/rebuild identities, collector samples/budgets, explicit authority/gaps, and cleanup. Raw reports are under ignored `.scratch/timing-comparison-ci-3e83d2a/`; their validation summary is `timing-comparison-ci-3e83d2a-validation.txt`.

Seven private frozen receipts bind the local sequence to `3e83d2a`: `20261023T234015Z-dbbc2259d41f.json` for the shared gate; `20261023T234017Z-92b1b8ff5185.json` and `20261023T234019Z-565367c70382.json` for source rebuilds; `20261023T234021Z-b206c99d13d9.json`, `20261023T234049Z-6a237a27e917.json`, and `20261023T234106Z-931dc1b5a25b.json` for Firefox; `20261023T234121Z-83fcb16d5da2.json` for Chrome. Each records child exit 0 and `frozen_gate: true`. Earlier dirty runs establish iteration results only.

## Integration authority and private-context limits

Normal integration checks exercise two distinct destinations, empty selections, selected-only delivery, fixed copies after actual popup closure, wrong-source rejection, source reload and renewed toolbar access, occupied slots, starting After invalidating Before eligibility, and stale reset/reload/closed views. No host grant is used for the source popup.

Firefox uses a named source-popup fixture with a different extension ID. Pinned `Bun.Transpiler` compiles the production inspector, session, handoff, and browser-target modules; input/output hashes are recorded. Packaged investigation assets are unchanged. A separate fixture action obtains optional approval, then the source session substitutes a permission-presence check for its request. This exercises production core integration and actual toolbar access, but does not qualify the React popup or native consent. The native Firefox observation below uses the unmodified XPI.

Firefox's private fixture uses test-only internal private-browsing permission and reload authority. It verifies an actual private HTTP source and source-popup exclusion. A fresh unchanged investigation reports a private tab, stays empty, and rejects a non-popup caller. That last check does not independently exercise the receiver-private guard with an otherwise valid normal popup sender. Deterministic tests cover that guard and unknown/throwing classifications. An authentic unclassifiable browser context was not manufactured.

Chrome's headless integration uses the explicitly named pre-granted UI copy with unchanged production assets. Its required-permission fixture cannot qualify optional management consent or optional scripting revocation. Headless private-context attempts timed out or disconnected before a usable observation and add no passing check. Actual unmodified macOS incognito-source exclusion and optional revocation were observed separately below. No split-incognito manifest change was made. Private receiver behavior with an otherwise valid sender remains deterministic coverage rather than a browser-observed guard verdict.

## Actual native macOS observations

Both sessions used clean `3e83d2a`, the package identities above, disposable profiles, and only AddonRay plus the controlled popup fixture. Computer-use observations operated the actual browser UI and packaged product. Native Linux/Windows usability is not established by hosted headless jobs.

Firefox 158.0.1 displayed the real optional-management prompt and captured two controlled extensions after Allow. The actual toolbar popup captured and explicitly selected Investigation 52d19cff and Before, then confirmed success. The accepted copy survived popup closure. Through Firefox settings, the controlled fixture alone was manually disabled. After a manual reload of the same source tab, the investigation's After inventory reported that change. A fresh popup captured and attached After through explicit keyboard selection and confirmation.

| Firefox milestone       | Before | After | Displayed difference |
| ----------------------- | ------ | ----- | -------------------- |
| DOM content loaded      | 207 ms | 27 ms | −180 ms              |
| Load event completed    | 228 ms | 31 ms | −197 ms              |
| First content displayed | 232 ms | 32 ms | −200 ms              |

Keyboard navigation reached the selectors, confirmation, timing explanation, and an explicit Uncertain assessment. The product made no causal claim about the fixture change. Start over removed inventories, all timing cells, and the assessment. Capturing again and reloading produced a new empty investigation identity. In an actual private window, local page capture worked, while keyboard activation of Attach timing reported that attachments require verified normal windows and exposed no destination selection.

Chrome for Testing 156.0.8078.47 displayed its real optional-management prompt and captured two controlled extensions after Allow. Its actual popup required explicit destination and side choices. Accepted Before survived popup Clear and closure. A manual reload of the same source tab, an unchanged After inventory, and a fresh popup attachment produced:

| Chrome milestone        | Before  | After   | Displayed difference |
| ----------------------- | ------- | ------- | -------------------- |
| DOM content loaded      | 28.9 ms | 39.1 ms | +10.2 ms             |
| Load event completed    | 29.6 ms | 39.3 ms | +9.7 ms              |
| First content displayed | 80 ms   | 64 ms   | −16 ms               |

No inventory change was reported and no assessment was selected automatically. Keyboard operation opened the explanation and selected Uncertain. Start over and a populated-view reload discarded data and changed the document identity. The actual incognito popup captured the controlled page but refused attachment with the normal-window explanation. Enabling incognito in this disposable unpacked-build profile reloaded and disabled the local build until Keep and developer mode restored it; no product manifest was changed.

After the manual Chrome observations, the native helper passed all 15 API checks on the unmodified product with retained native optional grants. It exercised the actual toolbar handoff and real optional scripting removal while Before timing, both inventories, and pending After selection existed. It then refilled the original popup and comparison before independently removing management access and verifying those inventories/assessment cleared. Its `privateWindow: pending` field reflects an omitted automatic private callback, not a private-window pass; the native UI observation above supplies the separate source-exclusion evidence.

Firefox's native helper records `setup-and-cleanup-only`; Chrome's records `passed-with-qualification-gaps`. Neither helper substitutes for the UI observations. Both exited successfully without cleanup failure. Raw reports are `.scratch/firefox-native-158.0.1.json` and `.scratch/chrome-native-api-evidence.json`. Actual screenshots use `.scratch/timing-comparison-firefox-native-*.png` and `.scratch/timing-comparison-chrome-native-*.png`, including private exclusion, accepted attachments, tables, and assessment. They remain local test data.

## Collector budget and remaining gates

The collector is unchanged from the [popup timing slice](2026-10-23-phase2-timing.md#size-and-overhead-method). Its source hash remains `0a1e6c1bc04c2c70f58cf8609e0f8d170a03b87ea8412ee20f1a74c4097f302c`. Each controlled loaded/heavy fixture records the first attempt, first completed snapshot, 30 synchronous samples, separate injection/driver samples, clock calibration, and a p95-plus-two-observed-steps guard. The heavy fixture verifies 200 served resource requests. Every report preserves raw minimized output checks.

Across the 12 local/hosted browser rows, the largest collector p95 was 1 ms, the largest empirical guard was 3 ms, and the largest timing block was 208 bytes. Each passed the 5 ms and 1 KiB limits. Clock steps, p95, and the guard are empirical observations, not universal error or latency guarantees. These fixtures do not measure extension impact or end-to-end human workflow speed.

Remaining release/qualification gates are native Linux/Windows usability, native minimum/ESR timing flows, screen-reader and broader accessibility review, retail Chrome installation, signed distribution/store submission, and browser-observed private-receiver/unknown-context guards beyond the exclusions described above. Source-tab identity does not verify the page, document, cache, or synchronized capture conditions. These limits do not justify new permissions or broader claims.

This completes the approved optional timing-comparison slice. Page errors, live interaction diagnostics, history/export, other browser/manifests, and the Rust companion require separate product decisions. No tracker issues/labels, licensing, public visibility, or store publication changed.
