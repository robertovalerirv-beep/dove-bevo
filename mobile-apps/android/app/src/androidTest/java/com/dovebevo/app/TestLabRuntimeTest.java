package com.dovebevo.app;

import static org.junit.Assert.*;

import android.app.Instrumentation;
import android.os.Build;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayInputStream;
import java.lang.reflect.Constructor;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;

/** Real WebView callbacks, entirely local fixtures: never launches MainActivity or the website. */
public final class TestLabRuntimeTest {
    private static final String HOST = "dovebevo-runtime.invalid";
    private static final String RESULT = "DOVEBEVO_RUNTIME_RESULT:";
    private static final String PAGE = """
            <!doctype html><meta charset="utf-8">
            <meta http-equiv="Content-Security-Policy"
              content="default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; worker-src 'self'">
            <title>Local Test Lab fence fixture</title><script>
            (async () => {
              const result = {}; let registration;
              try {
                result.get = (await fetch('direct', {cache:'no-store'})).status;
                const post = await fetch('direct', {method:'POST', body:'local fixture'});
                result.post = post.status; result.postBody = await post.json();
                registration = await navigator.serviceWorker.register('worker.js', {scope:'./'});
                const ready = await navigator.serviceWorker.ready;
                const worker = ready.active;
                if (!worker) throw new Error('worker did not activate');
                result.worker = await new Promise((resolve, reject) => {
                  const channel = new MessageChannel();
                  const timeout = setTimeout(() => reject(new Error('worker reply timed out')), 10000);
                  channel.port1.onmessage = event => {
                    clearTimeout(timeout); channel.port1.close(); resolve(event.data);
                  };
                  worker.postMessage('local requests', [channel.port2]);
                });
              } catch (error) { result.error = String(error); }
              finally {
                try { result.unregistered = registration ? await registration.unregister() : false; }
                catch (error) { result.cleanupError = String(error); }
                console.log('DOVEBEVO_RUNTIME_RESULT:' + JSON.stringify(result));
              }
            })();
            </script>
            """;
    private static final String WORKER = """
            self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
            self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
            self.addEventListener('message', event => {
              event.waitUntil((async () => {
                const result = {};
                try {
                  result.get = (await fetch('worker', {cache:'no-store'})).status;
                  const response = await fetch('worker', {method:'POST', body:'local worker fixture'});
                  result.post = response.status; result.postBody = await response.json();
                } catch (error) { result.error = String(error); }
                event.ports[0].postMessage(result);
              })());
            });
            """;

    @Test public void readOnlyModeBlocksPageAndServiceWorkerPostsLocally() throws Exception {
        exercise(true);
    }

    @Test public void normalModeReachesLocalPostSinkAsNegativeControl() throws Exception {
        exercise(false);
    }

    private void exercise(boolean readOnly) throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        TestLabPolicy policy = TestLabPolicy.detect(() -> readOnly ? "true" : null);
        WebViewClient appClient = appClient("TestLabClient", policy, WebViewClient.class);
        ServiceWorkerClient appWorker = appClient("TestLabServiceWorkerClient", policy, ServiceWorkerClient.class);
        String scope = "/" + UUID.randomUUID() + "/";
        AtomicInteger pagePostCallbacks = new AtomicInteger();
        AtomicInteger workerPostCallbacks = new AtomicInteger();
        AtomicInteger localPagePosts = new AtomicInteger();
        AtomicInteger localWorkerPosts = new AtomicInteger();
        AtomicInteger unexpectedOrigins = new AtomicInteger();
        AtomicReference<WebView> webView = new AtomicReference<>();
        AtomicReference<String> rawResult = new AtomicReference<>();
        CountDownLatch completed = new CountDownLatch(1);
        boolean[] priorWorkerBlock = new boolean[1];
        boolean cleanedWorker = false;
        try {
            instrumentation.runOnMainSync(() -> {
                ServiceWorkerController controller = ServiceWorkerController.getInstance();
                priorWorkerBlock[0] = controller.getServiceWorkerWebSettings().getBlockNetworkLoads();
                controller.getServiceWorkerWebSettings().setBlockNetworkLoads(true);
                // Install before new WebView. Both wrappers always terminate every request locally.
                controller.setServiceWorkerClient(new ServiceWorkerClient() {
                    @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                        if (isPost(request)) workerPostCallbacks.incrementAndGet();
                        WebResourceResponse blocked = appWorker.shouldInterceptRequest(request);
                        return blocked != null ? blocked : fixture(request, scope, localWorkerPosts, unexpectedOrigins);
                    }
                });
                WebView view = new WebView(instrumentation.getTargetContext());
                webView.set(view);
                view.getSettings().setJavaScriptEnabled(true);
                view.getSettings().setBlockNetworkLoads(true);
                view.getSettings().setAllowFileAccess(false);
                view.getSettings().setAllowContentAccess(false);
                view.setWebViewClient(new WebViewClient() {
                    @Override public WebResourceResponse shouldInterceptRequest(WebView current, WebResourceRequest request) {
                        if (isPost(request)) pagePostCallbacks.incrementAndGet();
                        WebResourceResponse blocked = appClient.shouldInterceptRequest(current, request);
                        return blocked != null ? blocked : fixture(request, scope, localPagePosts, unexpectedOrigins);
                    }
                });
                view.setWebChromeClient(new WebChromeClient() {
                    @Override public boolean onConsoleMessage(ConsoleMessage message) {
                        if (message.message().startsWith(RESULT)) {
                            rawResult.set(message.message().substring(RESULT.length()));
                            completed.countDown();
                        }
                        return true;
                    }
                });
                view.loadUrl("https://" + HOST + scope + "index.html");
            });
            assertTrue("Local fixture/worker did not finish within 30 seconds", completed.await(30, TimeUnit.SECONDS));
            JSONObject result = new JSONObject(rawResult.get());
            cleanedWorker = result.optBoolean("unregistered");
            String provider = Build.VERSION.SDK_INT >= 26
                    ? String.valueOf(WebView.getCurrentWebViewPackage()) : "API 24-25";
            Log.i("DoveBevoTestLab", "api=" + Build.VERSION.SDK_INT + " readOnly=" + readOnly
                    + " provider=" + provider
                    + " pagePostCallbacks=" + pagePostCallbacks.get() + " workerPostCallbacks=" + workerPostCallbacks.get()
                    + " localPagePosts=" + localPagePosts.get() + " localWorkerPosts=" + localWorkerPosts.get()
                    + " result=" + result);
            assertFalse(result.toString(), result.has("error"));
            assertFalse(result.toString(), result.has("cleanupError"));
            assertTrue("Fixture worker registration was not removed", cleanedWorker);
            assertEquals(0, unexpectedOrigins.get());
            assertEquals(200, result.getInt("get"));
            assertEquals(1, pagePostCallbacks.get());
            assertEquals(1, workerPostCallbacks.get());
            JSONObject worker = result.getJSONObject("worker");
            assertFalse(worker.toString(), worker.has("error"));
            assertEquals(200, worker.getInt("get"));
            assertEquals(readOnly ? 403 : 200, result.getInt("post"));
            assertEquals(readOnly ? 403 : 200, worker.getInt("post"));
            assertEquals(readOnly ? 0 : 1, localPagePosts.get());
            assertEquals(readOnly ? 0 : 1, localWorkerPosts.get());
            if (readOnly) {
                assertEquals("automated_test_read_only", result.getJSONObject("postBody").getString("error"));
                assertEquals("automated_test_read_only", worker.getJSONObject("postBody").getString("error"));
            }
        } finally {
            final boolean restoreWorkerSettings = cleanedWorker;
            instrumentation.runOnMainSync(() -> {
                WebView view = webView.get();
                if (view != null) { view.stopLoading(); view.destroy(); }
                ServiceWorkerController controller = ServiceWorkerController.getInstance();
                // On timeout/failure keep network blocked for any late worker in this isolated process.
                controller.getServiceWorkerWebSettings().setBlockNetworkLoads(
                        restoreWorkerSettings ? priorWorkerBlock[0] : true);
                controller.setServiceWorkerClient(null);
            });
        }
    }

    private static boolean isPost(WebResourceRequest request) {
        return request != null && "POST".equals(request.getMethod());
    }

    private static <T> T appClient(String nestedClass, TestLabPolicy policy, Class<T> type) throws Exception {
        // Reflection targets only our own private classes; release code needs no test entry point.
        Class<?> implementation = Class.forName("com.dovebevo.app.MainActivity$" + nestedClass);
        Constructor<?> constructor = implementation.getDeclaredConstructor(TestLabPolicy.class);
        constructor.setAccessible(true);
        return type.cast(constructor.newInstance(policy));
    }

    private static WebResourceResponse fixture(WebResourceRequest request, String scope,
            AtomicInteger localPosts, AtomicInteger unexpectedOrigins) {
        if (request == null || !"https".equals(request.getUrl().getScheme())
                || !HOST.equals(request.getUrl().getHost()) || request.getUrl().getPort() != -1) {
            unexpectedOrigins.incrementAndGet();
            return localResponse("text/plain", 404, "Not Found", "Unknown local fixture origin");
        }
        String path = request.getUrl().getPath();
        if ("GET".equals(request.getMethod()) && (scope + "index.html").equals(path))
            return localResponse("text/html", 200, "OK", PAGE);
        if ("GET".equals(request.getMethod()) && (scope + "worker.js").equals(path))
            return localResponse("application/javascript", 200, "OK", WORKER);
        if ((scope + "direct").equals(path) || (scope + "worker").equals(path)) {
            if (isPost(request)) localPosts.incrementAndGet();
            return localResponse("application/json", 200, "OK", "{\"fixture\":true}");
        }
        return localResponse("text/plain", 404, "Not Found", "Unknown local fixture route");
    }

    private static WebResourceResponse localResponse(String mimeType, int status, String reason, String body) {
        return new WebResourceResponse(mimeType, "UTF-8", status, reason,
                Collections.singletonMap("Cache-Control", "no-store"),
                new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
    }
}
