# Page-error attachment candidate feasibility

The approved [P2D plan](../plans/phase2-page-error-comparison.md) requires the new
handoff and lifetime rules to pass before product wiring. The candidate passed
that gate in its declared normal-window scope. Independent review verified the
four reports, generated fixture hashes and critical assertions before production
implementation began. This is candidate evidence, not product qualification.

## Source and authority

The scratch runner used baseline `05b62e697c4466e10c8ade712eae70ad46212148`
with dirty planning documentation, on macOS arm64. The candidate implements the
proposed protocol with synthetic inventories, confirmed summaries and timing
acceptance. It imports the actual production summary validator from
`lib/page-error-check.ts`. It does not exercise the collector or React controls.

| Input                             | SHA-256                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| Candidate                         | `97dafd283c7bfbf2285d1f0b7766f91850ce9eaff746f3a8e996929bee80f4fe` |
| Runner                            | `92bceda2dca56daa845ee2ce874180ea99e50778c76be50876e4ace0c7df5fc6` |
| Baseline summary validator module | `ef875e4ce07c0d0539e9daae206b6648b23852822ebfeef984d7f45e3fcdc37c` |

Raw reports and generated fixture files remain in ignored
`.scratch/error-comparison-feasibility/`. The four final report suffixes are
`firefox-140.0-1792855718217.json`,
`firefox-153.5.1esr-1792855718258.json`,
`firefox-158.0.1-1792855716136.json` and
`chrome-156.0.8078.47-1792855714127.json`. Earlier failed trials remain available;
they exposed fixture discovery assertions that were corrected before the final
matrix. They do not qualify production behavior.

## Observed results

| Distribution       | Actual version | Driver                     | Passing checks |
| ------------------ | -------------- | -------------------------- | -------------- |
| Firefox            | 140.0          | geckodriver 0.37.1         | 21             |
| Firefox ESR        | 153.5.1        | geckodriver 0.37.1         | 21             |
| Firefox            | 158.0.1        | geckodriver 0.37.1         | 21             |
| Chrome for Testing | 156.0.8078.47  | ChromeDriver 156.0.8078.47 | 20             |

Every final report records browser and local server cleanup. Actual own-view
calls deliver only to the selected investigation, make receiving-realm copies,
and consume the donor once. Accepted counts survive donor reset and closure.
Actual donor/destination reset, reload and closure reject stale work. The
five-second confirmation timeout revokes its action permit: releasing a held
receiver afterward cannot commit, while a new explicit confirmation can succeed.
Closing the destination after commit but before acknowledgment leaves the donor
used, so an uncertain result cannot duplicate the transfer.

The candidate also exercises fixed slots, both shared timing/error source-binding
orders, malformed summaries and getter rejection, a completed summary after its
source closes, and unrelated packaged/non-view sender rejection. Actual optional
scripting removal clears both owners on all four targets. Actual optional
management removal additionally passes on Firefox.

## Limits and next gate

Private/unknown classifications are simulated negative tests. Authentic private
or unclassifiable own-view contexts remain unqualified. Chrome uses a named
required-management fixture, so this run does not prove Chrome optional-management
consent or removal. Timing source-binding tests seed synthetic timing acceptance;
they do not requalify the actual popup transport. Inventories and completed
summaries are synthetic. The views share the extension trust domain and do not
isolate compromised extension documents.

Production model, transfer, React interaction, unchanged collector budgets,
clean packaged builds, native macOS use and hosted OS qualification require
separate evidence. No wider permission, background coordinator or storage was
needed for this candidate gate.
