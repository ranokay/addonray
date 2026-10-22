# Decisions and interview record

Date: 2026-10-22, Europe/Bucharest.

## Confirmed by the user

| Decision            | Answer                                                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product audience    | Firefox desktop power users, guided troubleshooting first. Developer profiling later.                                                                                      |
| Privacy             | No telemetry or cloud service. Diagnostics stay in the current session. Inventory/page inspection require explicit consent. Saved/exported reports need a separate action. |
| Product name        | AddonRay.                                                                                                                                                                  |
| Repository identity | `ranokay/addonray`, under the authenticated user account.                                                                                                                  |
| Initial visibility  | Private.                                                                                                                                                                   |
| License             | Decide later. No license grant in the initial source.                                                                                                                      |

## Fixed by the request

WXT, TypeScript, React; phased feasibility tests; honest inventory/capability explanations; diagnostics later; optional Rust companion eventually; no implication of arbitrary global or per-site extension toggling.

## Implementation choices confirmed in the final scope review

- A small popup with inventory and minimal selected-page probes.
- Firefox desktop MV3, initial manifest minimum 140. Actual platform support follows evidence.
- Required `activeTab`; optional `management` and `scripting`; no broad host permissions.
- Popup memory only. Closing or clearing discards results. Browser permission grants may persist independently.
- Phase 0 stops before continuous recording, export, background coordination, and native implementation.
- A stable development extension ID derived from the approved product/repository identity. Final distribution identity remains a release decision.
- Local deterministic checks and disposable-profile Firefox tests, with qualification gaps visible.

## Interview status

All three rounds are answered. The user confirmed shared understanding and authorized Phase 0 implementation, tests, a signed initial commit, and a push to private `ranokay/addonray`. Technical details within those boundaries are delegated to the implementing agent. Further product phases and publication remain separate decisions.

Independent review added two acceptance details: bind the selected tab before waiting for consent, and verify the actual popup lifetime around permission prompts. The first is implemented and tested. Follow-up [native-popup evidence](evidence/2026-10-22-qualification.md) covers the second on Firefox 158.0.1 on macOS arm64. Other browser/OS combinations remain unqualified.

## Earlier conversation limitation

The referenced ChatGPT conversation could be retrieved, but its assistant replies contain reference markers rather than architecture text. This plan uses the user's explicit restatement and current interview answers. No unseen detail is treated as agreed.

## Toolchain continuation

The user requested migration from pnpm and Prettier to Bun's ecosystem, including native formatting, linting, type checking, and tests, and explicitly requested hk and jactionlint. After reviewing stable versus canary availability, the user chose a pinned Bun canary with native fmt/lint. [Toolchain setup](toolchain.md) records the exact revision, installation, verification, and rollback. This changes development tooling within Phase 0; it does not authorize Phase 1 or alter product permissions and data retention.
