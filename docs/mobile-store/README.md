# Store submission drafts

Prepared 26 October 2026 from source `ea7f0d0`. These files are a review pack, not submitted declarations. The current native build is an isolated preview with fixture data and a preview identity; it must not be uploaded as the production product described below. Fresh native artifact, real device, signing and live service gates remain in [the mobile plan](../superpowers/plans/2026-10-26-mobile-apps.md).

## Copy ready for review

[metadata.it-IT.json](metadata.it-IT.json) contains plain text for both stores. Use `apple` fields in App Store Connect and `google_play` fields in Play Console; the contact URLs need rendered public read-back before entry. The app UI currently ships only Italian (`src/app/i18n/it.ts`), so there is no English consumer listing claiming an English app. English reviewer instructions are in [privacy-and-review.md](privacy-and-review.md).

The copy follows [the brand voice](../brand/02-voce.md): compare places and prices, without encouraging drinking. It makes no national coverage, lowest-price, live-price, offline-use or guaranteed availability claim. It describes the intended production features already present in source; permission refusal, sharing, challenge return and real contributions still need device proof.

Suggested screenshot sequence, captured from the real candidate rather than a mockup: map/filter (“I prezzi sulla mappa”); venue receipt with observation date (“Guarda quando è stato segnato”); contribution form (“Segna il prezzo che hai pagato”); search (“Cerca una città o un locale”). Keep system chrome, native app identity and displayed dataset consistent. These are captions, not generated assets.

Field counts include spaces, punctuation and description line breaks after JSON decoding. Apple keywords use UTF-8 bytes. Limits are from Apple's [app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information) and [platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/), and Google's [store listing reference](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en); checked 26 October 2026.

| Field | Draft length | Limit |
| --- | ---: | ---: |
| Apple name / Google title | 9 | 30 |
| Apple subtitle | 28 | 30 |
| Apple promotional text | 105 | 170 |
| Apple keywords, UTF-8 bytes | 68 | 100 |
| Apple description | 1,341 | 4,000 |
| Google short description | 79 | 80 |
| Google full description | 1,341 | 4,000 |

## Facts needed before the pack can be submitted

- **Responsibility is settled:** the owner confirmed the full legal name **Roberto Valeri**, personally responsible for Dove bevo for now, with `dovebevo@gmail.com` for privacy, support and content reports. A future company needs a deliberate policy update. The store publishing organization and the privacy controller are distinct; do not substitute the publisher into the policy.
- **Policy completion:** obtain any address/trader details the actual distribution requires; complete retention/removal and partner settings, then verify the final public `/privacy` and `/regole` in the app and browser. These drafts invent no address or company details.
- **Moderation:** Roberto is the content-report owner through the existing mailbox/admin workflow. Define response coverage and demonstrate the implemented temporary contribution restrictions on the isolated service. The review pack describes their shared-network/cohort scope, calendar expiry and evasion limits; no durable person ban or store approval is claimed.
- **Disclosures:** finalize each evidence-matrix row, app/SDK privacy manifests, encryption/deletion answers, sponsorship classification and content-rating questionnaires against the production binary and service. Empty manifest arrays are not a no-data declaration.
- **Review access and assets:** choose a real populated supported area; capture screenshots from the production candidate. Confirm a reachable anti-bot service and return-to-app path. Supply no fabricated reviewer credentials. Pricing, availability countries and final category are not set by these files; Food & Drink is a candidate to check in each console.

No console fields, legal agreements, audience declarations or distribution settings were saved by this documentation change.
