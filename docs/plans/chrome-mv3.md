# Chrome MV3 compatibility slice

Approved on 2026-10-23: keep the pinned native-tool Bun canary, add Chrome first against its current desktop release, and support MV3 builds only. Edge, Safari, and Firefox MV2 remain deferred. This slice precedes comparison planning and changes no investigation lifetime.

## Result and acceptance

| ID   | Required behavior                                                                                                                                                                                                                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-01 | Explicit Firefox/Chrome MV3 builds retain only required `activeTab` and optional `management`/`scripting`. Other browser and manifest targets fail clearly.                                                                                                                                                       |
| C-02 | Firefox retains its minimum 140 and data-collection declaration. Chrome omits Firefox settings and starts at a separately tested current major, 156. A manifest minimum is not qualification of every later browser.                                                                                              |
| C-03 | Browser context comes from the build, not user-agent inspection or browsing data. Labels, bounded errors, permission descriptions, and manual settings guidance name the selected browser.                                                                                                                        |
| C-04 | Chrome's management capability is distinguished from AddonRay's inspection-only policy. Product code never enables/disables/uninstalls another extension. Inventory still does not establish execution on a page.                                                                                                 |
| C-05 | Inventory search, metadata distinctions, dark layout, explicit actions, minimal top-frame probe, Clear/revocation/refresh/close behavior, and in-flight cancellation keep their existing contract.                                                                                                                |
| C-06 | Firefox XPI and Chrome ZIP have separate validated outputs and browser-named source archives. Extracted source builds reproduce each target's packaged files. No fixtures or test authority enter the product artifacts.                                                                                          |
| C-07 | Deterministic checks cover both contexts and reject unknown targets. Firefox regression probes remain intact. Chrome tests pin and assert both browser and driver version, use disposable profiles and controlled fixtures, and record source identity, artifact hash, results, gaps, and cleanup failures.       |
| C-08 | Chrome CI uses a separately named test fixture with pre-granted required permissions where native optional-permission prompts cannot be automated. Unmodified product startup and real native macOS denial/approval are checked separately. Fixture grants never count as native consent evidence.                |
| C-09 | Current Chrome for Testing 156.0.8078.47 is the reproducible automated baseline on macOS arm64, Linux x64, and Windows x64 where available. Native popup evidence names its distribution and OS. Retail Chrome installation, native Linux/Windows usability, and store publication remain separate release gates. |

## Implementation and stop condition

Use WXT's browser context and conditional manifest configuration, reuse the current adapters/session/UI, and add target-aware package verification. Keep the existing pinned Bun, hk, and jactionlint setup. Browser-specific tests must distinguish API authority from product policy rather than copy Firefox's mutation-rejection assertion into Chrome.

Use Chrome's browser-root DevTools extension testing commands only in disposable test processes. Do not add debugger permissions, background pages, test hooks, broad hosts, or a native companion to the product. Keep the original ZIP manifest unchanged; any pre-granted test copy lives only in ignored scratch space.

The slice ends with signed private builds, passing checks for the observed environments, independent review, and bounded evidence/resumption docs. It adds no comparison records, persistence, export, diagnostic collector, additional supported browser, MV2 build, or publication.

## Primary references

- [WXT browser/manifest targets](https://wxt.dev/guide/essentials/target-different-browsers) and [conditional manifests](https://wxt.dev/guide/essentials/config/manifest).
- [Chrome management](https://developer.chrome.com/docs/extensions/reference/api/management), [permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions), [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), and [scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting).
- [Exact stable-channel testing builds](https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json).
- [Pinned extension testing implementation](https://chromium.googlesource.com/chromium/src/+/refs/tags/156.0.8078.47/chrome/browser/devtools/protocol/extensions_handler.cc).
