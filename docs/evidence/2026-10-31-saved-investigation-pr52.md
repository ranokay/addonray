# Saved-investigation PR delivery verification

This 2026-10-31 record covers corrections and requalification for private
[PR #52](https://github.com/ranokay/addonray/pull/52), scoped to #6. The supervisor
approved `c28c9596499cdb4b27f7609c65c93249580031ba` with F1 through F13 closed.
That approval is the historical implementation checkpoint, not approval of later
corrections or proof of hosted review. At the time of this record, final-head
review and merge disposition remain pending verification. The PR conversation
is the source for subsequent delivery-head receipts, hosted review and merge
status.

## Corrections

- `e430ba7` shares the deferred final-context fixture across the five existing
  library regressions, and shares the deletion-epoch probe between Firefox and
  Chrome. The exact held context entry and all lifecycle/operation assertions
  remain. The shared probe keeps the stronger assertions from both callers.
  Two callback-owned promises are explicitly marked `void`.
- `78f98ca` adds an explicit storage-readiness retry after startup or connection
  failure. Retry rechecks normal context, coalesces pending checks, preserves
  the live pair and never saves automatically. A later Save captures its own
  synchronous store barrier. Disposal prevents a delayed context check from
  reopening storage. The Save section has a separate retry action, and the
  review text now says nothing is saved unless Save investigation is chosen.
- The same correction uses Chrome's returned extension ID for private/restart
  probes and verifies that the origin stays fixed across restarts. The failed
  Ubuntu job had selected `/usr/bin/google-chrome`, despite requesting the
  pinned testing version. The launcher now forces the managed testing build
  and records/asserts its versioned binary path. Selenium documents this
  [browser-selection option](https://www.selenium.dev/documentation/selenium_manager/).
  This changes test selection, not product permissions or distribution support.
- `89248bb` keeps the simulated readiness probe state on the page's `window`.
  The first Firefox attempt at `78f98ca` failed because Selenium's transient
  `globalThis` did not retain that test state. Its failed report remains at
  `.scratch/pr52-failed-probe-78f98ca-firefox-158.0.1.json`, SHA-256
  `cbae55ab658a51b08728a00648c44e165e5caf33020af17802c5c7bb1364ff96`.
- `dd995c923e32a18d935f08e4a0104f093f12a921` makes the cached readiness promise
  presence test explicit as `checking !== null`. This is the only production
  source difference after the product matrix at `89248bb`.

The stale product-restart gap was removed from the data plan and Stage 1 record.
Their other qualification limits remain.

## Deterministic verification and negative controls

The shared check and commit hooks pass **523 tests / 2,022,369 assertions in
36 files**, plus native type checking of 83 files, both package checks and
workflow lint. The final frozen receipt is attached to the PR after the final
documentation commit; commit-hook output is not substituted for that receipt.

The consolidated library suite still has 23 tests and 73 assertions. Isolated
scratch copies removing the final post-await guard, action ownership check, and
delete-catch guard fail 4, 2 and 1 tests respectively. No tracked source was
restored or amended for these controls. The receipt is
`.scratch/sonar-f10-negative-u_zc0t5o/receipt.json`:

| Control          | Log SHA-256                                                        |
| ---------------- | ------------------------------------------------------------------ |
| Post-await guard | `7b43154183de1dc3d400797f0f8ee12b4e749f41a24953e79dc150feac1b1b18` |
| Action ownership | `fdb31a01039a8c182fa6589bc80a1886732d9a95649bcfccfbb757e13bea9c3a` |
| Delete catch     | `bdb445cd4f502473e49d58c51acd7282702635026c9cab898c16cca208bcb82c` |

The four readiness regressions fail against the prior one-shot implementation.
The retained log is `.scratch/pr52-readiness-negative-wbk3u1cu/test.log`, SHA-256
`a5215aafef19946abf13c090857d58b9b5d231a0d80df18b3c31bfce05eaaa5e`.

## Product browser runs

All four product runs below use clean source
`89248bb296fd4b45916a74f02686315943d6becf` on macOS arm64 and have frozen source
receipts. Firefox passes **89 checks per pin**, Chrome for Testing **83**.
The additional check simulates a lost IndexedDB connection, uses the actual UI
retry, observes zero write transactions before a new Save, and preserves the
live pair without reload. It is simulated failure evidence, not a native engine
failure observation. All earlier quota and lifecycle authority distinctions
remain.

| Run                | Checks / outcome | Report                                                                 | SHA-256                                                            |
| ------------------ | ---------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| firefox-158.0.1    | 89               | `.scratch/pr52-qualification-89248bb/firefox-evidence-158.0.1.json`    | `e02a119ea6069bf4d16caf4717cb1867080d32df0de8052228ea950c19325fda` |
| chrome             | 83               | `.scratch/pr52-qualification-89248bb/chrome-evidence.json`             | `d12db70f91b9e95c29bd93c1f3d31862ef10c9f4e5345cc91d576791b4107c84` |
| firefox-140.0      | 89               | `.scratch/pr52-qualification-89248bb/firefox-evidence-140.0.json`      | `eb60e41bc43f19550b92481af21e18b279836c9330a6e5ca81c14a04d1c790ed` |
| firefox-153.5.1esr | 89               | `.scratch/pr52-qualification-89248bb/firefox-evidence-153.5.1esr.json` | `bc5c3b9e967910e965de703d5a130bb59347c1fca83e698c3bd254ecc8658e8b` |

Chrome's recorded binary is
`/Users/ranokay/.cache/selenium/chrome/mac-arm64/156.0.8078.47/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`.
Each report retains its distribution, fixture authority, source state and gaps.

## Product restart and source rebuilds

These runs use clean
`dd995c923e32a18d935f08e4a0104f093f12a921`. Each restart probe passes five checks
for explicit Save, full process restart with retained profile/origin,
read-only reopen, unsaved live-state loss and deletion persistence. Firefox
uses disclosed disposable-profile installation/private authority. Chrome uses
the named pre-granted fixture with unchanged production assets and verifies
the ID returned by each new browser session. Native consent is not exercised.

| Run                        | Checks / outcome | Report                                                                      | SHA-256                                                            |
| -------------------------- | ---------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| restart-firefox-158.0.1    | 5                | `.scratch/pr52-qualification-dd995c9/saved-restart-firefox-158.0.1.json`    | `f159b8302ff7a9bd34ff94061a301c7ab9f8a2f51e1eb262d6ef791e85dee5da` |
| restart-firefox-140.0      | 5                | `.scratch/pr52-qualification-dd995c9/saved-restart-firefox-140.0.json`      | `e8c4d403eef113ba183309ade906168b108b2d36350fd264e86297a13aaa4b2f` |
| restart-firefox-153.5.1esr | 5                | `.scratch/pr52-qualification-dd995c9/saved-restart-firefox-153.5.1esr.json` | `eaf5a10e6a39c8e8b632a2b3173f4fecfa67a1bcf43f3bcf75c3a3c12b28ee49` |
| restart-chrome             | 5                | `.scratch/pr52-qualification-dd995c9/saved-restart-chrome.json`             | `8ce67e1595d011dc1607364bd37118ff679ed679bb3b72f67cc5d9c08ab3d264` |

Both source rebuilds compare every one of the 25 packaged extension files:

| Run             | Checks / outcome | Report                                                                  | SHA-256                                                            |
| --------------- | ---------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| rebuild-firefox | passed           | `.scratch/pr52-qualification-dd995c9/source-build-evidence.json`        | `b7f68c5488d6fa31baaad8a2afcb1819ee4e9b92a53c1b86c104739ca29c17b3` |
| rebuild-chrome  | passed           | `.scratch/pr52-qualification-dd995c9/source-build-evidence-chrome.json` | `b12d49e4f034af763691546c208fc391c35f9b6401005502eb1ce3eeebb496cd` |

## Refactored candidate probe

The candidate and production adapter are separate authorities. On clean
`dd995c9`, the shared deletion-epoch barrier, invalid/exhausted epoch refusal,
readiness gate, bounds and controlled store-loss cases pass on Firefox 158.0.1
and Chrome for Testing 156.0.8078.47. Neither report contains an essential
failure. Firefox exits 0 with disclosed nonessential gaps. Chrome exits 2,
**incomplete**, because its private-context case is unavailable; its actual
quota-error observation is also unavailable. The private popup case passes.
These are the previously accepted mechanism gaps, not a complete candidate
qualification pass and not a product-library private guard pass.

| Run                       | Checks / outcome | Report                                                                            | SHA-256                                                            |
| ------------------------- | ---------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| candidate-firefox-158.0.1 | exit 0           | `.scratch/saved-storage-firefox-158-0-1-20261031T094833Z-K4vow3/report.json`      | `4239aaa0184714b02a583d564bb67ee421c534cdb4af2393ed9fe24b7d3220e0` |
| candidate-chrome          | exit 2           | `.scratch/saved-storage-chrome-156-0-8078-47-20261031T095020Z-nw3EIj/report.json` | `7b20402f7503380c6e9a9d18a9440a442765083d5f088f245cc993ffddd19bfb` |

Per-command logs, elapsed times, source snapshots and gate receipt paths are in
`.scratch/pr52-qualification-89248bb/product-receipts.json` and
`.scratch/pr52-qualification-dd995c9/{restart,candidate,rebuild}-receipts.json`.

## Hosted review and Sonar dispositions

CodeRabbit's review at `c28c959` identified the readiness retry, Chrome ID,
stale restart qualification and contradictory history text. The corrections
above address those findings; completed review of the delivery head must still
be verified separately.

The first Sonar scan failed 4.6% new-code duplication, security B and reliability
D. Ten issues were reviewed as false positives with source-specific explanations
in Sonar: six fixed Git invocations in caller-controlled developer/CI probes,
and four deliberate UTF-16 string sorts used for exact key-set comparison or
canonical hashing/byte accounting. They do not consume untrusted executable or
command arguments and do not implement user-facing locale sorting. No gate,
threshold, rule or exclusion was changed. The saved disposition response is
`.scratch/sonar-pr52-c28c959-security-reliability-dispositions.json`.

The scan at `89248bb` clears duplication and security. Its remaining reliability
finding (`typescript:S6544`) flags the nullable cached-promise presence check;
`dd995c9` makes that check explicit. A later green badge alone is not substituted
for completed review or validation of the final head.

## Preserved limits

Chrome's authentic incognito popup refusal is observed separately from its
private main-frame library route, which remains `ERR_BLOCKED_BY_CLIENT`; the
library guard itself is unexercised there. Chrome UI uses the disclosed
pre-granted fixture, so native optional consent remains unqualified. Natural
eviction, actual Chrome engine quota failure, verified Firefox post-clear
emptiness, retail installs, other architectures and native desktop usability
remain outside these local results. The live hosted matrix is recorded on the
PR separately. Simulated lifecycle/quota/connection loss remains simulated.
No permission, background owner, dependency, retention policy, #7 through #11
scope, licensing, public visibility, release or publication change is included.

Sixteen earlier raw reports/logs were copied before replacement; the manifest
and hashes are `.scratch/pre-pr52-corrections-48h9nv08/manifest.json`. Earlier
Stage 1, product, restart and source evidence remains tied to its original
named revision and authority. The original worktree and parent checkout are
preserved; branch/worktree deletion requires separate explicit authorization.
