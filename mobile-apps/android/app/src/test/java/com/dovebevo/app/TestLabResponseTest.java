package com.dovebevo.app;

import static org.junit.Assert.*;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class TestLabResponseTest {
    @Test public void safeRequestsAndOrdinaryUsersKeepDefaultNetworkHandling() {
        TestLabPolicy testLab = TestLabPolicy.detect(() -> "true");
        for (String method : new String[]{"GET", "HEAD", "OPTIONS"}) assertNull(TestLabResponse.forRequest(testLab, method));
        TestLabPolicy normal = TestLabPolicy.detect(() -> null);
        for (String method : new String[]{"GET", "POST", "DELETE", null}) assertNull(TestLabResponse.forRequest(normal, method));
    }

    @Test public void blockedRequestsReturnFixedLocalForbiddenResponseWithoutNetworkInputs() throws Exception {
        TestLabPolicy testLab = TestLabPolicy.detect(() -> "true");
        for (String method : new String[]{"POST", "PUT", "PATCH", "DELETE", "CONNECT", "TRACE", "unexpected", "", null}) {
            TestLabResponse response = TestLabResponse.forRequest(testLab, method);
            assertNotNull(String.valueOf(method), response);
            assertEquals(403, response.statusCode());
            assertEquals("Forbidden", response.reasonPhrase());
            assertEquals("application/json", response.mimeType());
            assertEquals("UTF-8", response.encoding());
            assertEquals("no-store", response.headers().get("Cache-Control"));
            try (InputStream body = response.openBody()) {
                assertEquals("{\"error\":\"automated_test_read_only\",\"message\":\"Public submissions are disabled during automated testing.\"}\n",
                        new String(body.readAllBytes(), StandardCharsets.UTF_8));
            }
        }
    }

    @Test public void concurrentResponsesHaveIndependentBodyStreams() throws Exception {
        TestLabResponse response = TestLabResponse.forRequest(TestLabPolicy.detect(() -> "true"), "POST");
        try (InputStream first = response.openBody(); InputStream second = response.openBody()) {
            assertNotSame(first, second);
            first.readAllBytes();
            assertEquals('{', second.read());
        }
    }
}
