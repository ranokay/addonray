# JSON report export

Status: bounded #8 implementation. Model, controller and UI checks pass locally.
Product browser iteration evidence is recorded below. Clean-source browser runs
and the frozen shared gate will run on the implementation commit; this record is
updated with their exact source and artifact identities before delivery.

This record covers [issue #8](https://github.com/ranokay/addonray/issues/8) under
the approved [saved-investigation and report-exchange contract](../plans/saved-investigation-data-rules.md).
It adds no permission, dependency, browser target, import path, printable HTML,
clipboard action or saved-archive Markdown output. #9 through #11 remain future
work.

## Implemented boundary

| Area          | Behavior                                                                                                                                                                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema        | Schema version 1 with only `schemaVersion`, `provenance` and `report`. The report carries both inventories, precomputed ID-based changes, assessment, optional timing and page-error summaries and observation limits. No envelope, IDs, timestamps, permission metadata, URL, title or context.    |
| States        | Null, measured, unrecorded and unavailable values are copied without coercion. Invalid, non-finite, negative, out-of-range or inconsistent diagnostic values are refused by the same strict report validation used for saved records.                                                               |
| Live export   | The existing report section keeps Markdown as its default and adds an explicit JSON format. Both formats use the same idle completed-pair, snapshot reference, reset generation, operation ticket, normal-window and current-permission checks. Format changes discard a preview.                   |
| Saved export  | An open archive prepares exact JSON with no collection permission. Prepare and download each recheck normal context and the selected record, re-read IndexedDB, reject deleted, expired, unsupported, unreadable or changed records, and compare the fresh serialized bytes with the reviewed text. |
| Invalidation  | Selection changes, lifecycle suspension, deletion, expiry, `pagehide` disposal and context loss discard pending work. Deferred storage reads cannot publish or hand off after invalidation. A remote refresh hint is only a hint; the next output action still re-reads storage.                    |
| Bounds        | Complete UTF-8 JSON at most 1 MiB, 1,000 inventory rows per side, 2,000 changes, 4,096 Unicode code points per string and nesting depth 8. Over-limit output is refused without truncation or repair.                                                                                               |
| Download      | A generic `addonray-investigation.json` UTF-8 download follows an exact read-only preview. Dispatch is a request, not browser acceptance or a completed file. Accepted files can outlive reset, deletion, expiry or view closure.                                                                   |
| Render safety | Hostile names, quotes, backslashes, control escapes, emoji and markup-like text remain JSON string data and textarea text. The interface never interprets reviewed content as markup.                                                                                                               |

## Deterministic checks

The full suite at the dirty implementation head based on
`03eeea705cb8c8a9b6a374b99965c3367f766b90` passes **571 tests / 2,022,626
assertions across 38 files** and native type checking of **87 files**. Focused
coverage includes:

- exact approved JSON fields and omitted local/live fields, duplicate names,
  ID-based changes, observation limits and future-import report shape;
- hostile string round trips, null and diagnostic state preservation, and
  refusal of non-finite, negative, above-range and inconsistent values;
- 1,000-row, 2,000-change, 4,096-code-point and complete 1 MiB accounting with
  no truncation;
- live Markdown default preservation, explicit JSON preparation and handoff,
  format-change invalidation, current snapshot/generation/context/permission
  checks, deferred reset, stale-preview download and bounded over-limit and
  handoff failures;
- saved archive exact preview and handoff, no permission call, private and
  unknown context refusal before storage access, deleted, expired, unsupported,
  invalid and same-key changed records, and deferred prepare/download races for
  cancel, dispose, selection change, context loss, deletion, expiry and library
  busy state;
- read-only escaped rendering and request-only status wording.

Model and server-rendered UI checks are not browser download or native
interaction evidence.

## Browser iteration evidence

All runs used disposable profiles through the repository runners. Iteration runs
were source-dirty at base `03eeea705cb8c8a9b6a374b99965c3367f766b90`; they are
not clean-source qualification.

| Target                           | Result                         | Checks | Report                                   |
| -------------------------------- | ------------------------------ | ------ | ---------------------------------------- |
| Firefox 158.0.1                  | passed-with-qualification-gaps | 95     | `.scratch/firefox-evidence-158.0.1.json` |
| Chrome for Testing 156.0.8078.47 | passed-with-qualification-gaps | 88     | `.scratch/chrome-evidence.json`          |

The reports record the observed browser/driver/OS identity, source commit,
dirty flag, controlled fixture authority, download directory and every check.
The added checks compared the exact reviewed preview with one newly completed
JSON file, asserted schema and report field sets, confirmed omitted fixture IDs
and internal labels, and preserved request-only product wording.

The Firefox run also prepared and downloaded saved-archive JSON after actual
optional management removal, then asserted management remained absent.

## Retained failures

The following Firefox 158.0.1 iteration failures are preserved. Later passing
runs do not establish their causes.

| Report                                                               | Stage                       | Observed failure                                                                                                                                                                                         |
| -------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.scratch/firefox-evidence-158.0.1-failed-markdown-name.json`        | 16 checks, report phase     | `AssertionError: Report must include the fixture name`. The new hostile fixture name is escaped inside the Markdown code span; the probe compared the unescaped name.                                    |
| `.scratch/firefox-evidence-158.0.1-failed-json-before-snapshot.json` | 20 checks, live JSON phase  | `TimeoutError: The browser did not create one complete JSON file with the reviewed UTF-8 bytes`. The helper snapshotted the download directory after dispatch, so a fast completion looked pre-existing. |
| `.scratch/firefox-evidence-158.0.1-failed-saved-change-case.json`    | 23 checks, saved JSON phase | `AssertionError: Expected values to be strictly equal: 'enabled' !== 'Enabled'`. The probe passed the UI label case into the lowercase schema field.                                                     |

An earlier Firefox 158.0.1 iteration timed out after three checks while the
popup search still used the previous fixture name. Its JSON report was overwritten
before retention; only the terminal timeout message and observed check count
survive. The fixture search text was corrected, and the retained reports above
begin after that run.

## Qualification gaps

- Clean-source four-pin reruns and the frozen shared gate are recorded in the
  final task receipt and replace the dirty iteration table above.
- No native human download observation, Save As, cancellation or retail
  installation is claimed. Automatic-download test preferences choose the
  destination and MIME handling.
- The Chrome pre-granted UI fixture cannot exercise saved-archive export after
  optional management removal. That path is observed only on Firefox.
- Private and unknown saved/concurrent exchange contexts, the exact hosted
  OS/architecture matrix, natural eviction, an actual Chrome engine quota error
  and a reachable Chrome private main-frame library guard remain open.
- JSON import, printable HTML, clipboard and saved-archive Markdown output are
  later tickets and are not qualified here.
