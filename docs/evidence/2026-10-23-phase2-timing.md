# Phase 2 page-timing evidence

Recorded on 2026-10-23 in Europe/Bucharest. Scope is the approved [popup timing snapshot](../plans/phase2-timing.md), P2A-01 through P2A-13. The user confirmed all five product choices and authorized implementation, tests, independent review, and signed private delivery.

## Source and artifacts

Signed implementation `8b8c9684a4930da098a7e02af4728983dafa507d` is pushed to private `ranokay/addonray`. It extends the existing explicit page action with DOMContentLoaded completion, load-event completion, and first contentful paint when reported. It preserves the required/optional permissions, Firefox/Chrome MV3 targets, popup-only memory, and independent inventory investigations. No reload, live recorder, page URL/content, resource analysis, storage, export, or extension attribution is added.

| Local artifact                | SHA-256                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| Firefox unsigned XPI          | `d92fa57c467bdbd6e73ea6295c371268c4bc60dbbbd97c6c015429cd84092735` |
| Chrome ZIP                    | `0dab995860dd457735145ff7172e801f2e1ff8dd56d6a64187a64ff86de65fc3` |
| Each browser-named source ZIP | `3bc461483c74bc2fd8e714cfce1ecd7618de25220f5a8981fd86bbb8290277b6` |

Each source archive contains the same 23 reviewed build inputs. Clean macOS rebuilds at `8b8c968` reproduced all eight output files for each target. The generated timing-controller module, browser fixtures, and test authority remain outside product/source archives. Dependency resolutions, Bun revision, hooks, and manifest budget remain unchanged.

## Feasibility before the UI change

Scratch-only probes ran against the previous product baseline `77feaa4` with dirty approved planning/tests, before the production collector/UI changed. On Firefox 140.0, 153.5.1esr, 158.0.1 and Chrome for Testing 156.0.8078.47/macOS arm64, all six final feasibility checks passed. They observed the default isolated world reading completed navigation/FCP milestones while a positive MAIN-world page marker remained hidden. A genuinely held resource left load-event completion at zero; releasing it produced a positive timestamp. A completed empty document genuinely lacked FCP. Loaded protected contexts supplied no observation.

These disposable host-granted fixtures establish API visibility. They do not establish product consent, packaged behavior, UI usability, or overhead. Exact drivers were geckodriver 0.37.1 and ChromeDriver 156.0.8078.47. Each final report records successful browser/server cleanup. Raw files are `.scratch/timing-feasibility-<target>.json`.

Two initial Firefox 140 scratch attempts timed out around optional blank/protected-context setup. Their reports remain under the `-initial` and `-protected-initial` suffixes. Protected navigation was corrected to use the existing driver's route because extension-created privileged tabs can be rejected. An authentic missing-navigation-entry case was not established. Deterministic tests cover it without replacing browser APIs or claiming a real-browser observation. No product permission or execution world changed for these corrections.

## Behavior and clean local qualification

The clean shared gate at `8b8c968` passed native formatting/lint/types, all 134 behavior tests with 384 assertions, both target packages/manifests/source allowlists, and strict jactionlint. Tests cover zero/fractional/missing/invalid timings, bounded maximum values, metadata getters/serialization that must not be read, canonical copying, consent/target binding, duplicate and later actions, in-flight clearing/revocation/close, and rendered meanings. The existing inventory/comparison tests remain passing.

| Distribution/version                              | OS          | Result                         |
| ------------------------------------------------- | ----------- | ------------------------------ |
| Firefox 140.0                                     | macOS arm64 | All 27 packaged checks passed. |
| Firefox 153.5.1esr, actual 153.5.1                | macOS arm64 | All 27 packaged checks passed. |
| Firefox 158.0.1                                   | macOS arm64 | All 27 packaged checks passed. |
| Chrome for Testing and ChromeDriver 156.0.8078.47 | macOS arm64 | All 24 checks passed.          |

All reports identify clean `8b8c968`, the artifacts above, exact versions, and no cleanup failure. Firefox used geckodriver 0.37.1. Six added shared checks read the actual collector source in a static module inside a separate host-granted controller. They check completed/resource-heavy pages, size/runtime budgets, a pending held resource and its release, missing paint, and a protected page. Chrome also asserts all three timing rows in the actual unmodified toolbar popup using its `activeTab` grant, then confirms actual scripting revocation clears the result. Firefox's headless timing source check does not qualify its packaged popup UI; the native observation below supplies current-version macOS evidence.

Private frozen receipts are `20261023T173735Z-58eaef0b0020.json` for the shared gate, `20261023T173737Z-ee1f667e97dc.json` and `20261023T173740Z-15a3137360d7.json` for source rebuilds, `20261023T173742Z-deec7b0673aa.json`, `20261023T173758Z-db91e879f246.json`, and `20261023T173810Z-0e82aa564c37.json` for Firefox, and `20261023T173817Z-59e14bc3ee64.json` for Chrome. All record child exit 0 and `frozen_gate: true`. Earlier development runs were dirty iteration evidence.

## Size and overhead method

The test controller embeds `collectPageObservation.toString()` from the production source into a static test-only module, with SHA-256 `0a1e6c1bc04c2c70f58cf8609e0f8d170a03b87ea8412ee20f1a74c4097f302c` in the local reports. Its isolated-world wrapper brackets the full synchronous collector, including readiness/support reads, using `performance.now()`. It records the true first attempt separately from the first completed snapshot, then 30 sequential samples per fixture. The heavy page serves and counts 200 controlled resource requests. Raw output is checked for fixed keys, URL/content sentinels, and timing-block byte size before adapter normalization.

Reports retain raw collector samples, nearest-rank p95, the observed minimum positive clock step, and an empirical p95-plus-two-steps guard. Browser injection plus driver/IPC durations are separate samples. Clock calibration and test polling belong only to the fixture; the product collector installs no timer or observer. The timing-block bound is 1 KiB and the measured collector budget is 5 ms. Every recorded guard passed.

| Environment / browser            | Largest collector p95 across its two fixtures | Largest empirical guard | Largest timing block |
| -------------------------------- | --------------------------------------------- | ----------------------- | -------------------- |
| macOS / Firefox 140.0            | 0 ms                                          | 2 ms                    | 175 bytes            |
| macOS / Firefox ESR 153.5.1      | 1 ms                                          | 3 ms                    | 175 bytes            |
| macOS / Firefox 158.0.1          | 1 ms                                          | 3 ms                    | 175 bytes            |
| macOS / Chrome for Testing 156   | about 0.10 ms                                 | about 0.30 ms           | 206 bytes            |
| Ubuntu / three Firefox versions  | 1 ms                                          | 3 ms                    | 178 bytes            |
| Windows / three Firefox versions | 1 ms                                          | 3 ms                    | 178 bytes            |
| Ubuntu / Chrome for Testing 156  | about 0.10 ms                                 | about 0.30 ms           | 206 bytes            |
| Windows / Chrome for Testing 156 | about 0.10 ms                                 | about 0.30 ms           | 207 bytes            |

Local CPU is Apple M3 Pro. Each hosted report records its own CPU and exact OS/browser. A measured zero can be below clock resolution; it does not mean zero execution cost. The minimum step and guard are empirical observations, not guaranteed clock-error bounds. These checks do not establish universal latency, full extension overhead, packaged-adapter/rendering time, website speed ratings, or extension responsibility. The static source fixture and unmodified product evidence remain separate.

## Native macOS popup observations

Both sessions used clean `8b8c968`, unmodified artifacts with the local hashes above, disposable profiles, and only AddonRay plus the controlled popup fixture. No pre-granted UI copy or API controller was installed.

### Firefox 158.0.1

- Opening the actual popup showed no inventory/page observations and disclosed the expanded one-shot action. The page action displayed readiness and all three milestones. This flow displayed no separate scripting warning.
- On the unchanged controlled page, the observed milestone values were 189 ms, 209 ms, and 213 ms. Repeating the explicit capture retained those document-load milestones. These values are illustrative fixture observations, not the collector's overhead samples.
- Tab/Shift-Tab reached the page action, timing guidance, and Clear. Return activated capture, expanded/collapsed the guidance, and cleared the result. Native focus was visible. The values and descriptions were readable while scrolling the popup.
- Reopening after a populated popup closed was empty despite retained access. A later keyboard capture succeeded. Clear then removed all timing rows.
- On actual `about:addons`, the popup remained usable and returned the bounded message `The page returned an invalid or unavailable probe result.` It displayed no timing rows.

The helper recorded exact setup/source/package and cleanup, not an automatic UI verdict. The report is copied to `.scratch/timings-firefox-native-report.json`. The actual values screenshot is `.scratch/timings-firefox-rows.jpg`; `.scratch/timings-firefox-native.jpg` also records expanded guidance/focus. Enter closed the browser/server and the loopback fixture port refused connections.

### Chrome for Testing 156.0.8078.47

- The actual popup started empty. Its native inventory prompt disclosed management of apps/extensions/themes; approving closed the popup. Reopening remained empty. This grant was retained for the existing post-native API protocol.
- Keyboard activation of the page action displayed all three milestones without a separate scripting warning. Observed values on the unchanged fixture were 20.2 ms, 20.5 ms, and 52 ms, with explicit units and definitions.
- Tab reached the timing disclosure and Return expanded it with visible focus. Shift-Tab reached Clear, which erased the timing rows. A subsequent deliberate capture succeeded with retained access. Escape closed that populated popup, and reopening was empty.
- On actual `chrome://extensions/`, the page action returned the bounded Chrome refusal explanation and no timing rows.

The screenshot is `.scratch/timings-chrome-native.jpg`. Enter then ran the existing four unmodified-product API checks for retained native inventory consent, independent comparison capture/assessment, and actual optional-management revocation clearing both investigation and popup. All four passed. That report is copied to `.scratch/timings-chrome-native-report.json` and is separate from native UI observations. The owned browser/server closed and its loopback port refused connections.

## Hosted qualification

The [six-job Firefox run](https://github.com/ranokay/addonray/actions/runs/39996572397), [two-job Chrome run](https://github.com/ranokay/addonray/actions/runs/39996572176), and [shared gate](https://github.com/ranokay/addonray/actions/runs/39996572185) passed at exact signed `8b8c9684a4930da098a7e02af4728983dafa507d`. All eight downloaded browser reports and eight rebuild reports identify that clean source. Firefox 140.0, 153.5.1esr and 158.0.1 passed 27 checks each on Ubuntu 24.04 x64 and Windows Server 2025 x64 with geckodriver 0.37.1. Chrome for Testing/ChromeDriver 156.0.8078.47 passed 24 checks on both systems.

Each browser hash matches its environment's successful eight-file source rebuild. Every overhead report contains two fixtures, 30 samples each, an actual 200-resource heavy fixture, a passing size/runtime guard, first-attempt data, clock calibration, and no cleanup failure. The reports are retained locally under `.scratch/timing-ci-8b8c968/`.

Linux hashes match the local table. Windows XPI SHA-256 is `64967e786bb5cd853219ab9a9f6f7f966f63ad7143967f59ff1d349d50bb5953`; Chrome ZIP SHA-256 is `fca7ee8c4b4373b66cea59a7ee85d4faa307d10f17ea2e5d215bbad80d25594e`; each Windows source ZIP has SHA-256 `dcd768bc1ff096333010726bc8ed913397ceea4ccd073a5afdbbc8f8fa0121f5`. These checks establish each OS's rebuild of its packaged contents. They do not establish identical archive bytes across OSs or explain the different archive hashes.

## Review and remaining gates

Independent planning, production-code, and browser-probe reviews found no actionable issue. The reviewer checked the documented scope, data minimization before return, zero/missing/value bounds, copied ownership, lifecycle, wording, authority, overhead/clock separation, fixture controls, and cleanup. The reviewer did not execute the tests or browser sessions. The overhead clock limitation above remains part of the recorded result.

A final independent documentation review compared this evidence, the plan, and the status checklist with local, native-helper, and hosted reports. It found no actionable inconsistency in revisions, artifact hashes, check counts, rebuilds, timing samples, clock summaries, or cleanup. It did not rerun tests or independently reproduce native observations.

Native Linux/Windows usability, screen readers and complete accessibility review, native minimum/ESR timing-popup behavior, retail Chrome installation, signed Firefox distribution, store submission, and other versions/OSs remain open. This slice observed no separate native scripting-denial dialog; deterministic denied-consent checks and existing permission tests remain separate evidence. Authentic missing-navigation entries remain unobserved. Empirical fixture overhead is not a universal performance guarantee.

Stop at this popup snapshot. Timing comparisons, live interaction measurements, page errors, mutation counts, network/resource analysis, history/export, additional targets, and a native companion need a separate scoped decision.
