# Native desktop popup checks

This protocol is the handoff for the remaining Linux and Windows UI qualification. Use a visible desktop and a disposable Firefox profile. The existing hosted API matrix remains separate evidence. A headed CI process alone does not establish desktop input, focus, or assistive-technology usability.

## Prepare the test

Record the source commit and confirm a clean checkout. Preserve any existing work before preparing another checkout. Record the OS version, architecture, desktop environment, display/session type, Firefox version, and input or accessibility tools used.

Install the pinned runtime and dependencies from the repository:

```sh
mise install http:bun
mise exec -- bun install --frozen-lockfile
```

The pinned archives currently cover Linux x64, Windows x64, and macOS arm64. Run one exact browser version at a time. The versions already exercised in the API matrix are `140.0`, `153.5.1esr`, and `158.0.1`.

On a Linux desktop:

```sh
FIREFOX_VERSION=140.0 mise run test-firefox-popup-package
```

In Windows PowerShell:

```powershell
$env:FIREFOX_VERSION = '140.0'
mise run test-firefox-popup-package
```

The task builds and validates the unsigned XPI, prints its SHA-256, creates a disposable profile, installs AddonRay and a controlled fixture, and serves a loopback HTTP page. Wait for the ready message and verify that the visible page says "Controlled local page". The helper does not produce an automated UI verdict. Do not use a normal browsing profile or repackage the file while this browser is running.

## Observe the actual popup

Record each case as passed, failed, blocked, or not observed. Describe the visible result. Keep an unexercised branch marked not observed.

| Case  | Action                                                                                                                                                                          | Expected behavior                                                                                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-01 | Open AddonRay through Firefox's extension menu.                                                                                                                                 | The actual toolbar popup renders with empty inventory and page results.                                                                                                                              |
| UI-02 | Choose inventory access and deny Firefox's prompt.                                                                                                                              | The product explains denial and shows no inventory. Record whether the prompt left the popup open.                                                                                                   |
| UI-03 | Retry inventory access and approve.                                                                                                                                             | AddonRay and the controlled fixture appear. If consent closed the popup, reopen and choose the action again; reopening must start empty.                                                             |
| UI-04 | Inspect the selected local page.                                                                                                                                                | Readiness and supported performance entry types appear. Record any browser prompt. No page content or URL appears in the result.                                                                     |
| UI-05 | Clear the session after both results are visible.                                                                                                                               | Both results disappear.                                                                                                                                                                              |
| UI-06 | Load inventory, close with Escape, and reopen.                                                                                                                                  | The new popup has no results. A fresh inventory action can use a retained grant.                                                                                                                     |
| UI-07 | Close the popup, open AddonRay's Permissions and data panel in Firefox's Add-ons Manager, and revoke the optional inventory grant. Reopen AddonRay and request inventory again. | Firefox shows the grant off, the reopened popup is empty, and the new action requests consent again. Denial leaves inventory empty. This does not exercise live revocation while a popup stays open. |
| UI-08 | With `about:addons` selected, open the actual popup and choose page inspection.                                                                                                 | A bounded refusal or unavailable-result explanation appears without a page observation.                                                                                                              |
| UI-09 | Use the keyboard to reach and activate each popup control.                                                                                                                      | Controls have visible focus, remain reachable, and activate without a pointer. Record any focus loss around prompts or reopening.                                                                    |
| UI-10 | Check the popup with the desktop's screen reader, if available.                                                                                                                 | Record the reader/version, control labels, reading order, and announced result changes. If unavailable, mark this case blocked.                                                                      |
| UI-11 | If a consent prompt closes or is dismissed while work is pending, reopen and inspect the result.                                                                                | Reopening starts empty. Only a fresh explicit action can collect data. If this branch does not occur, mark it not observed.                                                                          |

Never change the controlled fixture or other extensions through AddonRay. UI-07 changes only AddonRay's own optional permission through Firefox's controls.

## Finish and record evidence

Press Enter in the launching terminal. Verify that the owned browser and local server close and the launcher exits with code 0. Keep raw screenshots or notes about controlled test data in ignored `.scratch/`. Do not capture an ordinary profile's inventory or browsing information.

Record the following in a dated evidence document after performing the checks:

- Full source commit and clean/dirty status.
- Exact desktop/session, OS, architecture, browser, input method, and accessibility tools.
- XPI SHA-256 printed by the packaging check.
- Case outcomes, prompt/popup lifetime, and observed failure details.
- Cases not observed or blocked, including the reason.
- Browser/server cleanup and launcher exit status.

An automated API pass, a screenshot, or successful setup alone does not complete this protocol. Keep signing, persistent installation, and publication at the separate distribution gate.
