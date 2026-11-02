package com.dovebevo.app;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Map;

/** A local response descriptor; no URL, transport or network collaborator is accepted. */
final class TestLabResponse {
    private static final TestLabResponse FORBIDDEN = new TestLabResponse();
    private static final byte[] BODY = ("{\"error\":\"automated_test_read_only\","
            + "\"message\":\"Public submissions are disabled during automated testing.\"}\n")
            .getBytes(StandardCharsets.UTF_8);

    private TestLabResponse() {}

    static TestLabResponse forRequest(TestLabPolicy policy, String method) {
        return policy.allowsMethod(method) ? null : FORBIDDEN;
    }

    int statusCode() { return 403; }
    String reasonPhrase() { return "Forbidden"; }
    String mimeType() { return "application/json"; }
    String encoding() { return "UTF-8"; }
    Map<String, String> headers() { return Collections.singletonMap("Cache-Control", "no-store"); }
    InputStream openBody() { return new ByteArrayInputStream(BODY); }
}
