package com.dovebevo.app;

import static org.junit.Assert.*;

import android.app.Instrumentation;
import android.content.Intent;
import android.content.SharedPreferences;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/** Local visible-sheet fixtures only: the test WebView never opens the public site. */
public final class VenueHeadingReaderRuntimeTest {
    private static final String FOCUSED = "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&drink=spritz&hh=1";
    private static final String ORDINARY = "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9";
    private static final String NAME = "Bar San Marco";
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private MainActivity activity;
    private WebView web;
    private SharedPreferences rules;
    private boolean hadRulesVersion;
    private String priorRulesVersion;

    @Before public void setUp() {
        assertTrue("Use the fixture runner's separate WebView profile", NativeFixtureRunner.isolatedProfileReady);
        rules = instrumentation.getTargetContext().getSharedPreferences("dovebevo_rules", 0);
        hadRulesVersion = rules.contains("accepted_rules_version");
        priorRulesVersion = rules.getString("accepted_rules_version", null);
        // Leave the actual app behind its local rules gate; only the owned fixture WebView loads.
        assertTrue(rules.edit().remove("accepted_rules_version").commit());
        activity = (MainActivity) instrumentation.startActivitySync(
                new Intent(instrumentation.getTargetContext(), MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
        onMain(() -> {
            web = new WebView(activity);
            web.getSettings().setJavaScriptEnabled(true);
            activity.setContentView(web);
        });
    }

    @After public void tearDown() {
        if (activity != null) onMain(() -> {
            if (web != null) { web.stopLoading(); web.destroy(); }
            activity.finish();
        });
        if (rules != null) {
            SharedPreferences.Editor editor = rules.edit();
            if (hadRulesVersion) editor.putString("accepted_rules_version", priorRulesVersion);
            else editor.remove("accepted_rules_version");
            assertTrue(editor.commit());
        }
    }

    @Test(timeout = 30000) public void currentNestedHeadingReadsFocusedReopenedFavouriteAndOrdinaryRoute() throws Exception {
        for (String url : new String[]{FOCUSED, ORDINARY}) {
            String result = read(url, sheet("<header class='mobile-venue__identity'><h2 class='scontrino__name'>" + NAME + "</h2></header>", "n123", NAME));
            SavedVenueCapture.Venue venue = VenueHeadingReader.decode(result, new SavedVenueCapture(url, 7), url, 7);
            assertNotNull("Current venue heading must be captured on " + url, venue);
            assertEquals(NAME, venue.name);
            assertEquals("https://www.dovebevo.com/bar/n123?c=u0nd9", venue.url);
        }
    }

    @Test(timeout = 30000) public void legacyDirectHeadingRemainsReadable() throws Exception {
        String result = read(ORDINARY, sheet("<h2 class='scontrino__name'>" + NAME + "</h2>", "n123", NAME));
        assertNotNull(VenueHeadingReader.decode(result, new SavedVenueCapture(ORDINARY, 3), ORDINARY, 3));
    }

    @Test(timeout = 30000) public void unrelatedHiddenOrConflictingHeadingsCannotBecomeABookmark() throws Exception {
        String nested = "<header class='mobile-venue__identity'><h2 class='scontrino__name'>" + NAME + "</h2></header>";
        for (String html : new String[]{
                sheet("<div><header class='mobile-venue__identity'><h2 class='scontrino__name'>" + NAME + "</h2></header></div>", "n123", NAME),
                sheet(nested + "<h2 class='scontrino__name'>" + NAME + "</h2>", "n123", NAME),
                sheet(nested, "w9", NAME),
                sheet(nested, "n123", "Different venue"),
                sheet("<header class='mobile-venue__identity' aria-hidden='true'><h2 class='scontrino__name'>" + NAME + "</h2></header>", "n123", NAME)}) {
            assertEquals("null", read(FOCUSED, html));
        }
    }

    @Test(timeout = 30000) public void foreignOrExtendedFocusedRoutesRemainIneligible() throws Exception {
        String html = sheet("<header class='mobile-venue__identity'><h2 class='scontrino__name'>" + NAME + "</h2></header>", "n123", NAME);
        assertEquals("null", read(FOCUSED + "&token=private", html));
        assertEquals("null", read("https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&drink=spritz&hh=2", html));
        assertEquals("null", read("https://example.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&drink=spritz&hh=1", html));
    }

    private static String sheet(String heading, String selected, String label) {
        return "<!doctype html><html data-dovebevo-mobile-shell='1'><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
                + "<body style='margin:0'><section class='map' data-selected='" + selected + "'></section>"
                + "<dialog class='sheet sheet--bare' open aria-label='" + label + "' style='position:absolute;left:8px;top:8px;width:240px;height:180px;margin:0;display:block'>"
                + "<div class='sheet__body'><div class='scontrino'><div class='scontrino__paper'>" + heading
                + "</div></div></div></dialog></body></html>";
    }

    private String read(String url, String html) throws Exception {
        CountDownLatch loaded = new CountDownLatch(1);
        onMain(() -> {
            web.setWebViewClient(new WebViewClient() {
                @Override public void onPageFinished(WebView view, String ignored) { loaded.countDown(); }
            });
            web.loadDataWithBaseURL(url, html, "text/html", "UTF-8", null);
        });
        assertTrue("Owned venue fixture did not load", loaded.await(5, TimeUnit.SECONDS));
        CountDownLatch evaluated = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>();
        onMain(() -> web.evaluateJavascript(VenueHeadingReader.SCRIPT, result -> {
            value.set(result);
            evaluated.countDown();
        }));
        assertTrue("Venue reader did not complete", evaluated.await(5, TimeUnit.SECONDS));
        return value.get();
    }

    private void onMain(Runnable action) {
        instrumentation.runOnMainSync(action);
        instrumentation.waitForIdleSync();
    }
}
