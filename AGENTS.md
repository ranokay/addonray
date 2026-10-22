# Working on AddonRay

Read [docs/status.md](docs/status.md) first to resume. Read [docs/requirements.md](docs/requirements.md) for the approved phase and [GLOSSARY.md](GLOSSARY.md) for product terms.

Before changing permissions, browser integrations, or capability claims, read [docs/api-limits.md](docs/api-limits.md) and [docs/privacy.md](docs/privacy.md). Before changing architecture or session lifetime, read [docs/architecture.md](docs/architecture.md) and the relevant records in [docs/adr](docs/adr).

Implement one approved phase at a time. Keep missing metadata unknown. Separate documentation, fake-browser tests, and observed Firefox evidence. Browser probes use disposable profiles and controlled fixture extensions. Product code offers inspection and explanations; it never attempts to change other extensions' state.

Before changing development tools, hooks, or CI, read [docs/toolchain.md](docs/toolchain.md). Use the checksum-pinned Bun canary through mise. The shared hk gate includes jactionlint. Keep hooks in check-only mode without automatic staging or stashing.

Run `mise run check` before committing. Run `mise run test-firefox` for browser API changes and record the exact version, observed results, and gaps in [docs/evidence](docs/evidence). If a probe cannot run, leave its qualification incomplete. Keep raw local data in ignored `.scratch/`.

The approved remote is private `ranokay/addonray`, integration branch `main`. Sign commits and stage authored paths explicitly. Preserve other work. Licensing, public visibility, AMO publication, and destructive operations need explicit user authorization. Current source has no license grant.

Use the locally installed Matt Pocock grilling/domain-modeling skills for unresolved product decisions. Record answers in [docs/decisions.md](docs/decisions.md), product terms in the glossary, and durable trade-offs in ADRs. Use [docs/status.md](docs/status.md) as the local delivery checklist; do not create tracker issues or labels unless requested.
