# Guided v1 trials

## Status

Approved by the user on 2026-11-06 as the #12 product contract. This document
authorizes no runtime implementation or qualification. The current investigation
still holds one Before/After pair and has no guided step UI. [The v1 contract](../v1-contract.md)
keeps the existing comparison, save and permission limits effective until the
implementation and qualification gates pass.

## Problem and result

Manual comparisons currently require the user to remember the sequence: capture
the baseline, change one browser setting, reproduce the problem, capture the
After state and record an assessment. The result is easier to lose, and a user
may start over without preserving a completed trial.

The guided trial keeps the approved one-pair, session-only investigation and adds
a visible five-step guide plus an explicit preservation warning. It does not
autosave, change extension state or diagnose a cause.

## Approved flow

| Step          | User-visible instruction                                                        | Underlying action                          |
| ------------- | ------------------------------------------------------------------------------- | ------------------------------------------ |
| 1. Baseline   | Capture the page as it is before changing anything.                             | Capture the Before inventory.              |
| 2. One change | Change one extension setting in the browser, then return to this investigation. | No browser action; no automatic detection. |
| 3. Reproduce  | Reproduce the original problem on the same page.                                | No browser action; no page reload.         |
| 4. After      | Capture the page again after the change.                                        | Capture the After inventory.               |
| 5. Assess     | Record whether the page is better, unchanged, worse or uncertain.               | Store the existing manual assessment.      |

The guide is static text and a checklist. It may reflect the existing investigation
state (for example, “Before captured”), but it does not infer that a settings
change happened, that the page is the same document, or that the reproduction
occurred under controlled conditions.

## Preservation and Start over

- A completed trial is preserved only by an explicit Save under the approved
  saved-investigation contract. Each Save creates one new immutable local archive.
- There is no autosave, no background save, no automatic history and no update of
  an existing archive.
- If Start over is pressed while a completed trial is unsaved, show a warning with
  three choices: **Save**, **Discard and start over**, **Cancel**.
- **Save** uses the existing save eligibility and failure behavior. If the save
  fails, the live trial remains and Start over does not proceed automatically.
  If the save succeeds, the archive remains and the live trial may be cleared.
- **Discard and start over** clears the live trial without creating an archive.
- **Cancel** leaves the live trial unchanged.
- An incomplete trial keeps the existing Start over behavior; the new warning is
  for a completed, unsaved trial.
- Saving does not require an assessment under the existing saved-data contract.
  The guide recommends completing the assessment before Save and shows the
  missing state explicitly.

## Limits and claims

- One live Before/After pair per investigation, exactly as today.
- The user performs the manual settings change outside AddonRay. AddonRay never
  changes another extension's state.
- The guide does not claim that the change caused the result. It records
  observations under conditions the user describes.
- The source tab, page identity and conditions may differ between captures; the
  existing limitations remain visible.
- No new permission, dependency, storage path, background process, sync, native
  transfer or report format is added.
- Saved archives remain bounded by the existing 50-record, 5 MiB and 1 MiB rules,
  per-save 7/30/90-day retention and normal-window guard.

## Acceptance criteria

| ID    | Requirement                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ |
| GT-01 | Guide baseline capture, a manual one-setting change, reproduction, After capture and explicit assessment in that order.              |
| GT-02 | Keep one live Before/After pair; Start over discards the live pair.                                                                  |
| GT-03 | Preserve a completed trial only through an explicit Save. No autosave or automatic history.                                          |
| GT-04 | Warn before Start over discards an unsaved completed trial and offer Save, Discard and Cancel.                                       |
| GT-05 | A failed Save preserves the live trial and does not proceed to discard.                                                              |
| GT-06 | Make no automatic extension-state change, page reload, settings detection or causal verdict.                                         |
| GT-07 | Show missing observations, source/condition limits and the distinction between a tab match and the same page.                        |
| GT-08 | Use the existing normal-window, permission, save, retention and deletion rules without a new permission or storage owner.            |
| GT-09 | Keep the popup and other investigations independent; no result transfer between views except the existing explicit attachment paths. |
| GT-10 | Verify the complete journey, denied access, save failure, unsaved warning and preserved archive before claiming implementation.      |

## Issue map

| Issue   | Contract use                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------------- |
| #12     | This document records the guided-trial decision.                                                      |
| #34     | Accessibility and usability audit covers the guided steps, warning dialog and preserved-trial states. |
| #35–#37 | Native journeys exercise the guided flow with actual desktop input.                                   |

## Current runtime

The current investigation has no guided checklist, no unsaved-trial warning and
no automatic preservation. Its existing one-pair lifetime, explicit Save and
Start over behavior remain unchanged.
