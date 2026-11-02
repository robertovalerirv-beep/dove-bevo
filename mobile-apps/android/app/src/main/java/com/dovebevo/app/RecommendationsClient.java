package com.dovebevo.app;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.CookieHandler;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.net.ssl.HttpsURLConnection;

/** Native HTTPS only; it never reads WebView cookies or follows a redirect. */
final class RecommendationsClient implements RecommendationsUi.Api {
    static final String ORIGIN = "https://www.dovebevo.com";
    static final class Request {
        final String url, method;
        final Map<String, String> headers;
        final byte[] body;
        Request(String url, String method, Map<String, String> headers, byte[] body) {
            this.url = url; this.method = method; this.headers = Collections.unmodifiableMap(headers); this.body = body;
        }
    }
    static final class Response {
        final int status; final byte[] body;
        Response(int status, byte[] body) { this.status = status; this.body = body; }
    }
    interface Transport { Response exchange(Request request, Cancellation cancellation) throws IOException; }
    static final class Cancellation {
        private boolean cancelled; private HttpsURLConnection connection;
        synchronized void attach(HttpsURLConnection value) throws IOException {
            if (cancelled) { value.disconnect(); throw new IOException("Recommendation request cancelled"); }
            connection = value;
        }
        synchronized void cancel() { cancelled = true; if (connection != null) connection.disconnect(); }
        synchronized void check() throws IOException { if (cancelled) throw new IOException("Recommendation request cancelled"); }
        synchronized void detach() { connection = null; }
    }
    private final RecommendationVoter voter;
    private final TestLabPolicy policy;
    private final Transport transport;
    RecommendationsClient(RecommendationVoter voter, TestLabPolicy policy) { this(voter, policy, new HttpsTransport()); }
    RecommendationsClient(RecommendationVoter voter, TestLabPolicy policy, Transport transport) {
        this.voter = voter; this.policy = policy; this.transport = transport;
    }
    @Override public DrinkRecommendations get(String canonical, Cancellation cancellation) throws IOException {
        return request(canonical, null, false, cancellation);
    }
    @Override public DrinkRecommendations set(String canonical, RecommendationDrink drink, boolean selected, Cancellation cancellation) throws IOException {
        if (drink == null || !policy.allowsMethod("POST")) throw new IOException("Recommendations are read only");
        return request(canonical, drink, selected, cancellation);
    }
    private DrinkRecommendations request(String canonical, RecommendationDrink drink, boolean selected, Cancellation cancellation) throws IOException {
        String valid = SavedVenueUrl.canonicalize(canonical);
        if (valid == null || !valid.equals(canonical)) throw new IOException("Venue unavailable");
        int query = valid.indexOf('?');
        String key = valid.substring(valid.lastIndexOf('/', query) + 1, query);
        String endpoint = ORIGIN + "/api/mobile/venues/" + key + "/recommendations" + valid.substring(query);
        cancellation.check();
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Accept", "application/json"); headers.put("Cache-Control", "no-store");
        headers.put("X-DoveBevo-Voter", voter.id());
        byte[] body = null;
        if (drink != null) {
            // Defense in depth at the final transport boundary, independent of disabled UI controls.
            if (!policy.allowsMethod("POST")) throw new IOException("Recommendations are read only");
            headers.put("Origin", ORIGIN); headers.put("Content-Type", "application/json");
            body = ("{\"drink\":\"" + drink.code + "\",\"recommended\":" + selected + "}").getBytes(StandardCharsets.UTF_8);
        }
        Response response = transport.exchange(new Request(endpoint, drink == null ? "GET" : "POST", headers, body), cancellation);
        cancellation.check();
        if (response.status != 200) throw new IOException("Recommendations unavailable");
        return DrinkRecommendations.parse(response.body, key);
    }
    private static final class HttpsTransport implements Transport {
        @Override public Response exchange(Request request, Cancellation cancellation) throws IOException {
            // HttpURLConnection may consult a process-wide CookieHandler. Fail closed rather than inherit ambient credentials.
            if (CookieHandler.getDefault() != null) throw new IOException("Recommendations unavailable");
            HttpsURLConnection connection = (HttpsURLConnection) new URL(request.url).openConnection();
            cancellation.attach(connection);
            long deadline = System.nanoTime() + 16000000000L;
            try {
                connection.setInstanceFollowRedirects(false); connection.setUseCaches(false);
                connection.setConnectTimeout(8000); connection.setReadTimeout(8000);
                connection.setRequestMethod(request.method);
                for (Map.Entry<String, String> header : request.headers.entrySet()) connection.setRequestProperty(header.getKey(), header.getValue());
                if (request.body != null) {
                    connection.setDoOutput(true); connection.setFixedLengthStreamingMode(request.body.length);
                    try (OutputStream output = connection.getOutputStream()) { cancellation.check(); output.write(request.body); }
                }
                int status = connection.getResponseCode();
                if (status != 200) return new Response(status, null);
                long declared = connection.getContentLengthLong();
                if (declared > DrinkRecommendations.MAX_BYTES) throw new IOException("Recommendations unavailable");
                try (InputStream input = connection.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[2048];
                    while (true) {
                        cancellation.check(); long remaining = (deadline - System.nanoTime()) / 1000000L;
                        if (remaining <= 0) throw new IOException("Recommendations unavailable");
                        connection.setReadTimeout((int) Math.min(8000L, remaining));
                        int count = input.read(buffer);
                        if (count == -1) return new Response(status, bytes.toByteArray());
                        if (bytes.size() + count > DrinkRecommendations.MAX_BYTES) throw new IOException("Recommendations unavailable");
                        bytes.write(buffer, 0, count);
                    }
                }
            } finally { cancellation.detach(); connection.disconnect(); }
        }
    }
}
