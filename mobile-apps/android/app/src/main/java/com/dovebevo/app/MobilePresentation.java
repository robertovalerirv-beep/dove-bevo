package com.dovebevo.app;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;

/** Bounded bundled presentation only. The installer independently checks normal DOM and page nonce. */
final class MobilePresentation {
    static final String ASSET = "app-theme.js";
    static final int MAX_BYTES = 131072;
    private MobilePresentation() {}

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
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (count == 0 || bytes.size() > MAX_BYTES - count) throw new IOException("Invalid bundled presentation");
            bytes.write(buffer, 0, count);
        }
        if (bytes.size() == 0) throw new IOException("Missing bundled presentation");
        return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
    }
}
