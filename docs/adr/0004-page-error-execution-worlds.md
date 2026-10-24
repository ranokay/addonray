---
status: accepted
---

# Select the page-error observer's world by browser

The user chose Firefox ISOLATED and Chrome MAIN for the proposed page-error collector on 2026-10-24. Controlled page-owned error/rejection fixtures observed both event kinds in Firefox's isolated world on 140.0, 153.5.1esr and 158.0.1, while Chrome 156.0.8078.47 observed them only in MAIN. Keep Firefox's isolation rather than sharing its observer with the page merely for implementation uniformity.

Chrome's page-side observer and its counts remain subject to page interference. It receives no extension-only API access, reads no raw error details, and cannot be treated as a reliable console feed or culprit detector. The control boundary, cleanup, privacy and overhead require separate feasibility and production review. The user subsequently approved the full feasibility-first [plan](../plans/phase2-page-errors.md); essential control/cleanup gates still precede product wiring. The existing timing collector remains isolated on both browsers. See [API research and observed limits](../evidence/2026-10-24-page-error-api-research.md).
