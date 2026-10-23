# Development toolchain

## Why this Bun build

On 2026-10-22 the user chose a pinned Bun canary with native formatting and linting. Stable Bun 1.4.3 includes native type checking, but its formatter and linter are canary-only at this date. This is a development dependency choice. It does not change the extension's runtime or permissions.

The official distribution package is `1.4.3-canary.20261021.1`. Its CLI reports `1.4.4-canary.1`, and its full source revision is `963452075e9d7e2a47a482f297143af5ed4f76c0`. The gate checks that revision rather than relying on the differing version labels.

On 2026-10-23 the user reviewed stable Bun 1.4.4 and chose to retain this pin. The [1.4.4 release](https://bun.com/blog/bun-v1.4.4) ships native formatting and type checking, but its official macOS arm64 binary at revision `38afee6c84fcf48c0edb2466aa4b27d287a59c30` has no native `lint` command. An isolated package without scripts returned `Script not found "lint"`; checking in this repository alone can mask that absence by running the lint package script through the existing canary. Stable formatting, type checking, and all 37 tests at baseline `852bccb` passed the exploratory checks. This was a compatibility assessment, not a replacement toolchain gate. Moving to stable today would require a separately pinned linter; the user kept the all-native setup.

`mise.toml` downloads the official native package through mise's HTTP backend with a fixed URL and SHA-512 checksum. Archive entries cover macOS arm64, Linux x64, and Windows x64. The Windows checksum comes from the same exact npm release's integrity metadata, and its executable is `package/bin/bun.exe` before extraction. Other development architectures need their own verified archive entry. The project does not follow the moving `canary` tag or require Node to bootstrap Bun. Archive availability still depends on the upstream registry.

## Install and run

```sh
mise install http:bun hk jactionlint shellcheck
mise exec -- bun install --frozen-lockfile
mise run hooks-install
mise run check
```

Activate mise in the shell for direct Bun commands. Otherwise use `mise exec -- bun ...` so another installed Bun cannot take precedence.

| Command                               | Purpose                                                       |
| ------------------------------------- | ------------------------------------------------------------- |
| `mise run fmt`                        | Format source and documentation with native Bun fmt.          |
| `mise run lint`                       | Run native Bun lint with zero warnings allowed.               |
| `mise exec -- bun run typecheck`      | Run the native TypeScript checker.                            |
| `mise exec -- bun test`               | Run the behavior tests with Bun's test runner.                |
| `mise run check`                      | Run the shared hk quality gate.                               |
| `mise run test-firefox`               | Build and run the disposable-profile Firefox API probes.      |
| `mise run test-firefox-popup`         | Open a disposable visible Firefox for recorded UI checks.     |
| `mise run package`                    | Build and validate the unsigned XPI and source ZIP.           |
| `mise run test-source-build`          | Rebuild the extracted sources and compare the packaged files. |
| `mise run test-firefox-package`       | Run browser API probes against the unsigned XPI.              |
| `mise run test-firefox-popup-package` | Open the unsigned XPI for native-popup observations.          |

The package scripts use `bun --check` for type checking and `--no-script` for native fmt/lint. These spellings avoid a same-named package script taking precedence. Use `bun run check` for the package's complete gate. TypeScript remains installed for WXT's peer dependency and editor support. WXT still prepares and builds the extension through Bun.

`bun.lock` is the only active dependency lockfile. pnpm, Prettier, and Vitest are no longer project tools.

## Hooks and CI

hk 2.8.0 reads `hk.pkl` and bundles its Pkl evaluator. `mise run hooks-install` installs a repository-local pre-commit hook through mise. The hook checks the whole working tree. It does not fix, stage, or stash files, so a passing hook does not certify that a partial staged snapshot contains every checked change. CI checks the committed snapshot independently.

Both `mise run check` and the hook run the same package gate. It verifies the Bun revision, formatting, lint, types, behavior tests, build, manifest, archive contents, source allowlist, and GitHub workflows. jactionlint 2.2.0 runs with `--strict-exit`; ShellCheck 0.11.0 supplies its shell analysis. The workflow has bounded runtime and concurrency, read-only repository access, and runs for pull requests and pushes to `main`.

The separate Firefox qualification workflow runs the unsigned XPI on Ubuntu 24.04 x64 and Windows Server 2025 x64 with exact Firefox versions `140.0`, `153.5.1esr`, and `158.0.1`. Those jobs install only the pinned Bun, not the full development gate toolset. They validate packaging, rebuild the source ZIP, and run the 27 browser probes. Seven-day artifacts retain their controlled-fixture JSON reports. Linux jobs install `libdbus-glib-1-2` for managed Firefox. Results qualify only the recorded cases and environments, not native-popup usability or every desktop distribution.

The API probe pins Selenium Manager's geckodriver selection to `0.37.1`, ignores browser/driver binaries on `PATH`, and asserts the returned driver and requested browser versions. It disables Selenium Manager statistics. The package checker uses JSZip 3.10.2 as a direct development dependency; Selenium already resolved that version. It is not part of the extension bundle.

The Chrome qualification workflow separately pins Chrome for Testing and ChromeDriver to `156.0.8078.47` on Ubuntu 24.04 x64 and Windows Server 2025 x64. It validates the Chrome package, rebuilds its source archive, and records 24 checks with explicit fixture/native-consent limits. `mise run test-chrome`, `mise run test-chrome-popup`, `mise run package-chrome`, and `mise run test-source-build-chrome` are the corresponding local tasks. The shared gate validates both Firefox and Chrome artifacts. See [testing](testing.md) for authority boundaries and report paths.

The Ubuntu Chrome job installs an AppArmor profile for only the exact pinned testing binary in Selenium's cache. It allows that binary to create user namespaces for Chromium's sandbox, following [Chromium's path-specific guidance](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md). The runner lacked a ready installed setuid helper. The job keeps the global user-namespace restriction and Chrome sandbox enabled, with no `--no-sandbox` flag. This policy is confined to the ephemeral hosted runner. Driver diagnostics remain in ignored scratch space and seven-day CI artifacts.

ChromeDriver must enable its documented `enableExtensionTargets` capability to list extension-created investigation tabs. Without it, the product opens the tab and DevTools/browser tab queries see it, but the driver omits that tab from its window handles. This is test-process introspection authority, not a product permission. See [ChromeDriver capabilities](https://developer.chrome.com/docs/chromedriver/capabilities).

## Timing comparison qualification

The approved optional timing comparison extends browser qualification through `timing-handoff-checks.mjs`. Firefox additionally prepares a named source-popup fixture with pinned `Bun.Transpiler`; only local test files receive compiled core modules. The source package remains the reviewed product input allowlist. When its private fixture is available, Firefox records 40 checks; Chrome records 34. These counts include explicitly different fixture authority and do not replace native unmodified popup qualification. See [testing](testing.md).

## Migration and rollback

The migration imported the prior pnpm lock before changing development tools. Retained package resolutions did not change. All 26 behavior test cases remain, including the explicit synchronization that tests clearing an in-flight request. Browser types now describe only the Promise-based methods and response fields consumed by the inspector. The generated production JavaScript and manifest matched the previous build byte for byte during migration verification.

The pre-migration source is commit `b18023b`. Roll back through a reviewed revert commit if this canary stops meeting project needs, then reinstall the restored pinned toolchain and lockfile. Keep application behavior and capability claims unchanged during a tooling rollback. A later canary update must change the exact archive URLs, checksums, package metadata, and revision guard together, then pass the complete gate and Firefox probes.

## Sources

- [Bun formatting](https://bun.sh/docs/format), [linting](https://bun.sh/docs/lint), and [type checking](https://bun.sh/docs/runtime/check).
- [Bun lockfile migration](https://bun.sh/docs/pm/lockfile).
- [Pinned Bun CLI source](https://github.com/oven-sh/bun/blob/963452075e9d7e2a47a482f297143af5ed4f76c0/src/runtime/cli/mod.rs).
- [mise HTTP platform downloads](https://mise.jdx.dev/dev-tools/backends/http.html#per-platform-downloads).
- [hk](https://github.com/jdx/hk) and [jactionlint](https://github.com/jdx/jactionlint).
