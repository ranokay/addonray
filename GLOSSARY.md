# AddonRay

The language used to discuss extension troubleshooting and its evidence.

## Language

**Inventory**:
The extensions the selected browser exposes to AddonRay, including their reported enabled state and available metadata.
_Avoid_: Complete browser audit, active-on-page list.

**Capability**:
An action AddonRay can explain as available, permission-dependent, unavailable, or unsupported in the current environment.
_Avoid_: Feature detection as proof of authority.

**Probe**:
A bounded, user-requested check of one browser capability or one page observation.
_Avoid_: Continuous monitoring.

**Observation**:
A measured or reported fact with its source and limitations attached.
_Avoid_: Culprit, proof of a conflict.

**Comparison**:
Two or more observations taken under conditions the user records, such as a manually changed extension state.
_Avoid_: Automatic isolation, causal proof.

**Inventory snapshot**:
The inventory reported by the browser at one deliberate capture, used as a before or after observation in a comparison.
_Avoid_: Extensions active on the page, complete browser state.

**Investigation**:
A temporary, user-directed examination of a page problem using a comparison of observations.
_Avoid_: Automatic diagnosis, saved report.

**Page assessment**:
The user's judgment that the page is better, unchanged, worse, or uncertain after a manual change. It does not establish the cause of that result.
_Avoid_: Measured improvement, culprit verdict.

**Session**:
The lifetime of the visible investigation and its temporary diagnostic data.
_Avoid_: Browsing history, retained report.

**Companion**:
An optional, separately installed local application whose capabilities require their own consent and evidence.
_Avoid_: Privileged browser backdoor.

**Qualification**:
Recorded evidence for named behaviors on an exact browser distribution, version, and operating system. A build alone does not establish it.
_Avoid_: Blanket browser support, feature detection as a passing result.
