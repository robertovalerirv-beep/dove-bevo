# Private drink favourites

An owner-requested phone feature: save the drink currently shown at a venue without entering a name. Existing venue favourites and public drink recommendations remain separate.

## Behaviour

- Open a venue and choose a drink on the map. Tap the existing bottom **Salva** action. The native chooser offers **Salva locale** and, when an actual active featured price is visible, **Salva [drink] · [venue]** with its normal or happy-hour band.
- **Preferiti** has **Locali** and **Drink** views. Venue comparisons retain their existing category and band controls. Drink favourites use each record's own category and band.
- Names come from the verified venue heading and the existing drink category. There is no naming form.
- Each drink favourite identifies a venue key, category and normal/happy-hour band. It is not a fixed price or a named branded menu item. Current menu descriptions, prices, dates, source details, currencies and serving formats come from the existing read APIs.
- Every current serving/currency variant remains separate. Missing, hidden, quarantined or unavailable prices are labelled truthfully. There is no zero-price fallback, currency conversion or silent substitution of a different drink or band.
- Opening a drink favourite uses the real mobile venue document with its typed category and band selected. Reload and browser history retain that selection. If the requested price disappears, the page says so and does not feature another price as the saved drink.

## Storage and compatibility

The new drink records are private to this app installation. They do not require login, synchronize to another device, publish a price, or submit a thumbs-up. App removal or clearing app data removes them. Each platform uses a separate bounded atomic local store with the existing no-backup/protection policy: at most 50 records and 64 KiB. The original venue store remains untouched. Removing one venue favourite does not remove an independent drink favourite.

The deduplication key uses the stable venue key plus category and band, not the venue cell, amount, currency or serving. Re-saving updates its automatic label and current canonical cell without duplicating the record. Failed writes preserve the last successful records.

## Route and lifecycle boundary

The native app-only venue document accepts either the existing exact `path,c` pair or the exact `path,c,drink,hh` tuple. Category must be one of the existing nine codes and `hh` must be literal `0` or `1`. Partial, duplicate, unknown-key, malformed or fragment-bearing routes fail closed. Canonical venue identity strips only a validated focus tuple; dedicated builders preserve it for reopening. Incidental private query fields are never copied into a saved link.

Saving a drink reuses the read-only, typed featured-price reader with current venue/name identity, sole visible dialog, foreground, current-navigation generation and bounded timeout checks. Opening another native destination, navigation, backgrounding, cancellation or a newer action retires pending capture. There is no new general JavaScript bridge, backend route, permission or public write.

## Apple review recording

The owner's original recording was retained privately and its cloud SHA-256 matched the downloaded copy. It begins inside the app and ends in Apple Maps with personal history. It will not be submitted unchanged: Apple's request explicitly requires a recording beginning with app launch. A fresh short recording should follow the final installed candidate and show the native save chooser, both favourite views, reporting and privacy, with actual build/OS evidence. Do not publish the private original or derived frames in Git.
