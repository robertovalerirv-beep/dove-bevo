# Mobile usability and saved venues

## Intent and authority

Build the first mobile update after the submitted Android 20 and iOS 26 releases. The owner authorized improvements to both mobile usability/navigation and native phone features, and delegated routine implementation choices. The coordinator selected the bounded features below. Store review submissions stay intact; this update does not replace their binaries or claim public availability.

## Approach

Extend the existing Java Android and Swift/UIKit iOS applications. Keep the production website, backend, schema, authentication and deployment unchanged. Native bookmarks use the existing `/bar/<key>?c=<cell>` route and the venue name already displayed in its open receipt. A fixed read-only expression obtains only that public heading, current URL and the existing public selection marker. It exposes no generic JavaScript bridge, invokes no page action, reads no credentials and adds no API, server account or dependency.

Real-iPhone feedback supersedes the initial manual-name design: keep bookmarks, automatically use the existing venue name, and show no naming/rename form or generated venue-ID fallback. Public price contributions remain the existing orange website action.

Alternatives considered were a new native map interface, which would duplicate Roberto's interface and require a larger integration, and server-synchronized favorites, which would change the backend. Local saved venues fit the current boundary and provide a useful native feature immediately.

## Saved venues contract

- Save only a currently open valid bar URL. An unavailable page, home/map page, admin page or unrelated URL is not eligible.
- Accepted origins are HTTPS `dovebevo.com` and `www.dovebevo.com`, without credentials and with absent/default 443 port. Canonical output uses `https://www.dovebevo.com` without an explicit port.
- The raw path must exactly match `/bar/[nwru][1-9][0-9]{0,14}`. The raw query must exactly match `c=[0-9b-hjkmnp-z]{5}`. Reject fragments, extra/duplicate parameters, percent-encoded substitutions, Unicode digits and misleading hosts.
- Native actions clearly identify private bookmarks: `Salva nei preferiti` and `Preferiti` in the top-right three-dot menu. Saving is one action using the existing venue name; there is no name form, manual rename or ID fallback. A saved canonical URL is unique: explicitly bookmarking it again updates its actual name and moves it to the front.
- Capture only one open, visible bare venue dialog and its exact receipt heading; require the heading to equal that dialog's accessible name. Reject ambiguity, an overlaid sheet and explicitly hidden/inert content. A heading may be scrolled off-screen inside the active dialog. Require the unique existing `section.map[data-selected]` key to match the strict venue key from the URL; this closes the interval between SPA `pushState` and route rendering. Page title and SEO canonical metadata can be stale and are not fallbacks.
- The fixed reader returns exactly three bounded strings: current href, name and selected key. Validate the captured URL, response URL/key and still-usable native URL, original WebView identity, foreground state and navigation generation before saving. Stop, failure, navigation/history changes, dismissal or destruction invalidate pending work, including leaving and returning to the same URL. No user/website string is interpolated into executable code.
- Automatic names must be nonempty after trimming and at most 120 UTF-16 units, matching imported OSM names; one-character names are valid. Reject C0/C1 controls and malformed UTF-16 before bridging and validate again natively. Do not truncate. Stored-label validation allows up to 120 Unicode scalar values (Java code points), preserving all previous valid 80-scalar labels, including legacy emoji/custom names. Existing labels are not silently rewritten during reads.
- Keep at most 50 venues, newest first. At capacity, show a clear message and require removing a venue before adding another; never silently evict saved choices.
- Reopen and remove entries from a native list. The list is usable offline, but maps and prices still require a connection. A removed public venue may show the website's normal not-found state.
- Persist only canonical venue URL and associated name in app-private storage. Android uses a synchronized file-data write followed by a same-directory atomic rename with explicit errors; iOS uses an atomic application-support file. Cap encoded storage at 64 KiB before decoding. Establish iOS backup exclusion on the dedicated saved-data directory before a final file commit, and verify replacement remains excluded. Preserve Android's existing backup configuration and ordinary file-data protection; OS device transfers remain platform-dependent. Read and validate stored records before using them. Filter malformed individual records, but fail closed on an unreadable, truncated, oversized or over-capacity whole-file payload: saving or removing must not silently overwrite that file. No automatic saving of browsing history, coordinates, prices, cookies or tokens. Do not transmit saved records or add analytics.
- Do not claim `saved` until persistence succeeds. A storage failure must leave the prior visible state intact and give a retryable message.

## Navigation and recovery

- Preserve real website/browser history. City search moves the map without a history entry; opening a venue creates an entry. Do not manufacture history or change website routes.
- Add Android Forward, with Back/Forward toolbar enabled states reflecting actual WebView history. System Back still closes the activity at history root. Preserve history across activity recreation using the platform's documented restoration API, validating restored top-level destinations and using the existing trusted URL fallback when restoration fails. Do not claim the API preserves a complete offline rendered page.
- Both platforms switch Reload to Stop during a document load. Stop cancels the load without replaying submissions, hides transient loading controls and leaves a clear Retry path if no usable page loaded. A stale cancellation callback must not obscure a later successful navigation. Reload/Retry remain explicit safe GET requests where already required.
- Add Android location help with a user-triggered app-settings action and city-search fallback. Do not request permissions automatically, broaden permissions, read location natively or loop after denial. Keep approximate-location support.
- While an iOS native error overlay covers the web content, exclude the covered content from accessibility navigation. Keep the error/retry and native toolbar accessible and restore web accessibility after recovery. Do not claim physical VoiceOver verification from a source test.

## Boundaries and risks

All source, worktrees, builds, evidence and temporary project files stay in the selected OneDrive project folder. Credentials and signing stores remain protected outside source/OneDrive. Changes are confined to `mobile-apps/**`; a mobile-workflow change needs a demonstrated verification requirement. Add no production permissions, fabricated public contributions or Cloudflare resources. Necessary signing and beta distribution use separately verified lanes while preserving the pending original public submissions.

Highest risks are malformed stored links, persistence failure/corruption, stale WebView callbacks after stop/recreation, history-root behaviour, TalkBack/VoiceOver access, and test-only hooks escaping into release. Native persistence must never share private data through a URL or privileged bridge.

## Acceptance evidence

Use real policy/store unit tests with adversarial URLs, duplicate/capacity/corruption/storage-failure cases. Use platform UI/runtime checks for save-list-reopen-remove, persistence across restart, Back/Forward and activity recreation, held-load Stop/Retry, offline recovery, and accessible native controls. Use owned local fixtures for deterministic navigation/network behaviour; do not post to production. Retain fresh Android build/lint/unit evidence and a necessary hosted Mac build/unit/UI check because the workstation is Windows. Distinguish local/simulator results from physical-device and public-store verification. Independently review both platforms, integrate only their claimed paths, then rerun final checks centrally. Saving eligibility uses the actual current WebView URL and a usable page state, never a previous-URL fallback; presenting/dismissing saved venues must preserve the existing WebView and map session.
