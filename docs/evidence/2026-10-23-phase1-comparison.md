# Phase 1 manual comparison evidence

Recorded on 2026-10-23 in Europe/Bucharest. Scope is the approved [one-pair comparison](../plans/phase1-comparison.md). This private build adds independent, temporary investigation tabs to Firefox MV3 and Chrome MV3. It adds no manifest permissions, automatic extension changes, page tracking, performance measurements, saved history, or export.

## Source and artifacts

Signed implementation `19516efd140361a2da2a3b0e50f0986e7477a35b` contains the controller, exact-ID state differences, dark investigation UI, popup launch action, tests, probes, and approved documentation. Signed `5b52ff2517b57c520add00b81198a86ad66b9dfd` changes only the initial Chrome popup readiness poll after a Linux CI failure. Product build inputs and artifact hashes remain unchanged by that test correction.

| Local artifact                | SHA-256                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| Firefox unsigned XPI          | `256bd9fed2ac0278904c37b946cfe97790c5dde286077a9ae0d8031390c2e0db` |
| Chrome ZIP                    | `461d88d5c6165704c219c7136a19b76acad8b439b25ccc9bc5334c24246b1e9e` |
| Each browser-named source ZIP | `69f416f1d1427d8b06fe7c5f771f4700e5cf434386c18d026e773429b0756e0b` |

Each source ZIP contains the same 22 reviewed build inputs. Clean rebuilds at `19516ef` reproduced all eight packaged output files for each target on macOS arm64. Fixtures, controllers, and browser-test authority remain outside the artifacts. The manifest checks also reject externally accessible resources.

## Local automated checks

The clean shared gate at `19516ef` passed native Bun formatting, linting and type checking, all 102 behavior tests with 321 assertions, both target package checks, and strict jactionlint. Tests cover consent/errors, empty snapshots, exact identity and state changes, minimized retention, independent owners, fixed captures, manual assessments, Start over, revocation, cancellation, and the rendered user contract. The Bun pin, dependencies, lockfile, hooks, and permission budget remain unchanged.

| Distribution/version                              | Source           | OS          | Result                         |
| ------------------------------------------------- | ---------------- | ----------- | ------------------------------ |
| Firefox 140.0                                     | `19516ef`, clean | macOS arm64 | All 21 packaged checks passed. |
| Firefox 153.5.1esr, reported 153.5.1              | `19516ef`, clean | macOS arm64 | All 21 packaged checks passed. |
| Firefox 158.0.1                                   | `19516ef`, clean | macOS arm64 | All 21 packaged checks passed. |
| Chrome for Testing and ChromeDriver 156.0.8078.47 | `19516ef`, clean | macOS arm64 | All 17 checks passed.          |
| Same Chrome/driver after the readiness correction | `5b52ff2`, clean | macOS arm64 | All 17 checks passed.          |

Firefox used geckodriver 0.37.1 and temporary unsigned XPI installation. Chrome loaded unchanged extracted ZIP contents into a disposable profile. No cleanup failure was reported.

The new browser checks exercise popup launch, fresh state despite retained permission, Before capture, switching to a controlled page and actual browser settings, After capture around a fixture transition, explicit assessment, independent investigations, popup clearing, Start over, close/reopen, and reload. Firefox also exercises actual optional-management revocation against a populated comparison. Chrome's comparison captures use a named pre-granted UI fixture with unchanged production assets. Those Chrome checks do not qualify native optional-management consent or revocation. Separate original-product Chrome checks verify toolbar launch and an empty investigation without management or host access.

ChromeDriver excludes extension targets by default. The test session now enables its documented `enableExtensionTargets` capability so WebDriver can see newly created investigation tabs. Before that correction, CDP and the browser tab API observed the created tab while WebDriver's window list omitted it. This changes driver visibility, not the extension's authority. See [ChromeDriver capabilities](https://developer.chrome.com/docs/chromedriver/capabilities).

Private frozen receipts at `19516ef` are `20261023T044329Z-f11f9a6a0cb0.json` for the shared gate, `20261023T044331Z-1bb57d39950c.json` and `20261023T044333Z-970184133462.json` for source rebuilds, `20261023T044335Z-140908f83e68.json`, `20261023T044350Z-4b4291dc47fb.json`, and `20261023T044400Z-b7bff99b2c00.json` for Firefox, and `20261023T044406Z-e5f15b253efb.json` for Chrome. The corrected clean Chrome receipt is `20261023T045302Z-10ddfb745307.json` at `5b52ff2`. All record child exit 0 and `frozen_gate: true`. Development trials and pre-commit checks were dirty iteration evidence.

## Native macOS observations

Both native sessions used clean `19516ef`, the unmodified artifacts above, disposable profiles, and only AddonRay plus the controlled popup fixture. Neither session contained the pre-granted UI fixture or an API controller. Browser settings changed only that disposable fixture.

### Firefox 158.0.1

- The actual extension popup opened a fresh investigation tab. It started empty, with Capture after disabled and its temporary lifetime visible.
- Capture before displayed Firefox's actual optional-management prompt. Deny left the full tab open with a bounded declined message. Retry displayed the prompt again. Allow kept the tab open and captured two extensions.
- The controlled local page was tested, the fixture was disabled through the actual Add-ons Manager, and the same local page was reloaded. Returning to the investigation preserved Before. Capture after reported exactly one Disabled change for the controlled fixture.
- All assessment choices started unset. Selecting Better and pressing Right selected Unchanged with visible focus. The UI distinguished the manual assessment from reported inventory changes and made no causal claim.
- A second investigation launched by keyboard from the actual popup started empty despite the retained grant. Returning to the original preserved its pair and assessment after the popup Clear action. Native pointer activation of this second launch did not produce an observed new tab through the computer-use controls; keyboard activation did.
- Start over erased the pair and assessment. A new capture succeeded using the retained grant. Reload erased it. Closing another populated investigation left the independent empty investigation unchanged.

The launcher recorded `.scratch/firefox-native-158.0.1.json` with clean source, exact browser/driver, package hash, and `setup-and-cleanup-only`. It does not issue a UI verdict. Enter closed the owned browser/server; the fixture port then refused connections. The native screenshot is `.scratch/comparison-firefox-native.jpg`.

### Chrome for Testing 156.0.8078.47

- The actual toolbar popup opened a fresh empty investigation. Capture before displayed the native management warning for apps, extensions, and themes. Deny kept the full tab open with a retryable declined result. Retry and Allow captured two extensions without closing the investigation.
- Switching to the local page, disabling only the controlled fixture through `chrome://extensions/`, reloading the same page, and returning preserved Before. Capture after showed exactly one Disabled change for the fixture.
- The assessment started unset. Selecting Better and pressing Right selected Unchanged with visible keyboard focus.
- Clearing the popup and opening a second investigation left the original pair and assessment intact. The second investigation was empty. Start over removed the original pair/assessment; a later reload discarded a newly captured Before. Closing another populated tab did not populate the independent tab.

After native observations, the launcher ran four API checks against unmodified production documents using the native-approved optional grant. An empty popup collected inventory only after an action. An independent investigation started empty and captured a fixed pair and explicit assessment. Actual optional-management removal cleared its pair and assessment, and the same removal cleared the separately loaded popup. `.scratch/chrome-native-api-evidence.json` records all four passing checks with clean source and exact versions/hash. These API checks do not issue a native UI verdict. Enter closed the owned browser/server; the fixture port refused connections. The native screenshot is `.scratch/comparison-chrome-native.jpg`.

## Hosted qualification

The [two-job Chrome run](https://github.com/ranokay/addonray/actions/runs/39902693276), [six-job Firefox run](https://github.com/ranokay/addonray/actions/runs/39902693247), and [shared gate](https://github.com/ranokay/addonray/actions/runs/39902693253) passed at signed `5b52ff2517b57c520add00b81198a86ad66b9dfd`. All eight downloaded browser reports and eight source-rebuild reports record that exact clean source. Each browser report has the expected passing check count, exact actual browser/driver version, artifact identity matching its environment's rebuild report, and no cleanup failure. Every rebuild compared all eight output files successfully with the pinned Bun revision.

| Hosted environment      | Browser coverage                   | Observed result                            |
| ----------------------- | ---------------------------------- | ------------------------------------------ |
| Ubuntu 24.04 x64        | Firefox 140.0, 153.5.1esr, 158.0.1 | 21 checks per version; geckodriver 0.37.1. |
| Windows Server 2025 x64 | Same three Firefox versions        | 21 checks per version; geckodriver 0.37.1. |
| Ubuntu 24.04 x64        | Chrome for Testing 156.0.8078.47   | 17 checks; ChromeDriver 156.0.8078.47.     |
| Windows Server 2025 x64 | Same Chrome for Testing version    | 17 checks; same ChromeDriver version.      |

ESR reports actual browser version 153.5.1. Linux package/source hashes match the local table. Windows Firefox XPI SHA-256 is `564c11b457e0cba6ab0b646f4640f61a30916a39e76aa68a5fd0870c1596fc1b`; its Chrome ZIP SHA-256 is `c866893d0ba08daff51bbad7206457af0deb5519ea901d59816271eba10a5ced`. Both Windows source ZIPs have SHA-256 `4baeb1a5faebfe76a868e1af75b54278ce07546cfdd98830db4a75a4d41ae71c`. These checks prove each environment rebuilt its own packaged contents. They do not establish identical archive bytes across OSs or explain the differing archive hashes. Downloaded reports are retained locally under `.scratch/comparison-ci-5b52ff2/`.

The [first Linux Chrome run](https://github.com/ranokay/addonray/actions/runs/39901843733) at `19516ef` passed its comparison fixture checks, then failed because the newly exposed production popup target did not yet have a document body. The bounded readiness poll now treats a missing body as not ready, retaining its required text and timeout. Other evaluation errors still fail. No product code changed to address this failure. The corrected Linux and Windows run above passed without disabling the browser sandbox.

## Review and remaining gates

Independent Standards, Spec, and Correctness review found no actionable issue in the product, rendered UI, launchers, or browser probes. Follow-up static reviews found no issue with extension-target visibility or the narrow popup readiness correction. The reviewer did not run browser checks; execution results above are separate evidence.

Native Linux/Windows input, complete focus traversal, screen readers, investigation behavior on native minimum/ESR Firefox, retail Chrome installation, signed Firefox distribution, store review/publication, and future browser versions remain unqualified. The hosted Chrome UI fixture does not prove optional-management consent on those OSs. Browser unloading/crash recovery is intentionally absent. No measured performance, culprit attribution, history, export, browser expansion, or native companion is approved by this slice.
