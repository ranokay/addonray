# First inventory slice evidence

## Source and scope

The user selected prototype A with a dark/black theme by default. Signed implementation commit `a80125bf7c900c009060504da0862be9f61a008b` rewrites that layout for production. The [three-variant prototype](https://github.com/ranokay/addonray/tree/prototype/inventory-popup) stays outside `main`. [Issue #1](https://github.com/ranokay/addonray/issues/1) records the verdict and implementation contract.

The implementation adds local search, All/Enabled/Disabled filtering, expandable permission explanations, unknown-metadata handling, and manual Firefox-controls guidance. It adds no browser permissions, persistence, remote resources, or cross-extension control. Popup memory remains the session boundary.

## Deterministic and independent checks

The shared check passed with 37 behavior tests and 76 assertions, native Bun format/lint/types, packaging and permission-budget validation, and jactionlint. Eleven new cases cover literal search, combined filters, metadata distinctions, explanation fallbacks, and escaped text. [Quality CI](https://github.com/ranokay/addonray/actions/runs/39865658206) passed at the implementation commit.

An independent static review of the production diff against `2a36426824b8db9163ed562bfb3693afc5de942f` found no actionable issues. It examined scope, privacy, filtering, lifecycle, tests, native controls, and dark styling. It did not run browser tasks or establish accessibility qualification. The earlier prototype review attempt that reached a usage limit remains a separate incomplete review.

## Packaged Firefox observations

Every row below passed all 15 observed checks with a clean source checkout at the implementation commit. ESR's returned browser version is `153.5.1`; the requested channel/version was `153.5.1esr`. All automated runs used geckodriver `0.37.1`, temporary unsigned XPI installation, and disposable profiles.

| Environment                            | Firefox 140.0 | Firefox 153.5.1esr | Firefox 158.0.1 |
| -------------------------------------- | ------------- | ------------------ | --------------- |
| macOS 27.2 build 26B5091g, arm64       | 15 passed     | 15 passed          | 15 passed       |
| Ubuntu 24.04, x64 hosted runner        | 15 passed     | 15 passed          | 15 passed       |
| Windows Server 2025, x64 hosted runner | 15 passed     | 15 passed          | 15 passed       |

The three new browser checks exercise the production dark interface's local search/filtering and explanations, refresh resets, and unavailable metadata for the disabled controlled fixture. Existing checks still exercise consent denial/approval, Clear/reopen, revocation, the actual toolbar's selected-tab grant, protected contexts, isolation, and ordinary-extension mutation rejection. The mutation attempt belongs only to the disposable test harness; the product never attempts it.

The [six-job hosted matrix](https://github.com/ranokay/addonray/actions/runs/39865658198) passed. Its six browser reports and six source-build reports were downloaded and inspected for source commit, clean state, versions, all check outcomes, and absence of a cleanup failure. Each source rebuild matched all four packaged extension files on its own OS. The local macOS source rebuild also passed at the same commit.

| Artifact     | macOS and Linux SHA-256                                            | Windows SHA-256                                                    |
| ------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Unsigned XPI | `f8854a041e6ef86c4aefb5e5c2623486c2b6137993c6d4715d058c1057f4d371` | `3a838a3b2fb4771a05b137cc6460765ba7e95f60b19794ead1a2f59cd4385b2b` |
| Source ZIP   | `a83a6fb1b3f6a6cc0730083149441c3e89f27cb2ab09e60bd63d3aa45a3e04cb` | `3894bbf75071ed90394d016c947ca08e64ed2b61374ac639f5fc5a971b4883c7` |

The source allowlist contains 15 build-input files. Archive bytes differ across OS; this evidence makes no cross-OS reproducibility claim.

## Actual native popup observation

Observed on macOS 27.2 arm64 using Firefox 158.0.1, the packaged XPI above, and a disposable visible profile from clean commit `a80125b`. The launcher installed only AddonRay and `Controlled popup fixture`, then opened a loopback page. Native pointer/keyboard actions and the accessibility tree were observed through the computer-use tool.

| Action                                                         | Observed result                                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Open the actual popup from Firefox's extension menu            | Black interface, empty results, explanatory consent actions.                              |
| Request inventory and approve Firefox's permission prompt      | Popup stayed open; two controlled entries appeared.                                       |
| Type `storage`, then Tab to State                              | One of two entries remained; focus reached the state selector.                            |
| Select Disabled with the keyboard                              | Zero of two, a distinct no-match message, and a reachable Reset filters button.           |
| Activate Reset filters with Return                             | Empty search, All states, two entries.                                                    |
| Reach a row with Tab and activate Return                       | Permission identifiers, descriptions, version/ID, and host metadata expanded.             |
| Refresh with a query, Enabled filter, and open fixture details | Search emptied, State returned to All, and both rows were collapsed.                      |
| Reach manual Firefox-controls guidance with Tab and Return     | Instructions and the popup-closing warning expanded.                                      |
| Reach Clear session with Shift-Tab and Return                  | Inventory rows and search/filter controls disappeared.                                    |
| Load again, close with Escape, and reopen                      | Reopening had no inventory or display controls. A fresh action reused the retained grant. |

Visible focus was observed on the native search field; the accessibility tree identified the focused filter, buttons, and disclosure controls during keyboard traversal. This is a bounded keyboard observation, not a screen-reader audit. Some computer-use pointer/text actions did not activate the intended control on their first attempt; their state was inspected before switching to explicit keyboard navigation. Only the verified outcomes above count as evidence.

Pressing Enter in the launcher closed the owned browser/server and exited with code 0. A subsequent connection to its loopback port was refused. Raw screenshots, reports, and gate receipts remain local; the production screenshot is `.scratch/phase1-native-popup.png`. Report timestamps use UTC on October 22; the user-facing observation date is October 23 in Europe/Bucharest.

## Boundaries and next action

This completes the approved private inventory slice. It does not complete all of Phase 1. Manual before/after comparisons still need an investigation-lifetime decision before planning or implementation.

Native Linux/Windows focus, input, popup lifetime, and screen-reader behavior remain unobserved. Native checks of this rewritten interface on macOS 140/ESR also remain unobserved. Earlier Phase 0 native observations do not qualify the rewritten UI. Signing, persistent installation, final AMO identity, licensing, and publication remain open release gates. Follow the [desktop QA handoff](../desktop-popup-qa.md) when suitable desktops are available.
