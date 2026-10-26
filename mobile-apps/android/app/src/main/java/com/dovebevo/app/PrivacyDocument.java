package com.dovebevo.app;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;

/** Reads the single bundled policy as complete UTF-8 plain text, without a WebView or network. */
public final class PrivacyDocument {
    public static final int MAX_BYTES = 128 * 1024;

    private PrivacyDocument() {}

    /** The caller owns and closes the asset stream. Invalid or oversized content is never truncated. */
    public static String read(InputStream stream) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        while (true) {
            int count = stream.read(buffer, 0, Math.min(buffer.length, MAX_BYTES + 1 - bytes.size()));
            if (count < 0) break;
            if (count == 0) {
                int value = stream.read();
                if (value < 0) break;
                bytes.write(value);
            } else {
                bytes.write(buffer, 0, count);
            }
            if (bytes.size() > MAX_BYTES) throw new IOException("Privacy policy is too large.");
        }
        String text = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
        if (text.startsWith("\uFEFF")) text = text.substring(1);
        if (text.trim().isEmpty() || text.indexOf('\0') >= 0) throw new IOException("Privacy policy is empty or invalid.");
        return text;
    }
}
