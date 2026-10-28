package com.dovebevo.app;

import static org.junit.Assert.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public final class RecommendationsClientTest {
    private static final String VENUE = "https://www.dovebevo.com/bar/n123?c=u0nd9";
    private static final String ID = "3b88fc80-93d6-4d17-a110-09f5c57979a3";
    private static RecommendationVoter voter() {
        return new RecommendationVoter(new RecommendationVoter.Storage() {
            public String read() { return ID; }
            public String create(String value) { throw new AssertionError("Existing identity replaced"); }
        });
    }
    static final class Sink implements RecommendationsClient.Transport {
        final List<RecommendationsClient.Request> requests = new ArrayList<>();
        int status = 200; byte[] body = DrinkRecommendationsTest.snapshot("n123", "water", 3, true);
        public RecommendationsClient.Response exchange(RecommendationsClient.Request request, RecommendationsClient.Cancellation cancellation) {
            requests.add(request); return new RecommendationsClient.Response(status, body);
        }
    }
    @Test public void exactEndpointHeadersAndIdempotentBooleanBodyWithoutCookies() throws Exception {
        Sink sink = new Sink(); RecommendationsClient client = new RecommendationsClient(voter(), TestLabPolicy.detect(() -> null), sink);
        assertEquals(3, client.get(VENUE, new RecommendationsClient.Cancellation()).row(RecommendationDrink.WATER).count);
        client.set(VENUE, RecommendationDrink.WATER, false, new RecommendationsClient.Cancellation());
        assertEquals(2, sink.requests.size());
        assertEquals("https://www.dovebevo.com/api/mobile/venues/n123/recommendations?c=u0nd9", sink.requests.get(0).url);
        assertEquals("GET", sink.requests.get(0).method); assertNull(sink.requests.get(0).body);
        RecommendationsClient.Request post = sink.requests.get(1);
        assertEquals("POST", post.method); assertEquals(ID, post.headers.get("X-DoveBevo-Voter"));
        assertEquals("https://www.dovebevo.com", post.headers.get("Origin"));
        assertEquals("application/json", post.headers.get("Content-Type"));
        assertEquals("{\"drink\":\"water\",\"recommended\":false}", new String(post.body, StandardCharsets.UTF_8));
        assertFalse(post.headers.containsKey("Cookie")); assertFalse(post.url.contains(ID));
    }
    @Test public void testLabAndUnreadableFlagRejectBeforeAnyPostSink() throws Exception {
        for (TestLabPolicy policy : new TestLabPolicy[]{TestLabPolicy.detect(() -> "true"), TestLabPolicy.detect(() -> { throw new SecurityException(); })}) {
            Sink sink = new Sink(); RecommendationsClient client = new RecommendationsClient(voter(), policy, sink);
            try { client.set(VENUE, RecommendationDrink.SPRITZ, true, new RecommendationsClient.Cancellation()); fail(); }
            catch (IOException expected) { }
            assertEquals(0, sink.requests.size());
            client.get(VENUE, new RecommendationsClient.Cancellation());
            assertEquals(1, sink.requests.size()); assertEquals("GET", sink.requests.get(0).method);
        }
    }
    @Test public void redirectsFailuresMalformedAndOversizeAreUnavailableNotZero() throws Exception {
        Sink sink = new Sink(); RecommendationsClient client = new RecommendationsClient(voter(), TestLabPolicy.detect(() -> null), sink);
        for (int status : new int[]{201, 204, 301, 302, 307, 308, 403, 404, 429, 500}) {
            sink.status = status;
            try { client.get(VENUE, new RecommendationsClient.Cancellation()); fail("Accepted non-200"); } catch (IOException expected) { }
        }
        sink.status = 200;
        for (byte[] body : new byte[][]{"{}".getBytes(StandardCharsets.UTF_8), new byte[32769], DrinkRecommendationsTest.snapshot("w9", "water", 0, false)}) {
            sink.body = body;
            try { client.get(VENUE, new RecommendationsClient.Cancellation()); fail("Accepted invalid response"); } catch (IOException expected) { }
        }
    }
    @Test public void invalidContextAndCancelledRequestNeverReachSink() throws Exception {
        Sink sink = new Sink(); RecommendationsClient client = new RecommendationsClient(voter(), TestLabPolicy.detect(() -> null), sink);
        for (String url : new String[]{"https://evil.test/bar/n123?c=u0nd9", VENUE + "&x=1", "https://www.dovebevo.com/", VENUE + "#x"}) {
            try { client.get(url, new RecommendationsClient.Cancellation()); fail(); } catch (IOException expected) { }
        }
        RecommendationsClient.Cancellation cancelled = new RecommendationsClient.Cancellation(); cancelled.cancel();
        try { client.set(VENUE, RecommendationDrink.WATER, true, cancelled); fail(); } catch (IOException expected) { }
        assertEquals(0, sink.requests.size());
    }
}
