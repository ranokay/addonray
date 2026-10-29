# Private-window fixture startup readiness

Recorded on 2026-10-29. This record covers issue #32, "Stabilize private-window
fixture startup". The implementation is signed `88e2dda25a4f8c6088233adb999962b21ca79c7d`.
The initial orchestration base was `ab8618a8482512c3cd5e994031062812ecaeb080`.
The implementation branch is based on current main
`7a49eeecf741c1966d449b9fe1c514592278260e`; the full review diff is
`7a49eee...88e2dda`. Later branch commits are documentation only. The fixture
and all reported browser evidence are at `88e2dda`. It changes a Firefox probe
fixture, not product code, permissions, preferences or runtime behavior.

## Retained failures

The [report export qualification](2026-10-28-report-export.md) preserved three
local and hosted runs with 77 checks instead of 79. Both private timing-fixture
checks were left unexecuted. Their raw reports still exist in the surviving
scratch copy:

- local macOS Firefox 158.0.1:
  `p3a-local-8091ad1/firefox-evidence-158.0.1-xpi.json`;
- hosted Ubuntu 24.04 Firefox 140.0:
  `p3a-hosted-8091ad1/firefox-Linux-140.0/firefox-evidence-140.0-xpi.json`;
- hosted Windows Server 2025 Firefox 158.0.1:
  `p3a-hosted-8091ad1/firefox-Windows-158.0.1/firefox-evidence-158.0.1-xpi.json`.

The surviving files were read from
`/Users/ranokay/Documents/ChatGPT/fext/.scratch/`. The raw `privateWindow.control`
objects contain only `extensionApiAvailable` and visible text. They do not
contain `location.href`. The local 158 and hosted Windows 158 text reads
"You're off the record" and the subsequent private-window explanation. The
hosted Linux 140 text reads "Search the web / Next-level privacy on mobile" and
the older private-window explanation. That text is consistent with Firefox's
private-browsing start page. It is not a captured failed URL, and it does not
establish the exact historical route.

The earlier prose called the observed page a welcome page. That label was wrong.
The 77-check counts, failed private checks, authority gaps and cleanup results
are unchanged. The separate diagnosis records `about:privatebrowsing` in its
raw timelines, but it did not capture the historical failing route either. An
unchanged hosted retry and a later local run passed 79 checks. Those passes
establish neither a cause nor a fix for the original failures.

All three retained failed reports record `privateWindow: true` and
`cleanup.ownedTabsClosed: true`. No cleanup failure was observed in them.

## Diagnosis

The surviving earlier diagnosis is
`/Users/ranokay/Documents/ChatGPT/fext/.scratch/private-fixture-diagnosis/result.json`.
It ran eight trials on Firefox 158.0.1 and 140.0. At window-handle discovery the
private window was sometimes still on `about:blank` or loading
`about:privatebrowsing`. All eight requested routes happened to load. The path
named by the earlier record,
`/Users/ranokay/Downloads/workspaces/addonray/.scratch/private-fixture-diagnosis/`,
is absent in this environment. The surviving file was inspected read-only and
was not modified.

Fresh trials are in
`.scratch/private-fixture-readiness/route-trials.json`. The script installed the
named source-popup fixture in disposable profiles, granted the existing
test-only `internal:privateBrowsingAllowed` permission, opened the fixture
control in a new private window and compared two modes. The immediate mode
requested the route as soon as the handle appeared, which is the pre-correction
behavior. The readiness-gated mode waited for the window's own startup document
to commit and finish loading first. Each mode ran six times on each pinned
version; geckodriver was 0.37.1.

| Firefox | Immediate pre-route states                                          | Gated pre-route state     | Exact routes |
| ------- | ------------------------------------------------------------------- | ------------------------- | ------------ |
| 140.0   | 3 `about:blank` not loading, 2 `about:blank` loading, 1 start page  | 6 start page, not loading | 6 + 6        |
| 153.5.1 | 3 start page loading, 1 `about:blank` loading, 2 start page settled | 6 start page, not loading | 6 + 6        |
| 158.0.1 | 3 start page loading, 3 start page settled                          | 6 start page, not loading | 6 + 6        |

All 36 routes reached the exact popup document. The original overwrite did not
reproduce, so the historical cause remains unestablished. The observed
difference is that the immediate mode sometimes requests the control while the
private window's own startup navigation is still blank or loading. The gated
mode never did.

A controlled perturbation is in
`.scratch/private-fixture-readiness/delayed-startup-control2.json`. It delays
only the new private window's own `gBrowser.loadTabs` call for the startup
document by 1000 ms. The wrapper exists only in the scratch script. It is not a
Firefox preference, fixture change or product change. On Firefox 158.0.1, both
immediate trials first loaded the requested popup, then the delayed startup
navigation replaced it and left `about:privatebrowsing` with no extension API.
Both readiness-gated trials waited for the startup document and retained the
exact popup route. This reproduces the overwrite mechanism and the correction's
effect. It does not establish that the historical failures had this timing or
this cause.

The first delay attempt did not affect the startup call; it remains in
`.scratch/private-fixture-readiness/delayed-startup-control.json`. It was
replaced by the wrapper installed on the window `load` event, which is the
retained control above.

## Correction

`scripts/timing-private-checks.mjs` at `88e2dda` now:

1. Verifies the new window is private and records its startup state at handle
   discovery.
2. Waits for `gBrowserInit.delayedStartupFinished`, a committed non-`about:blank`
   URI and `webProgress.isLoadingDocument === false`. It then waits for the
   content document to reach `readyState === "complete"`.
3. Requests the control route only after that state. It requires the exact URL,
   a complete document, the fixture's runtime ID and the `#page` control before
   any private assertion.
4. Applies the same exact-route check to the private investigation receiver.
   The existing private tab and private window assertions remain.

The waits are bounded by observed state, not a fixed sleep. No product hook,
permission, preference, runtime path, collector budget or check name changed.
The test-only private-browsing permission and extension reload remain the same
fixture authority as before.

A source-route gap still returns before either private check runs, so the
report keeps 77 observed checks. A receiver-only gap after the source check
retains that one passed check and fails the run, so its report has 78 observed
checks and names the missing receiver check. On an unqualified control route the
record distinguishes a failed startup wait from a failed exact route. Cleanup
starts with `ownedTabsClosed: false`, closes owned handles, asserts that none
remain and sets the flag only then. A cleanup error or leaked owned tab leaves
the flag false and fails the run. All selected runs report
`ownedTabsClosed: true`.

## Verification

The clean shared gate at `88e2dda` passed 438 behavior tests across 25 files
with no failures, native type checking of 56 files, formatting, linting, both
packages and manifests, source allowlists and strict workflow lint. The frozen
receipt is
`20261029T104840Z-f28df676eaa4.json`.

Clean packaged Firefox runs used the unsigned XPI with SHA-256
`82b754a02dbaa3e7b7700567ce82d873dc023a3ba91a8fcf27cfcaecc08ec08a` on macOS
27.2 (build 26B5091g) arm64. They used geckodriver 0.37.1 and clean source
`88e2dda`. Each passed 79 checks with `passed-with-qualification-gaps`.

| Firefox    | Startup at handle                                      | Startup settled                      | Receipt                              |
| ---------- | ------------------------------------------------------ | ------------------------------------ | ------------------------------------ |
| 140.0      | `about:blank`, not loading, delayed startup unfinished | `about:privatebrowsing`, not loading | `20261029T105227Z-f5b5d569f82e.json` |
| 153.5.1esr | `about:blank`, loading                                 | `about:privatebrowsing`, not loading | `20261029T105041Z-fa9c4645a764.json` |
| 158.0.1    | `about:privatebrowsing`, loading                       | `about:privatebrowsing`, not loading | `20261029T104901Z-1cfe342540a6.json` |

All three reports record the exact `popup.html` and `investigation.html` routes
with `readyState: complete`, both private checks passed, and owned-tab cleanup.
They are copied to `.scratch/private-fixture-readiness/` as
`firefox-evidence-<version>-xpi.json`. The 140.0 and 153.5.1esr reports are the
cases where the handle appeared before the private window's startup document
had loaded; the readiness wait covered them before the route request.

Dirty iteration receipts are separate. During dirty iteration on base
`7a49eee`, the 158.0.1 and 153.5.1esr development runs passed 79 checks. The
first dirty 140.0 iteration in that sequence failed 54 checks at an unrelated
existing page-error collector budget of 13 ms p95 plus two clock steps. Its
report is
`.scratch/private-fixture-readiness/firefox-evidence-140.0-iteration-failed-budget.json`
and its receipt is `20261029T102242Z-9e8393a8c418.json`. An unchanged retry
passed 79 checks with receipt `20261029T102646Z-e7cfcb2be8c6.json`. No budget,
sample, warmup or assertion changed; issue #33 remains out of scope. A later
pass does not explain the failed budget sample. A later dirty 158.0.1 run at
docs head `d1ca0d5` with the final reporting changes passed 79 checks with
receipt `20261029T104610Z-fb6f0f025f98.json`. The final clean matrix above is at
`88e2dda`, after those readiness and cleanup reporting corrections.

The frozen receipt runner records exact clean HEAD, unchanged tracked contents,
child exit 0 and `frozen_gate: true` for all four claims above. Raw reports and
trial JSON are ignored `.scratch` data, not product evidence. The final
documentation head has its own frozen shared-check receipt under
`.scratch/private-fixture-readiness/receipts/`. The three browser reports remain
bound to `88e2dda`; they do not qualify a later source SHA.

## Hosted qualification

PR #49 ran at head `85d0ae78619798e530760fa1254928e82e71cbfc`. The Firefox and
Chrome workflows check out GitHub's pull-request merge commit
`bbde119c797ac039fdc1157f8860010585eca06e`, whose parents are current main
`7a49eee` and PR head `85d0ae7`. The probe reports therefore name the merge
commit; the extension source is the reviewed code at `88e2dda` plus
documentation-only commits.

The [Check run](https://github.com/ranokay/addonray/actions/runs/40863859453),
[Firefox run](https://github.com/ranokay/addonray/actions/runs/40863859516) and
[Chrome run](https://github.com/ranokay/addonray/actions/runs/40863859706) all
passed. All six Firefox jobs passed with 79 checks each, both private checks,
clean source, source rebuilds, exact control and receiver routes and
`ownedTabsClosed: true`.

| Job                    | Browser | Startup at handle                                      | Startup settled                      | Artifact SHA-256                                                   |
| ---------------------- | ------- | ------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------ |
| Ubuntu 24.04 / 140.0   | 140.0   | `about:blank`, loading, delayed startup finished       | `about:privatebrowsing`, not loading | `82b754a02dbaa3e7b7700567ce82d873dc023a3ba91a8fcf27cfcaecc08ec08a` |
| Ubuntu 24.04 / 153.5.1 | 153.5.1 | `about:blank`, not loading, delayed startup unfinished | `about:privatebrowsing`, not loading | `82b754a02dbaa3e7b7700567ce82d873dc023a3ba91a8fcf27cfcaecc08ec08a` |
| Ubuntu 24.04 / 158.0.1 | 158.0.1 | `about:blank`, not loading, delayed startup unfinished | `about:privatebrowsing`, not loading | `82b754a02dbaa3e7b7700567ce82d873dc023a3ba91a8fcf27cfcaecc08ec08a` |
| Windows 2025 / 140.0   | 140.0   | `about:privatebrowsing`, loading                       | `about:privatebrowsing`, not loading | `af2a6a807f7c59e4bb41ad664f341fffdb19d6ae4e9ea3e92e567371335a80b2` |
| Windows 2025 / 153.5.1 | 153.5.1 | `about:privatebrowsing`, not loading                   | `about:privatebrowsing`, not loading | `af2a6a807f7c59e4bb41ad664f341fffdb19d6ae4e9ea3e92e567371335a80b2` |
| Windows 2025 / 158.0.1 | 158.0.1 | `about:privatebrowsing`, loading                       | `about:privatebrowsing`, not loading | `af2a6a807f7c59e4bb41ad664f341fffdb19d6ae4e9ea3e92e567371335a80b2` |

The Windows artifact hash differs from Linux and macOS through the previously
recorded CRLF checkout conversion. Each Windows source rebuild reproduced all 19
packaged files from the clean source archive. Both Chrome jobs passed 73 checks
with clean source and passed source rebuilds; the change remains Firefox-only.

CodeRabbit reviewed the first pushed head and reported one minor documentation
finding about disambiguating the revision references. Commit `85d0ae7` fixed it.
CodeRabbit then reviewed `85d0ae7`, confirmed the clarification and resolved the
thread. SonarCloud reported Quality Gate passed, zero new issues and zero
security hotspots. No required human approval applies to this private
repository's unprotected `main`.

Raw reports and the validation summary are in
`.scratch/private-fixture-readiness/hosted-85d0ae7/`. A later documentation-only
head needs its own workflows; those are inspected separately and do not move
the hosted evidence away from the code at `88e2dda`.

## Authority and remaining gaps

The private checks use the named source-popup fixture with compiled production
core and unchanged packaged investigation assets. The test-only
`internal:privateBrowsingAllowed` permission and reload are fixture authority,
not product behavior. The checks exercise an actual private HTTP source and
fresh packaged investigation assets, not an unmodified toolbar popup or human
consent. No native private-window observation, Linux/Windows local observation,
retail installation or store claim follows from this record.

Hosted Ubuntu 24.04 x64 and Windows Server 2025 x64 runs remain pending until
the branch is handed off for a PR. They are not marked passing here. Chrome is
not rerun because this change is confined to the Firefox fixture; the shared
gate still packages and validates Chrome.

The original overwrite was not reproduced without perturbation. The controlled
delay demonstrates the race and the correction, not the historical cause. The
historical 77-check results remain failed evidence.
