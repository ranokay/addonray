# Brand asset kit

Status: Aperture selected on 2026-10-29. The reusable kit and package icons are
delivered. Issue [#3](https://github.com/ranokay/addonray/issues/3) remains open
because the user has not authorized removal of the authored prototype
exploration. No store, licensing or publication claim is made.

## Scope

Deliver one user-selected AddonRay mark and a reusable kit: editable vector
masters, transparent raster exports, monochrome variants, the icon sizes the
Firefox and Chrome extension packages need, and reusable companion and store
materials. Wire the selected package icons into the current extension and record
canonical locations and usage rules.

The kit is a visual identity deliverable. It does not decide the companion
package identity, publisher, store listing, licensing or publication route.
Those remain with [#4](https://github.com/ranokay/addonray/issues/4) and the
release tickets #39, #44 and #45. Prototype panels label companion and store
slots as reusable future material, not submission assets.

## Selection gate

The prototype in [docs/prototypes/brand-assets/index.html](../prototypes/brand-assets/index.html)
shows three named directions behind the installed prototype skill's picker. The
user chooses one before any production asset is created. The prototype stays
outside `entrypoints/` and `public/`, and no extension code imports it.

The directions differ in silhouette, not palette:

| Name         | Axis                   | Form                                                            |
| ------------ | ---------------------- | --------------------------------------------------------------- |
| **Aperture** | Enclosed instrument    | A broken lens ring with a focused center.                       |
| **Prism**    | Angular transformation | A solid triangle cut by a beam, with the beam leaving the form. |
| **Frame**    | Framed observation     | A four-corner viewfinder around a solid point.                  |

Every direction is shown at toolbar 16 and 32 px, extension-management 48 px,
companion/distribution 128 and 256 px, store 128 and 300 px, and monochrome 16
and 32 px. Each context appears on light and dark backgrounds.

## Promotion deliverables

1. `assets/brand/masters/`: full-color SVG, monochrome SVG, an optical
   small-size SVG if 16 px needs it, and a horizontal lockup.
2. `assets/brand/exports/`: transparent PNGs at 16, 32, 48, 64, 96, 128, 256 and
   512 px for the mark; monochrome black and white at 16, 32, 48, 96, 128, 256
   and 512 px; lockups at 320 and 640 px; a reusable store tile at 300 and 512 px.
3. `public/icon-{16,32,48,96,128}.png`: package icons for both targets. The
   installed WXT icon discovery and built manifest were inspected; both targets
   use explicit `icons` and `action.default_icon` paths.
4. Manifest and package checks that assert the exact icon maps in both built
   `manifest.json` files, the archive contents, and the source archive allowlist.
5. `assets/brand/README.md`: canonical paths, clearspace, minimum sizes, palette,
   light/dark and monochrome rules, and export derivation.
6. Dated evidence with the selection, contrast measurements, small-size
   observations, export hashes, package results and unverified claims.
7. A decision record and a status update limited to what is actually complete.

## Verification

- Compare the selected mark at 16 px, 200% zoom, and in monochrome for
  silhouette recognition. Record contrast ratios for each background.
- `tests/brand-assets.test.ts` proves raster dimensions, alpha, canonical export
  identity, and package icon equality by hash. It does not judge aesthetics.
- `scripts/check-manifest.mjs` asserts both target icon maps and referenced
  files. `mise run package`, `mise run package-chrome`,
  `mise run test-source-build` and `mise run test-source-build-chrome` prove the
  archives and source rebuilds.
- Icon, configuration and prototype changes do not trigger the Firefox or Chrome
  runtime probes. No runtime or store qualification follows from this kit.

## Cleanup gate

The prototype is authored exploration. Removing it requires explicit user
authorization after a concrete selected kit exists. Until then it stays in the
repository. The existing inventory prototype on its separate branch is
untouched.

## Recorded history

- 2026-10-29: issue #3 implementation started from `ab8618a`. Three directions
  and the selection gate recorded. Prototype built and awaiting selection.
- 2026-10-29: the user selected Aperture. The static package palette, optical
  16 px master, transparent exports, monochrome variants, lockups, store tile,
  manifest maps and source allowlist were delivered. The prototype remains
  pending separate cleanup authorization.
