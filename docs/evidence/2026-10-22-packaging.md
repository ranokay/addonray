# Packaged extension and desktop qualification

## Scope

The user selected macOS, Linux, and Windows as desktop targets on 2026-10-22. Each environment needs its own evidence. This continuation tests an unsigned XPI installed temporarily into disposable Firefox profiles. It does not qualify Mozilla signing, persistent installation, publication, enterprise policy, every OS distribution, or every CPU architecture.

The existing [unpacked native-popup observations](2026-10-22-qualification.md) remain separate from these package and headless checks.

## Package checks

The WXT package contains four production files. Its root manifest, HTML, JavaScript, and CSS match the build directory byte for byte. On macOS, the product manifest and compiled JavaScript remain unchanged from the previous qualification. The source archive contains 13 allowlisted files. A fresh extraction, frozen dependency install, and rebuild produced the same four extension files on each tested OS.

The unsigned XPI SHA-256 in the development trials was `032688475339b768a1214da5fc3cbc53a4571b420d04e0a85535d9512907b27f`. Source archive hashes change when included build inputs or instructions change. Reports record those hashes rather than treating a filename as artifact identity.

The package checker verifies CRCs and exact entry names/bytes. It checks original entry names before extraction, and source allowlisting prevents local evidence or unrelated files from entering the archive. JSZip 3.10.2 was already resolved through Selenium and is now a direct development dependency. The dependency audit reported no known advisories before this change.

## Development trials

On macOS arm64, packaged Firefox `140.0`, `153.5.1esr`, and `158.0.1` each passed the same 12 API checks with geckodriver `0.37.1`. These initial trials used parent `d66f16d` with uncommitted tooling changes. Their reports explicitly record `sourceDirty: true`; they are iteration evidence.

## Clean committed evidence

All results below use signed commit `bdad8f9bad00020ea8f4190ad3c87fece199e520`. Every browser report records `sourceDirty: false`, installation mode `temporary-unsigned-xpi`, the matching requested/actual Firefox version, geckodriver `0.37.1`, and all 12 checks passed. No failure or cleanup failure was recorded. The reports retain `passed-with-qualification-gaps` because native UI and distribution claims need separate evidence.

| Environment                            | Firefox 140.0  | Firefox 153.5.1esr | Firefox 158.0.1 | Source archive rebuild            |
| -------------------------------------- | -------------- | ------------------ | --------------- | --------------------------------- |
| macOS 27.2 arm64, local                | 12 checks pass | 12 checks pass     | 12 checks pass  | All four files match the XPI.     |
| Ubuntu 24.04 x64, GitHub-hosted        | 12 checks pass | 12 checks pass     | 12 checks pass  | Passes in each of the three jobs. |
| Windows Server 2025 x64, GitHub-hosted | 12 checks pass | 12 checks pass     | 12 checks pass  | Passes in each of the three jobs. |

The [six-job browser run](https://github.com/ranokay/addonray/actions/runs/39731719710) and [development gate](https://github.com/ranokay/addonray/actions/runs/39731719698) passed. The six downloaded browser reports and six rebuild reports were inspected locally, including their commit, dirty flag, versions, artifact identity, outcomes, and cleanup status. Remote reports are seven-day workflow artifacts; the downloaded copies remain in `.scratch/ci-39731719710/`.

| Local check                 | Receipt identifier              |
| --------------------------- | ------------------------------- |
| Source rebuild              | `20261022T060440Z-ccfef27b52d9` |
| Packaged Firefox 140.0      | `20261022T060458Z-341be8168e47` |
| Packaged Firefox 153.5.1esr | `20261022T060505Z-4d8b2e65ad4c` |
| Packaged Firefox 158.0.1    | `20261022T060509Z-fb81815cb2a4` |
| Full development gate       | `20261022T060700Z-159930b59475` |

Each local receipt records exit 0 and unchanged clean snapshots before and after the run. Raw reports remain in ignored `.scratch/`.

### Artifact identity

macOS and Linux runs used XPI SHA-256 `032688475339b768a1214da5fc3cbc53a4571b420d04e0a85535d9512907b27f` and source ZIP SHA-256 `2925ae7474391b032838acfc49cdfd92957a364ab1898f00378750777fe40954`. Windows runs used XPI SHA-256 `c872019c5fe5c5168986d98a98cf6c92958f9adc5549e2886cf3f9aa39b579d8` and source ZIP SHA-256 `b071c2cb785d7a6ff2a0265c8a9fe49c39a533938d76f5ee42edda431fb941b6`.

Each OS reproduced the contents of its own packaged artifact. The checks do not establish identical archive bytes across operating systems or explain the differing archive hashes. All rebuild reports list the same four output filenames and the pinned Bun revision.

## Packaged native popup on macOS

Computer-use automation operated the actual toolbar popup on Firefox 140.0, macOS 27.2 arm64, using the clean committed XPI identified above. The visible launcher created a disposable profile with one controlled fixture and a local HTTP page.

| Action                                            | Observed result                                                                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Open the packaged extension                       | The actual popup renders with no results.                                                          |
| Deny inventory permission                         | Firefox's real prompt leaves the popup open. Denial shows an explanation and no inventory.         |
| Retry and approve                                 | The popup displays AddonRay and the controlled fixture.                                            |
| Inspect the local page                            | Readiness is `complete`; supported performance entry types appear, without another browser prompt. |
| Clear                                             | Both inventory and page results disappear.                                                         |
| Populate inventory, close with Escape, and reopen | The new popup starts empty. A fresh inventory action succeeds with the retained grant.             |
| Finish the launcher with Enter                    | The owned browser and server close with exit 0.                                                    |

This packaged session did not repeat native permission revocation or protected-page UI checks. Those have separate unpacked observations and packaged headless coverage. Closure while consent is pending was not observed. The launcher itself produces no automated UI verdict.

## Remaining qualification

Native-popup usability on Linux and Windows remains unobserved. A hosted Windows Server job does not establish desktop Windows 11 usability; Ubuntu coverage does not establish every Linux desktop or distribution. Packaged native-popup observations on macOS ESR/current releases remain separate from the existing unpacked observations. Mozilla signing, persistent installation, restart behavior, final AMO identity, licensing, and publication still require the distribution gate and user decisions. Phase 1 has not begun.

## References

- [Mozilla packaging format](https://extensionworkshop.com/documentation/publish/package-your-extension/).
- [Temporary installation and its limits](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).
- [WXT source archive guidance](https://wxt.dev/guide/essentials/publishing.html).
- [Selenium Manager configuration](https://www.selenium.dev/documentation/selenium_manager/).
- [Geckodriver compatibility](https://firefox-source-docs.mozilla.org/testing/geckodriver/Support.html).
