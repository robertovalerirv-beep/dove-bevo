package com.dovebevo.app;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import android.webkit.WebView;
import android.content.Context;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.Set;

/** Bounded bundled presentation only. The installer independently checks normal DOM and page nonce. */
final class MobilePresentation {
    static final String ASSET = "app-theme.js";
    static final int MAX_BYTES = 131072;
    static final int MAX_ART_BYTES = 256 * 1024;
    private MobilePresentation() {}

    static void installDocumentStart(WebView view) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;
        try (InputStream input = view.getContext().getAssets().open("app-theme-start.js")) {
            String source = read(input);
            if (source.getBytes(StandardCharsets.UTF_8).length > 8192) return;
            WebViewCompat.addDocumentStartJavaScript(view, source,
                    Set.of("https://www.dovebevo.com", "https://dovebevo.com"));
        } catch (IOException unavailable) {
            // Keep normal browsing available if the optional theme cannot load.
        }
    }

    static boolean allows(String finishedUrl, String currentUrl) {
        if (finishedUrl == null || !finishedUrl.equals(currentUrl)
                || BrowserPolicy.target(finishedUrl) != BrowserPolicy.Target.INTERNAL) return false;
        try {
            URI uri = new URI(finishedUrl);
            return uri.getPort() == -1 && "https".equals(uri.getScheme())
                    && "www.dovebevo.com".equals(uri.getHost());
        } catch (java.net.URISyntaxException malformed) { return false; }
    }

    static String read(InputStream input) throws IOException {
        return read(input, MAX_BYTES);
    }

    static String load(Context context) throws IOException {
        String core;
        try (InputStream input = context.getAssets().open(ASSET)) { core = read(input); }
        try (InputStream input = context.getAssets().open("drink-art.js")) {
            return read(input, MAX_ART_BYTES) + "\n" + core;
        } catch (IOException optionalArtworkUnavailable) { return core; }
    }

    static String read(InputStream input, int maximum) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (count == 0 || bytes.size() > maximum - count) throw new IOException("Invalid bundled presentation");
            bytes.write(buffer, 0, count);
        }
        if (bytes.size() == 0) throw new IOException("Missing bundled presentation");
        return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
    }
}
