# Previewed investigation report export qualification

The approved [P3A contract](../plans/phase3-report-export.md), including Q12,
is implemented. This record separates working-tree checks and native
observations from the forthcoming clean implementation and hosted results.
Signed delivery is incomplete until those exact-head checks and downloaded
reports are verified. No release-support, store or signing gate is closed.

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
final source identities must be checked separately.

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
controlled-evidence directories. Product inputs must match the eventual clean
source before reusing these dirty-native observations.

Automatic-download preferences/CDP settings selected the destination. Native
Save As and download cancellation under default user settings were not observed.
These were inventory-only native reports; actual attached diagnostic exports
were not newly observed in native UI. Their content is covered by serializer
tests alongside existing attachment qualification. No complete accessibility or
other-OS native verdict follows from the keyboard checks.

## Remaining delivery and release boundaries

Clean frozen shared checking, both source rebuilds, all three packaged local
Firefox versions, Chrome and the exact-head hosted matrices remain required for
signed private delivery. Every later documentation delivery head needs its own
hosted verification; earlier results cannot qualify a newer SHA.

Authentic private/unknown export guards, default download settings, full
accessibility, native Linux/Windows, retail installation, signed distribution
and store publication remain release gates. No new browser target, history,
clipboard action, background owner, collector or permission has been introduced.
