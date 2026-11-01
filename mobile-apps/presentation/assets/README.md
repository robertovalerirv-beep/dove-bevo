# App drink artwork

`spritz-illustration.png` is original generic artwork generated with the built-in ImageGen tool on2026-11-01. It depicts a drink category, not an actual venue, menu item, receipt or customer observation. SHA256: `0fcf8e7502e125c3e6f258a5b5cc4b343342798ba1f8d0c5ff62a7aa8ae25d3f`.

The app-only `drink-art.js` embeds `spritz-illustration.jpg`, a99575-byte JPEG encoding at the original1024x1536 dimensions. The full original PNG is retained here for provenance; it is not bundled into either app. No photograph is fetched from a third-party service, no venue image is invented, and the existing price form remains responsible for all public submissions. The artwork is decorative; the actual drink name remains visible and accessible. Other drink categories retain their existing source icons.

Generation prompt: one clear stemmed glass filled with orange spritz, irregular ice and one orange slice, on a seamless near-white background with soft natural daylight and a subtle contact shadow. No brand, text, venue, people, interface or collage. Entire glass and stem visible with extra white side space, polished Italian drink-comparison app art direction. Generic drink illustration only.

The generated-image tool initially writes to its system-managed output directory. The exact original was copied into this selected project worktree before being referenced. Windows' installed JPEG encoder produced the app encoding without changing composition or dimensions. No fallback image API was used.
