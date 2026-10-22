# Phase 1 first slice: searchable, understandable inventory

Status: the user approved A, Quick list, with a dark/black theme by default and these acceptance criteria on 2026-10-23. Production implementation is in progress. Native desktop and distribution gates remain open as recorded in [Phase 0 readiness](../evidence/2026-10-22-phase0-readiness.md).

## Problem and intended result

The current popup lists exposed extensions and raw permission strings. A user with several extensions has to scan the entire list and interpret those strings alone. This slice adds local search, an enabled-state filter, readable permission explanations, and instructions for using Firefox's controls.

The popup remains the session boundary. Existing consent and page-inspection behavior stay in place. Search and filtering operate on inventory already loaded through an explicit action. They make no additional browser calls.

## Product behavior

| ID     | Acceptance criterion                                                                                                                                                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1A-01 | After inventory succeeds, a labelled search input matches extension names, IDs, reported API permission identifiers, and reported host patterns. Matching is case-insensitive literal substring search with surrounding whitespace ignored. Missing fields contribute no searchable permission values. |
| P1A-02 | A labelled state filter offers All, Enabled, and Disabled. It combines with search, preserves alphabetical ordering, and shows the number displayed out of the total exposed inventory. No match and an empty browser inventory have distinct explanations.                                            |
| P1A-03 | Permission details preserve the exact identifiers Firefox supplied and add concise explanations for the covered permissions. An unrecognized identifier receives an explicit unavailable-explanation fallback. No severity score, risk rating, or execution claim is inferred.                         |
| P1A-04 | Missing metadata stays unknown. An empty reported list stays distinct from unavailable metadata. Host patterns remain escaped text with a general scope explanation and browser-restriction caveat. They are not loaded as remote resources or converted into automatic site visits.                   |
| P1A-05 | A manual guidance section explains how to use Firefox's extension menu and Manage extensions controls. It warns that opening settings closes and clears this popup. AddonRay offers no cross-extension toggle or site-access control.                                                                  |
| P1A-06 | Clear, permission revocation, inventory refresh, and popup close/reopen discard search/filter/detail UI state together with the affected inventory. Pending work cannot repopulate cleared results.                                                                                                    |
| P1A-07 | Controls have persistent labels, visible keyboard focus, and keyboard activation. Result counts use a concise polite announcement. Unknown, denied, empty, and no-match states remain usable.                                                                                                          |
| P1A-08 | Required/optional permissions, data collection, retention, and page-probe output stay within the approved Phase 0 boundary. No browser API is called on load or because a user types or changes a display filter.                                                                                      |
| P1A-09 | Tests cover search/filter combinations, metadata distinctions, unknown explanation fallbacks, and reset behavior. Browser checks exercise the updated production interface with controlled fixtures; existing API/package checks and permission-budget checks still pass.                              |

Start the explanation set with the permissions exposed by AddonRay and the controlled fixtures, plus common adjacent cases: `activeTab`, `management`, `scripting`, `storage`, `tabs`, and `webRequest`. Keep unsupported identifiers visible through the fallback. The prototype's illustrative wording will be reviewed against primary references before production implementation.

## Implementation outline

Reuse the existing inventory adapter, consent flow, session controller, and React/plain CSS stack. Keep display filtering and explanation lookup separate from browser access. Let an inventory-scoped component own temporary display state so clearing or removing that inventory also removes its controls and state. Keep the page probe and capability explanations available.

The requested [prototype skill](/Users/ranokay/.agents/skills/prototype/SKILL.md) produces fixture-only variations on the existing popup route. The full experiment is captured on [prototype/inventory-popup](https://github.com/ranokay/addonray/tree/prototype/inventory-popup) in signed commit [36e4d24](https://github.com/ranokay/addonray/commit/36e4d24b3febc304489887831289f31040ec3b55), outside `main`. [Implementation issue #1](https://github.com/ranokay/addonray/issues/1) holds the prototype pointer and selected verdict. Rewrite the chosen design under production constraints; do not promote prototype code unchanged.

## Prototype question

Which information hierarchy works best in a compact inventory popup?

| Variant              | Primary interaction                                               | Tradeoff to evaluate                                                                         |
| -------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A: Quick list        | Scan extension names/states and expand one row.                   | Fits the existing task with little navigation and hides longer explanations until requested. |
| B: Permission lens   | Choose a reported permission, then inspect matching extensions.   | Makes access questions easy to start but adds vertical space and another filter concept.     |
| C: Focused inspector | Choose an extension from a compact list and read its detail pane. | Keeps one extension's facts together but leaves less width for long metadata.                |

Verdict: A is the production baseline, with a dark/black theme by default. The user selected it after the three-layout preview. Names and states remain easy to scan, with longer metadata revealed by expanding a row. B and C remain preserved as design sources for future investigation views. The original prototype keeps its light palette; the production rewrite applies the requested dark palette without adding a theme preference or persistence.

The preview runs with `mise run prototype` from the prototype checkout. Open `http://127.0.0.1:5188/entrypoints/popup/index.html?variant=A`, then use the bottom switcher for B and C. All displayed inventory and page results are fictional fixtures.

## Prototype validation

On 2026-10-23, the shared gate passed in both the planning checkout and the prototype checkout, including all 26 existing behavior tests. Preview interactions exercised search/filter combinations, unavailable and unrecognized metadata, denied and empty inventory, Clear, URL-based variant switching, and arrow-key behavior while search has focus. The production extension bundle on the prototype branch excludes the fixture strings and switcher. These checks do not qualify native Firefox usability or the future production implementation.

An independent prototype review was attempted but did not complete because the review agent reached its usage limit. Do not treat that review as passed.

## Validation and stop condition

Verify pure display behavior with focused Bun tests and run the required shared gate. Extend the controlled browser interface checks where they verify the new behavior, then run the packaged exact-version matrix. Observe keyboard use in an actual macOS popup. Record Linux/Windows native desktop and screen-reader coverage separately; existing open gates stay open.

This slice ends when the agreed inventory behavior is implemented, reviewed, and supported by current tests and browser evidence. It adds no manual comparison records, longer-lived investigation, background process, continuous diagnostics, report export, persistence, new host access, or companion. Manual before/after comparisons remain a later Phase 1 slice with their own investigation-lifetime decision.

## Primary references

- [Firefox extension metadata fields](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/management/ExtensionInfo).
- [API and host permission meanings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions).
- [Firefox limits on extension state changes](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/management/setEnabled).
