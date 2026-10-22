# Phase 0 acceptance and remaining qualification

## Evidence map

This maps the approved Phase 0 requirements to their current evidence. The real-browser reports name exact versions and platforms; the Bun tests cover controlled failure and lifecycle cases. The [packaging report](2026-10-22-packaging.md) records the source revisions, artifact hashes, and detailed limits.

| Requirement                                | Evidence                                                                                                                                                  | Boundary                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| P0-01: empty initial interface             | Session tests, production-document API checks, and native macOS popup observations.                                                                       | Native Linux/Windows popup usability remains open.                       |
| P0-02: explicit optional inventory consent | Adapter denial/approval tests and real Firefox permission-dialog checks.                                                                                  | A retained grant still requires an explicit product action.              |
| P0-03: honest inventory metadata           | Adapter normalization tests and enabled/disabled controlled-fixture browser checks.                                                                       | Missing permissions remain unknown; inventory is not execution evidence. |
| P0-04: selected top-frame access           | Tests bind the selected tab before consent resolves; real browser checks exercise the actual toolbar grant without host permissions.                      | Browser restrictions and navigation can remove access.                   |
| P0-05: minimized page observation          | Collector/validator tests, manifest checks, and real local-page observations.                                                                             | Only readiness and supported performance entry types are collected.      |
| P0-06: bounded failures                    | Tests cover denied access, missing tab/API, rejected injection, and malformed responses. Real probes cover protected contexts.                            | Simulated failures and real browser observations remain distinct.        |
| P0-07: capability limits                   | Product explanations, capability tests, and rejected ordinary-extension mutation against a disposable fixture.                                            | The product provides no cross-extension switches or attribution verdict. |
| P0-08: session lifetime                    | Clear, revocation, and late-work tests; real document reopen and native macOS popup close/reopen observations.                                            | Closing during pending consent remains an unobserved native branch.      |
| P0-09: tests and permission budget         | All 26 behavior tests, manifest checks, package validation, formatting, lint, types, and workflow checks.                                                 | Passing deterministic checks does not establish desktop usability.       |
| P0-10: actual Firefox evidence             | Twelve API cases on each of three named Firefox versions across macOS arm64, Ubuntu x64, and Windows Server x64, plus separate native macOS observations. | Coverage is limited to the recorded environments and installation modes. |

## Open release gates

- Visible Linux and Windows desktop popup/input/accessibility checks. Follow the [native QA handoff](../desktop-popup-qa.md).
- Native branches and packaged browser combinations that remain unobserved in the dated evidence.
- Mozilla signing, persistent installation/restart behavior, final extension identity, licensing, and authorization to publish.

No controllable Linux or Windows desktop session was established during the continuation on 2026-10-22. The available local UI controls target macOS. The local Linux container runtime had no running desktop, and the repository had no self-hosted runner. No remote desktop connection or new environment was provisioned.

## User decision

The user chose to move into Phase 1 planning for the private build while keeping native Linux/Windows popup usability and signing as open release gates. This authorizes the scope review. Phase 1 implementation still requires an agreed slice and acceptance criteria. The open gates above remain unchecked.
