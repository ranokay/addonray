# Development toolchain

## Why this Bun build

On 2026-10-22 the user chose a pinned Bun canary with native formatting and linting. Stable Bun 1.4.3 includes native type checking, but its formatter and linter are canary-only at this date. This is a development dependency choice. It does not change the Firefox extension's runtime or permissions.

The official distribution package is `1.4.3-canary.20261021.1`. Its CLI reports `1.4.4-canary.1`, and its full source revision is `963452075e9d7e2a47a482f297143af5ed4f76c0`. The gate checks that revision rather than relying on the differing version labels.

`mise.toml` downloads the official native package through mise's HTTP backend with a fixed URL and SHA-512 checksum. The initial platforms are macOS arm64 and Linux x64. Other development platforms need their own verified archive entry. The project does not follow the moving `canary` tag or require Node to bootstrap Bun. Archive availability still depends on the upstream registry.

## Install and run

```sh
mise install http:bun hk jactionlint shellcheck
mise exec -- bun install --frozen-lockfile
mise run hooks-install
mise run check
```

Activate mise in the shell for direct Bun commands. Otherwise use `mise exec -- bun ...` so another installed Bun cannot take precedence.

| Command                          | Purpose                                                  |
| -------------------------------- | -------------------------------------------------------- |
| `mise run fmt`                   | Format source and documentation with native Bun fmt.     |
| `mise run lint`                  | Run native Bun lint with zero warnings allowed.          |
| `mise exec -- bun run typecheck` | Run the native TypeScript checker.                       |
| `mise exec -- bun test`          | Run the behavior tests with Bun's test runner.           |
| `mise run check`                 | Run the shared hk quality gate.                          |
| `mise run test-firefox`          | Build and run the disposable-profile Firefox API probes. |

The package scripts use `bun --check` for type checking and `--no-script` for native fmt/lint. These spellings avoid a same-named package script taking precedence. Use `bun run check` for the package's complete gate. TypeScript remains installed for WXT's peer dependency and editor support. WXT still prepares and builds the extension through Bun.

`bun.lock` is the only active dependency lockfile. pnpm, Prettier, and Vitest are no longer project tools.

## Hooks and CI

hk 2.8.0 reads `hk.pkl` and bundles its Pkl evaluator. `mise run hooks-install` installs a repository-local pre-commit hook through mise. The hook checks the whole working tree. It does not fix, stage, or stash files, so a passing hook does not certify that a partial staged snapshot contains every checked change. CI checks the committed snapshot independently.

Both `mise run check` and the hook run the same package gate. It verifies the Bun revision, formatting, lint, types, behavior tests, build, manifest, and GitHub workflows. jactionlint 2.2.0 runs with `--strict-exit`; ShellCheck 0.11.0 supplies its shell analysis. The workflow has bounded runtime and concurrency, read-only repository access, and runs for pull requests and pushes to `main`.

## Migration and rollback

The migration imported the prior pnpm lock before changing development tools. Retained package resolutions did not change. All 26 behavior test cases remain, including the explicit synchronization that tests clearing an in-flight request. Browser types now describe only the Promise-based methods and response fields consumed by the inspector. The generated production JavaScript and manifest matched the previous build byte for byte during migration verification.

The pre-migration source is commit `b18023b`. Roll back through a reviewed revert commit if this canary stops meeting project needs, then reinstall the restored pinned toolchain and lockfile. Keep application behavior and capability claims unchanged during a tooling rollback. A later canary update must change the exact archive URLs, checksums, package metadata, and revision guard together, then pass the complete gate and Firefox probes.

## Sources

- [Bun formatting](https://bun.sh/docs/format), [linting](https://bun.sh/docs/lint), and [type checking](https://bun.sh/docs/runtime/check).
- [Bun lockfile migration](https://bun.sh/docs/pm/lockfile).
- [Pinned Bun CLI source](https://github.com/oven-sh/bun/blob/963452075e9d7e2a47a482f297143af5ed4f76c0/src/runtime/cli/mod.rs).
- [mise HTTP platform downloads](https://mise.jdx.dev/dev-tools/backends/http.html#per-platform-downloads).
- [hk](https://github.com/jdx/hk) and [jactionlint](https://github.com/jdx/jactionlint).
