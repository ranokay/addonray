# Brand asset prototype evidence

Date: 2026-10-29. Issue [#3](https://github.com/ranokay/addonray/issues/3).
Base: `ab8618a8482512c3cd5e994031062812ecaeb080`.

## Artifact

[docs/prototypes/brand-assets/index.html](../prototypes/brand-assets/index.html)
is one self-contained HTML file with inline CSS, JavaScript and SVG marks. It
uses no external fonts, scripts, images or media. The outer wrapper, `html` and
`body` are transparent, and only the comparison panels set light or dark
backgrounds. The wrapper has no side padding and no banner title, so an inline
host can supply its own page chrome. Comparison panels keep their own padding.

The picker markup, styles and keyboard wiring follow the installed prototype
skill's `PICKER.md`. The replay control is omitted because the marks are static.
The picker keeps the prescribed dark glass appearance.

## Directions

| Name         | Axis                   | Form                                                            |
| ------------ | ---------------------- | --------------------------------------------------------------- |
| **Aperture** | Enclosed instrument    | A broken lens ring with a focused center.                       |
| **Prism**    | Angular transformation | A solid triangle cut by a beam, with the beam leaving the form. |
| **Frame**    | Framed observation     | A four-corner viewfinder around a solid point.                  |

Each direction is shown at toolbar 16 px in Firefox-dark and Chrome-light
strips, a 32 px high-DPI asset on both backgrounds, extension management at 48
px on light and dark, companion/distribution at 128 and 256 px on light and
dark, store previews at 128 and 300 px on light and dark, and monochrome 16 and
32 px.

The planned third direction used a radial beacon form. At toolbar size the
radial treatment read as a close control, so it was replaced by Frame before
the user saw the artifact. No direction was selected during this change.

## Review corrections

The first prototype head, `254e96c`, was not correct. Its `mark()` helper wrote
`--mark-accent: var(--mark-accent)` on each SVG, a self-reference that made the
accent fall back to black, and its primary shapes followed surrounding text
instead of `--mark-ink`. Dark panels therefore hid the accent dots and beams.
The supervisor review at that head found the defect. This evidence keeps the
failed observation as a corrected result, not as a pass.

The corrected helper binds `color: var(--mark-ink)` and lets a colored mark
inherit the panel's `--mark-accent`; only monochrome marks set the accent to
`currentColor`. The monochrome cell no longer applies opacity to the mark
itself. The supervisor's second finding removed the outer banner and horizontal
padding. Screenshots were regenerated. The rendered computed-style checks now
assert the actual palette on every panel rather than counting SVGs.

## Verification

The file was opened directly from disk in headless Chrome for Testing
`156.0.8078.47` on macOS arm64. ChromeDriver `156.0.8078.47` drove the page with
Selenium. The run recorded these passing checks:

- Initial `?v=1` load shows Aperture, one active item and one `aria-current`
  item.
- Key `2` switches to Prism, then `ArrowRight` and `ArrowLeft` switch to Frame
  and back to Prism.
- Clicking Frame selects it. The URL reflects `?v=2` and `?v=3` after switches.
- Reloading `?v=2` restores Prism.
- Each direction renders 7 context panels and 18 marks with the expected
  headings.
- Every colored mark on light panels computes to primary `rgb(11, 58, 40)` and
  accent `rgb(31, 122, 82)`.
- Every colored mark on dark panels computes to primary `rgb(182, 228, 202)`
  and accent `rgb(111, 199, 155)`.
- Monochrome marks compute to `rgb(17, 17, 17)` on white and
  `rgb(255, 255, 255)` on black, with the accent equal to the primary color.
- Primary and accent shapes have non-zero rendered bounds, both accents are
  fully opaque, and non-monochrome marks use two different colors.
- The outer wrapper has `0px` left and right padding at 1280 and 700 px, no
  banner title, and the comparison panels keep `12px` padding.
- No external scripts, links, images or media are present.
- The document has no horizontal overflow at 1280 px, and the picker stays
  fixed.
- `html`, `body` and the outer wrapper compute to `rgba(0, 0, 0, 0)`.
- A light `prefers-color-scheme` capture renders the same panels with readable
  surrounding chrome.
- The browser console has no severe messages.

The corrected run records 18 passing checks. Screenshots and the JSON run
record are in the ignored `.scratch/brand-prototype/` directory:
`aperture-full.png`, `prism-full.png`, `frame-full.png`, the matching
`-viewport.png` captures, and `aperture-light-viewport.png`. Full-page captures
hide the fixed picker so it does not cover a panel. The viewport captures show
the real picker.

## Gaps

This is prototype evidence, not selection, production or store evidence. Only
the Chromium headless harness was exercised. Native Firefox, Safari, assistive
technology, zoom behavior in a user browser and the final inline host
environment remain unobserved. Hover and focus-visible appearance were not
captured as images, though the wiring is present.

The computed-style checks read paint values and rendered bounds. They do not
sample screenshot pixels. No contrast measurement or small-size optical test
exists yet; those follow the user's selection. No production asset, manifest icon or package icon is wired.
Issue #3 remains open.
