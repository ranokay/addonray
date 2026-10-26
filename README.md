# AddonRay

AddonRay helps Firefox and Chrome users investigate broken or slow pages with an extension inventory, explicit capability limits, and manual troubleshooting guidance.

Product name and private repository identity `ranokay/addonray` were approved on 2026-10-22. This directory retains its original `fext` name. Licensing is undecided. The repository has no license grant.

## Current state

Phase 0 is scaffolded. The approved first Phase 1 slice adds local inventory search, enabled-state filtering, permission explanations, and manual browser-controls guidance in a dark popup. The approved manual comparison adds a fresh investigation tab for one Before/After inventory pair and your assessment of the page. Its results live only while that tab remains loaded. The popup retains explicit consent, a minimal selected-page probe, and capability explanations. [Current status](docs/status.md) tracks implementation and qualification. [Earlier evidence](docs/evidence/2026-10-22-qualification.md) records minimum/release/ESR API and native-popup checks on macOS arm64. This is a private feasibility build; Store distribution remains a separate release gate.

The approved builds are Firefox MV3 and Chrome MV3. Desktop targets are macOS, Linux, and Windows. Other browsers and MV2 remain deferred. [Chrome compatibility criteria](docs/plans/chrome-mv3.md) distinguish repeatable Chrome for Testing checks from retail installation and native usability. [Packaged-extension qualification](docs/evidence/2026-10-22-packaging.md) tracks unsigned XPI checks and the Linux/Windows API matrix separately from native-popup usability and signing. `mise run package` creates the XPI and source ZIP locally; it publishes nothing.

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

For Chrome, use `mise exec -- bun run dev:chrome` or `mise run package-chrome`. The latter creates a validated Chrome ZIP and browser-named source ZIP. `mise run test-chrome` uses an exact Chrome for Testing version in a disposable profile; `mise run test-chrome-popup` opens a visible session for separate native-consent observations. [Testing](docs/testing.md) describes the pre-granted UI fixture and unmodified product checks.

## Read the project

- [Vision](docs/vision.md) explains who this serves and what success means.
- [Product requirements](docs/requirements.md) defines behavior and acceptance criteria.
- [Architecture](docs/architecture.md) describes the extension boundaries and future companion.
- [API limits](docs/api-limits.md) separates documented APIs from observed behavior.
- [Privacy](docs/privacy.md) defines permission requests and data retention.
- [Phases](docs/phases.md) provides delivery gates and explicit stop conditions.
- [Testing](docs/testing.md) distinguishes simulated tests from observed browser evidence.
- [Toolchain](docs/toolchain.md) covers Bun, hk, jactionlint, setup, and rollback.
- [Decisions](docs/decisions.md) records answers and open questions.
- [Naming research](docs/naming.md) records the shortlist and collision checks.
- [Checklist and handoff](docs/status.md) is the resumption entry point.
- [Glossary](GLOSSARY.md) defines product terms.
- [Contributing](CONTRIBUTING.md) explains how to change this project.

AddonRay does not offer arbitrary global or per-site switches for other extensions. An inventory entry does not prove that an extension ran on the current page. Diagnostics can supply observations and comparison results, not a reliable verdict about which extension caused a problem.

## Page-timing snapshot

The page-inspection action also reads three recorded loading milestones: DOM content loaded, load event completed, and first content displayed when reported. It uses the document loaded in the originally selected tab when the check runs. Results stay in popup memory. The check does not reload the page, record later interactions, collect a URL/content, or identify a responsible extension. See the [approved scope](docs/plans/phase2-timing.md) for field definitions, size/runtime budgets, and qualification requirements.

The approved [optional timing comparison](docs/plans/phase2-timing-comparison.md) adds an explicit Attach timing action. Choose an investigation and side to retain that timing in its memory. Attach Before before starting the After inventory, then capture After timing from the same browser tab. The comparison shows measured millisecond differences with uncertainty, while inventory-only comparisons remain available. Attachments work only between verified normal-window views and add no permissions or saved history. Qualification is tracked in [status](docs/status.md).

## Page-error checks

Choose New page-error check from the source page's popup, then explicitly Start
in its separate check tab. Reproduce the problem on the original page and Stop
to keep confirmed counts, or let the 30-second/200-event window finish. The check
counts only future top-frame uncaught JavaScript error and unhandled-rejection
notifications. It collects no raw messages, stacks, rejected values, URLs or
page titles, and cannot identify a responsible extension.

Only verified normal windows participate. Firefox's observer stays isolated;
Chrome's runs with the page, which can interfere with its counts. Start over,
Clear, permission revocation and owner teardown discard results. Reload loses
the source binding. Each view keeps its own temporary data. See
[qualification and remaining gaps](docs/evidence/2026-10-24-phase2-page-errors.md).

## Optional page-error comparisons

In a completed check, choose Attach to investigation. Select its label and an
error-count side, then confirm. Attach Before before starting After inventory;
attach After only after its inventory and the Before error attachment exist.
Each completed check attaches successfully once. Its summary stays readable.

The investigation owns a copy after the check resets or closes. All timing and
error attachments use the same browser tab, without collecting its URL/title or
proving that it still contains the same page. Start over in the investigation,
permission revocation, reload, close or unloading discards all its observations.
Counts, durations and completion reasons appear side by side. Different intervals
or interactions prevent automatic error-rate or causal comparisons. See the
[approved scope](docs/plans/phase2-page-error-comparison.md) and
[current qualification](docs/status.md).
