# Packaged extension and desktop qualification

## Scope

The user selected macOS, Linux, and Windows as desktop targets on 2026-10-22. Each environment needs its own evidence. This continuation tests an unsigned XPI installed temporarily into disposable Firefox profiles. It does not qualify Mozilla signing, persistent installation, publication, enterprise policy, every OS distribution, or every CPU architecture.

The existing [unpacked native-popup observations](2026-10-22-qualification.md) remain separate from these package and headless checks.

## Package checks

The WXT package contains four production files. Its root manifest, HTML, JavaScript, and CSS match the build directory byte for byte. The product manifest and compiled JavaScript remain unchanged from the previous qualification. The source archive contains 13 allowlisted files. A fresh extraction, frozen dependency install, and rebuild produced the same four extension files.

The unsigned XPI SHA-256 in the development trials was `032688475339b768a1214da5fc3cbc53a4571b420d04e0a85535d9512907b27f`. Source archive hashes change when included build inputs or instructions change. Reports record those hashes rather than treating a filename as artifact identity.

The package checker verifies CRCs and exact entry names/bytes. It checks original entry names before extraction, and source allowlisting prevents local evidence or unrelated files from entering the archive. JSZip 3.10.2 was already resolved through Selenium and is now a direct development dependency. The dependency audit reported no known advisories before this change.

## Development trials

On macOS arm64, packaged Firefox `140.0`, `153.5.1esr`, and `158.0.1` each passed the same 12 API checks with geckodriver `0.37.1`. These initial trials used parent `d66f16d` with uncommitted tooling changes. Their reports explicitly record `sourceDirty: true`; they are iteration evidence.

Clean committed reruns, the Linux/Windows workflow, and packaged native-popup observations will be recorded after the tooling commit. Until then, those qualifications remain pending.

## References

- [Mozilla packaging format](https://extensionworkshop.com/documentation/publish/package-your-extension/).
- [Temporary installation and its limits](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).
- [WXT source archive guidance](https://wxt.dev/guide/essentials/publishing.html).
- [Selenium Manager configuration](https://www.selenium.dev/documentation/selenium_manager/).
- [Geckodriver compatibility](https://firefox-source-docs.mozilla.org/testing/geckodriver/Support.html).
