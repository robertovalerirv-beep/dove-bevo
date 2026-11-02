# Current iOS store screenshots - 2 November 2026

This package contains six original, unedited PNGs: map, existing venue and native favourites for iPhone and iPad. They were captured by the passing live browsing UI test on unsigned Debug simulators from native source `8a408fe677d8e7962601c26eaec9bbfb009980b0`, the same native source as TestFlight build 62. They are not captures of the signed IPA and are not physical-device evidence. No personal video is included.

The iPhone originals are 1206 x 2622, from an iPhone 17 simulator on iOS 27.0, workflow run 41370003275, artifact 13109636836. The iPad originals are 2048 x 2732, from an iPad Air 13-inch (M4) simulator on iOS 27.0, workflow run 41374921206, artifact 13111411554. All PNGs are original 8-bit RGB without alpha. No image was resized, cropped, repainted, composited or otherwise edited.

`assets/` contains the six upload candidates. `source/` retains byte-identical copies with their original attachment filenames. `provenance.json` records the exact source, workflow/artifact identity, selected-image checksums, dimensions, test identity and simulator limitation. Its selection-file hashes link to the independently reviewed local source records without publishing unrelated diagnostics or personal recordings.

`backup/` preserves all six previous Italian screenshots unchanged. Each matches the server inventory's exact filename, byte count and source MD5. `provenance.json` records their existing screenshot IDs and original repository paths. The inventory is an observed snapshot from 2026-11-02T03:04:31.113Z; the operator must read back and validate the actual current provider state before mutation.

The canonical UTF-8/LF `plan.json` targets only Dove Bevo app 6827324444, version e01a5724-9314-4ed6-9353-abc5c4a21a07 and Italian localization 7e96802e-cee8-4777-9384-4f743912be38. Its SHA-256 is `24c42f35e9dfd836fb89b02ef6f32061b196264e7431b96f1371b5ea895cf3c1`. The fixed existing sets are:

- iPhone APP_IPHONE_61: eb509607-4f07-442f-bb14-3c7b7d49fdf5, three new assets and three exact old backups;
- iPad APP_IPAD_PRO_3GEN_129: 0cf30963-b6ba-47d1-9bd7-a75f055abeef, three new assets and three exact old backups.

All paths are relative to this directory. Copies and checksums were verified, every PNG chunk's CRC and IHDR were checked, and the plan bytes were independently compared with Node `JSON.stringify(plan, null, 2) + "\n"`. There are no symlinks or path escapes. `checks.json` records those local checks; it is not an upload receipt or provider approval.

This source package changes no app code, store metadata or provider state. Upload and final store acceptance remain separate verified operations.

## Provider follow-through

On 2 November 2026, the coordinator uploaded these six exact files through App Store Connect's current App Previews and Screenshots controls. Processing finished for all six before the previous placements were removed. The originals remain recoverable in Apple's Asset Library. A fresh page reload confirmed three current iPhone placements and three current iPad placements, in map, venue, favourites order. Build 62 remains selected; this is screenshot preparation, not public app approval or submission.

The legacy screenshot-set inventory and `plan.json` above are historical provenance, not a resumable description of the current Asset Library placements. Do not reapply that plan. A legacy API attempt stopped after creating one unused reservation, before uploading bytes or removing originals; that exact unused reservation was separately verified and removed, then read back as absent. Current placements were verified again afterward. No private physical-device recording is part of this package; Apple's requested review recording remains separate.
