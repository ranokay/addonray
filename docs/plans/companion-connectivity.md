# Optional companion connectivity check

## Status

The user approved the NET-1 capability on 2026-11-06 as the #20 companion
contract. The same date's Q7 and Q8 answers select the companion host ID, artifact
names, GitHub Releases channel and detached minisign/SHA-256 method as a plan.
This document authorizes no runtime implementation, native host installation, key
creation, signature, publication or support claim. Exact public-key values,
private credentials and release authorization remain owner gates. The current
runtime has no companion and no `nativeMessaging` permission.

## Problem and result

When a page or its requests fail, the user cannot tell whether the machine can
reach the page's host at all. The optional companion supplies one narrow,
read-only check: DNS resolution, a TCP connection and, for HTTPS, a TLS
handshake to the selected page's exact host and port. It does not send an HTTP
request. The result helps the user compare the machine's OS network path with the
browser's failed request, without claiming that a network path, extension or
server caused the page problem. DNS may return multiple addresses; the check
tests at most one resolved address and one TCP/TLS path. If DNS fails or times
out, no address is tested. The UI says so explicitly, and a failure does not imply
that the host is unreachable.

## Approved operation

NET-1 is a **local connectivity check**:

1. Read the selected page's scheme, host and port under the existing selected-tab
   access.
2. Resolve the hostname through the OS resolver.
3. Open one TCP connection to that host and exact port.
4. For HTTPS, perform one TLS handshake with certificate and hostname validation.
5. Return stage outcomes, durations and a coarse error class.
6. Disconnect and clear the result when the view closes or the user clears it.

The companion process makes no HTTP request itself, sends no path, query,
fragment, cookie, credential or header, and follows no redirect. Its only
application-level connection is one TCP connection and, for HTTPS, one TLS
handshake to the selected host and port. OS resolver queries for that hostname
necessarily contact the configured resolver infrastructure and may use DoH; they
are permitted and scoped below. No other destination is chosen by the companion.
It is one attempt, not a background monitor.

## Input boundary

The extension sends only:

```json
{
  "protocolVersion": 1,
  "operation": "connectivity",
  "scheme": "https",
  "host": "example.com",
  "port": 443
}
```

Rules:

- `scheme` is `http` or `https`. Other schemes, extension pages, browser UI,
  `file:` pages and unknown contexts are unsupported before consent.
- `host` comes from the browser's parsed selected-page URL, not free text. It is
  a lowercase ASCII hostname or IP literal, at most 253 characters, with no
  whitespace, control characters, path, query, fragment, credentials or port.
  IDN hosts use the browser's ASCII form.
- `port` is the selected page's actual effective port, an integer from 1 through 65535. The check never silently substitutes 80 or 443 when the page uses a
  non-default port.
- The native host validates the complete message, exact keys, operation,
  protocol version, host pattern and port before any network call. Unknown
  fields, oversized messages, malformed values and unsupported operations are
  rejected without a network call.

## Result boundary

The display-only result contains at most 1 KiB:

```json
{
  "protocolVersion": 1,
  "operation": "connectivity",
  "overall": "ok",
  "stages": {
    "dns": { "status": "ok", "durationMs": 12 },
    "tcp": { "status": "ok", "durationMs": 20 },
    "tls": { "status": "ok", "durationMs": 55 }
  },
  "errorClass": null
}
```

Stage status is `ok`, `failed`, `timeout`, `cancelled`, `unsupported` or
`unavailable`. For HTTP, the TLS stage is absent or `unsupported`; for HTTPS it is
required. `errorClass` is one fixed value: `dns-not-found`, `dns-timeout`,
`connect-refused`, `connect-timeout`, `network-unreachable`, `tls-certificate`,
`tls-hostname`, `tls-timeout` or `other`. The result never contains an IP
address, certificate subject/issuer/serial, DNS answer, HTTP status, response
body, header, URL path, timestamp beyond the stage duration, or free-form native
error text. The UI states that the check tested at most one resolved address, not
every address the hostname may resolve to; if DNS failed, no address was tested.
Failure does not prove the host is unreachable.

The result is display-only in v1. It is not saved, attached to an investigation,
exported, copied, added to a report or sent to any other service. It lives in the
owning view's memory and is cleared on close, reset, cancellation, permission
removal or context loss.

## Consent and permissions

- `nativeMessaging` is an optional permission requested only when the user first
  chooses the connectivity check. Installation grants no native access. If a
  target cannot support optional native messaging, the capability returns for an
  explicit install-time permission decision rather than silently widening
  install consent.
- The native host manifest allowlists the approved extension ID. No other
  extension can connect.
- The check requires an explicit user action and displays the host and port
  before the native process runs.
- The companion is optional. Inventory, capability explanations, investigations,
  saved data and reports remain usable without it.
- Declining the permission, an absent host, an unsupported platform or a failed
  process leaves the check unavailable without a fallback to another mechanism.

## Direct-network limits

The check uses the native process's **OS resolver and OS routing**. It does not
read or reproduce the browser's proxy, PAC, DNS-over-HTTPS, connection pool, HTTP
cache, cookies, authentication, service worker or TLS session. The OS may route
the target TCP/TLS connection through a VPN, split tunnel, firewall or OS-level
proxy, and may resolve the hostname through a VPN-provided or OS-configured DNS
service. The companion makes no VPN-bypass or “direct internet” guarantee.

A browser request can fail while the OS path succeeds, and the reverse can also
occur. The result is not evidence that an extension caused a failure, that the
network is healthy, that the server is reachable through the browser, or that the
page would work after a reload. The UI states these limits next to the result.

## Permitted network traffic

The only permitted application-level destinations are:

- OS resolver queries for the selected hostname, through the system's configured
  resolver path, which may itself use DNS-over-HTTPS, a VPN resolver or a local
  stub;
- one TCP connection and, for HTTPS, one TLS handshake to the selected host and
  actual port;
- offline reads of the platform or pinned trust store used for certificate and
  hostname validation.

The v1 verifier must not perform online OCSP, CRL, certificate-transparency or
other network fetches. If a platform verifier makes such requests, the verifier
is rejected; supporting them requires an explicit user-approved contract
revision. The companion makes
no HTTP request, no redirect, no telemetry or update check, and opens no other
host or port. “No unrelated destination” means this bounded set, not “no resolver
or VPN traffic.”

## Native host boundary

One Rust native-messaging host performs the operation. It:

- accepts only the versioned connectivity operation from the allowlisted extension;
- validates the exact scheme, host and port before resolving or connecting;
- bounds DNS, TCP and TLS with a 5-second total deadline and per-stage deadlines;
- supports cancellation at each stage and exits without a result when cancelled;
- opens one connection and closes it on completion, timeout, cancellation or
  error;
- reads no profile files, changes no browser preference or profile database,
  installs no background service and accepts no arbitrary file or URL request;
- returns only the bounded result above.

The same operation is planned for macOS, Windows and Linux. Native host
registration, installer layout, update, removal and browser registration differ
per OS and are #25–#28. The stable host ID is `dev.ranokay.addonray` and the
artifact base name is `addonray-companion-<version>-<os>-<arch>`; per-OS archive
or installer suffixes are #25–#28 choices.

## Release identity and distribution

Q7 fixes the stable native-messaging host ID as `dev.ranokay.addonray`. The host
manifest and browser registration use that ID. Companion artifacts use the base
name `addonray-companion-<version>-<os>-<arch>`: `<version>` is the release
version, `<os>` is `macos`, `windows` or `linux`, and `<arch>` is `arm64` or `x64`
for the intended support matrix. The per-OS archive or installer suffix belongs to
#25–#28 and does not change the base name.

Releases use GitHub Releases in `ranokay/addonray`. The release record names the
exact source commit and tag, the clean-source build run, supported
OS/architecture options and the artifact hashes. A release contains each
companion artifact, its SHA-256 checksum, a detached minisign signature and the
public verification key fingerprint. The public verification key and fingerprint
are obtained through an authenticated owner-controlled path before verification;
a key bundled only beside the artifact cannot establish that artifact's
authenticity. The release record may repeat the fingerprint, but the trusted
source is the authenticated path, not the release asset. The exact public key
value, fingerprint and private signing credentials remain unknown and outside
source and tickets. No separate companion
store or account is selected.

## Signature and integrity verification

Q8 selects detached minisign signatures plus SHA-256 checksums for every
companion artifact on every OS. Detached-only signing is the v1 route and
supersedes the earlier native-platform-signing recommendation. Developer ID,
notarization and Windows Authenticode are not v1 requirements.

The installation or update path verifies the checksum and signature against the
previously trusted public key before registering or executing the host. No host
binary runs before that check, and an update verifies the replacement before
replacing or executing it. On failure, the artifact is not installed, registered
or executed. There is no unsigned fallback, no instruction to disable OS security
and no quarantine removal. A failed first install leaves no host registration; a
failed update keeps the last verified installation and reports the failure; the
artifact is discarded or left quarantined.

The signature establishes authenticity and integrity relative to the trusted
public key. It does not provide Developer ID or Authenticode identity,
notarization, OS reputation or a Gatekeeper/SmartScreen bypass. Gatekeeper and
SmartScreen warning, allow and cancel flows, plus install, update and removal, are
qualified from actual downloaded artifacts with quarantine or Mark-of-the-Web
intact. Local developer builds, removed quarantine and browser or harness results
are not native distribution evidence. A warning-free installation is not promised.
Missing minimum macOS 14 and suitable Windows/Linux environments remain explicit
blockers; candidate-current versions remain separate.

## Trust and TLS validation

HTTPS validation checks the certificate chain and hostname. The implementation
should use the platform trust store where the Rust TLS stack exposes it; otherwise
it uses a pinned root set and records the difference as a limitation. Enterprise
or user-installed roots may not be visible to a pinned set. The verifier must not
perform online OCSP, CRL, certificate-transparency or other network fetches in
v1; if a platform verifier does, the verifier is rejected unless the user
approves a contract revision. #21–#23 must prove the chosen verifier, document
which trust source was used and capture the actual resolver/verifier traffic. A certificate
warning does not identify an extension or a browser policy cause.

## Feasibility pass/fail

#21–#23 must prove, on each intended OS and exact architecture:

- DNS success, NXDOMAIN and resolver timeout, including a multi-address hostname
  where at most one resolved address is tested and the UI does not generalize the
  result. On DNS failure the UI says no address was tested;
- TCP success, connection refused and connect timeout;
- TLS success, expired/untrusted certificate, hostname mismatch and handshake
  timeout;
- the selected non-default port reaches the same port, not 80 or 443;
- cancellation at DNS, TCP and TLS stages;
- malformed, oversized and unknown messages are rejected without network access;
- an absent host, wrong protocol version, crashed process and disconnect produce
  bounded unavailable results;
- no profile mutation or unrelated file access;
- with controlled network observation, the only application-level destination is
  the selected host and actual port; OS resolver queries are the only other
  permitted traffic; no online TLS-verifier traffic is observed. Online verifier
  traffic fails feasibility and returns for a user-approved contract revision.
  There is no HTTP request, redirect, telemetry, update check or arbitrary
  host/port;
- record whether an OS VPN, DNS policy or OS proxy was active, and prove the
  result describes OS routing rather than a VPN bypass;
- exact browser distribution/version, OS, architecture and source identities;
- cleanup of the child process and any pending socket.

An essential failure returns to the user with a revised capability. It does not
widen native access or silently drop a stage.

## Open release decisions

The capability, host identity, artifact base name and channel are approved as a
plan. These release items remain open:

- exact public verification key value and fingerprint, and the authenticated
  owner-controlled distribution path for them;
- private signing credential ownership, key access and concrete signing
  authorization;
- installer/update/removal mechanism and exact supported archive/installer
  formats (#25–#28);
- publisher account access and concrete release authorization (#43);
- actual downloaded/quarantined-artifact qualification on each supported OS and
  architecture.

These remain with #4, #39 and #43. No key generation, key access, upload,
signature, publication or account access is authorized by this contract.

## Issue map

| Issue             | Contract use                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| #20               | This document records the NET-1 capability decision.                                             |
| #21               | Prove NET-1 on macOS.                                                                            |
| #22               | Prove NET-1 on Windows.                                                                          |
| #23               | Prove NET-1 on Linux.                                                                            |
| #24               | Deliver NET-1 through the bounded protocol and product consent flow.                             |
| #25–#27           | Install and remove the host on each OS, including pre-execution verification.                    |
| #28               | Upgrade, protocol compatibility and verified-signature update failure.                           |
| #29, #34, #35–#39 | Private-context guards, accessibility, native journeys, security review and candidate packaging. |
| #43               | Publish the approved companion release through GitHub Releases.                                  |

## Current runtime

There is no native messaging host, no `nativeMessaging` permission and no
connectivity result in the current product. The extension remains fully useful
without the companion.
