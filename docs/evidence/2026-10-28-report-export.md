# Previewed investigation report export qualification

The approved [P3A contract](../plans/phase3-report-export.md), including Q12,
is implemented in signed private commit `8091ad120cb12195722c59e87bad8563f214ed27`.
Clean local qualification and all eight hosted targets pass at that implementation
head, after the separate attempts recorded below. Working-tree checks and native
observations retain their own authority. Later documentation delivery requires
its own exact-head checks and downloaded-report verification. No release-support,
store or distribution-signing gate is closed.

## Implementation and review

`lib/investigation-report.ts` serializes allowed investigation fields into one
UTF-8 Markdown file, with a 1,048,576-byte bound and no truncation. It includes
both inventories, their existing changes, assessment and optional diagnostics,
with explicit missing states and observation limits. Identifier fields,
permission metadata and extra context are excluded. Untrusted names/versions
remain literal in code spans, with visible escapes for delimiters and controls.
A concrete Markdown-renderer test checks that hostile strings create no links,
images or active HTML; this does not certify every downstream renderer.

`lib/report-export.ts` binds a preview to its current investigation snapshot,
reset generation and action ticket. A clearable permit releases retained text
and snapshot references when pending work is invalidated. Preparing/downloading
rechecks own-tab normal context and existing grants without new prompts or
collection. Never-granted scripting access does not block an inventory-only
report. Actual removal still resets the investigation. `lib/report-download.ts`
dispatches a Blob/anchor request and immediately removes the link and object URL.
It neither observes disk completion nor retries automatically.

The investigation shows the exact read-only Markdown before a separate Download
report action. Assessment/attachment changes invalidate it. Cancel affects only
the preview. Reset, revocation, reload and disposal erase unsaved data. Q12's
keep-open warning distinguishes request dispatch from browser acceptance.
The original failed immediate-close tests remain in the separate
[feasibility record](2026-10-27-report-export-feasibility.md).

Independent product review found no material issue. Probe/native-helper review
found two evidence problems: fresh post-action file observations and native
revocation observations were asserted before being retained. Both were corrected
so failure reports keep bytes/hashes or the actual API/state/read failure before
assertions. The reviewer verified both corrections and reported no remaining
material source finding. `.scratch/p3a-code-review.json` records review scope;
the clean-source and native-input audits below bind those findings to delivery.

## Working-tree validation

The complete deterministic suite passed **433 tests and 1,834 assertions**.
The 63 export tests contribute 266 assertions. Native type checking passed
55 files. Shared checking includes native formatting/lint, both packages,
manifest/archive validation and workflow lint. An initial lint failure in a test
control-character regex was corrected with equivalent code-point assertions;
it was not a production defect. Its failed receipt remains retained.

Working-tree receipts are:

- Full behavior suite: `20261027T075612Z-95342b23be04.json`.
- Initial lint failure: `20261028T063337Z-b99614e3394a.json`.
- Preliminary shared gate: `20261028T063355Z-1cfe60b48e9c.json`.
- `mise run test-firefox`, Firefox 158.0.1: `20261028T063503Z-00a70b6ef01d.json`.
- `mise run test-chrome`, Chrome for Testing 156.0.8078.47: `20261028T063712Z-8076bda0d368.json`.

These receipts live under `/Users/ranokay/.local/state/agent-tools/gates/`.
They are dirty development evidence, not frozen exact-commit gates. The Firefox
development task loads a directory build; clean packaged XPI checks remain a
separate layer. Later helper-only changes need their own final shared check.

The two browser runs passed **79 Firefox checks / 73 Chrome checks**. The new
built React flow proves explicit preview without download, Cancel, assessment
invalidation, an exact generic-name UTF-8 file, erasure of a later unsaved preview
on reset, and continued equality of the completed file at its original browser
download path after reset and owner closure. Firefox's existing actual management
removal also starts with a prepared preview and verifies its erasure.

Raw reports are `.scratch/p3a-dirty/firefox-158.0.1.json` and
`.scratch/p3a-dirty/chrome.json`. Both retain the reviewed and downloaded Markdown,
byte counts, SHA-256 hashes and post-reset/post-close observations before
assertions. The coordinator independently verified equality and both lifetime
observations. The controlled 5,071-byte report is fixture data, not user data.

Firefox uses the unmodified product and an approved optional grant. Chrome uses
its explicitly named pre-granted UI copy with unchanged packaged assets.
Required fixture permissions are automation authority, not native optional
consent evidence. Download destinations/MIME handling are test-controlled. These
checks do not qualify default Save As behavior or authentic private guards.

## Native macOS observations

On macOS 27.2 arm64, CUA Driver operated the unmodified validated packages in
separate visible disposable profiles. Firefox was 158.0.1/geckodriver 0.37.1;
Chrome for Testing and ChromeDriver were 156.0.8078.47. Driver setup opened
`investigation.html` directly. It does not qualify native toolbar launch.
No optional permission was pre-granted to either product.

Observed in both browsers:

- Actual management Deny leaves the capture declined. Explicit retry and Allow
  permit Before capture; After and Uncertain are deliberate.
- The read-only preview displays the inventories, sensitive-field disclosure
  and Q12 download warning. Shift+Tab then Return from the preview activates
  Cancel. Preparing again and changing the assessment invalidates the preview;
  restoring the assessment permits fresh preparation.
- Tab then Return from the preview activates Download report. The native browser
  reports `addonray-investigation.md` completed/Done. External helper checks
  independently establish **4,398 exact UTF-8 bytes**, not a product completion
  API. Scripting remained ungranted for the inventory-only report.
- A native reload clears the pair, assessment and preview. The helper's separate
  actual management-removal command clears a populated investigation and preview;
  CUA observes disabled preparation and no preview afterward.

The first background Chrome Cmd+R attempt did not establish a reload. Its unchanged pair and the
subsequent stopped recapture batch were not counted as reload success or a
product defect. After an explicit recapture, foreground Cmd+R cleared the view;
the final snapshot confirms a new empty investigation. A post-revocation explicit
inventory request resumed without another visible prompt, so no renewed native
consent claim is made for that request.

Raw helper reports, CUA notes and screenshots are retained separately in:

- `.scratch/report-export-native-firefox-Hfyy0x/`
- `.scratch/report-export-native-chrome-FTXvGC/`

Both helper reports preserve package/source-input hashes and verify them again
at finish. Both sessions passed their two requested driver assertions, closed
the browsers and removed their exact owned profiles. Chrome required the
recorded post-quit exact-path cleanup. Completed files remain in the ignored
controlled-evidence directories. The 41 product-input hashes match clean implementation `8091ad1`, as recorded
in `.scratch/p3a-audit/native-to-clean-8091ad1.json`. The native reports retain
their dirty-source baseline `deeb3d8`; they are not clean-commit browser runs.

Automatic-download preferences/CDP settings selected the destination. Native
Save As and download cancellation under default user settings were not observed.
These were inventory-only native reports; actual attached diagnostic exports
were not newly observed in native UI. Their content is covered by serializer
tests alongside existing attachment qualification. No complete accessibility or
other-OS native verdict follows from the keyboard checks.

## Clean implementation qualification

Signed `8091ad1` is pushed to private `ranokay/addonray` on `main`. Its frozen
shared gate passed 433 tests with 1,834 assertions and native type checking of
55 files. Both clean source-archive rebuilds compared all 14 packaged files.
The pinned Bun runtime reports `1.4.4-canary.1+963452075`; the configured archive
pin and checksum remain unchanged.

Frozen receipts under `/Users/ranokay/.local/state/agent-tools/gates/` are:

| Gate                                    | Receipt                              |
| --------------------------------------- | ------------------------------------ |
| Shared check                            | `20261028T065847Z-347f0a6d14a1.json` |
| Firefox source rebuild                  | `20261028T070018Z-0b78df311670.json` |
| Chrome source rebuild                   | `20261028T070021Z-f26e90457602.json` |
| macOS Firefox 140.0                     | `20261028T070237Z-5fb3dd1b18bf.json` |
| macOS Firefox 153.5.1esr                | `20261028T070529Z-1011c08ca42f.json` |
| macOS Firefox 158.0.1 controlled repeat | `20261028T072256Z-cdee2c67a661.json` |
| macOS Chrome for Testing 156.0.8078.47  | `20261028T070849Z-20221cbe0766.json` |

All three Firefox versions pass 79 checks each and Chrome passes 73 on macOS
27.2 arm64. Firefox uses geckodriver 0.37.1; ChromeDriver matches the Chrome
version. The selected complete reports are listed in
`.scratch/p3a-audit/selected-local-8091ad1.json`. The source rebuilds and original
runs are under `.scratch/p3a-local-8091ad1/`; Firefox 158 attempts are separate
under `.scratch/p3a-local-8091ad1-retry/`. Each selected report verifies the exact
5,071-byte fixture export and fresh observations of its original download path
after reset and owner closure.

The implementation's hosted [Check](https://github.com/ranokay/addonray/actions/runs/40647439501),
[Firefox](https://github.com/ranokay/addonray/actions/runs/40647439468) and
[Chrome](https://github.com/ranokay/addonray/actions/runs/40647439477) workflows
passed. The selected six Firefox jobs on Ubuntu 24.04 x64 and Windows Server
2025 x64 pass 79 checks each. Both pinned Chrome jobs pass 73 checks. All 16
selected browser/rebuild reports verify clean `8091ad1`, exact browser versions,
41 source-input hashes, paired archive identities, all 14 rebuilt package files,
export bytes and both completed-file lifetime observations, bounds and cleanup.
Windows source/package hashes differ from Linux/macOS through the verified CRLF
checkout conversion. No other input drift is accepted.
Selected browser reports retain `passed-with-qualification-gaps` for their
documented fixture/native and release limits. The selected retries fill the two
missing private-fixture checks without closing those standing limits.

The independent audits are `.scratch/p3a-audit/local-8091ad1-final.json` and
`.scratch/p3a-audit/hosted-8091ad1-final.json`; coordinator reruns with the
`parent-` prefix independently pass. They recompute every raw 30-sample collector
p95 and two-clock-step guard, summary-size, duration and event-cap bounds. The
largest selected guarded p95 is 3 ms locally and 4 ms hosted, within the unchanged
5 ms limit. All eight selected ZIPs match GitHub SHA-256 digests and their
extracted reports. Selection is explicit in
`.scratch/p3a-audit/selected-hosted-8091ad1.json`, with original six members under
`.scratch/p3a-hosted-8091ad1/` and two unchanged retries under
`.scratch/p3a-hosted-8091ad1-retry/`.

### Preserved incomplete and failed attempts

The first local Firefox 158 and initial hosted Linux Firefox 140 / Windows
Firefox 158 runs reported 77 checks and `passed-with-qualification-gaps`.
Their two existing private timing-fixture checks could not run because the
requested private control showed Firefox's welcome page. Their export checks
passed, but those runs do not qualify the full matrix. One unchanged hosted
retry per affected member passed all 79 checks. Original artifacts 12798367621
and 12798328448 remain separate from retry artifacts 12798556961 and 12798488312.

The first unchanged local Firefox 158 retry passed its private checks, then
failed the existing empty page-error supervisor/setup budget. Its raw p95 was
4 ms and clock step 1 ms, giving a guarded 6 ms against the unchanged 5 ms limit.
Its receipt is `20261028T071222Z-f630768ddaa6.json`; the failed report is
`.scratch/p3a-local-8091ad1-retry/firefox-evidence-158.0.1-first-retry-failed.json`.
The independent failure audit is
`.scratch/p3a-audit/local-158-first-retry-failure-audit.json`. A further controlled
unchanged run passed all 79 checks and budgets. The selection uses that whole
report, without combining sections of failed runs. No threshold, sampling,
warmup, assertion or collector scenario changed. A later pass does not establish
a cause or a fix for the failure.

A separate disposable-profile diagnosis did not reproduce the private-page
overwrite in eight trials. It found a readiness gap between window creation and
initial private-page loading, but did not establish that gap caused the earlier
results. `.scratch/private-fixture-diagnosis/result.json` retains the trials.
No unrelated fixture change was made in this slice.

Correction (2026-10-29): the retained reports' visible text is consistent with
Firefox's private-browsing start page. Those reports did not capture
`location.href`, so "welcome page" above is not a recorded URL or a diagnosed
historical route. The 77-check results, failed private checks and authority gaps
are unchanged. See the
[private-fixture readiness record](2026-10-29-private-fixture-readiness.md).

## Delivery and release boundaries

This dated record qualifies implementation `8091ad1`. Every later documentation
delivery head needs its own frozen shared check and hosted verification; earlier
results cannot qualify a newer SHA. The final local receipt is
`.scratch/p3a-delivery.json` and must name that exact head, its workflows and the
verified downloaded reports before delivery is complete.

Authentic private/unknown export guards, default download settings, full
accessibility, native Linux/Windows, retail installation, signed distribution
and store publication remain release gates. No new browser target, history,
clipboard action, background owner, collector or permission has been introduced.
