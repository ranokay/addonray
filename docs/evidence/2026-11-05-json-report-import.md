# JSON report import

Status: bounded #9 implementation and local qualification. The strict parser,
import controller, record envelope and library UI are covered by deterministic,
server-rendered and production file-input checks. This record adds no permission,
dependency, browser target, support, publication or visibility change.

This record covers [issue #9](https://github.com/ranokay/addonray/issues/9) under
the approved [saved-investigation and report-exchange contract](../plans/saved-investigation-data-rules.md).

## Implemented boundary

| Area            | Behavior                                                                                                                                                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Selection       | The library document exposes one explicit JSON file input. A file above 1 MiB is rejected before its bytes are read. Accepted bytes must decode as complete UTF-8 before parsing. No filename or path is stored or rendered.                                                                                                                           |
| Strict parser   | A bounded recursive-descent parser replaces permissive `JSON.parse` at the boundary. It rejects malformed JSON, duplicate decoded object keys, `__proto__`, `prototype` and `constructor` at every level including escaped spellings, non-finite numbers, trailing content and nesting depth over 8 while reading.                                     |
| Schema          | Only `schemaVersion: 1`, `provenance: captured` or `imported`, and the exact `report` object are accepted. Unknown fields at every level, wrong types and invalid state/count/duration combinations are rejected. Inventory rows are limited to 1,000 per side, changes to 2,000 and strings to 4,096 code points.                                     |
| State           | Null, measured, unrecorded and unavailable states are copied without coercion. The precomputed change list is retained rather than recomputed from names. An existing exact JSON export re-imports for read-only inspection.                                                                                                                           |
| Import review   | A valid file opens as an explicitly labelled **Imported report** in read-only view memory. Hostile names and markup-like text render as escaped text. Import makes no inventory, page, collector, source-tab or permission call and cannot attach to a live investigation. Import alone persists nothing.                                              |
| Provenance      | The file's `provenance` is descriptive only. A file claiming `captured` is still stored locally with `origin: imported` and never becomes a local capture. Re-export uses the local origin.                                                                                                                                                            |
| Separate save   | **Save imported report** writes through the existing store transaction with local `importedAt`, `savedAt`, 7/30/90-day retention (default 30) and `origin: imported`. The existing 50-record, 5 MiB total and 1 MiB complete-record limits apply. A report whose envelope would exceed 1 MiB is view-only; no partial record or truncation is written. |
| Context         | Import and save require a verified normal window. Private, unknown and lost contexts fail closed; the library hides import when its context check is denied. Import requires no collection permission and no storage availability. Storage failure affects only the separate save and preserves the imported view.                                     |
| Invalidation    | Clear, replacement, suspension, disposal, context loss and deletion-epoch changes invalidate pending file reads or saves. A save that began before a delete cannot commit after the deletion epoch advances. Ordinary validation, file-read or storage failures preserve the current valid imported view where applicable.                             |
| Report exchange | Re-export reuses the existing exact schema version 1 serializer and download path. It keeps imported provenance and omits `recordId`, `savedAt`, `expiresAt`, `importedAt`, extension IDs, page and browser context.                                                                                                                                   |

## Deterministic checks

The final implementation head is signed
`113026ba7f27ce330455e1439f0713778097f5ed`; the earlier implementation commits
are `34f344d072fffbfd24600cea62b549eac2ac7033` and
`b0cdc7504effde05d1a1f56b07fb8c7a78aaf122`. The frozen shared gate passes
**620 tests / 2,022,958 assertions across 40 files** and native type checking of
**91 files**. Focused coverage includes:

- 1 MiB rejection before reading or parsing, incomplete UTF-8, empty,
  malformed, trailing and multiple-document input;
- duplicate decoded keys, escaped duplicate keys and escaped forbidden property
  names at top level and nested levels;
- unknown fields at every schema level and wrong scalar, object and array types;
- non-finite numbers, negative and above-range `milliseconds`, above-range
  `observedMs`, inconsistent totals and invalid finish/count/duration
  combinations;
- 1,000-row, 2,000-change, 4,096-code-point and depth-8 boundaries, including a
  4,096-emoji string accepted by code-point count;
- accepted-export round trip, preserved null/measured/unrecorded/unavailable
  states and a precomputed change list unrelated to the retained names;
- explicit selection, no storage or permission call on import, private/unknown
  refusal before file reading, preserved view after hostile files and retry;
- import replacement, lifecycle suspension and disposal during file reads,
  context loss during a read, storage unavailability limited to save, ordinary
  save failure and retry;
- save with imported origin, import-time `importedAt`, save-time `savedAt`,
  7/30/90-day retention, no filename, no imported envelope fields in exchange
  JSON and imported-provenance re-export;
- deletion-epoch changes while a save is pending, no resurrection, no committed
  save after disposal, and no in-flight save replacement by a later selection;
- view-only accounting for an accepted near-limit file whose stored envelope
  exceeds the 1 MiB record cap;
- SSR checks for the file input, **Imported report** label, escaped hostile
  text, separate save disclosure, view-only disablement and denied-context
  hiding.

Model and server-rendered UI checks are not browser file-selection evidence.

## Review corrections

- The strict parser owns duplicate and prototype-key rejection rather than
  relying on `JSON.parse`: duplicate keys would otherwise be silently collapsed
  and prototype keys materialized before a reviver.
- Depth is checked in `parseValue` before recursive descent and decoded object
  keys are checked before assignment and duplicate detection.
- HTML-like strings are accepted as strings and rendered as text; they are not
  treated as executable content by the parser or the view.
- The imported record envelope requires `importedAt` only for `origin:
imported`; existing captured records without it remain readable.
- Import was separated from storage: file validation and review do not open
  IndexedDB. The save controller reads the store identity/epoch only for the
  separate explicit save.
- A later UI guard hides the import section when the library's normal-context
  check is denied, in addition to controller fail-closed checks.
- Duplicate DOM heading identifiers were removed by parameterizing the shared
  report detail component for imported and saved views.

## Browser qualification

Runs used disposable profiles through the repository runners, sequentially,
from clean `113026ba7f27ce330455e1439f0713778097f5ed`
(`sourceDirty: false`). Firefox used the unmodified development build in a
temporary directory; Chrome extracted the validated ZIP. macOS is
`darwin arm64`.

| Target                                | Driver                     | Result                         | Checks | Report SHA-256                                                     |
| ------------------------------------- | -------------------------- | ------------------------------ | ------ | ------------------------------------------------------------------ |
| Firefox 140.0                         | geckodriver 0.37.1         | passed-with-qualification-gaps | 100    | `d3158d647d51efb234c6dd9c090767e5f94bf82f630e351ba3e562b1de3bad3d` |
| Firefox 153.5.1esr (reported 153.5.1) | geckodriver 0.37.1         | passed-with-qualification-gaps | 100    | `b09fdd0cc4ef74145a3533249caec89db5d8e8229246b43d30def0b5c0627c84` |
| Firefox 158.0.1                       | geckodriver 0.37.1         | passed-with-qualification-gaps | 100    | `788c7bd3fb41c289697981f15af4a2b6fa75b67ff7f22fec18b777fa760ec4ff` |
| Chrome for Testing 156.0.8078.47      | ChromeDriver 156.0.8078.47 | passed-with-qualification-gaps | 93     | `bac5853e240d8c4e846f5ec00ae5393edeba839b8c564ce7477302d44293afc9` |

Raw reports remain in ignored `.scratch/`:
`firefox-evidence-140.0.json`, `firefox-evidence-153.5.1esr.json`,
`firefox-evidence-158.0.1.json` and `chrome-evidence.json`.

Each target passes five added production file-input checks:

1. explicit selection renders the **Imported report**, keeps markup-like text
   inert, stores no record and exposes no filename;
2. `pagehide`/`pageshow` suspension clears and does not restore the imported
   view;
3. five hostile files are rejected without replacing the previous view or
   writing a record: duplicate key, escaped `__proto__`, unknown nested field,
   incomplete UTF-8 and an over-1 MiB file;
4. a replacement valid file saves with imported origin, local `importedAt`,
   seven-day retention and exact imported-provenance JSON re-export/download;
5. a valid 1,048,516-byte file is inspectable but view-only because its stored
   envelope would exceed 1 MiB, and saves no record.

Every target produced the same 815-byte re-export with SHA-256
`99235b4b8924d53d794d6fc6e947ef00ce3fe16ece4e4ce9934d1a26307c91e3`,
equal to the downloaded file. The saved record reported `origin: imported`, a
safe-integer `importedAt`, no filename and a seven-day `expiresAt - savedAt`
delta. Firefox ran the import checks after actual optional management removal;
import and re-export neither requested nor restored collection access. Chrome
ran them through its named pre-granted UI fixture with unchanged production
assets.

Package identities at clean `113026b` are Firefox XPI SHA-256
`1f62da8c1cc44fa180d6eb942084332e80c70af32a77c313e5b33b2ce18cf099`,
Chrome ZIP SHA-256
`52913effa7d2ac6a935c0bea3d02e9aa5e7c6592b94a41f0fd2a21b3d14893a8`, and source
archive SHA-256
`e9777625c403081b5c7569a2fae4ad32bf8daa5273a1276474dc1846235c6236`.

The frozen shared gate receipt for `34f344d` is
`.local/state/agent-tools/gates/20261104T230646Z-1c11066af7a7.json`; the final
head requires its own frozen gate before delivery, recorded in the supervise
thread.

## Gaps

- The file-picker interaction is automated through Selenium's production file
  input, not a native human selection, cancellation or accessibility
  observation.
- The authentic private import action is model-tested and the library
  denied-context view is SSR-tested. The Chrome private main-frame library route
  remains browser-policy-blocked, so private import is not exercised end to end
  in Chrome.
- The hostile-file set is fixed and boundary-directed, not a general fuzzing
  campaign.
- Only macOS arm64 is locally observed. Linux, Windows, exact-OS hosted runs,
  retail installation, signed distribution and store qualification remain
  open.
- Import does not qualify native file dialog behavior, browser download
  cancellation, printable HTML or clipboard.
