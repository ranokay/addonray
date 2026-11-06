# Printable HTML report

Status: bounded #10 implementation initially qualified from clean
`6cb16346e153eae4fc1691f2579e9299fb96576a`. Review fixes at `3ce50ea`
(sandboxed previews and deduplicated probes), `5f67c0b` (backslash escaping) and
`4667cda` (exact-document preview wait) follow; the final exact-head matrix is
recorded in the pull request instead of a moving documentation head. This record
preserves the initial qualification, corrections and gaps. Deterministic checks,
native type checking, one clean Chrome and three clean Firefox product runs pass,
and a native Chrome print/Save-as-PDF observation completed. This record adds no
permission, dependency, browser target, support claim, clipboard action or PDF
library. #11 remains future work.

This record covers [issue #10](https://github.com/ranokay/addonray/issues/10)
under the approved
[saved-investigation and report-exchange contract](../plans/saved-investigation-data-rules.md)
and its Formats, SRD-19 and SRD-20 rules.

## Implemented boundary

| Area         | Behavior                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Format       | Self-contained printable HTML as a third live format, a saved-archive format and the imported report's printable output. Inline `<style>` only; no scripts, images, fonts, links or remote resources. No PDF library or `downloads` permission.                                                                                                                                                  |
| Content      | Only the approved report fields: provenance, assessment, both inventories, the stored precomputed ID-based changes, assessment, optional timing and page-error summaries, observation limits and fixed limit text. No record IDs, timestamps, permission or host metadata, URL, title, browser or OS context.                                                                                    |
| States       | Empty inventories, absent assessment, unattached diagnostics and measured, unrecorded and unavailable milestones stay explicit. Changes are rendered from the stored list and are never recomputed from names. Duplicate names and versions stay indistinguishable and the limit is stated.                                                                                                      |
| Provenance   | A live report says it was captured by AddonRay. An imported report says it is untrusted file content AddonRay did not observe, and an unsaved import also names the file's unauthenticated provenance claim. Saved imports retain imported provenance without re-asserting a discarded claim.                                                                                                    |
| Escaping     | Every report string is escaped for HTML. Backslashes, control, format, surrogate and bidirectional characters are shown as `\u{X}` notation, so a literal escape-looking string remains distinguishable from the character it names. Hostile names and markup remain text in the parsed document.                                                                                                |
| Preview      | The exact document string is rendered in an inert iframe. The print helper verifies the `srcdoc` attribute, the loaded document tree and the frame identity before calling that frame's print method, so an unloaded or stale frame cannot print.                                                                                                                                                |
| Bounds       | The complete UTF-8 document including CSS and markup is checked against 1 MiB before publication. Over-limit output is refused without truncation; JSON and Markdown keep their own independent bounds.                                                                                                                                                                                          |
| Layout       | Light print palette, `@page` margins, fixed-layout wrapping tables, `overflow-wrap: anywhere`, repeated table headers and heading break-avoidance. A single entry taller than a page splits and continues; sections are not blanket-unbreakable.                                                                                                                                                 |
| Invalidation | Live reset, assessment, attachment, permission and context changes; saved deletion, expiry, replacement, unsupported/unreadable rows, selection changes and context loss; import replacement, clear, suspension, disposal and context loss all discard pending or visible output. Saved prepare and delivery re-read the store after the final context check before regenerating or handing off. |
| Outcomes     | Download and print are requests. The interface reports "Download requested" or "Print dialog requested"; it never claims browser acceptance, a completed print, a saved PDF or final disk completion.                                                                                                                                                                                            |

## Deterministic checks

The full suite at clean `6cb16346e153eae4fc1691f2579e9299fb96576a` passes
**672 tests / 2,023,284 assertions across 43 files** and native type checking
passes **101 files**. Focused coverage includes:

- complete document shape, inline style only, absent script/link/image/iframe/
  object/embed elements and absent resource attributes;
- escape of markup, quotes, controls, bidi formatting and lone surrogates;
- empty inventories, absent assessment, unattached diagnostics and preserved
  measured, unrecorded and unavailable states;
- stored changes used verbatim, duplicate-name limitation, full 4,096-code-point
  names and complete 1,000-row/2,000-change output;
- exact 1 MiB refusal without truncation and JSON availability on the same
  snapshot; no local envelope, identifiers, timestamps or context;
- live format selection, exact HTML handoff, print handoff and request-only
  messages, stale print rejection across a deferred permission check, permission
  removal and over-limit refusal;
- saved HTML preview/download/print with fresh storage reads, exact regenerated
  byte comparison and deleted, expired, replaced, private/unknown and busy
  rejection;
- imported HTML preview/download/print, replacement/clear/suspension/context
  invalidation, stale handoff rejection and near-limit over-1-MiB refusal;
- print-frame refusal for missing, mismatched, unloaded and cross-frame
  documents, and server-rendered view checks that the iframe source is escaped
  and print/download controls remain disabled while busy.

Model and server-rendered UI checks are not browser print or PDF evidence.

## Clean browser qualification

All runs used disposable profiles through the repository runners, sequentially,
from clean `6cb16346e153eae4fc1691f2579e9299fb96576a` (`sourceDirty: false`).
Firefox runs install the unmodified development build in a temporary directory.
The Chrome run extracts the validated ZIP. macOS is `darwin arm64`, macOS 27.2.

| Target                                | Driver                     | Result                         | Checks | Report SHA-256                                                     |
| ------------------------------------- | -------------------------- | ------------------------------ | ------ | ------------------------------------------------------------------ |
| Firefox 140.0                         | geckodriver 0.37.1         | passed-with-qualification-gaps | 110    | `eff9d7268af7de7e27eccf021e846e755be0255211adf11ee0c53a58560c2c65` |
| Firefox 153.5.1esr (reported 153.5.1) | geckodriver 0.37.1         | passed-with-qualification-gaps | 110    | `acf1d69fc55ddf80cb78868ba37eb3fa942039a6fc864bf950c34bfeb18391f3` |
| Firefox 158.0.1                       | geckodriver 0.37.1         | passed-with-qualification-gaps | 110    | `3d5dee9d548ae3ef96cf12f1939d8c2c7bf46f3668fcf5c6ff535de891a0685d` |
| Chrome for Testing 156.0.8078.47      | ChromeDriver 156.0.8078.47 | passed-with-qualification-gaps | 101    | `7a812c4ada48614dd78693c9dd3eed803baf7989a87ad8c162a09b27190741e2` |

The Chrome ZIP SHA-256 is
`3c1fed8fcba9ae8779775ec2f4bca4a097e0186cfa1b4cb9e031ebe4b2d925e8`. Raw
reports remain in ignored `.scratch/`: `firefox-evidence-140.0.json`,
`firefox-evidence-153.5.1esr.json`, `firefox-evidence-158.0.1.json` and
`chrome-evidence.json`.

The added checks assert that the preview frame's loaded tree equals a fresh parse
of its exact `srcdoc`, that the parsed document has no script, image, link,
iframe, object, embed, form, input, button or resource attribute, and that the
layout has no horizontal overflow at a 794 px printable width with repeated table
headers and heading break avoidance. Each download produced exactly one generic
`addonray-investigation.html` (or numbered variant) whose UTF-8 bytes equal the
reviewed preview. The Firefox run also prepares, downloads and prints saved HTML
after actual management removal, and the imported flow verifies that replacing
the import discards the previous printable preview.

- Print dispatch in the automated probes is test-instrumented: the test replaces
  the frame's `print` method to record the exact loaded document. It is packaged
  product UI evidence, not native dialog evidence. The native observation below is
  separate.

## Native print and PDF observation

A disposable Chrome for Testing `156.0.8078.47` profile loaded the production
build at clean `6cb16346e153eae4fc1691f2579e9299fb96576a`, imported a report with
a 4,016-code-point name, hostile markup, 90 inventory rows, an empty After
inventory and missing diagnostics, saved it, opened it and prepared the printable
HTML. The exact loaded preview was 28,089 bytes with SHA-256
`25ffe24b3b5286f6878b7f264366903202fe80820eaa95914ea80c6b8c401577`.

The product's **Print / Save as PDF** opened Chrome's print preview for that frame
only, showing **8 pages**, the imported/untrusted label, the long name wrapping
and the empty inventory section. The preview and destination are captured in
`.scratch/native-product4-print-preview.png`. Cancelling the dialog created no
PDF and left the status at the request-only text. A second request, **Save as
PDF**, produced `Saved investigations · AddonRay.pdf` (334,600 bytes, SHA-256
`b498a21277e3dae15bffbc80c6eeac31b49484fc4268920a1756b247f40570bb`) with
`%PDF-1.4` and `/Count 8`. Rendered page 1 contains the report header, imported
provenance and long name; page 2 continues the same entry and shows the hostile
markup as text. PDFKit reports 8 pages and extracted text for each page. The
saved-status wording is
`Print dialog requested. AddonRay cannot observe whether it was printed, cancelled or saved as a PDF.`

Firefox 158.0.1 at `6cb1634` opened its in-tab print preview from the same
product flow, showing **8 sheets of paper**, the exact report, Save to PDF, and
Cancel/Save. Cancel closed the preview, created no PDF, and the product then
showed the same request-only status. The Firefox native save dialog was opened
in an earlier attempt but not completed; a Firefox-produced PDF was not observed.
The evidence is in `.scratch/native-firefox3-print-preview.png` and
`.scratch/native-firefox3-after-cancel.png`.

## Review corrections

- The print adapter originally compared only the `srcdoc` attribute. It now also
  requires a complete `contentDocument`, matching frame identity, the same
  document object and an exactly equal parsed document tree. This rejects an
  unloaded or stale frame.
- The browser helper initially read the frame before its first document root
  existed. It now waits for a complete root and matching frame before reading.
- The automation initially treated escaped text such as `&lt;img src=x` as a
  forbidden ` src=` attribute. The check now inspects the parsed document for
  resource attributes and executable/resource elements instead.
- A probe that left the live or saved exporter on HTML made a later Markdown/JSON
  expectation wait for a textarea that was intentionally absent. The helpers now
  restore the Markdown/JSON default before returning.
- The report serializer and controllers were checked against the approved
  minimized fields and the stored-change rule; no name-based recomputation or
  local envelope field was added.
- CodeRabbit found that a literal `\u{202E}` and an actual U+202E rendered the
  same. The fix at `5f67c0b` escapes literal backslashes as `\u{5C}` and adds a
  regression distinguishing the two. The `6cb1634` suite remained 672 tests and
  did not include that case; the later head's suite is 673 tests and includes it.
  This changes only values containing backslashes; reports without backslashes
  keep the earlier bytes.
- Saved delivery originally validated the record fetched before the final
  asynchronous normal-context check. Another view could delete, delete-all or
  replace the row while that check was pending without a delivered notification,
  and the old object could still publish or hand off. Both prepare and
  download/print now re-read the store after the final context check and validate
  that authoritative snapshot, regenerating and comparing the output with the
  reviewed text. Selection, operation, busy and context checks remain after
  every earlier await. Six deterministic regressions hold the final context
  check after the first read, mutate storage without a hint, release context and
  prove HTML prepare/download/print and JSON prepare/download cannot publish or
  hand off stale content. They fail on the pre-fix head and pass after the fix.
  The code does not trust BroadcastChannel delivery, mutable object identity or an
  expiry-only recheck.

## Retained failures

These iterations remain recorded in ignored `.scratch/`; later passes do not
establish their causes.

| Artifact                                               | Stage                   | Observed failure                                                                                                                         |
| ------------------------------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `.scratch/chrome-evidence-failed-tdz.json`             | printable layout        | `JavascriptError: Cannot access 'document' before initialization` from a test helper's local `const document` shadowing the page global. |
| `.scratch/chrome-evidence-failed-frame-root.json`      | live preview read       | `JavascriptError: Cannot read properties of null (reading 'outerHTML')` before the iframe document root existed.                         |
| `.scratch/chrome-evidence-failed-import-resource.json` | imported preview        | Assertion failure because escaped text ` src=` was treated as a real resource attribute.                                                 |
| `.scratch/chrome-evidence-failed-format.json`          | later live report       | Timeout waiting for `report-text` because the section was left on HTML after the new checks.                                             |
| `.scratch/firefox-evidence-158.0.1-failed-format.json` | imported JSON re-export | Timeout waiting for `saved-json-text` because the library exporter was left on HTML.                                                     |

## Qualification gaps

- No native human browser print observation beyond the recorded disposable
  profiles; no Windows, Linux, non-pinned Chrome or other Firefox distributions.
- Chrome used its pre-granted UI fixture for optional permissions. No authentic
  Chrome optional-management consent is claimed. The saved and imported HTML
  paths request no collection permission and were exercised after Firefox
  management removal.
- Firefox Save-to-PDF completion and a Firefox-produced PDF are unobserved.
  Chrome produced the only observed PDF. One Firefox native save-dialog
  automation attempt was abandoned when focus landed outside the dialog in the
  disposable profile; that profile was discarded and no product defect is
  established.
- Print-dialog cancellation and disk completion cannot be observed by the
  product. The native cancellation observation is external evidence; the
  interface deliberately reports only a request.
- Natural eviction, an actual Chrome quota error and a reachable Chrome private
  main-frame library guard remain the #6 gaps. Hosted CI, the exact-OS matrix,
  retail installation and publication remain release gaps.
- Clipboard (#11), saved-archive Markdown and any PDF library remain out of
  scope. No new runtime, manifest, permission, dependency, target or support
  claim follows from this record.
