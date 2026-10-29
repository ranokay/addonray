# Aperture brand asset delivery evidence

Date: 2026-10-29. Issue [#3](https://github.com/ranokay/addonray/issues/3).
Prototype base: `ab8618a8482512c3cd5e994031062812ecaeb080`. Implementation base:
`5ae5c75b27790b04fd975bd0ea579ede999fb96b`.

## Selection and approach

The user selected **Aperture** after the inline prototype review. The prototype
review and its two correction rounds are recorded in
[prototype evidence](2026-10-29-brand-asset-prototype.md). The prototype HTML
was later removed after explicit authorization; the evidence and
[historical GitHub blob](https://github.com/ranokay/addonray/blob/6b0f38eeff2081f9b869eb2e9794afcc98d7702e/docs/prototypes/brand-assets/index.html) are retained.

The package uses one static icon set rather than theme-specific toolbar assets.
The prototype's dark and light palettes were combined into a mid-green primary
(`#2f8f63`) and a mint accent center (`#b6e4ca`). This keeps the same Aperture
silhouette and the corrected ink/accent binding without adding manifest
switches, permissions or session behavior. The 16 px export uses
`addonray-mark-small.svg`, which has a heavier ring and larger accent center
than the 32 px master.

The static palette is a deliberate compromise. The primary holds above 3:1 on
both chrome backgrounds. The accent center is a secondary fill; it is subtle on
light chrome and does not carry the silhouette.

## WXT and manifest convention

The installed WXT version is 0.21.4. Its source at
`node_modules/wxt/dist/core/utils/manifest.mjs:40` builds the base manifest
`icons` field from `discoverIcons`, whose filename patterns start at line 210.
That discovery does not set `action.default_icon`; the entrypoint code only
copies an explicit popup `defaultIcon` at line 138. Relying on
`public/icon-{size}.png` alone would therefore leave the toolbar action icon
unstated.

`wxt.config.ts` explicitly maps both `icons` and `action.default_icon` to
`icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-96.png` and
`icon-128.png`. Both built manifests were inspected and contain those exact
maps. No `theme_icons`, target changes, permissions or session changes were
added.

`public/**` is included in `zip.includeSources`, and
`scripts/check-package.mjs` includes `public` in its expected source allowlist.
Both source archives contain 46 files and rebuild every packaged extension file,
including all five icons.

## Assets

Canonical paths and usage rules are in [assets/brand/README.md](../../assets/brand/README.md).
The kit contains:

- Editable masters: full-color mark, 16 px optical mark, black and white
  monochrome marks, default and white lockups, and a reusable dark store tile.
- Transparent exports: mark at 16, 32, 48, 64, 96, 128, 256 and 512 px;
  monochrome black and white at 16, 32, 48, 96, 128, 256 and 512 px; lockups at
  320 and 640 px; store tile at 300 and 512 px.
- Package icons at 16, 32, 48, 96 and 128 px.

Selected hashes:

| File                                           | SHA-256                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `public/icon-16.png`                           | `e6e73f428fc0e63fcf81956ea99d6bd512380d37e3189eb1300e40a07949a8d0` |
| `public/icon-32.png`                           | `10d8ba1c36d4c1ab12ca485ec9b2bb59cf15bd72adff3bc141c43675cc68265b` |
| `public/icon-48.png`                           | `f0b0c686986b64ce6516c8bde7637e74731e4144af22baa25aaaa43a79c4501c` |
| `public/icon-96.png`                           | `ddade4314cd49ab297e1c9d88901e31ecf52229bc1e5e3434e404e99c53b52dc` |
| `public/icon-128.png`                          | `73d7f8b3cfad5c1d3825ec3eb3692b5a7568a8316ad7f75c2f34c446e034c750` |
| `assets/brand/masters/addonray-mark.svg`       | `d528efe2ba2059b617b5a636f60ec35c1cd3b86f823bdfb202f691319136ced1` |
| `assets/brand/masters/addonray-mark-small.svg` | `abc69f386799d55cd31fcc44e9d1a209e5f61b0f6e82f5881e6192db43a2c5d3` |

## Rendered verification

`tests/brand-assets.test.ts` decodes each committed PNG and checks exact
dimensions, RGBA transparency, opaque core colors, and package/export byte
equality. Every monochrome export from 16 through 512 px must contain exactly
one opaque color, black or white. The test also rejects external references in
the masters. The focused run passed 5 tests with 0 failures.

The [self-contained package proof](2026-10-29-aperture-package-proof.html)
embeds the actual package PNG bytes and shows them at 16 and 32 px in
representative light (`#f9f9fb`) and dark (`#1c1b22`) toolbars, plus a 4× pixel
view. Headless Chrome for Testing 156.0.8078.47 captured the proof on macOS
arm64.

A separate headless DOM check confirmed that all 12 embedded images and every
ancestor through `html` compute to opacity 1; only the label spans under each
image are muted at 0.9. The page uses transparent `html`, `body` and outer
wrapper, has no outer banner or title, zero horizontal wrapper padding, and
keeps the light and dark backgrounds inside the comparison panels. The outer
text, table and notes use theme-aware colors. All 12 embedded data URLs
hash-match the current `public/icon-*.png` files: six 16 px instances (two
toolbar rows, two size rows and two 4× views), and two each of 32, 48 and
128 px.

Measured sRGB contrast from the opaque core colors:

| Role          | Color     | Light toolbar | Dark toolbar | White  | Near black |
| ------------- | --------- | ------------- | ------------ | ------ | ---------- |
| Ring and dot  | `#2f8f63` | 3.82:1        | 4.25:1       | 4.02:1 | 4.99:1     |
| Accent center | `#b6e4ca` | 1.34:1        | 12.15:1      | 1.41:1 | 14.25:1    |

At 16 px the ring gap and center dot remain recognizable against both
backgrounds. The mint center is visible on dark chrome and subtle on light
chrome; the green ring and dot carry the shape. At 32 px the gap, dot and accent
center are clear. The 16 px optical master avoids a hairline accent.

## Package and source verification

- `mise run package` passed: Firefox manifest and permission budget, package
  contents, and source allowlist. XPI SHA-256
  `82b754a02dbaa3e7b7700567ce82d873dc023a3ba91a8fcf27cfcaecc08ec08a`.
- `mise run package-chrome` passed: Chrome manifest and permission budget,
  package contents, and source allowlist. ZIP SHA-256
  `09015daf4fae56b7d3539e537cd0bd447143722cb16d0852225fdf8313e1e22b`.
- Both source archives contain 46 files with SHA-256
  `88aec44e286b6293f10d69bc4a49f13d32260c392fd13f6a70aeca303aca553e`.
- `mise run test-source-build` and `mise run test-source-build-chrome` rebuilt
  the extracted archives and compared 19 packaged files each, including the five
  icons. Both passed. Receipts are in `.scratch/source-build-evidence.json` and
  `.scratch/source-build-evidence-chrome.json`.
- `mise exec -- bun run typecheck` passed 56 files.

The authorized prototype cleanup after `6b0f38e` deletes one documentation file
and edits documentation only. Documentation is outside the source allowlist, and
the package icon bytes are unchanged. The clean source rebuild receipts at
`6b0f38e` therefore remain bounded evidence for the same source inputs; they were
not rerun at the cleanup head.

## Limits

This is local asset and packaging evidence. It does not qualify native toolbars
on Firefox or Chrome, Linux or Windows rendering, store listings, signed
distribution, screen readers or the final published identity. The static icon
was rendered on representative chrome colors; the browser may composite icons
differently on a platform. Store and companion compositions are reusable
material, not submission assets. The authorized prototype cleanup is complete.
Issue #3 remains open pending private PR delivery.
