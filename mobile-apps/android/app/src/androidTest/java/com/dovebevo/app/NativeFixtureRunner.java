package com.dovebevo.app;

import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.test.runner.AndroidJUnitRunner;
import java.util.UUID;

/** Test-only browser profile, selected before any WebView or service-worker API.
 * These fixtures require API 28 isolation; the production app still supports API 24.
 * A fresh suffix preserves the normal browser profile, cookies and cached website.
 */
public final class NativeFixtureRunner extends AndroidJUnitRunner {
    static boolean isolatedProfileReady;

    @Override public void onCreate(Bundle arguments) {
        if (Build.VERSION.SDK_INT < 28)
            throw new IllegalStateException("Native browser fixtures require API 28+ for safe profile isolation");
        WebView.setDataDirectorySuffix("dovebevo-fixtures-" + UUID.randomUUID());
        isolatedProfileReady = true;
        super.onCreate(arguments);
    }
}
