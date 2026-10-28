package com.dovebevo.app;

import static org.junit.Assert.*;

import android.app.AlertDialog;
import android.app.Instrumentation;
import android.annotation.TargetApi;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.system.Os;
import android.view.View;
import android.webkit.ServiceWorkerController;
import android.webkit.WebBackForwardList;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.Assume;

/**
 * Real app callbacks/native dialogs and real WebViews, with every response local.
 * Launches only bundled welcome (no acceptance/network), then installs an owned
 * fixture layout. Reflection touches our own private seams, never platform internals.
 * This is not a live website, complete Activity recreation, or physical-device test.
 */
@TargetApi(26)
public final class NativeUsabilityRuntimeTest {
    private static final String ONE = "https://www.dovebevo.com/bar/n123?c=u0nd9";
    private static final String HOLD = "https://www.dovebevo.com/bar/w9?c=sr2y7";
    private static final String FAILURE = "https://www.dovebevo.com/bar/r42?c=u0nd9";
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final AtomicBoolean hold = new AtomicBoolean();
    private final CountDownLatch release = new CountDownLatch(1);
    private final CountDownLatch holdStarted = new CountDownLatch(1);
    private MainActivity activity;
    private WebView web;
    private WebViewClient actualClient;
    private SavedVenueStore store;
    private SavedVenuesUi savedUi;
    private File fixtureDirectory;
    private SharedPreferences rules;
    private String oldRulesVersion;
    private boolean hadRulesVersion;
    private boolean priorWorkerBlock;

    @Before public void setUp() throws Exception {
        Assume.assumeTrue("Fixture delegates require WebView.getWebViewClient on API 26+", Build.VERSION.SDK_INT >= 26);
        rules = instrumentation.getTargetContext().getSharedPreferences("dovebevo_rules", 0);
        hadRulesVersion = rules.contains("accepted_rules_version");
        oldRulesVersion = rules.getString("accepted_rules_version", null);
        assertTrue(rules.edit().remove("accepted_rules_version").commit());
        activity = (MainActivity) instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(), MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
        fixtureDirectory = new File(activity.getCacheDir(), "native-usability-" + UUID.randomUUID());
        assertTrue(fixtureDirectory.mkdir());
        store = new SavedVenueStore(new SavedVenueFile(fixtureDirectory));
        instrumentation.runOnMainSync(() -> {
            try {
                assertNotNull(activity.findViewById(R.id.accept_rules));
                assertNull(get("website"));
                priorWorkerBlock = ServiceWorkerController.getInstance().getServiceWorkerWebSettings().getBlockNetworkLoads();
                ServiceWorkerController.getInstance().getServiceWorkerWebSettings().setBlockNetworkLoads(true);
                LinearLayout layout = new LinearLayout(activity);
                layout.setOrientation(LinearLayout.VERTICAL);
                LinearLayout tools = new LinearLayout(activity);
                for (String[] action : new String[][]{{"backButton", "goBack"}, {"forwardButton", "goForward"},
                        {"refreshButton", "refresh"}, {"shareButton", "share"}}) {
                    Button button = new Button(activity);
                    button.setText(action[1]);
                    button.setOnClickListener(view -> invoke(action[1]));
                    set(action[0], button);
                    tools.addView(button, new LinearLayout.LayoutParams(0, -2, 1));
                }
                layout.addView(tools);
                ProgressBar progress = new ProgressBar(activity);
                set("progress", progress); layout.addView(progress);
                FrameLayout content = new FrameLayout(activity);
                set("content", content);
                layout.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
                LinearLayout error = new LinearLayout(activity);
                error.setOrientation(LinearLayout.VERTICAL);
                TextView title = new TextView(activity); set("errorTitle", title); error.addView(title);
                TextView message = new TextView(activity); set("errorMessage", message); error.addView(message);
                Button retry = new Button(activity); retry.setId(R.id.retry); retry.setText(R.string.retry);
                retry.setOnClickListener(view -> invoke("navigate", new Class<?>[]{String.class}, get("lastTrustedUrl")));
                error.addView(retry); error.setVisibility(View.GONE); set("errorPanel", error);
                content.addView(error, new FrameLayout.LayoutParams(-1, -1));
                activity.setContentView(layout);
                installFixtureWebView();
                savedUi = new SavedVenuesUi(activity, store, () -> (String) invoke("eligibleSavedVenue"),
                        url -> invoke("navigate", new Class<?>[]{String.class}, url));
                set("savedVenues", savedUi);
                invoke("updateToolbar");
            } catch (Exception error) { throw new AssertionError(error); }
        });
    }

    @After public void tearDown() throws Exception {
        release.countDown();
        if (activity != null) instrumentation.runOnMainSync(() -> {
            if (savedUi != null) savedUi.dismiss();
            if (web != null) { web.stopLoading(); web.destroy(); }
            try { set("website", null); } catch (Exception error) { throw new AssertionError(error); }
            ServiceWorkerController.getInstance().getServiceWorkerWebSettings().setBlockNetworkLoads(priorWorkerBlock);
            activity.finish();
        });
        if (rules != null) {
            SharedPreferences.Editor editor = rules.edit();
            if (hadRulesVersion) editor.putString("accepted_rules_version", oldRulesVersion);
            else editor.remove("accepted_rules_version");
            assertTrue(editor.commit());
        }
        if (fixtureDirectory != null) {
            Os.chmod(fixtureDirectory.getAbsolutePath(), 0700);
            File[] files = fixtureDirectory.listFiles();
            if (files != null) for (File file : files) assertTrue(file.delete());
            assertTrue(fixtureDirectory.delete());
        }
    }

    @Test public void savedVenueNativeDialogsPreserveTheWebViewAndPersistAndRemoveRealFiles() throws Exception {
        navigate(ONE);
        WebView original = web;
        instrumentation.runOnMainSync(() -> {
            savedUi.saveCurrent();
            AlertDialog dialog = currentDialog();
            ((EditText) dialog.findViewById(R.id.saved_venue_name)).setText("Locale di prova");
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick();
            assertFalse(dialog.isShowing());
            assertSame(original, get("website"));
        });
        assertEquals("Locale di prova", new SavedVenueStore(new SavedVenueFile(fixtureDirectory)).load().get(0).label);
        assertEquals(ONE, store.load().get(0).url);
        instrumentation.runOnMainSync(() -> {
            savedUi.saveCurrent();
            currentDialog().getButton(AlertDialog.BUTTON_NEGATIVE).performClick();
            savedUi.showList();
            currentDialog().getListView().performItemClick(null, 0, 0);
            currentDialog().getButton(AlertDialog.BUTTON_POSITIVE).performClick();
        });
        await(() -> ONE.equals(web.getUrl()) && (Boolean) get("hasUsablePage") && !(Boolean) get("loading"));
        instrumentation.runOnMainSync(() -> {
            assertSame(original, get("website"));
            savedUi.showList();
            currentDialog().getListView().performItemClick(null, 0, 0);
            currentDialog().getButton(AlertDialog.BUTTON_NEUTRAL).performClick();
        });
        assertTrue(store.load().isEmpty());
    }

    @Test public void sameDocumentHistoryControlsAndNativeSavedStateRestoreAForwardEntry() throws Exception {
        navigate(BrowserPolicy.HOME);
        instrumentation.runOnMainSync(() -> web.evaluateJavascript("history.pushState({inApp:true},'', '/bar/n123?c=u0nd9')", null));
        await(() -> ONE.equals(web.getUrl()) && ((Button) get("backButton")).isEnabled());
        instrumentation.runOnMainSync(() -> {
            assertFalse(((Button) get("forwardButton")).isEnabled());
            assertEquals(ONE, invoke("eligibleSavedVenue"));
            ((Button) get("backButton")).performClick();
        });
        await(() -> BrowserPolicy.HOME.equals(web.getUrl()) && ((Button) get("forwardButton")).isEnabled());
        Bundle activityState = new Bundle();
        instrumentation.runOnMainSync(() -> {
            invoke("onSaveInstanceState", new Class<?>[]{Bundle.class}, activityState);
            assertNotNull(activityState.getBundle("browser_history"));
            FrameLayout content = (FrameLayout) get("content");
            content.removeView(web); web.stopLoading(); web.destroy(); set("website", null);
            set("hasUsablePage", false); set("failed", false);
            installFixtureWebView();
            assertEquals(Boolean.TRUE, invoke("restoreHistory", new Class<?>[]{Bundle.class}, activityState));
        });
        await(() -> BrowserPolicy.HOME.equals(web.getUrl()) && !(Boolean) get("loading"));
        instrumentation.runOnMainSync(() -> {
            assertFalse(((Button) get("backButton")).isEnabled());
            assertTrue(((Button) get("forwardButton")).isEnabled());
            ((Button) get("forwardButton")).performClick();
        });
        await(() -> ONE.equals(web.getUrl()) && ((Button) get("backButton")).isEnabled());
    }

    @Test public void firstLoadStopOffersRetryAndARealServerFailureStillShowsRecovery() throws Exception {
        hold.set(true);
        instrumentation.runOnMainSync(() -> invoke("navigate", new Class<?>[]{String.class}, HOLD));
        assertTrue("Held fixture did not start", holdStarted.await(10, TimeUnit.SECONDS));
        instrumentation.runOnMainSync(() -> {
            assertEquals(activity.getString(R.string.stop_loading), ((Button) get("refreshButton")).getContentDescription());
            ((Button) get("refreshButton")).performClick();
            assertEquals(View.GONE, ((ProgressBar) get("progress")).getVisibility());
            assertEquals(View.VISIBLE, ((LinearLayout) get("errorPanel")).getVisibility());
            assertEquals(activity.getString(R.string.loading_stopped_title), ((TextView) get("errorTitle")).getText().toString());
            assertNull(invoke("eligibleSavedVenue"));
        });
        hold.set(false); release.countDown();
        instrumentation.runOnMainSync(() -> activity.findViewById(R.id.retry).performClick());
        await(() -> HOLD.equals(web.getUrl()) && !(Boolean) get("loading") && !(Boolean) get("failed"));
        instrumentation.runOnMainSync(() -> {
            assertEquals(View.GONE, ((LinearLayout) get("errorPanel")).getVisibility());
            assertEquals(HOLD, invoke("eligibleSavedVenue"));
            invoke("navigate", new Class<?>[]{String.class}, FAILURE);
        });
        await(() -> (Boolean) get("failed"));
        instrumentation.runOnMainSync(() -> {
            assertEquals(View.VISIBLE, ((LinearLayout) get("errorPanel")).getVisibility());
            assertNull(invoke("eligibleSavedVenue"));
        });
    }

    @Test public void aRealFileWriteFailurePreservesThePriorCommittedVenue() throws Exception {
        assertEquals(SavedVenueStore.Result.SAVED, store.save(ONE, "Uno"));
        Os.chmod(fixtureDirectory.getAbsolutePath(), 0500);
        try { assertEquals(SavedVenueStore.Result.STORAGE_ERROR, store.save(HOLD, "Due")); }
        finally { Os.chmod(fixtureDirectory.getAbsolutePath(), 0700); }
        assertEquals(1, store.load().size());
        assertEquals(ONE, store.load().get(0).url);
        assertEquals(SavedVenueStore.Result.REMOVED, store.remove(ONE));
    }

    @Test public void oversizedOrForeignHistoryCannotBeRestoredAsAnAllowedWebsite() throws Exception {
        Bundle excessive = new Bundle(); excessive.putByteArray("oversize", new byte[131073]);
        instrumentation.runOnMainSync(() -> {
            assertNull(BrowserHistoryState.restore(web, excessive));
            assertTrue(web.getSettings().getBlockNetworkLoads());
        });
        // Build opaque foreign state in a separate network-blocked view whose
        // every response is local, without weakening the real app's URL client.
        AtomicReference<WebView> foreignView = new AtomicReference<>();
        CountDownLatch foreignLoaded = new CountDownLatch(1);
        instrumentation.runOnMainSync(() -> {
            WebView foreign = new WebView(activity); foreignView.set(foreign);
            foreign.getSettings().setBlockNetworkLoads(true);
            foreign.setWebViewClient(new WebViewClient() {
                @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    return new WebResourceResponse("text/html", "UTF-8", new ByteArrayInputStream(
                            "<!doctype html><meta http-equiv=Content-Security-Policy content=\"default-src 'none'\"><p>Owned foreign history fixture</p>".getBytes(StandardCharsets.UTF_8)));
                }
                @Override public void onPageFinished(WebView view, String url) { foreignLoaded.countDown(); }
            });
            foreign.loadUrl("https://untrusted.invalid/fixture");
        });
        try {
            assertTrue(foreignLoaded.await(15, TimeUnit.SECONDS));
            instrumentation.runOnMainSync(() -> {
                Bundle foreign = new Bundle();
                WebBackForwardList captured = foreignView.get().saveState(foreign);
                assertNotNull(captured);
                try { BrowserHistoryState.restore(web, foreign); fail("Foreign history must be rejected"); }
                catch (IllegalArgumentException expected) { assertTrue(web.getSettings().getBlockNetworkLoads()); }
            });
        } finally { instrumentation.runOnMainSync(() -> foreignView.get().destroy()); }
    }

    private void navigate(String url) throws Exception {
        instrumentation.runOnMainSync(() -> invoke("navigate", new Class<?>[]{String.class}, url));
        await(() -> url.equals(web.getUrl()) && !(Boolean) get("loading") && (Boolean) get("hasUsablePage"));
    }

    private void installFixtureWebView() {
        invoke("createWebsite");
        web = (WebView) get("website");
        web.getSettings().setBlockNetworkLoads(true);
        actualClient = web.getWebViewClient();
        WebViewClient delegate = actualClient;
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse guarded = delegate.shouldInterceptRequest(view, request);
                if (guarded != null) return guarded;
                byte[] bytes = "<!doctype html><meta charset=utf-8><meta http-equiv=Content-Security-Policy content=\"default-src 'none'\"><title>Owned native fixture</title><p>Local browser fixture</p>".getBytes(StandardCharsets.UTF_8);
                InputStream body = new ByteArrayInputStream(bytes);
                if (hold.get() && HOLD.equals(request.getUrl().toString())) body = new ByteArrayInputStream(bytes) {
                    @Override public synchronized int read(byte[] buffer, int offset, int length) {
                        try { if (!release.await(15, TimeUnit.SECONDS)) return -1; }
                        catch (InterruptedException error) { Thread.currentThread().interrupt(); return -1; }
                        return super.read(buffer, offset, length);
                    }
                };
                int status = !"GET".equals(request.getMethod()) ? 403 : FAILURE.equals(request.getUrl().toString()) ? 500 : 200;
                return new WebResourceResponse("text/html", "UTF-8", status,
                        status == 200 ? "OK" : status == 500 ? "Service Unavailable" : "Forbidden",
                        Collections.singletonMap("Cache-Control", "no-store"), body);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return delegate.shouldOverrideUrlLoading(view, request);
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap icon) {
                delegate.onPageStarted(view, url, icon);
                if (HOLD.equals(url) && hold.get()) holdStarted.countDown();
            }
            @Override public void onPageFinished(WebView view, String url) { delegate.onPageFinished(view, url); }
            @Override public void doUpdateVisitedHistory(WebView view, String url, boolean reload) { delegate.doUpdateVisitedHistory(view, url, reload); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) { delegate.onReceivedError(view, request, error); }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) { delegate.onReceivedHttpError(view, request, response); }
        });
    }

    private void await(BooleanSupplier condition) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
        AtomicBoolean matched = new AtomicBoolean();
        while (System.nanoTime() < deadline) {
            instrumentation.runOnMainSync(() -> matched.set(condition.getAsBoolean()));
            if (matched.get()) return;
            Thread.sleep(50);
        }
        fail("Native fixture state did not become ready within 15 seconds");
    }

    private AlertDialog currentDialog() {
        try {
            Field field = SavedVenuesUi.class.getDeclaredField("currentDialog"); field.setAccessible(true);
            return (AlertDialog) field.get(savedUi);
        } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }

    private Object get(String name) {
        try { Field field = MainActivity.class.getDeclaredField(name); field.setAccessible(true); return field.get(activity); }
        catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }

    private void set(String name, Object value) {
        try { Field field = MainActivity.class.getDeclaredField(name); field.setAccessible(true); field.set(activity, value); }
        catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }

    private Object invoke(String name) { return invoke(name, new Class<?>[0]); }

    private Object invoke(String name, Class<?>[] types, Object... values) {
        try { Method method = MainActivity.class.getDeclaredMethod(name, types); method.setAccessible(true); return method.invoke(activity, values); }
        catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }

}
