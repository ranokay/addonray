# Guided trials local evidence

On 2026-11-11, review runs on macOS 27.2 build 26B123, arm64, exercised
the guided trial on the in-progress source based on `ac77cd8`. The Firefox
160.0 run used geckodriver 0.37.1 and the unmodified product investigation
route with approved optional management access. The Chrome for Testing
156.0.8078.47 run used the labelled pre-granted UI fixture with unchanged
production assets. Both used disposable profiles and controlled fixtures.

The browser checks exercised the Before/After journey, explicit assessment,
independent investigations, unsaved warning, Escape and focus restoration,
simulated quota failure, warning Save, a second archive, assessment edits and
discard. Firefox also exercised cancellation and actual management revocation
while a warning Save was held at an instrumented permission check. Screenshots
of the Firefox and Chrome dialogs were inspected for layout and focus indication. The fixture
uses browser-driver authority for the controlled extension change; the product
does not make or verify that change. Model tests cover pending-save cancellation,
reset, revocation, stale permission results and attachment changes. The quota
error is simulated, not an observed engine quota.

These are local automation results. The investigation launcher is rendered as
a browser tab, and Chrome's UI fixture has pre-granted access. They do not prove
native toolbar-popup or permission-prompt usability, retail installation,
VoiceOver, other OSs, hosted CI or release qualification. Exact final-head gate
and browser-matrix receipts are reported separately from this in-progress run.
