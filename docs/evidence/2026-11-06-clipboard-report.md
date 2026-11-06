# Clipboard report (#11)

Status: bounded #11 implementation qualified from clean
`eec3a2d84196dd3d935552c6d4352d04eb402e77` on macOS 27.2 arm64. A later
documentation-only head requires its own frozen gate and browser matrix receipt.
The
permission-free gate passed before product wiring. Deterministic checks, native
type checking, one clean Chrome run and three clean Firefox product runs pass.
Headful product runs on Firefox 158.0.1 and Chrome for Testing 156.0.8078.47
verified the exact copied text against the host system clipboard, including
denial and unavailable outcomes. This record adds no permission, dependency,
automatic copy, background clipboard access, browser target or support claim.

This record covers [issue #11](https://github.com/ranokay/addonray/issues/11)
under the approved
[saved-investigation and report-exchange contract](../plans/saved-investigation-data-rules.md)
and its Formats, SRD-19 and SRD-20 rules.

## Permission-free feasibility gate

The gate ran before any product wiring. A test-only writer fixture declared **no
clipboard permission**. A separate reader fixture declared `clipboardRead` only
as test readback authority. Neither fixture, nor either manifest, is part of the
product or source package.

The selected mechanism is `navigator.clipboard.writeText` inside the explicit
copy click. It uses the browser's transient user activation and requests no
`clipboardWrite` permission. `document.execCommand('copy')` also resolved in the
same probes but is not used: it is deprecated and was not needed.

| Target                           | Guardian-style write after awaits | Exact 1 MiB write | No-activation policy                             | Restored prior clipboard |
| -------------------------------- | --------------------------------- | ----------------- | ------------------------------------------------ | ------------------------ |
| Firefox 140.0                    | resolved, ~263 ms, activation yes | exact hash        | `NotAllowedError`, clipboard unchanged           | yes                      |
| Firefox 153.5.1esr               | resolved, ~258 ms, activation yes | exact hash        | `NotAllowedError`, clipboard unchanged           | yes                      |
| Firefox 158.0.1                  | resolved, ~262 ms, activation yes | exact hash        | `NotAllowedError`, clipboard unchanged           | yes                      |
| Chrome for Testing 156.0.8078.47 | resolved, ~256 ms, activation yes | exact hash        | permitted and clipboard changed (browser policy) | yes                      |

The guarded case awaited current-tab reads and a 250 ms delay before the write.
The delay is diagnostic, not a product requirement. The actual production guard
flow is exercised by the packaged product checks below. A no-activation denial
is not required where a browser legitimately permits the write; the table
records each browser's observed policy instead.

Raw reports (ignored `.scratch/`):

| Report                                          | SHA-256                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `clipboard-feasibility-firefox-140.0.json`      | `8bdb4bf0c71cac7d554ae4b604a9e8a3a93ec76ba2ba96f7773274a0415744be` |
| `clipboard-feasibility-firefox-153.5.1esr.json` | `392eec89146de603ee225a531daabb071990cc2efe70b7d367d538a7422b23f9` |
| `clipboard-feasibility-firefox-158.0.1.json`    | `e710db5a9dfcae6603b5861f2ea1c6c451a5b7620771c8bd6a6399151879df38` |
| `clipboard-feasibility-chrome.json`             | `584404f0dc7bcd7573f4982ea3ee17868480803ce4e2d121253d367c01bb476b` |

## Implemented boundary

| Area           | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Action         | Explicit **Copy Markdown** only. No automatic, scheduled, background or cross-view copy. No manifest permission change; the product manifest remains `activeTab` with optional `management` and `scripting`.                                                                                                                                                                                                                                                                                                                                    |
| Representation | Live clipboard text is the existing reviewed Markdown report. Saved archives and unsaved imported reports have a new provenance-aware Markdown review generated from the stored `SavedReport`; it is not a copy of the JSON or printable HTML source. No saved or imported Markdown download was added.                                                                                                                                                                                                                                         |
| Review         | Each entrypoint shows its own labelled **Exact Markdown clipboard review** before the action. Live uses the existing Markdown textarea; saved and imported use a copy-only Markdown format choice with a read-only textarea.                                                                                                                                                                                                                                                                                                                    |
| Disclosure     | The interface names the **system clipboard** as the destination and states that other applications and people can read it and that AddonRay cannot recall or erase copied content. The copied Markdown also states that copied, downloaded or printed content is outside AddonRay's control.                                                                                                                                                                                                                                                    |
| Content        | Only the approved report fields: provenance, both inventories, the stored precomputed ID-based changes, assessment, optional timing and page-error summaries, observation limits and fixed limit text. No extension IDs, record IDs, timestamps, page or browser context, permission or host metadata. Imported provenance and an unauthenticated file claim are labelled honestly.                                                                                                                                                             |
| States         | Empty inventories, absent assessment, unattached diagnostics and measured, unrecorded and unavailable milestones stay explicit. Stored changes are used verbatim and never recomputed from names. Duplicate names remain indistinguishable and the limit is stated.                                                                                                                                                                                                                                                                             |
| Escaping       | Names and versions render in Markdown code spans. Backticks, backslashes, quotes, controls, format characters, lone surrogates and line separators use Unicode escape notation, so copied text cannot close a code span or masquerade as different content.                                                                                                                                                                                                                                                                                     |
| Bound          | The live serializer and the new saved/imported Markdown renderer both cap the complete UTF-8 text at 1 MiB. The clipboard adapter rechecks the exact UTF-8 bytes before the platform call. No operation truncates.                                                                                                                                                                                                                                                                                                                              |
| Guards         | Live copy reuses the idle completed-pair, snapshot reference, reset generation, exclusive activity lease, normal-window, current-permission and freshness checks. Saved copy re-reads IndexedDB before and after the final context check, compares the fresh Markdown with the reviewed text, and rejects deleted, expired, unsupported, unreadable, replaced, busy or non-normal state. Imported copy uses the held content, normal-window and replacement/clear/suspension checks; it reads no storage and requests no collection permission. |
| Outcomes       | Success is published only after `writeText` resolves. Denied, unavailable and ordinary failures have separate bounded messages. The reviewed preview is preserved on ordinary failure, denial and unavailability. After the write resolves, a stale permit suppresses success and content restoration. A browser-accepted clipboard write is treated as outside recall; AddonRay never claims it can cancel or erase it.                                                                                                                        |
| Staleness      | Model tests resolve a deferred write after reset, record replacement or selection deletion and assert that no success or preview restoration appears. The platform write itself is not cancellable; the controller only suppresses stale status. The cleanup of the reviewed text in pending permits remains unchanged.                                                                                                                                                                                                                         |

## Deterministic checks

The full suite at clean `eec3a2d` passes **701 tests / 2,023,426 assertions
across 45 files** and native type checking of **105 files**. Focused coverage
includes:

- adapter success only after resolution, exact 1 MiB acceptance, one-byte-over
  refusal, UTF-8 byte accounting, denial, unavailable, generic failure and no
  error-detail leakage;
- Markdown provenance for captured and imported content, unauthenticated file
  claims, omitted local identifiers and timestamps, stored-change verbatim use,
  duplicate names, all missing states, hostile code-span escaping and 1 MiB
  over-limit refusal without truncation;
- live copy after the async context/permission checks, exact handoff text,
  JSON/HTML copy refusal, deferred success, denial preservation, thrown failure
  and reset during a write suppressing success or restored preview;
- saved Markdown preparation, copy-only behavior with no download, fresh storage
  reads, exact regenerated comparison, deferred success, denial preservation and
  deletion during a write suppressing success;
- imported Markdown preparation, imported provenance and claim retention,
  copy-only behavior, deferred success, denial preservation, replacement during
  a write and no copy from the HTML preview;
- server-rendered view checks for the labelled exact Markdown review, system
  clipboard and outside-recall disclosure, copy actions only in Markdown format
  and no copy controls for JSON or printable HTML.

Model and UI checks are not browser clipboard evidence.

## Clean browser qualification

All runs used disposable profiles through the repository runners, sequentially,
from clean `eec3a2d` (`sourceDirty: false`). Firefox runs install the unmodified
development build in a temporary directory. Chrome extracts the validated ZIP.

| Target                                | Driver                     | Result                         | Checks | Report SHA-256                                                     |
| ------------------------------------- | -------------------------- | ------------------------------ | ------ | ------------------------------------------------------------------ |
| Firefox 140.0                         | geckodriver 0.37.1         | passed-with-qualification-gaps | 116    | `211a6e4880be507090c4118f62fe3224376d69f970af3b686d166185ff610d15` |
| Firefox 153.5.1esr (reported 153.5.1) | geckodriver 0.37.1         | passed-with-qualification-gaps | 116    | `29268916c570fd79662e506c16e037b91ea0577fd0597157bfe5b8031b8ee685` |
| Firefox 158.0.1                       | geckodriver 0.37.1         | passed-with-qualification-gaps | 116    | `d3046eaff53cb3d1f9430b64aed95b667cd830849fab84792e8f81d05bbc16ae` |
| Chrome for Testing 156.0.8078.47      | ChromeDriver 156.0.8078.47 | passed-with-qualification-gaps | 106    | `bbe7396342cb4e301ceac734fa935fc52783b2704b06e5dcf59360acd10e8292` |

Each browser run copies the live Markdown, an open saved archive's Markdown and
an unsaved imported report's Markdown. A separate test-only reader fixture reads
the clipboard back and asserts exact text, byte length and SHA-256 against the
reviewed preview. The saved flow copies both before and after actual management
removal. Firefox also performs a real synthetic no-activation copy: the browser
denies it, the product reports the denial and the preview remains. Chrome's
no-activation attempt legitimately succeeds, so its denial handling is exercised
with a deterministic injected `NotAllowedError`. Unavailable is injected last in
the imported document; the product reports it and preserves the review. The
reader/writer fixtures use test-only authority and are generated in ignored
scratch space.

Exact Firefox copied content at `eec3a2d`:

| Output                   | Bytes | SHA-256                                                            |
| ------------------------ | ----- | ------------------------------------------------------------------ |
| Live Markdown            | 5,488 | `d99a806b02cef35cbbdadbaac3658af66d02a5654a49aa4b064a946eb9875663` |
| Saved archive Markdown   | 6,248 | `133c4374ef4bbe64bce5be6d7238580a64da590082a7c825c1dfda949fc506d8` |
| Imported report Markdown | 5,225 | `45b702d9c45629f30eecee89e3e1538ddafc24fb12813373c45326a6c1342535` |

Chrome copied 5,494 bytes of live Markdown
(`7ad6b372f200bd1627c4499219059a6c2c5a811cb683ad1232fb82987aa816c2`) and
6,254 bytes of saved Markdown
(`852bb189a2dc328b28f897c1f69f9bc4fcc63b6c1235eeb87eb0161921fd9b8c`).
Its imported Markdown matched the 5,225-byte Firefox hash. The different live
and saved sizes reflect the fixture extension count in each browser, not a
format difference.

## Headful system-clipboard observation

Two disposable headful runs repeated the same packaged product flows and read
the host clipboard with `pbpaste` after each copy. Both runs matched the
reviewed preview byte for byte and restored the empty preexisting clipboard
afterward.

| Target                           | Outputs verified      | System clipboard     | Report SHA-256                                                     |
| -------------------------------- | --------------------- | -------------------- | ------------------------------------------------------------------ |
| Firefox 158.0.1                  | live, saved, imported | exact, then restored | `f5f3747acc2d4954d4681501c3d657ddf54dfdea4d227cb1aa790014ee43a228` |
| Chrome for Testing 156.0.8078.47 | live, saved, imported | exact, then restored | `8d1aa8e0bb48c52b1be79087cbc4b0ee349ad1bc8babd2a1832b1d414ea4e003` |

Firefox's synthetic no-activation copy produced
`Clipboard access was denied by the browser. The report was not copied.` with the
reviewed Markdown still in place. Chrome's synthetic no-activation copy was
permitted by the browser; the injected rejection path then produced the same
bounded denial. The injected unavailable path produced
`Clipboard writing is unavailable in this browser. The report was not copied.`
and preserved the review in both browsers.

The exact status and preview are visible in `.scratch/native-clean-firefox/` and
`.scratch/native-clean-chrome/` screenshots (`01`–`06` Firefox, `01`–`05`
Chrome). The copied text is the exact reviewed document, including the imported
untrusted-provenance label and hostile names shown as literal code-span text.

## Review corrections

- The first product probe opened the test reader tab immediately before each
  trusted copy click. Firefox then treated the imported copy as lacking
  activation. The session now captures the preexisting clipboard once and does
  not switch tabs before a copy action. No product guard was weakened.
- The first denial/unavailable injection left the page's clipboard view modified
  for later flows. Rejection handling is now verified once, as the final
  clipboard action in a document, and the shared success flows do not inject
  platform state.
- The unavailable simulation originally replaced `navigator.clipboard`; Firefox
  did not restore it predictably. It now removes only the `writeText` function,
  which the adapter already treats as unavailable, and runs last.
- Test clipboard restoration now happens while the product window still exists
  and reports the restored hash. The earlier cleanup ran after the owning window
  had closed.
- The saved and imported Markdown views were added as copy-only formats so a
  clipboard review cannot be inferred from the JSON or printable HTML preview.

## Authority limits and gaps

- Qualified locally on macOS 27.2 arm64 only. Windows, Linux, other macOS
  releases, retail installations and other browser versions remain unqualified.
- Firefox 153.5.1esr reports `153.5.1`; the requested ESR label is recorded but
  the browser does not expose the `esr` suffix in the version capability.
- Chrome uses the named pre-granted UI fixture with unchanged production assets;
  native optional-management consent is separate evidence. The Firefox run uses
  an actual approved optional management grant.
- The no-activation result is browser policy: Firefox denies it; Chrome's focused
  extension page permits it. The product does not require denial and always
  reports the actual outcome.
- Denial on Chrome and unavailable on both browsers use deterministic injected
  platform state at the end of the imported flow. They exercise the real
  controller, adapter, preview and status rendering, not native browser policy.
- A platform clipboard write that is already in flight is not cancellable.
  Stale success suppression is model-tested across reset, replacement and
  deletion; no browser probe delayed a real platform write across a deletion.
- The browser probes did not produce a maximum-size product report. The 1 MiB
  exact write is feasibility evidence; the adapter boundary and renderer refusal
  are model-tested. No truncation path exists.
- The reader fixture's `clipboardRead` authority is test-only and generated in
  ignored scratch space. It is not in either package or the source archive.
- Clipboard content is outside AddonRay's recall. The evidence does not claim
  forensic erasure, OS clipboard history control or availability of the copied
  text after the view closes.
- Headless browser checks and headful system-clipboard checks are separate
  evidence. The headful runs still use Selenium clicks, not human keyboard or
  screen-reader observation.

## Source record

- [Issue #11](https://github.com/ranokay/addonray/issues/11), read live on
  2026-11-06.
- [Saved-investigation and report-exchange contract](../plans/saved-investigation-data-rules.md),
  Formats and SRD-19/SRD-20.
- [Printable HTML evidence](2026-11-06-printable-report.md), whose representation,
  guard and evidence pattern this slice follows.
- Reviewed product code: `lib/report-clipboard.ts`, `lib/report-markdown.ts`,
  `lib/report-export.ts`, `lib/saved-export.ts`, `lib/import-output.ts` and the
  three report views.
