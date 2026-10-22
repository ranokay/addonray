# AddonRay

AddonRay helps Firefox users investigate broken or slow pages with an extension inventory, explicit capability limits, and guided comparisons.

Product name and private repository identity `ranokay/addonray` were approved on 2026-10-22. This directory retains its original `fext` name. Licensing is undecided. The repository has no license grant.

## Current state

Phase 0 is scaffolded. The requirements interview and scope review are complete. The extension includes explicit consent, inventory, a minimal selected-page probe, and capability explanations. [Qualification evidence](docs/evidence/2026-10-22-qualification.md) records current-release native-popup checks, release/ESR API checks, and the Firefox 140 loading blocker. This is a feasibility build, not an AMO release.

## Run locally

```sh
mise install http:bun hk jactionlint shellcheck
mise exec -- bun install --frozen-lockfile
mise run hooks-install
mise run check
mise exec -- bun run dev
```

The project uses a checksum-pinned Bun canary for native formatting, linting, type checking, and tests. `mise run fmt` formats files; `mise run lint` checks source. See [toolchain setup and rollback](docs/toolchain.md) for the exact pin and hk hook behavior.

The development task starts Firefox. Alternatively, run `mise exec -- bun run build`, open `about:debugging#/runtime/this-firefox`, choose Load Temporary Add-on, and select `.output/firefox-mv3/manifest.json`.

```sh
mise run test-firefox
```

The real-browser task builds the extension, then uses Selenium Manager to locate/download Firefox and its driver. It creates a disposable profile and controlled fixtures, and writes local evidence to ignored `.scratch/`. It never uses the ordinary Firefox profile. The test driver has browser-UI privileges solely for fixture setup and permission dialog automation. The production extension has no such privilege.

## Read the project

- [Vision](docs/vision.md) explains who this serves and what success means.
- [Product requirements](docs/requirements.md) defines behavior and acceptance criteria.
- [Architecture](docs/architecture.md) describes the extension boundaries and future companion.
- [API limits](docs/api-limits.md) separates documented APIs from observed behavior.
- [Privacy](docs/privacy.md) defines permission requests and data retention.
- [Phases](docs/phases.md) provides delivery gates and explicit stop conditions.
- [Testing](docs/testing.md) distinguishes simulated tests from Firefox evidence.
- [Toolchain](docs/toolchain.md) covers Bun, hk, jactionlint, setup, and rollback.
- [Decisions](docs/decisions.md) records answers and open questions.
- [Naming research](docs/naming.md) records the shortlist and collision checks.
- [Checklist and handoff](docs/status.md) is the resumption entry point.
- [Glossary](GLOSSARY.md) defines product terms.
- [Contributing](CONTRIBUTING.md) explains how to change this project.

AddonRay does not offer arbitrary global or per-site switches for other extensions. An inventory entry does not prove that an extension ran on the current page. Diagnostics can supply observations and comparison results, not a reliable verdict about which extension caused a problem.
