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

The review fix for the preservation marker uses a non-owning reference to the
exact saved snapshot. A reset, revocation, edit or disposal cannot leave the
marker owning old observations, and a late save cannot mark a replacement trial.
Focused model tests cover those transitions. The reference does not replace the
existing cancellation or storage guards.

The later dialog-cleanup correction was reviewed locally from the working tree
based on `51f9498`. Firefox 160.0 with geckodriver 0.37.1 passed 113 checks on
the unmodified product route. A test-only programmatic assessment change while
Save was held at a permission check closed the warning, cancelled the Save and
left archives unchanged. Chrome for Testing and ChromeDriver 156.0.8078.47
passed 103 checks using the pre-granted UI fixture. These were macOS 27.2 arm64
runs; the Chrome run did not exercise that Firefox-only state-change probe.

The subsequent preservation and cancellation fixes were exercised on the
working tree based on `2455c6b`: Firefox 160.0 and geckodriver 0.37.1 passed
117 checks on macOS 27.2 arm64. These included an instrumented held Save,
its success and quota-failure paths, a cancelled archive check, and deletion
of saved archives before Start over. Chrome for Testing and ChromeDriver
156.0.8078.47 passed 104 checks with the pre-granted UI fixture. The held
permission, context and quota failure were test instrumentation; they do not
establish native prompt or natural engine-quota behavior.

These are local automation results. The investigation launcher is rendered as
a browser tab, and Chrome's UI fixture has pre-granted access. They do not prove
native toolbar-popup or permission-prompt usability, retail installation,
VoiceOver, other OSs, hosted CI or release qualification. Exact final-head gate
and browser-matrix receipts are reported separately from this in-progress run.
