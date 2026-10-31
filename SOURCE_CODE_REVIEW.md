# Rebuilding the extension

This source archive contains the files needed to rebuild the local Firefox and Chrome MV3 packages. AddonRay-owned code and documentation use Apache-2.0; LICENSE, NOTICE and THIRD_PARTY_NOTICES.txt travel with both source and extension archives. The name and logo artwork remain reserved as described in NOTICE. These packages have not been submitted to an extension store.

Install mise from its official distribution, then run these commands from the extracted archive:

```sh
mise install http:bun
mise exec -- bun install --frozen-lockfile
mise exec -- bun run build
mise exec -- bun run build:chrome
```

`mise.toml` pins the official Bun canary archive and checksum for macOS arm64, Linux x64, and Windows x64. The CLI revision is `963452075e9d7e2a47a482f297143af5ed4f76c0`. Dependencies resolve from `bun.lock`. WXT prepares its generated types during installation.

The rebuilt files are in `.output/firefox-mv3/` and `.output/chrome-mv3/`. Compare their names and bytes with the corresponding Firefox XPI or Chrome ZIP. ZIP timestamps and compression are not part of this comparison. The repository's `mise run test-source-build` and `mise run test-source-build-chrome` automate extraction, a frozen install, rebuilding, and file comparison in fresh ignored directories.

The unsigned XPI is for temporary installation into a disposable Firefox profile. Chrome for Testing loads an unchanged extraction of the Chrome ZIP in a disposable profile. Signing, retail installation, and publication require separate release qualification.
