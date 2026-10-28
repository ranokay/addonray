# Investigation report export feasibility

Status: the original immediate-owner-close lifetime gate failed. The user
accepted Q12's revised contract on 2026-10-27 in the
[interview](../decisions.md#report-export-interview). The revised candidate gate
then passed six checks on each of the four pinned local targets, including ESR,
before product wiring. The implementation is now wired in the working tree, with
focused tests and native type checking passing. Full shared gates, packaged UI,
native/hosted qualification and signed delivery remain pending. The original
failed assertions remain failed. No export implementation has been committed or
pushed.

## Identity and authority

Observed on 2026-10-27 on macOS 27.2 arm64. The checkout remains
`deeb3d857f7a4992a417054e2dae6dfec051df11` on `main`, with authored documentation
and draft model changes. These are dirty-source candidate runs, not frozen
production qualification. The pinned Bun runtime reports
`1.4.4-canary.1+963452075`, as documented in [toolchain](../toolchain.md).

The separately named temporary extension uses synthetic Markdown only. It has
required `activeTab` and optional `management`/`scripting`, with no `downloads`,
storage, host or background permission. Actual grants contain only `activeTab`.
Real clicks invoke asynchronous own-tab context and permission reads before an
anchor requests the file. Held validation, synthetic preview state and immediate
reset/owner closure are explicit fixture controls. No production serializer,
export controller, React UI, inventory or page collector is exercised.

Firefox uses geckodriver 0.37.1 and a disposable profile, with test preferences
directing automatic downloads to an owned directory. Privileged Firefox context
resolves the controlled extension's URL. Chrome uses matching Chrome for Testing
and ChromeDriver 156.0.8078.47, `Extensions.loadUnpacked`, and test-only
`Browser.setDownloadBehavior`. These controls do not qualify native dialogs,
optional consent or default user download settings.

Raw data lives in ignored `.scratch/report-export-feasibility/`. Its
`verified-summary.json` identifies every attempt, source/fixture hashes, retained
file, original result, authority and cleanup disposition. The candidate source
SHA-256 is `d3f72babf4de1224bd266a07081329ea8f58e6213f8c095cb3f539b9498998fd`.
The browser-run runner SHA-256 is
`5c3b30def133c116d0d2621d038d991a5688d9a8294b307d761058126b0ffd2b`.
Each attempt retains source archives matching its recorded hashes.

## Initial observed results

| Browser distribution/version     | Candidate                    | Ordinary/lifecycle cases | Immediate owner close | Overall                 |
| -------------------------------- | ---------------------------- | ------------------------ | --------------------- | ----------------------- |
| Firefox 158.0.1                  | Blob URL, synchronous revoke | Five pass                | Failed                | Failed                  |
| Firefox 158.0.1                  | Data URL                     | Five pass                | Failed                | Failed                  |
| Firefox 140.0                    | Blob URL, synchronous revoke | Five pass                | Failed                | Failed                  |
| Chrome for Testing 156.0.8078.47 | Blob URL, synchronous revoke | Five pass                | Passed                | Passed candidate checks |

The five passing cases are an exact 182-byte UTF-8 file after asynchronous
validation, an exact 1,048,576-byte UTF-8 file, Cancel without a URL/download,
reset while validation is pending without late handoff, and reset immediately
after requesting a 1 MiB file without truncation. Completed files use
`addonray-investigation.md`. Blob cases leave no fixture object URL retained.

In the sixth case, the fixture requests the file and immediately removes its own
tab in the same task. Firefox produced no exact-size completed file during the
15-second wait. The Data URL result shows that changing only the URL strategy
does not establish owner-close survival. Chrome completed that case. These
observations do not prove the browser's internal cancellation mechanism or
establish behavior for every close/reload schedule.

One earlier Firefox 158 setup attempt failed before a browser started because
the driver service builder had no `loggingTo` method. Its zero-check report is
retained separately, not counted as a browser result. The original runner was
reconstructed from the exact single-call correction and matches its recorded
SHA-256, `87364a2fd79db784f0acb01f6cdf2531455dc2555dbfda6fb015954d73984c22`.

All started browser sessions ended. Firefox profiles disappeared normally.
Chrome's raw report records a retained disposable profile. A separate cleanup
supplement records checking for live use of that exact owned path and removing
it; the original report was not rewritten. The coordinator independently checked
all five report hashes, archived runner/candidate hashes, 20 fixture files,
13 retained download sizes/hashes and absence of all started browser profiles.
Receipts are `parent-artifact-audit.json` and `parent-final-audit.json` in the
same ignored directory. Successful files still match after browser teardown.

## Revised Q12 candidate gate

After Q12 was accepted, the final revised runner passed all six candidate checks
on each target on macOS 27.2 arm64:

| Browser distribution/version     | Driver version             | Revised checks |
| -------------------------------- | -------------------------- | -------------- |
| Firefox 140.0                    | geckodriver 0.37.1         | Six passed     |
| Firefox 153.5.1esr               | geckodriver 0.37.1         | Six passed     |
| Firefox 158.0.1                  | geckodriver 0.37.1         | Six passed     |
| Chrome for Testing 156.0.8078.47 | ChromeDriver 156.0.8078.47 | Six passed     |

The first five source blocks are byte-identical to the original runner, with
SHA-256 `bfcf43e60363e700937c583e12687f6542e5e6cc100f3169000db9fb6a3af435`.
The revised sixth case waits for the external test process to observe a complete
exact 1 MiB file, leaves it at the original browser download path while its owner
closes, verifies the same bytes there after closure, then archives it. It does
not require or claim that a merely dispatched request survives owner closure.

The final runner SHA-256 is
`ad90089743fe364a17453628d02ed4bb2abc9c6487c7536dd637a49f27860811`.
Candidate source remains
`d3f72babf4de1224bd266a07081329ea8f58e6213f8c095cb3f539b9498998fd`.
`.scratch/report-export-feasibility/verified-revised-summary.json` identifies all
four raw receipts, 16 retained artifacts, source/fixture hashes and cleanup.
The coordinator's `parent-revised-audit.json` independently verifies those
artifact sizes/hashes, first-five source equality and absence of all started
profiles. Chrome's retained owned profile was removed separately after driver
quit and process/path checks; its original cleanup result remains recorded.

Three preliminary revised Firefox receipts are excluded from this final gate.
Their shared helper archived the completed file before closing its owner, so
they did not establish retention at the original browser download path. The
final revised2 receipts correct that observation sequence. Both those
preliminary receipts and the original immediate-close failures remain separate.
No original failed assertion was weakened or relabelled as passing.

This is synthetic candidate evidence with controlled automatic-download settings
and external filesystem observation. It qualifies the revised fixture contract,
not production React interaction, native download prompts, browser-reported
completion, hosted OSs or distribution.

## Historical model checks before product wiring

Before product wiring, the independent serializer and owning-view export
controller were drafts, with no investigation entry-point or manifest changes.
The focused command
`mise exec -- bun test tests/investigation-report.test.ts tests/report-export.test.ts`
passed 54 tests and 213 assertions, exit 0. These tests cover report content,
literalization, the exact UTF-8 bound, context/permission outcomes and stale
revision/reset races. They do not qualify a real product download or shared
Markdown rendering. An initial controller-test run exposed unsupported
`vi.mocked` test-helper calls; those calls were replaced with captured spies and
listeners before the passing run. No product defect was inferred from that
test-harness failure.

## Current implementation and pending qualification

After the revised candidate gate passed, the serializer, owning-view controller,
ordinary Blob/anchor download adapter and exact-preview React controls were
wired into the investigation. The current focused suite passes 63 tests with
266 assertions, and native type checking passes 55 files. Independent review of
the export core found no material issue. These results are development evidence,
separate from the synthetic candidate and real packaged/native browser behavior.

`scripts/report-export-checks.mjs` is being integrated into the packaged browser
protocols. It drives the production React preview/Cancel/assessment/download
controls and retains raw preview/file equality data. Shared investigation checks
also cover reset erasure and completed-file retention through owner closure.
These new packaged checks have not passed qualification yet. The planned
`scripts/report-export-native.mjs` helper will support separate visible browser
observations; no native result is claimed.

No full shared gate, source rebuild, production browser matrix, native UI check,
commit or push has been performed for this unfinished slice. Follow
[export testing instructions](../testing.md#report-export-checks) and preserve
the distinction between test-controlled automatic downloads and native default
Save As behavior.

## Accepted revised boundary and remaining gaps

The user accepted Q12 on 2026-10-27. Requesting a download does not establish
browser acceptance. Ask the user to keep the investigation open until the browser
shows the download, and explain that closing or reloading before acceptance may
cancel the request. Already accepted bytes/downloads/files can remain after reset
or closure; AddonRay cannot guarantee final disk completion or recall them. This
revision adds no permission, background owner or longer data lifetime.

The original failed gate is not repaired by this wording. P3A-14 and P3A-16
explicitly require the accepted request/acceptance boundary, and the revised
candidate gate above passed before product wiring. Preserve the original failed
assertions and their reports. An anchor click alone cannot stand in for browser
acceptance or a completed file. The revised candidate pass does not replace
production or native qualification.

Firefox ESR was absent from the initial attempt and passed the revised candidate
gate. Linux/Windows, native
interaction, save-dialog cancellation, default browser settings and authentic
private/unknown guards remain unobserved for export. The candidate checks only
its actual normal own tab. No existing release, collector-overhead, signed
distribution or store gate is closed by this evidence.
