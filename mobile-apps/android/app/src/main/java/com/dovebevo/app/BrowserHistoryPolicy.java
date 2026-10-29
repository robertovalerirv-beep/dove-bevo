package com.dovebevo.app;

/** Only a small, entirely trusted document history is eligible for OS state restoration. */
final class BrowserHistoryPolicy {
    static final int MAX_ENTRIES = 50;
    static final int MAX_STATE_BYTES = 131072;

    private BrowserHistoryPolicy() {}

    static boolean accepts(String[] urls, int currentIndex, int stateBytes) {
        if (urls == null || urls.length == 0 || urls.length > MAX_ENTRIES
                || currentIndex < 0 || currentIndex >= urls.length
                || stateBytes < 1 || stateBytes > MAX_STATE_BYTES) return false;
        for (String url : urls) if (BrowserPolicy.target(url) != BrowserPolicy.Target.INTERNAL) return false;
        return true;
    }
}
