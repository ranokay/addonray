# Rebuilding the extension

This source archive contains the files needed to rebuild the local Firefox MV3 package. It grants no license and has not been submitted to AMO.

Install mise from its official distribution, then run these commands from the extracted archive:

```sh
mise install http:bun
mise exec -- bun install --frozen-lockfile
mise exec -- bun run build
```

`mise.toml` pins the official Bun canary archive and checksum for macOS arm64, Linux x64, and Windows x64. The CLI revision is `963452075e9d7e2a47a482f297143af5ed4f76c0`. Dependencies resolve from `bun.lock`. WXT prepares its generated types during installation.

The rebuilt extension files are in `.output/firefox-mv3/`. Compare their names and bytes with the XPI contents. ZIP timestamps and compression are not part of this comparison. The repository's `mise run test-source-build` automates extraction, a frozen install, rebuilding, and file comparison in a fresh ignored directory.

The unsigned XPI is for temporary installation into a disposable Firefox profile. Signing, persistent installation, and publication require separate release qualification.
