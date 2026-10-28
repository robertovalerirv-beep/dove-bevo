package com.dovebevo.app;

/** Ignore only an explicit platform cancellation; real document errors still need recovery. */
final class BrowserFailurePolicy {
    private BrowserFailurePolicy() {}

    static boolean isCancelled(int errorCode, CharSequence description) {
        // WebViewClient.ERROR_UNKNOWN is -1 on all supported Android versions.
        return errorCode == -1 && description != null && "net::ERR_ABORTED".contentEquals(description);
    }
}
