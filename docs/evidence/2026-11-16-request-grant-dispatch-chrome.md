# Request grant dispatch feasibility (Chrome)

On 2026-11-16, the tracked probe at clean
`83421efc92e29f432064072575df34e72e571e2b` reproduced a REQ-1 first-grant
failure on Chrome for Testing 156.0.8078.47. An earlier tracked run at
`a63616c4585e04e1b0739892c8abce89bc61c003` produced the same contrast before
the stricter evidence checks below; that raw report is retained. A native
runtime grant of optional `webRequest` plus an exact host did not produce
terminal request observations in the extension context that existed when the
grant was approved. The identical fixture, extension path and ID, headful
command-line launch, controlled cases and registration logic did observe every
case after a browser restart with the persisted grant.

This is bounded feasibility evidence for #17. It authorizes no product wiring,
permission change, reload UX or support claim. Firefox REQ-1 remains
unqualified, and no REQ-1 acceptance is claimed for any target.

## Question and method

The approved REQ-1 flow opens one check owner, waits for a live grant snapshot,
requests optional `webRequest` and the selected scheme+host directly inside the
Start gesture, then collects terminal events in the background context. The
probe asks whether that flow observes controlled same-origin requests on this
exact build.

The probe holds these inputs constant for every phase:

- one generated fixture manifest: optional `webRequest`, optional `*://*/*`,
  service-worker background, no required API permission and no host permission;
- one extension directory, so Chrome derives one ID from the command-line path;
  the probe asserts the computed ID, the runtime ID and the fixture digests;
- headful `--load-extension` command-line loading (no DevTools extension
  install) in a disposable profile;
- the same three controlled fetches (`/case/a`, `/case/b`, `/case/c`) against
  one loopback origin from a page in a new tab;
- one registration implementation: a top-level attempt, a top-level
  `permissions.onAdded` handler, and an on-demand arm message, each guarded to
  register at most one listener per filter (`<all_urls>` and
  `http://127.0.0.1/*`). Every attempt is recorded.

Phases:

1. **First grant.** Native prompt approved from the operator desktop; the
   fixture owner page keeps Start disabled until its live `permissions.contains`
   snapshot is ready and calls `permissions.request` as the direct first action
   of the Start click.
2. **New worker, same extension context.** The service-worker target is closed
   and the next message starts a new worker in the same browser process.
3. **Browser restart.** The browser process is replaced; the profile, extension
   path, manifest, launch mode, case list and registration logic are unchanged;
   the persisted native grant is present before any action.
4. **Extension self-reload (diagnostic only).** A same-process
   `runtime.reload()` followed by attempts to reopen the owner page. This is
   retained as an unobserved harness case, not as a reload-UX claim.

The positive control is phase 3: it proves the fixture, server, source page,
event filters and summary path work. Matching is by source tab ID, origin and
initiator, path, status and resource type, not by total event count. Event
lists are capped at 40 entries and retained only in this controlled-fixture
debug report; the fixture uses no storage API and writes no origin, attempt or
cleanup record.

Before traffic, the probe reads and records the worker: its load serial, API
presence, and registration attempts. The worker-restart phase explicitly wakes
the new worker, requires a changed serial and both top-level registrations, and
requires the same worker to serve the readiness and traffic that follow. A
negative phase is accepted only with the full 5,000 ms window and at least 15
poll samples, rather than stopping on an unrelated event. Both filters must
register exactly once before the traffic boundary, with no failed registration
after success; the three controlled fetches must all return 200; and the debug
event list must stay below its cap. `tests/request-grant-dispatch.test.ts`
covers each rejection, including the false conclusions that a truncated window,
a failed fetch, a missing or duplicate registration, a saturated capture, or an
unrelated event could produce.

## Environment

| Item                 | Value                                                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser              | Chrome for Testing 156.0.8078.47                                                                                                                                                                                                            |
| Driver               | ChromeDriver 156.0.8078.47                                                                                                                                                                                                                  |
| OS                   | macOS 27.2 (26B123)                                                                                                                                                                                                                         |
| Architecture         | arm64                                                                                                                                                                                                                                       |
| Source               | `83421efc92e29f432064072575df34e72e571e2b`, clean                                                                                                                                                                                           |
| Invocation           | `mise exec -- bun scripts/request-grant-dispatch.mjs`                                                                                                                                                                                       |
| Native prompt        | macOS accessibility sheet: "AddonRay request grant dispatch diagnostic has requested additional permissions"; Allow pressed by the operator                                                                                                 |
| Fixture extension ID | `kajihikhpbfgnjpdlchgbkhnigojmolp` (path-derived, asserted equal to the runtime ID)                                                                                                                                                         |
| Fixture digests      | manifest `cfd528e73a9f3db265644f5d8dda80e3be1c7c0db95835e954663f7ea1f9b0e4`; background `69192b045ba0aad4634e8243ef52551b2cfe41a0c396cdf9b13b5845c9cc6007`; owner script `db6298ffe61f5d52b8b0bdbc20cc592ae4a5fb38260ae5c665f5d61372aef3cb` |
| Raw report           | `.scratch/request-grant-dispatch-wtUueM/report.json`, SHA-256 `9e7041527c1871cc2b1e040fff23ef715dcf92e663ee1f3dfc00ee11171395ad`                                                                                                            |

## Observed result

Grant path: Start was disabled at load and enabled only when its live snapshot
resolved. The pre-grant snapshot (`granted: false`) and its readiness record
preceded the Start click. The click handler captured
`navigator.userActivation.isActive` as `true` immediately before calling
`permissions.request`; the request resolved `true` 3,477 ms later.
`permissions.onAdded` fired at the resolution time, both listeners registered
within 1–4 ms, and `containsAfterGrant` was `true`. The pre-traffic readiness
record and the traffic boundary follow those registrations.

| Phase                            | Worker seen at load                                                                                             | Observation                                                                                                    | Controlled matches                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| First grant, live context        | `webRequest` absent; top-level registration failed for both filters; `permissions.onAdded` registered both once | 20 samples over 5,106 ms; counters 0/0                                                                         | 0 of 6                                                                            |
| New worker, same context         | API present; top-level registration ok; changed serial confirmed before traffic                                 | 20 samples over 5,162 ms; counters 0/0                                                                         | 0 of 6                                                                            |
| Browser restart, persisted grant | API present; top-level registration ok; arm reported both already registered                                    | first sample 13 ms after the fetches; counters 7/5                                                             | 6 of 6 (both filters, all three cases, XHR, status 200, source tab and initiator) |
| Extension self-reload            | Not observed                                                                                                    | Six owner-page attempts reached the URL but the owner script never initialized; no state or fetch was recorded | Not gated                                                                         |

All three fetches returned 200 in every gated phase, both filters registered
exactly once before traffic, and each phase retained fewer than 40 events. The
probe's gate evaluator requires the complete positive control, the full negative
windows, the pre-traffic readiness and registration records, a different worker
serial after the worker restart, and the exact expected namespace contrast. It
reported `outcome: reproduction-succeeded`; console output stated
`REQ-1 GATE FAILED` and `Reproduction SUCCEEDED`.

## What the comparison supports

On this exact build, OS, command-line-loaded unpacked diagnostic and native
grant sequence, a grant approved after the extension context already existed
was not honored for `webRequest` terminal dispatch in that context. A new worker
in the same context did not change that. A new browser process with the same
persisted grant did. The controlled comparison rules out a broken fixture,
server, source page, event filter, registration implementation or bounded
dispatch delay, because the identical inputs observed every case in phase 3.

It does not establish a browser root cause, a universal Chrome defect, retail or
installed-extension behavior, another Chrome release, another OS, another
loading mode or hosted CI behavior. The self-reload case was not observed and
supports no reload-UX claim.

## Preserved failures

No failed attempt was replaced by a later pass. The ignored scratch records
retain the earlier, pre-tracked comparison and each failed sub-case:

- `.scratch/grant-dispatch/report.json`: first-grant zero events and the
  browser-restart positive control before the tracked probe existed.
- `.scratch/grant-dispatch/same-process-report.json`: new worker in the same
  context with zero events; extension self-reload not observed.
- `.scratch/chrome-webrequest-diag4.mjs` and its log: zero events for a
  DevTools-installed extension with required host access; this harness
  difference is why the tracked probe uses command-line loading only.
- `.scratch/chrome-webrequest-diag6.log`: two first-grant zero cases, one with
  optional and one with required `webRequest`; it contains no positive control.
  The positive controls came from the command-line required-host probes in
  `.scratch/chrome-webrequest-diag5.mjs` and `diag8`.
- `.scratch/request-grant-dispatch-3Uzb4C/report.json` (SHA-256
  `08c7f6ac9f977b11f3d01197dcca25ba80a1f1638c911fba7f223bcd781f29d4`): the
  earlier tracked run before the stricter evidence checks.
- `.scratch/request-grant-dispatch-run-83421ef.log` and the raw report above:
  the final tracked clean-head reproduction.

## Unproved REQ-1 gates

- Firefox 140.0, 153.5.1esr and 158.0.1: the full #17 matrix, including
  2xx/3xx/4xx/5xx and network/DNS/connection/TLS visibility, observable blocked
  cases, redirect single-count, port and initiator filters, third-party and
  cross-origin-frame exclusions, the native activation path, live cleanup
  ownership and every removal state, attachment copies, the 30-second window,
  keepalive, worker restart, budgets, 0/1/100/500 cases and the 1 KiB bound.
- Chrome 156 beyond this grant-dispatch gate: the same matrix, plus cleanup and
  lifetime behavior in a context that can observe requests.
- #18 product wiring, #19 attachment/schema work, and the persisted-metadata
  prohibition in an implemented runtime.
- Hosted Linux and Windows runs, retail installation and store distribution.

## Decision

No scope or target change is approved. The evidence recommends deferring Chrome
REQ-1 pending a user decision, with a future retest on a later pinned Chrome as
an option. A first-run restart/reopen UX and dropping a target are unapproved
alternatives; neither is implemented or qualified here. The existing approved
contract text in
[the collector contract](../plans/mutation-request-failure.md) is unchanged.
