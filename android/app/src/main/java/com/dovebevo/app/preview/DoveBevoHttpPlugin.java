package com.dovebevo.app.preview;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.CookieJar;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

/** Cookie-free transport for the isolated preview. No logging, redirects, cache or WebView cookie jar. */
@CapacitorPlugin(name = "DoveBevoHttp")
public class DoveBevoHttpPlugin extends Plugin {
    private static final int MAX_REQUEST_BYTES = 16 * 1024;
    private static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
    private static final Set<String> MUTATIONS = new HashSet<>(Arrays.asList(
        "/api/mobile/prices", "/api/mobile/prices/confirm", "/api/mobile/venues", "/api/mobile/reports"
    ));
    private final OkHttpClient client = new OkHttpClient.Builder()
        .cookieJar(CookieJar.NO_COOKIES)
        .followRedirects(false)
        .followSslRedirects(false)
        .retryOnConnectionFailure(false)
        .cache(null)
        .callTimeout(20, TimeUnit.SECONDS)
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build();

    @PluginMethod
    public void request(PluginCall call) {
        try {
            String rawUrl = call.getString("url", "");
            URI url = new URI(rawUrl);
            String path = url.getRawPath();
            if (!"https".equals(url.getScheme()) || !"mobile-preview.dovebevo.com".equals(url.getHost()) ||
                url.getRawUserInfo() != null || url.getRawFragment() != null || (url.getPort() != -1 && url.getPort() != 443) ||
                path == null || !(path.startsWith("/api/") || path.startsWith("/data/")) ||
                !url.normalize().getRawPath().equals(path) || path.toLowerCase(Locale.ROOT).contains("%2e") || path.contains("\\")) {
                call.reject("Native destination refused");
                return;
            }
            String method = call.getString("method", "GET");
            if (!(method.equals("GET") || method.equals("POST"))) {
                call.reject("Native method refused");
                return;
            }
            String data = call.getString("data");
            byte[] bytes = data == null ? new byte[0] : data.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > MAX_REQUEST_BYTES || (method.equals("GET") && data != null)) {
                call.reject("Native request body refused");
                return;
            }
            Request.Builder builder = new Request.Builder().url(rawUrl);
            JSObject headers = call.getObject("headers", new JSObject());
            Iterator<String> names = headers.keys();
            while (names.hasNext()) {
                String name = names.next();
                String value = headers.getString(name);
                String lower = name.toLowerCase(Locale.ROOT);
                if (value == null || value.length() > 4096 || value.contains("\r") || value.contains("\n") ||
                    !(lower.equals("accept") || lower.equals("content-type") || lower.equals("authorization") || lower.equals("x-dovebevo-native")) ||
                    (lower.equals("authorization") && !(method.equals("POST") && MUTATIONS.contains(path) && value.startsWith("Bearer "))) ||
                    (lower.equals("x-dovebevo-native") && !value.equals("1"))) {
                    call.reject("Native header refused");
                    return;
                }
                builder.header(name, value);
            }
            if (method.equals("POST")) builder.post(RequestBody.create(bytes, MediaType.get("application/json")));
            else builder.get();
            client.newCall(builder.build()).enqueue(new Callback() {
                @Override
                public void onFailure(Call request, IOException error) {
                    call.reject("Native request failed");
                }

                @Override
                public void onResponse(Call request, Response response) {
                    try (Response closed = response) {
                        if (response.code() >= 300 && response.code() < 400) {
                            call.reject("Native redirect refused");
                            return;
                        }
                        ResponseBody body = response.body();
                        if (body == null || body.contentLength() > MAX_RESPONSE_BYTES) {
                            call.reject("Native response refused");
                            return;
                        }
                        ByteArrayOutputStream output = new ByteArrayOutputStream();
                        try (InputStream input = body.byteStream()) {
                            byte[] buffer = new byte[8192];
                            int count;
                            while ((count = input.read(buffer)) != -1) {
                                if (output.size() + count > MAX_RESPONSE_BYTES) {
                                    call.reject("Native response too large");
                                    return;
                                }
                                output.write(buffer, 0, count);
                            }
                        }
                        JSObject responseHeaders = new JSObject();
                        for (String name : response.headers().names()) {
                            if (!name.equalsIgnoreCase("Set-Cookie") && !name.equalsIgnoreCase("Set-Cookie2")) {
                                responseHeaders.put(name.toLowerCase(Locale.ROOT), response.header(name));
                            }
                        }
                        JSObject result = new JSObject();
                        result.put("status", response.code());
                        result.put("headers", responseHeaders);
                        result.put("body", output.toString(StandardCharsets.UTF_8.name()));
                        call.resolve(result);
                    } catch (IOException error) {
                        call.reject("Native response failed");
                    }
                }
            });
        } catch (Exception error) {
            call.reject("Native request refused");
        }
    }

    @Override
    protected void handleOnDestroy() {
        client.dispatcher().cancelAll();
        client.connectionPool().evictAll();
    }
}
