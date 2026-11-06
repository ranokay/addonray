---
status: accepted
---

# Use selected-origin request observation for request-failure counts

On 2026-11-06 the user approved a bounded request-failure check for the v1
backlog. The check uses optional `webRequest` and a temporary host grant for the
selected page's exact scheme and host. Collection is restricted to the selected
tab and exact origin, including the effective port in a runtime filter even
though the host grant itself may cover all ports on that host. Only terminal
`webRequest.onCompleted` and `webRequest.onErrorOccurred` events are counted;
started requests are not tracked. The summary contains observed requests, HTTP
4xx/5xx responses, network failures and failures by resource type. It retains no
URL, request ID, header, body, status text or error string.

The alternatives were broader all-host observation and a no-permission
resource-error event count. All-host observation would cover third-party and CDN
requests but asks for a broad host grant and contradicts the current privacy
posture. No-permission resource-error events miss `fetch`/XHR and HTTP status,
and can be interfered with by the page. Deferring request-failure work would leave
#17–#19 unimplemented. Selected-origin observation provides useful same-origin
evidence while keeping the permission request narrow.

Consequences: third-party and cross-origin-frame requests are invisible, and
blocked-request coverage is incomplete. The product must say so and must not
attribute a failure to an extension, network or server. The check adds a
background event page/service worker that counts only during an explicit check.

Permission ownership is explicit and live. The check owner keeps the grant
snapshot in memory, calls `permissions.request` directly inside a demonstrated
activation path, seals and publishes the result, then removes only permissions
recorded as newly granted. Participating receiver views hold the expected-cleanup
marker in memory so a late removal event does not erase a sealed result or an
independent attached copy. Pre-existing grants are never removed; cleanup failure
leaves the result and discloses the retained grant. If the background worker
restarts, the live check owner still owns cleanup. If the owner is also lost, no
memory snapshot is claimed to survive: cleanup is unverified, no unknown grant is
silently removed, and retained grants are reviewed through browser permission
controls. Durable origin metadata is not approved.

The 30-second Chrome service-worker lifetime, exact-origin port filtering,
terminal-event double counting, user-activation path, in-memory cleanup
ownership, abrupt-loss behavior and the proposed elapsed-work limits require #17
feasibility proof before product wiring. If reliable cleanup needs durable origin
metadata or a changed revocation policy, #17 returns for a user-approved contract
revision. See the
[collector contract](../plans/mutation-request-failure.md).
