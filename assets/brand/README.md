# AddonRay brand assets

The user selected **Aperture** on 2026-10-29. It is a broken lens ring around a
solid center, drawn on a 32-unit grid. The prototype that produced the choice is
preserved at [docs/prototypes/brand-assets](../../docs/prototypes/brand-assets/index.html);
it is not a production input.

## Canonical locations

| Path                                     | Purpose                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `masters/addonray-mark.svg`              | Editable full-color mark for 32 px and larger.                     |
| `masters/addonray-mark-small.svg`        | Optical mark for 16 px. Heavier ring and larger accent center.     |
| `masters/addonray-mark-monochrome.svg`   | Black single-color mark.                                           |
| `masters/addonray-mark-mono-white.svg`   | White single-color mark.                                           |
| `masters/addonray-lockup.svg`            | Horizontal lockup for light or neutral surfaces.                   |
| `masters/addonray-lockup-mono-white.svg` | Horizontal lockup for dark surfaces.                               |
| `masters/addonray-store-tile.svg`        | Reusable dark store/companion composition, not a submission asset. |
| `exports/`                               | Transparent PNGs derived from the masters.                         |
| `public/icon-*.png`                      | Package icons. These are the files the extension manifests load.   |

The extension uses `public/icon-16.png`, `icon-32.png`, `icon-48.png`,
`icon-96.png` and `icon-128.png`. Both Firefox and Chrome map them through
explicit `icons` and `action.default_icon` entries in `wxt.config.ts`.

## Palette

| Role           | Color     | Use                                                                            |
| -------------- | --------- | ------------------------------------------------------------------------------ |
| Primary        | `#2f8f63` | Ring and outer dot. Chosen to hold at least 3:1 on both light and dark chrome. |
| Accent         | `#b6e4ca` | Inner dot. A secondary highlight, not the silhouette boundary.                 |
| Wordmark light | `#0b3a28` | Text in the default lockup.                                                    |
| Wordmark dark  | `#f1f1f1` | Text in the dark store tile and white mono lockup.                             |

The static package icon deliberately uses one palette. It is not theme-aware.
Measured against `#f9f9fb`, the primary is 3.82:1; against `#1c1b22` it is
4.25:1. The accent center is 1.34:1 on the light toolbar and 12.15:1 on the
dark toolbar. The accent is a secondary fill inside the primary dot, so the
silhouette does not depend on it. The complete measurements and optical
observations are in [the package proof](../../docs/evidence/2026-10-29-aperture-package-proof.html)
and [the asset evidence](../../docs/evidence/2026-10-29-brand-assets.md).

## Usage rules

- Keep at least 2 units of the 32-unit grid clear around the mark. Do not place
  text or another icon inside that boundary.
- Use the mark at 16 px or larger. Use `addonray-mark-small.svg` for 16 px and
  the regular master for 32 px and above.
- Use the full-color mark on light and dark chrome. The primary green is chosen
  for both. Do not substitute the prototype's theme-specific mint or deep-green
  inks in package icons without repeating the contrast and optical checks.
- Use the monochrome mark when color is unavailable, printing in one ink, or
  placing the mark on a busy background that needs a single silhouette.
- Use the white mono lockup on dark surfaces. Use the default lockup on light or
  neutral surfaces. Do not place the default wordmark on a dark surface.
- Do not stretch, rotate, outline, add shadows or gradients, or change the
  aperture gap. Do not redraw the mark from the raster exports.
- The wordmark uses the product UI stack (`-apple-system`, `BlinkMacSystemFont`,
  `Segoe UI`, sans-serif). The SVG text remains editable. If a distribution
  needs font-independent outlines, convert the text to paths and update the
  raster exports and hashes together.

## Derivation

The masters are the source of truth. Raster exports were rendered from per-size
SVG wrappers with macOS `sips` at the exact pixel dimensions. The 16 px export
uses `addonray-mark-small.svg`; the package icon is a byte copy of that export.
All other exports use the corresponding master. The committed PNGs are the
reviewed artifacts. The package test checks their dimensions, alpha, core
colors, and byte equality with `public/icon-*.png`.

The full-color store tile is a reusable composition. It does not define a store
listing, companion package name, publisher, license or publication route. Those
decisions remain with #4 and the release tickets.

## Verification

`tests/brand-assets.test.ts` decodes every committed PNG, checks dimensions,
transparency, opaque core colors and package/export byte equality, and rejects
external references in the masters. `scripts/check-manifest.mjs` checks both
target manifests and the actual package icon dimensions. `scripts/check-package.mjs`
includes `public/**` in the source allowlist. Both source rebuilds must pass
before delivery.
