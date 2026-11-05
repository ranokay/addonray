# Working on AddonRay

Read [docs/status.md](docs/status.md) first to resume. Read [docs/requirements.md](docs/requirements.md) for the approved phase and [GLOSSARY.md](GLOSSARY.md) for product terms.

Before changing permissions, browser integrations, or capability claims, read [docs/api-limits.md](docs/api-limits.md) and [docs/privacy.md](docs/privacy.md). Before changing architecture or session lifetime, read [docs/architecture.md](docs/architecture.md) and the relevant records in [docs/adr](docs/adr).

Implement one approved phase at a time. Keep missing metadata unknown. Separate documentation, fake-browser tests, and observed Firefox evidence. Browser probes use disposable profiles and controlled fixture extensions. Product code offers inspection and explanations; it never attempts to change other extensions' state.

Before changing development tools, hooks, or CI, or setting up a worktree, read [docs/toolchain.md](docs/toolchain.md). Run `mise run setup` in each fresh worktree. Use the checksum-pinned Bun canary through mise. The shared hk gate includes jactionlint. Keep hooks in check-only mode without automatic staging or stashing.

Run `mise run check` before committing. A review round runs the browser checks its change affects; for shared browser API changes, run `mise run test-firefox` and `mise run test-chrome` and record exact distributions, versions, observed results, and gaps in [docs/evidence](docs/evidence). The full `mise run test-browsers` matrix is required on the final approved head only. CI runs Chrome and the three pinned Firefox versions on every PR; its Firefox jobs use packaged probes, not the unpacked local probes. Read [the Chrome plan](docs/plans/chrome-mv3.md) before changing target support or test authority. If a probe cannot run, leave its qualification incomplete. Keep raw local data in ignored `.scratch/`.

The remote is `ranokay/addonray`, integration branch `main`. Owned code and documentation use Apache-2.0; preserve NOTICE and THIRD_PARTY_NOTICES.txt, including reserved branding and upstream terms. Sign commits and stage authored paths explicitly. Preserve other work. Before any push or PR, confirm the repository's current visibility from GitHub. Changing it needs explicit user authorization. License-policy changes, store publication and destructive operations also need explicit user authorization.

Use the locally installed Matt Pocock grilling/domain-modeling skills for unresolved product decisions. Record answers in [docs/decisions.md](docs/decisions.md), product terms in the glossary, and durable trade-offs in ADRs. Use [docs/status.md](docs/status.md) as the local delivery checklist; do not create tracker issues or labels unless requested, except relabeling an issue from `needs-info` to `ready-for-agent` when a merged plan settles its decisions.

## Agent skills

### Issue tracker

Issues and specs live in `ranokay/addonray` on GitHub. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage roles and label names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout with root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.
