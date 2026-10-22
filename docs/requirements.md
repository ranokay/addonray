# Product requirements

Status: Phase 0 scope approved on 2026-10-22 and scaffold implemented. See [decisions](decisions.md) and [observed evidence and gaps](evidence/2026-10-22-firefox.md).

## User stories

1. As a Firefox user, I want to see which extensions Firefox exposes so I can start investigating a problem.
2. As a privacy-conscious user, I want an explanation before granting inventory access so I can decline without breaking the rest of the tool.
3. As a user, I want enabled state and missing permission metadata represented accurately so I do not mistake missing data for no access.
4. As a user, I want to inspect the selected page only after a deliberate action so the tool does not monitor my browsing.
5. As a user, I want to know when Firefox prevents inspection so a browser restriction is not presented as a broken extension.
6. As a user, I want observations distinguished from suspicions so I do not blame an unrelated extension.
7. As a user, I want to clear the visible session immediately so diagnostic details do not linger.
8. As a contributor, I want repeatable probes and evidence records so I can verify browser support independently.
9. In a later phase, as a user, I want a guided comparison while I change extension settings through Firefox so I can reproduce a difference.
10. In a later phase, as a user, I want to review a minimized report before exporting it so sharing remains my choice.

## Phase 0 acceptance

| ID    | Observable behavior                                                                                                                                                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-01 | A Firefox MV3 build opens a React interface without collecting inventory or page data on load.                                                                                                                                               |
| P0-02 | The inventory action explains and requests optional `management` access from a user gesture. Denial produces a clear result and no inventory call.                                                                                           |
| P0-03 | The inventory lists extension identity, name, version, enabled state, and permission metadata when Firefox supplies it. Missing permission fields are shown as unknown. Themes are outside this inventory.                                   |
| P0-04 | A separate page action requests optional `scripting` access and uses `activeTab` for the tab selected at the click. Start capturing the tab before waiting for consent and never retarget after the prompt. The top frame only is inspected. |
| P0-05 | The page probe returns only document readiness and supported performance entry types. It collects no URL, title, DOM content, resource list, request headers, or page errors.                                                                |
| P0-06 | Restricted pages, closed tabs, denied permissions, absent APIs, malformed results, and other failures become bounded explanatory results.                                                                                                    |
| P0-07 | Capability explanations explicitly mark global toggling, per-site control of other extensions, and cross-extension console/performance attribution as unsupported for the ordinary distribution.                                             |
| P0-08 | Closing the interface or clearing the session discards diagnostic results. Reopening starts empty even if Firefox remembers a previously granted optional permission.                                                                        |
| P0-09 | Tests exercise consent, partial inventory metadata, capability gating, invalid page responses, and permission revocation. Build checks enforce the intended permission budget.                                                               |
| P0-10 | A disposable Firefox profile runs real probes. Evidence names the browser version, OS, probe, expected/observed behavior, and qualification gaps. Simulated tests never stand in for these results.                                          |

## Later product behavior

Phase 1 adds inventory filtering, permission explanations, manual comparison guidance, and accessible empty/error states. Phase 2 considers bounded page diagnostics with separate consent and explicit feature support. Export requires preview and minimization rules. No later phase begins automatically because a capability appears possible.

## Out of scope for Phase 0

Continuous recording, network collection, page-world instrumentation, console interception, automatic culprit ranking, automated extension state changes, theme management, report export, persistent history, mobile/Chromium support, accounts, sync, AMO publication, and a native companion implementation.

## Important edge cases

- An enabled extension may have permission to access a site without having executed there.
- A disabled extension can have unavailable permission metadata.
- A user may revoke optional permissions while the interface is open. Clear affected results and require a new explicit action.
- A navigation can remove the temporary page grant. Do not silently broaden host access or retry against another tab.
- Page-provided values are untrusted even when they arrive through a browser scripting result.
- A failed comparison can be caused by page variability, browser protections, caches, or an interaction among extensions.
