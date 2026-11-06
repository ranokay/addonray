---
status: accepted
---

# Choose an OS-path host connectivity check for the optional companion

On 2026-11-06 the user selected the optional companion's first read-only
capability: a connectivity check for the selected page's actual host and port.
The native host performs DNS resolution, one TCP connection and, for HTTPS, one
TLS handshake with certificate and hostname validation. It sends no HTTP request
and receives only the selected scheme, host and port. The result is a bounded,
display-only set of stage outcomes, durations and a coarse error class. It is not
saved, attached to an investigation, exported or included in a report.

The alternatives were a local system snapshot, read-only browser-profile
diagnostics, or deferring the companion. CPU count, disk free and uptime do not
answer a troubleshooting decision the user can act on. Profile diagnostics
duplicate the management API, are fragile across browser versions and expand
privacy. Deferring the companion would remove #20–#28 and the companion portions
of the native and release tickets from v1. Direct connectivity answers a concrete
question: can this machine resolve and connect to the page's host outside the
browser?

Consequences: the hostname and port cross the native-messaging boundary, and the
native process makes network connections through the OS resolver and OS routing.
It may traverse an OS VPN, split tunnel, firewall or OS-level proxy, and DNS may
use a VPN-provided or OS-configured resolver; there is no VPN-bypass or “direct
internet” guarantee. It does not use the browser's proxy, PAC, DNS-over-HTTPS,
cache, cookies, authentication or TLS session. OS resolver traffic is inherent.
TLS validation must be offline in v1; online OCSP/CRL or other verifier traffic is
not permitted and requires an explicit user-approved contract revision, otherwise
the verifier is rejected. The companion process makes no HTTP request, follows no
redirect and opens no unrelated destination. It tests at most one resolved
address; if DNS fails, none is tested, so failure does not prove the host is
unreachable. It cannot identify a culprit extension or prove the browser path is
healthy. The check stays optional and display-only. Native host identity, distribution channel, platform signing,
installer layout and release authorization remain open with #4 and #25–#28.
Per-OS DNS/TCP/TLS, cancellation, exact-port, malformed-input, actual
resolver/verifier traffic and cleanup behavior require #21–#23 proof before
product delivery. See the [connectivity contract](../plans/companion-connectivity.md).
