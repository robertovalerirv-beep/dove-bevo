package com.dovebevo.app;

import android.os.Bundle;
import android.os.Parcel;
import android.webkit.WebBackForwardList;
import android.webkit.WebView;

/** Best-effort OS history state; it deliberately does not persist rendered pages. */
final class BrowserHistoryState {
    private BrowserHistoryState() {}

    static Bundle capture(WebView view) {
        Bundle state = new Bundle();
        WebBackForwardList history = view.saveState(state);
        return safe(history, size(state)) ? state : null;
    }

    /** Invalid attempted restores remain network-blocked and must be discarded by the caller. */
    static WebBackForwardList restore(WebView view, Bundle state) {
        if (state == null || size(state) > BrowserHistoryPolicy.MAX_STATE_BYTES) return null;
        boolean previouslyBlocked = view.getSettings().getBlockNetworkLoads();
        view.getSettings().setBlockNetworkLoads(true);
        WebBackForwardList history = view.restoreState(state);
        if (!safe(history, size(state))) throw new IllegalArgumentException("Untrusted browser history");
        view.getSettings().setBlockNetworkLoads(previouslyBlocked);
        return history;
    }

    private static int size(Bundle state) {
        Parcel parcel = Parcel.obtain();
        try { parcel.writeBundle(state); return parcel.dataSize(); }
        finally { parcel.recycle(); }
    }

    private static boolean safe(WebBackForwardList history, int bytes) {
        if (history == null || history.getSize() > BrowserHistoryPolicy.MAX_ENTRIES) return false;
        String[] urls = new String[history.getSize()];
        for (int i = 0; i < urls.length; i++) urls[i] = history.getItemAtIndex(i).getUrl();
        return BrowserHistoryPolicy.accepts(urls, history.getCurrentIndex(), bytes);
    }
}
