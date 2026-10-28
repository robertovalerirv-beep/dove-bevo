# Android automated-test safety

Dove Bevo shows the real website, whose anonymous contribution actions can publish real public data. Automated exploration must not submit invented prices, venues, confirmations or reports.

The Android app reads only Firebase's documented `Settings.System.getString(getContentResolver(), "firebase.test.lab")` signal once at activity creation. Exact `"true"` enables read-only mode. A missing/null flag leaves ordinary user behavior unchanged. A `SecurityException` reading the flag selects read-only mode conservatively. No device fingerprints, reviewer detection or hidden APIs are used.

In read-only mode a persistent native banner explains the restriction. Rules acceptance still precedes every WebView and service-worker-engine initialization. The ordinary launcher, website browsing, origin/cookies, SSL handling, permissions, privacy and back navigation retain their normal paths. Public submissions, external browser/mail/map launches and native sharing are unavailable during automated testing; attempted external actions show the same explanation. Outside this mode all existing methods and external actions remain available under the existing browser policy.

The website and popup WebViews share a `WebViewClient.shouldInterceptRequest` fence. The API 24+ `ServiceWorkerClient` fence is installed before creating any WebView, after rules acceptance. Both use immutable policy and return an in-memory, fixed HTTP 403 JSON response with `Cache-Control: no-store` before dispatching any request whose method is not exactly `GET`, `HEAD` or `OPTIONS`. Null, lowercase and unknown methods are rejected in this mode. The response takes no URL, request body or network client and never forwards or retries the blocked request. There is no injected website JavaScript or new backend endpoint.

## Coverage and limits

- Firebase documents this signal for its hosted devices, including Play Console pre-launch reports. This is a transparent data-protection restriction, disclosed here and in review notes; it does not claim to identify or cover every Google human/manual review environment.
- Current source uses POST for `/api/prices`, `/api/prices/confirm`, `/api/venues`, `/api/reports`, `/api/session`, `/api/events` and administrative mutations. `postWithSession`, direct admin fetches and event beacons were inspected. These public-data mutations are blocked by method across all origins, including service-worker requests and popup forms. No live contribution was created for verification.
- Android's interception callbacks define the boundary. They are not a general network firewall. The current website has no WebSocket or WebTransport write path; future transports or public-data mutations using a nominally safe method need separate review. GET caching/rate-limit bookkeeping remains normal browsing behavior.
- Local policy/response tests prove flag handling, exact method rules, normal-user pass-through and independent fixed response streams. They do not establish live Firebase device behavior, Google approval or a public store release. A release still needs its ordinary Android build/lint gates and isolated runtime verification without public submissions.

## Official references

- [Firebase Test Lab FAQ: detecting a running test](https://firebase.google.com/docs/test-lab/troubleshooting#how_do_i_detect_a_running_test_in_test_lab)
- [Android WebViewClient request interception](https://developer.android.com/reference/android/webkit/WebViewClient#shouldInterceptRequest(android.webkit.WebView,%20android.webkit.WebResourceRequest))
- [Android ServiceWorkerController](https://developer.android.com/reference/android/webkit/ServiceWorkerController)
