# Contributing

This is a private early-stage project with no license grant yet. Repository access does not establish a distribution license.

Start with [status](docs/status.md), [requirements](docs/requirements.md), and the [glossary](GLOSSARY.md). Read [API limits](docs/api-limits.md) before changing capability claims or browser permissions. Read [privacy](docs/privacy.md) before collecting or retaining data.

Implement one approved phase at a time. Keep browser adapters small and tests focused on observable behavior. Validate data at browser/page/native boundaries. Missing metadata stays unknown. A permission string, API method, mock result, or source reading must not become a claim of observed authority.

Follow [toolchain setup](docs/toolchain.md) for the pinned Bun canary, `bun.lock`, hk hooks, and jactionlint. Run `mise run check` before committing and both `mise run test-firefox` and `mise run test-chrome` for shared API behavior changes. Record skipped cases explicitly. Use disposable profiles and fixture extensions, and keep personal browsing data out of tests, issues, logs, and commits.

Commits should be signed and scoped to the change. Preserve work by others. Repository visibility, licensing, store publication, destructive Git actions, and changes to the user's ordinary browser profile require explicit authorization.

For a proposed change, describe the user-visible behavior, the permission/data consequence, tests run, and remaining qualification gaps. Update the relevant requirement or decision when behavior changes. Keep the resumption checklist accurate.
