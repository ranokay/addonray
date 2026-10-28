# Phase 3 previewed investigation report export

Status: approved for feasibility-first implementation, tests, independent review
and signed private delivery to `ranokay/addonray` on `main` on 2026-10-27. The
user accepted Q1 through Q11 in the [report export interview](../decisions.md#report-export-interview),
including the 1 MiB UTF-8 report limit, then accepted Q12's lifetime revision on
the same date after an essential candidate failure. The revised candidate gate
then passed six checks on each pinned local target, including ESR, before product
wiring. The serializer, controller, browser download adapter and investigation UI
are now wired in the working tree. Focused tests and native type checking pass;
the development shared gate and current local Firefox/Chrome flows pass, and
available macOS native controls are observed. Clean exact-head qualification,
hosted evidence and signed delivery remain pending. See
[production evidence](../evidence/2026-10-28-report-export.md).

## Failed candidate and accepted lifetime revision

The initial Firefox 158 candidate produced exact small and 1 MiB downloads with
both Blob and data URLs. Closing the owning tab in the same task immediately
after `anchor.click()` could preempt the download request, leaving no file. Those
failed lifetime assertions remain failed. Firefox 140 repeated the Blob failure;
Chrome for Testing 156.0.8078.47 passed the same six candidate cases. ESR was not
run. Successful byte checks do not qualify Firefox owner-close survival or
production behavior. The
[feasibility record](../evidence/2026-10-27-report-export-feasibility.md) is the
location for the candidate reports and their limits.

The user accepted Q12 on 2026-10-27. Request dispatch does not establish browser
acceptance. Ask the user to keep the investigation open until the browser shows
the download and warn that closing or reloading can cancel an unaccepted request.
Bytes or a file already accepted by the browser can remain after clearing. This
revision changes no permission or investigation lifetime. P3A-14 and P3A-16 below
explicitly adopt the revised boundary. Q11 remains the original approval, and
its failed immediate-owner-close assertions remain failed. The revised candidate
gate subsequently passed on Firefox 140.0, 153.5.1esr, 158.0.1 and Chrome for
Testing 156.0.8078.47, with six checks each. It qualifies the controlled fixture's
revised behavior, separately from the new product implementation.

Before wiring, draft serializer tests passed 32 tests with 128 assertions and
draft controller tests passed 22 tests with 85 assertions. Those historical
counts are not current qualification. The wired implementation's focused suite
passes 63 tests with 266 assertions, and native type checking passes 55 files.
Independent review of the export core has no material finding. Full shared gates,
packaged UI, native downloads, hosted reports and signed delivery remain pending.

## Problem and result

A completed investigation holds useful observations only while its view stays
loaded. Let the user prepare one human-readable Markdown report for someone
helping troubleshoot. The report uses that investigation's existing observations.
It adds no inspection, capture, user notes, environment collection or saved history.

The user reviews the exact text before choosing Download report. The browser
controls the resulting download and may save automatically under its settings.
AddonRay can report that it requested the download, not that the file was saved.
Keep the investigation open until the browser shows the download. Closing or
reloading can cancel a request the browser has not accepted. Reset cannot recall
bytes or a file already accepted by the browser.

## Selected user flow

1. Explicitly capture both Before and After inventories in one investigation.
   Timing attachments, page-error attachments and the manual assessment remain
   optional. An inventory-only investigation qualifies.
2. Choose Prepare report while no inventory capture or report action is in
   progress. Verify that the owning view is a normal window and that its current
   observation revision, reset generation and permission state remain eligible.
3. Construct a bounded report from allowlisted existing observations. Do not
   fetch fresh inventory, page data, browser/OS metadata or timestamps.
4. Show the exact Markdown text in a read-only preview in the investigation view.
   Explain that extension names and versions are included and may identify the
   user's extension choices. The preview offers Download report and Cancel.
5. A changed assessment or attachment makes the old preview unusable. Preparing
   again creates a fresh preview from the current investigation. Reset, actual
   optional-permission revocation, close, reload or unloading erases the unsaved
   preview with the investigation. Cancel discards only the preview.
6. On Download report, recheck the same source revision and generation, current
   context and permissions after asynchronous checks. Only the previewed bytes
   may be handed to the browser under a generic `.md` filename. A stale or failed
   attempt gives a bounded result and never retries automatically.
7. A request is not browser acceptance. Keep the investigation open until the
   browser shows the download; close/reload can cancel an unaccepted request.
   After acceptance, bytes or a downloaded/pending file can outlive investigation
   memory. Clearing, closing or revoking cannot recall them. The user manages the
   file through the browser or filesystem.

## Report content

Include both extension inventories and their existing added, removed, enabled
and disabled changes. Report extension names, versions and enabled states.
Compute identity-based changes from the existing comparison; omit extension ID
fields and do not replace them with internal row labels or protocol identifiers.
Names and versions remain sensitive even when ID fields are omitted.

Include the recorded Better/Unchanged/Worse/Uncertain assessment, or an explicit
not-recorded state. Include attached timing milestones and their existing
measured/unrecorded/unavailable states. Retain existing signed millisecond
differences only when both timing values are measured. Include attached error
counts, observation durations and completion reasons side by side. Missing
attachments stay explicitly absent. Add no error difference, rate, score,
automatic assessment or culprit verdict.

Retain the observation limits needed to interpret the report. Inventory does not
prove execution on a page. Attachments do not prove matching documents,
synchronized captures or equal reproduction conditions. Zero observed errors
does not prove an error-free page. Chrome's page-side error observer remains
subject to page interference. Timing differences do not establish extension
impact, and the user's assessment remains a separate judgment.

Omit dedicated extension-ID fields, source-tab IDs, document/attempt/transfer IDs,
internal investigation labels and other protocol data. Do not collect or add page
URLs/titles, page content, DOM snippets, cookies, tokens, raw error details,
permission/host metadata, absolute timestamps, user notes or additional browser/OS
context. Escape text already present in allowed names and versions so report
readers see literal values rather than active links or HTML.

## Acceptance criteria

| ID     | Required behavior                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3A-01 | Export one investigation only after both inventory captures succeeded and no inventory capture or report action is in progress. Assessment and timing/error attachments remain optional. Preserve popup and standalone-check behavior.                                                                                                                                                                                                                        |
| P3A-02 | Use only existing investigation observations. Preparing and downloading make no inventory/page collection call and add no context, timestamp, note, collector, source-page selection or automatic extension action.                                                                                                                                                                                                                                           |
| P3A-03 | Include both inventories, existing inventory changes, optional assessment, attached timing/error observations and explicit missing states. Include extension names, versions and enabled states; omit extension-ID fields and internal labels/identifiers.                                                                                                                                                                                                    |
| P3A-04 | Preserve existing timing states and measured-pair millisecond differences. Present error counts, durations and completion reasons without count arithmetic or rates. Preserve the manual assessment and observation/target limits without scores or causal verdicts.                                                                                                                                                                                          |
| P3A-05 | Serialize allowlisted canonical values only. Encode untrusted names and versions as literal Markdown text without active links or HTML. Do not serialize source objects, hidden identifiers, permission metadata, page identifiers/content, raw errors or extra environment data.                                                                                                                                                                             |
| P3A-06 | Prepare the full UTF-8 Markdown text before preview. Limit the complete document to 1 MiB, or 1,048,576 bytes. An oversized or invalid report produces a bounded error, preserves the investigation and creates no downloadable preview. Never truncate or silently omit content to meet the limit.                                                                                                                                                           |
| P3A-07 | Show a read-only preview of the exact Markdown text to be downloaded in the owning investigation view. Disclose included extension names/versions. Download report and Cancel are explicit actions; previewing causes no download.                                                                                                                                                                                                                            |
| P3A-08 | Bind each preview to the investigation's observation revision and reset generation. Check them before preparation and after asynchronous checks, and again before browser handoff. Assessment or attachment changes invalidate the old preview and require fresh preparation. Late preparation or download work cannot revive stale or erased data.                                                                                                           |
| P3A-09 | Prepare and download only from a verified normal-window owning view. Private/incognito, unknown and failed classifications fail closed. Recheck after asynchronous work without browsing-page enumeration or new context collection.                                                                                                                                                                                                                          |
| P3A-10 | Check the current inventory permission without prompting for new collection. Never-granted scripting access does not block an inventory-only report. Actual management or scripting revocation follows the existing whole-investigation reset and erases its preview; pending work cannot restore it.                                                                                                                                                         |
| P3A-11 | Keep preview text, eligibility and download resources in the owning view's memory only. Cancel discards the preview. Reset, actual revocation, close, reload, unloading and teardown discard unsaved preview data and invalidate pending work. Other investigations remain independent.                                                                                                                                                                       |
| P3A-12 | Download only the exact previewed UTF-8 bytes under a generic `.md` filename with no observation, identifier or timestamp in it. Use the browser's ordinary download path with the existing permission budget. The browser may auto-save; AddonRay makes no completed-save claim.                                                                                                                                                                             |
| P3A-13 | Handle denied/failed/stale download preparation and browser handoff with bounded explanatory outcomes. Prevent concurrent actions, retain valid investigation observations, and never retry or switch output formats automatically. Do not claim detection of user cancellation or final disk completion when the chosen mechanism cannot observe it.                                                                                                         |
| P3A-14 | Disclose that requesting a download does not prove browser acceptance. Ask the user to keep the investigation open until the browser shows the download; close/reload may cancel an unaccepted request. Browser-accepted bytes or files can persist after clearing, revocation or closing and cannot be recalled. Add no history, restoration, clipboard action, remote transmission or automatic sharing.                                                    |
| P3A-15 | Preserve Firefox/Chrome MV3 targets/minima and current permissions. Add no `downloads` permission, host grant, background owner, durable storage, new dependency, store publication or support claim. Reassess Firefox's data declaration for this explicit local-only export and document the rationale and remaining qualification.                                                                                                                         |
| P3A-16 | Qualify the Q12 revised request/acceptance contract on controlled Firefox and Chrome fixtures, including ESR, before product wiring. Prove exact bytes with the owner open, stale-action rejection and accepted-file retention under unchanged permissions. Record pre-acceptance close/reload limits and retain the original failed immediate-close assertions. Essential revised-gate failure requires a revised plan without wider authority or retention. |
| P3A-17 | Cover serialization, sensitive-field exclusion, literal text, byte bounds, missing values, normal-context guards, initial scripting absence, actual revocation, revision/reset races and download failure with focused deterministic tests. Keep model tests separate from browser and native evidence.                                                                                                                                                       |
| P3A-18 | Run the shared gate, source rebuilds and both browser qualifications for the shared export path. Record exact distributions, versions, source/artifact identities, observed download outcomes and gaps. Independently review production, probe and evidence claims before signed private delivery. No earlier matrix qualifies this new behavior.                                                                                                             |

## Firefox declaration reassessment

Reviewed on 2026-10-27. Mozilla's [Add-on Policies FAQ](https://extensionworkshop.com/documentation/publish/add-on-policies-faq/)
permits a user-initiated export to the local filesystem under its local-backup
exception. It distinguishes remote-server transmission, which must follow the
data collection and consent rules. The [built-in consent documentation](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
describes the declaration for transmitted data and the `none` declaration.

The approved rationale retains `none` for this explicit local download, with no
AddonRay network transfer or automatic sharing. This interpretation is bounded
to the approved behavior. It does not qualify implementation, installation,
store compliance or publication. Browser/download qualification is pending;
reassess if a later feature sends data elsewhere.

## Feasibility and qualification sequence

1. Record the agreed contract and inspect current ownership and download APIs.
   Keep any candidate export files and raw reports in ignored `.scratch/`.
2. Qualify Q12's revised contract on controlled Firefox and Chrome fixtures under
   the unchanged manifest permissions, including the missing ESR run. Prove exact
   UTF-8 output while the owner remains open, bounded resources, stale-action
   rejection and accepted-file retention. Record pre-acceptance close/reload as a
   cancellation limit, preserving the original immediate-close failures. Separate
   request dispatch, browser acceptance and final file completion in the evidence.
3. Implement the canonical report preparation and revision/generation rules with
   focused tests, then wire the exact preview and explicit download action.
4. Complete independent production/probe review and fix material findings. Run
   `mise run check`, source rebuilds, `mise run test-firefox` and
   `mise run test-chrome`; preserve failed attempts and exact-head evidence.
5. Observe available native preview/Cancel/download flows and record unobserved
   platform, private-context and distribution cases honestly. Prepare dated
   evidence, sign authored paths and deliver privately to `main`. Every later
   delivery head requires its own verification.

Saved history, report import, other formats, clipboard export, user notes,
additional diagnostics, longer sessions, browser targets and publication remain
separate decisions.
