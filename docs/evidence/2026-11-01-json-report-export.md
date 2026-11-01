# JSON report export

Status: bounded #8 implementation qualified from clean
`4b51bc6bc5945dbadae4cabfb2822ab3231fd1d9`. Deterministic checks, native type
checking, four clean product browser runs and the frozen shared gate pass. The
clean runs and gate receipt are recorded below. This record adds no permission,
dependency, browser target, import path, printable HTML, clipboard action or
saved-archive Markdown output. #9 through #11 remain future work.

This record covers [issue #8](https://github.com/ranokay/addonray/issues/8) under
the approved [saved-investigation and report-exchange contract](../plans/saved-investigation-data-rules.md).

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

The full suite at clean `4b51bc6bc5945dbadae4cabfb2822ab3231fd1d9`
passes **575 tests / 2,022,641 assertions across 38 files** and native type
checking passes **87 files**. Focused coverage includes:

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

## Review corrections

- The saved preview now revalidates the held record and its serialized identity
  after the final context await and immediately before publication. A deferred
  context/clock test advances past `expiresAt` while that await is pending and
  proves no preview appears.
- Every asynchronous continuation checks the operation ticket, permit identity
  and current selection before it mutates state. A failed private or unknown
  context result from an obsolete prepare or download cannot clear a newer
  preview. Obsolete operations do not read storage or issue a second context
  call after cancellation.
- Download re-reads storage, then compares the exact freshly serialized document
  with the reviewed text before the synchronous handoff. A deletion, expiry or
  same-key replacement between preview and download fails without requiring a
  delivered refresh hint.
- The Markdown probe again compares the complete fixture name after its required
  quote and backslash escapes. The expected escaped value is declared
  independently next to the hostile fixture. The original full-name failure
  remains recorded below.
- Storage ordering: IndexedDB `get` returns one immutable record snapshot.
  Prepare validates that exact snapshot after its last await and publishes no
  later than the same task. A concurrent delete or replacement cannot rewrite
  the held object; the next output action re-reads storage and compares the
  exact serialized document before handoff. There is no atomic read-to-UI or
  read-to-download transaction, and this record does not claim one.

## Clean browser qualification

All runs used disposable profiles through the repository runners, sequentially,
from clean `4b51bc6bc5945dbadae4cabfb2822ab3231fd1d9` (`sourceDirty: false`).
Firefox runs install the unmodified development build in a temporary directory.
The Chrome run extracts the validated ZIP. macOS is `darwin arm64`.

| Target                                | Driver                     | Result                         | Checks | Report SHA-256                                                     |
| ------------------------------------- | -------------------------- | ------------------------------ | ------ | ------------------------------------------------------------------ |
| Firefox 140.0                         | geckodriver 0.37.1         | passed-with-qualification-gaps | 95     | `dae5c01a95fa3ea779e4a3e64d3547f6f6d329d7d95238a7a0ad4f6daf237d84` |
| Firefox 153.5.1esr (reported 153.5.1) | geckodriver 0.37.1         | passed-with-qualification-gaps | 95     | `6e0418b790eca48b6fea849dcc8251ceeffa90278655521f1f986aac8e7e6347` |
| Firefox 158.0.1                       | geckodriver 0.37.1         | passed-with-qualification-gaps | 95     | `cb86b8c843b10de5e45f4dae0d0b8a6f69a5e28fbad2c4335ae363e4074d7416` |
| Chrome for Testing 156.0.8078.47      | ChromeDriver 156.0.8078.47 | passed-with-qualification-gaps | 88     | `d78cc8e8e0c6753c036c2d3355b53f00b46fa5e33ad9e705648069d383831183` |

The Chrome ZIP SHA-256 is
`003e3307d36512628470b070b936463587407eeb936dbd8a1e07df1611a6e73a`. The Firefox
temporary-directory installation has no archive hash. Raw reports remain in
ignored `.scratch/`: `firefox-evidence-140.0.json`,
`firefox-evidence-153.5.1esr.json`, `firefox-evidence-158.0.1.json` and
`chrome-evidence.json`. Runner logs are `firefox-140-clean.log`,
`firefox-153.5.1esr-clean.log`, `firefox-158.0.1-clean.log` and
`chrome-clean.log`.

The three JSON checks on every Firefox target and the two on Chrome passed with
exact byte equality. On Firefox, the hostile fixture name produced a 1,340-byte
JSON document with SHA-256
`906ee92fa7cbeec850aa8e77fa13a10a24c36a9a9b012077e98a0aa6c820bf08` for the live,
saved and post-management-removal exports. The live export created a fresh
generic filename; later saved exports observed `addonray-investigation(1).json`
and `addonray-investigation(2).json`. Chrome produced 1,346 bytes with SHA-256
`b3a6513321be574beee2ddf4bd090efa8f468a97abc853c1c26c05c69c717aea`; its second
saved export reused the generic filename and was accepted only because its
modification time advanced from `1793497202921196667` to
`1793497203893482821` ns. Firefox exports all had new filenames and no previous
same-name artifact; their observed modification times are recorded per check in
the raw reports. Every observed file was new or newer than the
pre-dispatch snapshot, used the generic filename or a numbered variant, was the
only changed matching file, and matched the reviewed bytes. Partial files and
unrelated JSON files never satisfied the check.

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

- The clean four-pin browser runs above pass. The frozen shared gate for the
  final documentation head is recorded in the task receipt; a documentation
  change does not alter packaged product bytes.
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
